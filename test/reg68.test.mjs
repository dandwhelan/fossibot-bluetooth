// Writing 0 to Settings Reg 68 (machine shutdown timer) permanently bricks
// devices — confirmed in the field, issue #1. Two independent defences exist:
// the refusal in setRegister() and the absence of a "Never" option in the UI.
// These tests pin both, because neither failure is visible until hardware dies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, selectOptions } from './extract.mjs';

const ALLOWED_TIMERS = [5, 10, 30, 60, 480];

// generateCommandBytes calls calculateChecksum, so both must share a scope.
const { generateCommandBytes } = loadFunctions(['calculateChecksum', 'generateCommandBytes']);

function makeSetRegister({ device = null, writeChar = null, isDebug = false } = {}) {
    const calls = { queued: [], logs: [], alerts: [], errors: [], reads: 0, simulated: [] };
    const { setRegister } = loadFunctions(['setRegister'], {
        log: msg => calls.logs.push(String(msg)),
        alert: msg => calls.alerts.push(String(msg)),
        console: { error: (...a) => calls.errors.push(a.join(' ')), log() {}, warn() {} },
        addToQueue: task => { calls.queued.push(task); return Promise.resolve(); },
        generateCommandBytes,
        device,
        writeChar,
        isDebug,
        mockSimulate: (reg, val) => calls.simulated.push([reg, val]),
        sendReadRequest: () => { calls.reads++; },
    });
    return { setRegister, calls };
}

test('reg 68 = 0 is refused and never reaches the queue', () => {
    const { setRegister, calls } = makeSetRegister();
    setRegister(68, 0);

    assert.equal(calls.queued.length, 0, 'a brick write was queued');
    assert.equal(calls.alerts.length, 1, 'the user was not warned');
    assert.match(calls.alerts[0], /brick/i);
    assert.equal(calls.errors.length, 1);
});

test('reg 68 = 0 is refused however the zero is spelled', () => {
    for (const zero of [0, '0', -0, 0.0, '', '00', ' 0 ']) {
        const { setRegister, calls } = makeSetRegister();
        setRegister(68, zero);
        assert.equal(calls.queued.length, 0, `Number(${JSON.stringify(zero)}) === 0 slipped through`);
    }
});

test('reg 68 accepts every documented timer value', () => {
    for (const val of ALLOWED_TIMERS) {
        const { setRegister, calls } = makeSetRegister();
        setRegister(68, val);
        assert.equal(calls.queued.length, 1, `reg 68 = ${val} was wrongly blocked`);
        assert.equal(calls.alerts.length, 0);
    }
});

// The guard is keyed on reg 68 specifically: 0 is a completely ordinary value
// elsewhere, and blocking it would break every "turn this output off" write.
test('zero is still writable to other registers', () => {
    for (const reg of [24, 25, 26, 27, 57, 66, 67]) {
        const { setRegister, calls } = makeSetRegister();
        setRegister(reg, 0);
        assert.equal(calls.queued.length, 1, `reg ${reg} = 0 was wrongly blocked`);
        assert.equal(calls.alerts.length, 0);
    }
});

test('a permitted write emits the packet for that register', async () => {
    const written = [];
    const { setRegister, calls } = makeSetRegister({
        device: { name: 'stub' },
        writeChar: { writeValue: async bytes => { written.push(bytes); } },
    });

    setRegister(68, 480);
    assert.equal(calls.queued.length, 1);
    await calls.queued[0]();

    assert.equal(written.length, 1);
    assert.deepEqual([...written[0]], [...generateCommandBytes(0x11, 68, 480)]);
    assert.equal(calls.reads, 1, 'the write should be followed by a read-back');
});

test('the shutdown-timer dropdown offers no value that would brick a device', () => {
    const options = selectOptions('set-sys-standby');

    assert.ok(options.length > 0, 'the dropdown lost its options');
    for (const opt of options) {
        assert.notEqual(opt.value.trim(), '', `option "${opt.label}" has an empty value`);
        assert.notEqual(Number(opt.value), 0, `option "${opt.label}" would write 0 to reg 68`);
        assert.ok(
            ALLOWED_TIMERS.includes(Number(opt.value)),
            `option "${opt.label}" (${opt.value}) is not a documented timer value`,
        );
    }
});
