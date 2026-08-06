// handleNotification() decodes every packet the device sends and is the largest
// piece of logic in the app. It wraps its whole body in a try/catch that only
// reaches console.error, so a decoding bug — or a missing stub in these tests —
// looks like "nothing happened" rather than a failure. Every test therefore
// asserts that nothing was swallowed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';
import { makeDocument, statusPacket, settingsPacket, rawPacket, asEvent } from './harness.mjs';

function makeParser({ isDebug = false, settings = { mainCap: 2048, expCap: 2048 } } = {}) {
    const { document, el } = makeDocument();
    const calls = {
        logs: [],
        errors: [],
        dashboards: [],
        alerts: [],
        history: [],
        outputs: [],
        settingsUI: 0,
        syncSettingsUI: 0,
        wifiUI: 0,
        diagnostics: 0,
    };
    const registers = [];
    const settingsRegisters = [];
    const networkStatus = { state: null, lastUpdate: 0 };

    const { handleNotification } = loadFunctions(['handleNotification'], {
        window: {},
        document,
        console: {
            error: (...a) => calls.errors.push(a.map(String).join(' ')),
            log() {}, warn() {},
        },
        log: msg => calls.logs.push(String(msg)),
        registers,
        settingsRegisters,
        networkStatus,
        NETWORK_STATES: { 1: 'Connected', 2: 'Connecting' },
        settings,
        isDebug,
        btns: { light: { id: 'light' } },
        lightState: false,
        getReg: idx => registers[idx] ?? 0,
        syncSettingsUI: () => { calls.syncSettingsUI++; },
        updateSettingsUI: () => { calls.settingsUI++; },
        setDashEnabled: () => {},
        updateOutputState: (type, on) => calls.outputs.push([type, on]),
        updateButtonState: () => {},
        recordHistory: (...a) => calls.history.push(a),
        checkAlerts: a => calls.alerts.push(a),
        renderDashboard: d => calls.dashboards.push(d),
        updateWifiStatusUI: () => { calls.wifiUI++; },
        renderDiagnostics: () => { calls.diagnostics++; },
    });

    const feed = view => {
        handleNotification(asEvent(view));
        assert.deepEqual(calls.errors, [], 'handleNotification swallowed an exception');
        return calls;
    };

    return { feed, handleNotification, calls, registers, settingsRegisters, networkStatus, el };
}

const lastDashboard = calls => calls.dashboards.at(-1);

test('a 0x1103 packet fills the settings bank and refreshes the settings UI', () => {
    const p = makeParser();
    p.feed(settingsPacket({ 13: 5, 57: 1, 67: 900 }));

    assert.equal(p.settingsRegisters[13], 5);
    assert.equal(p.settingsRegisters[57], 1);
    assert.equal(p.settingsRegisters[67], 900);
    assert.equal(p.calls.syncSettingsUI, 1);
    assert.equal(p.calls.settingsUI, 1);
});

test('a 0x1104 packet fills the status bank', () => {
    const p = makeParser();
    p.feed(statusPacket({ 20: 450, 56: 731, 69: 3 }));

    assert.equal(p.registers[20], 450);
    assert.equal(p.registers[56], 731);
    assert.equal(p.registers[69], 3);
});

// Reg 56 is 0-1000; decoding it in the wrong order is the "apparent zero
// battery" report in CLAUDE.md.
test('main SOC is reg 56 divided by ten', () => {
    for (const [raw, pct] of [[1000, 100], [731, 73.1], [55, 5.5], [0, 0]]) {
        const p = makeParser();
        p.feed(statusPacket({ 56: raw }));
        assert.equal(lastDashboard(p.calls).soc, pct, `reg 56 = ${raw}`);
    }
});

test('extension batteries decode as (raw - 10) / 10 and zero means absent', () => {
    const absent = makeParser();
    absent.feed(statusPacket({ 53: 0, 55: 0 }));
    assert.equal(lastDashboard(absent.calls).extText, '');

    const present = makeParser();
    present.feed(statusPacket({ 53: 510, 55: 10 }));
    assert.equal(lastDashboard(present.calls).extText, 'Ext1: 50.0% | Ext2: 0.0%');
});

test('output toggles come from the reg 41 bitmask', () => {
    const p = makeParser();
    p.feed(statusPacket({ 41: 512 | 2048 }));

    assert.deepEqual(p.calls.outputs, [['usb', true], ['dc', false], ['ac', true]]);
});

// Only 78 and 79 are real faults. Healthy devices report other non-zero codes
// (136 is the one in the field reports), and treating those as errors is the
// "fault banner with no fault" bug.
test('system status treats only error codes 78 and 79 as faults', () => {
    const cases = [
        [{ 8: 136, 48: 0x8000 }, 'Charging'],
        [{ 8: 136, 48: 0x4000 }, 'Standby'],
        [{ 8: 0, 48: 0x8000 }, 'Charging'],
        [{ 8: 1, 48: 0x4000 }, 'Standby'],
        [{ 8: 78, 48: 0x8000 }, 'Inverter Fault'],
        [{ 8: 79, 48: 0x8000 }, 'Temp Protection'],
        [{ 8: 79, 42: 0x6000, 48: 0x8000 }, 'Error 79'],
    ];

    for (const [regs, expected] of cases) {
        const p = makeParser();
        p.feed(statusPacket(regs));
        assert.equal(lastDashboard(p.calls).sysStatus, expected, JSON.stringify(regs));
    }
});

test('the protection banner stays hidden for a healthy non-zero error code', () => {
    const p = makeParser();
    p.feed(statusPacket({ 8: 136, 42: 0xe3d8, 48: 0x8000 }));

    assert.ok(p.el('protectionWarning').classList.contains('hidden'));
});

test('the protection banner distinguishes hardware from environmental faults', () => {
    const hw = makeParser();
    hw.feed(statusPacket({ 8: 79, 42: 0x6000 }));
    assert.match(hw.el('protectionWarning').textContent, /Hardware Fault/);
    assert.ok(!hw.el('protectionWarning').classList.contains('hidden'));

    const env = makeParser();
    env.feed(statusPacket({ 8: 79, 42: 0x0001 }));
    assert.match(env.el('protectionWarning').textContent, /Temp\/Safety Protection/);

    const inverter = makeParser();
    inverter.feed(statusPacket({ 8: 78 }));
    assert.match(inverter.el('protectionWarning').textContent, /Inverter Fault/);
});

// checkAlerts fires on `errorCode > 0`; the 78/79 rule lives here in the
// caller, so this is what stops a healthy 136 raising a fault notification.
test('the alert call normalises unrecognised error codes to zero', () => {
    const healthy = makeParser();
    healthy.feed(statusPacket({ 8: 136, 48: 0x8000 }));
    assert.equal(healthy.calls.alerts.at(-1).errorCode, 0);

    const faulted = makeParser();
    faulted.feed(statusPacket({ 8: 78 }));
    assert.equal(faulted.calls.alerts.at(-1).errorCode, 78);
});

test('the charge limit passed to alerts falls back to 100% when unset', () => {
    const p = makeParser();
    p.feed(statusPacket({ 56: 500 }));
    assert.equal(p.calls.alerts.at(-1).chargeLimitPct, 100);

    p.settingsRegisters[67] = 900;
    p.feed(statusPacket({ 56: 500 }));
    assert.equal(p.calls.alerts.at(-1).chargeLimitPct, 90);
});

test('history and alerts are skipped in simulator mode', () => {
    const p = makeParser({ isDebug: true });
    p.feed(statusPacket({ 56: 500 }));

    assert.equal(p.calls.history.length, 0);
    assert.equal(p.calls.alerts.length, 0);
    assert.equal(p.calls.dashboards.length, 1, 'the dashboard should still render');
});

// Some firmware sends status without the expected header, so anything long
// enough is decoded as a status dump.
test('a long packet is decoded as status even with an unexpected header', () => {
    const p = makeParser();
    p.feed(statusPacket({ 56: 880 }, { header: 0x00, opCode: 0x00 }));

    assert.equal(lastDashboard(p.calls).soc, 88);
});

test('a truncated status packet reads missing registers as zero without throwing', () => {
    const p = makeParser();
    p.feed(statusPacket({ 20: 120 }, { regCount: 90, opCode: 0x04 }));
    assert.equal(p.registers[20], 120);

    const short = makeParser();
    short.feed(statusPacket({ 20: 120 }, { regCount: 30 }));
    assert.equal(short.registers[20], 120);
    assert.equal(short.registers[56], 0, 'registers past the end should read as 0');
    assert.equal(lastDashboard(short.calls).soc, 0);
});

test('a write confirmation updates the settings bank', () => {
    const p = makeParser();
    p.feed(rawPacket([0x11, 0x06, 0x00, 0x39, 0x00, 0x01, 0x97, 0x9a]));

    assert.equal(p.settingsRegisters[57], 1);
    assert.match(p.calls.logs.at(-1), /Write Confirmed: Reg 57 = 1/);
});

test('a network status packet records the connection state', () => {
    const p = makeParser();
    p.feed(rawPacket([0x11, 0x07, 0x01, 0x00]));

    assert.equal(p.networkStatus.state, 'Connected');
    assert.equal(p.calls.wifiUI, 1);

    p.feed(rawPacket([0x11, 0x07, 0x63, 0x00]));
    assert.equal(p.networkStatus.state, 'Unknown (99)');
});

test('an ASCII debug frame is logged rather than decoded', () => {
    const p = makeParser();
    p.feed(rawPacket([...Buffer.from('AT+CWMODE=1\r\n')]));

    assert.match(p.calls.logs.at(-1), /Device Debug: AT\+CWMODE=1/);
    assert.equal(p.calls.dashboards.length, 0);
});

test('an error reply and an unknown opcode are logged, not thrown', () => {
    const err = makeParser();
    err.feed(rawPacket([0x11, 0x84, 0x02, 0x00]));
    assert.match(err.calls.logs.at(-1), /Not Supported/);

    const unknown = makeParser();
    unknown.feed(rawPacket([0x11, 0x0f, 0x00, 0x00]));
    assert.match(unknown.calls.logs.at(-1), /Unknown OpCode 0x0f/);
});

// A zero-length notification is the one input that reaches the catch: reading
// byte 0 off an empty DataView throws. The catch is what keeps a malformed
// frame from tearing down the notification handler, so pin that it contains
// the error rather than letting it escape into the BLE callback.
test('an empty payload is contained by the catch instead of escaping', () => {
    const p = makeParser();

    assert.doesNotThrow(() => p.handleNotification(asEvent(rawPacket([]))));
    assert.equal(p.calls.errors.length, 1);
    assert.match(p.calls.errors[0], /Error in handleNotification/);
    assert.equal(p.calls.dashboards.length, 0);
});
