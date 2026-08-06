// The four connect invariants from CLAUDE.md, each of which has broken Android
// device discovery at least once (PRs #32, #33). They were documented in prose
// only; these pin them.
//
// connect() takes navigator as a free variable, so the whole path runs here
// against a stub — no browser needed. What this cannot see is the DOM wiring
// (that connect is registered as a click listener at all); it does cover the
// consequence of that wiring, which is that `options` may be an Event.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';

const MAX_SILENT_RETRIES = 2;

function fakeDevice({ id = 'dev-1', name = 'POWER-2400', connects = true } = {}) {
    const listeners = {};
    const characteristic = {
        addEventListener() {},
        startNotifications: async () => {},
        writeValue: async () => {},
    };
    const server = {
        getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }),
    };
    const gatt = {
        connected: false,
        connect: async () => {
            if (!connects) throw new Error('GATT connection failed');
            gatt.connected = true;
            return server;
        },
        disconnect: () => { gatt.connected = false; },
    };
    return {
        id, name, gatt,
        addEventListener: (evt, fn) => { (listeners[evt] ||= []).push(fn); },
        listeners,
    };
}

function makeConnect({
    device = undefined,
    knownDevices = [],
    grantedDevices = [],
    chooserDevice = null,
    hasBluetooth = true,
    failedConnects = new Map(),
    refreshGate = null,
} = {}) {
    const calls = { order: [], logs: [], toasts: [], requestDeviceArgs: [] };
    const track = name => { calls.order.push(name); };

    const bluetooth = {
        requestDevice: async opts => {
            track('requestDevice');
            calls.requestDeviceArgs.push(opts);
            if (!chooserDevice) {
                const err = new Error('User cancelled');
                err.name = 'NotFoundError';
                throw err;
            }
            return chooserDevice;
        },
        getDevices: async () => grantedDevices,
    };

    // Long timers are the failure deadlines; letting them fire would race the
    // stubs, and letting them stay pending would hold the process open.
    const setTimeoutStub = (fn, ms) => (ms >= 5000 ? 0 : setTimeout(fn, 0));

    const api = loadFunctions(['connect'], {
        navigator: hasBluetooth ? { bluetooth } : {},
        window: {},
        document: { getElementById: () => null },
        localStorage: { getItem: () => null, setItem() {} },
        setTimeout: setTimeoutStub,
        clearTimeout: () => {},
        log: msg => { calls.logs.push(String(msg)); },
        showToast: msg => { calls.toasts.push(String(msg)); },
        device,
        server: null, service: null, writeChar: null, notifyChar: null,
        userDisconnected: false,
        connectInFlight: false,
        forceDeviceChooser: false,
        acceptAnyDevice: false,
        preferredDeviceId: null,
        manualLightOverride: null,
        reconnectAttempts: 0,
        knownDevices,
        grantedDevices,
        failedConnects,
        MAX_SILENT_RETRIES,
        listenedDevices: new Set(),
        SERVICE_UUID: 'service', WRITE_UUID: 'write', NOTIFY_UUID: 'notify',
        settings: { mainCap: 2048 },
        cancelAutoConnect: () => track('cancelAutoConnect'),
        refreshGrantedDevices: async () => { track('refreshGrantedDevices'); if (refreshGate) await refreshGate; },
        rememberDevice: () => track('rememberDevice'),
        renderKnownDevices: () => {},
        onDisconnected: () => {},
        handleNotification: () => {},
        updateStatus: ok => track(`updateStatus:${ok}`),
        resetSessionStats: () => {},
        startPolling: () => track('startPolling'),
        sendSettingsRequest: async () => track('sendSettingsRequest'),
    });

    return { ...api, calls, failedConnects };
}

// Invariant 1: `auto` is per call, and the check is strict. connect is wired
// directly as a click listener, so `options` is often an Event — anything that
// is not exactly {auto: true} is a user tap and must reach the chooser.
test('only options.auto === true counts as a background attempt', async () => {
    const manualForms = [
        undefined,
        {},
        { type: 'click', target: {}, preventDefault() {} },  // an Event
        { auto: 'true' },
        { auto: 1 },
    ];

    for (const options of manualForms) {
        const c = makeConnect();
        await c.connect(options);
        assert.ok(
            c.calls.order.includes('requestDevice'),
            `connect(${JSON.stringify(options)}) skipped the device chooser`,
        );
    }

    const auto = makeConnect();
    await auto.connect({ auto: true });
    assert.ok(!auto.calls.order.includes('requestDevice'), 'a background retry opened the chooser');
    assert.match(auto.calls.logs.join('\n'), /Auto-connect: no saved device/);
});

// Invariant 4, and the other half of invariant 1: a tap must be able to take
// over from a background attempt, or a tap landing mid-loop does nothing.
test('a tap cancels the auto-connect loop; a background retry does not', async () => {
    const manual = makeConnect();
    await manual.connect();
    assert.ok(manual.calls.order.includes('cancelAutoConnect'));

    const auto = makeConnect();
    await auto.connect({ auto: true });
    assert.ok(!auto.calls.order.includes('cancelAutoConnect'));
});

// The exact shape of the PR #32 regression: the loop is parked on an await and
// a tap lands in that window. Inferring `auto` from shared state made the tap
// look like a background retry, and the chooser was silently skipped.
test('a tap landing while the loop is parked on an await still opens the chooser', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const c = makeConnect({ refreshGate: gate });

    const background = c.connect({ auto: true });
    await null;   // let the background attempt reach its await

    await c.connect();   // the tap
    assert.ok(c.calls.order.includes('requestDevice'), 'the tap was treated as a background retry');
    assert.ok(c.calls.order.includes('cancelAutoConnect'), 'the tap did not cancel the loop');

    release();
    await background;
});

test('a second tap while one is in flight is ignored', async () => {
    const c = makeConnect();

    const first = c.connect();
    await c.connect();
    await first;

    assert.match(c.calls.logs.join('\n'), /Already connecting/);
    assert.equal(c.calls.order.filter(o => o === 'requestDevice').length, 1);
});

// Invariant 3: Chrome on Android drops the tap's user activation across an
// await, then refuses to open the chooser with a SecurityError. Nothing may be
// awaited before requestDevice on the manual path — which is why
// getDevices() is cached at startup instead of being awaited here.
test('nothing is awaited before the chooser opens on a tap', async () => {
    const c = makeConnect();
    await c.connect();

    const asyncStubsBefore = c.calls.order
        .slice(0, c.calls.order.indexOf('requestDevice'))
        .filter(name => name === 'refreshGrantedDevices');

    assert.deepEqual(asyncStubsBefore, [], 'an await ran before requestDevice on the manual path');
});

test('a background attempt does refresh the granted-device cache first', async () => {
    const c = makeConnect();
    await c.connect({ auto: true });

    assert.ok(c.calls.order.includes('refreshGrantedDevices'));
});

// Invariant 2: `device` truthy means connect() skips requestDevice entirely, so
// a saved device that will not connect must be released or the chooser becomes
// unreachable until a page reload.
test('a manual tap releases a device that has failed too often', async () => {
    const dead = fakeDevice({ connects: false });
    const c = makeConnect({
        device: dead,
        knownDevices: [{ id: dead.id }],
        failedConnects: new Map([[dead.id, MAX_SILENT_RETRIES]]),
    });

    await c.connect();

    assert.ok(c.calls.order.includes('requestDevice'), 'the chooser stayed unreachable');
    assert.match(c.calls.logs.join('\n'), /not responding/);
});

test('repeated manual failures eventually drop the device', async () => {
    const dead = fakeDevice({ connects: false });
    const c = makeConnect({ device: dead, knownDevices: [{ id: dead.id }] });

    await c.connect();
    assert.equal(c.readVar('device'), dead, 'dropped the device after a single failure');
    assert.equal(c.failedConnects.get(dead.id), 1);

    await c.connect();
    assert.equal(c.readVar('device'), null, 'a device that failed twice stayed latched');
});

// Background retries keep theirs, so a unit that is merely out of range
// reconnects on its own without the user being sent to the chooser.
test('background failures keep the device latched', async () => {
    const dead = fakeDevice({ connects: false });
    const c = makeConnect({
        device: dead,
        knownDevices: [{ id: dead.id }],
        grantedDevices: [dead],
    });

    await c.connect({ auto: true });
    await c.connect({ auto: true });
    await c.connect({ auto: true });

    assert.equal(c.readVar('device'), dead, 'a background retry gave up its saved device');
    assert.ok(c.failedConnects.get(dead.id) >= MAX_SILENT_RETRIES);
});

test('a successful connect clears the failure count and starts polling', async () => {
    const good = fakeDevice();
    const c = makeConnect({ chooserDevice: good, failedConnects: new Map([[good.id, 1]]) });

    await c.connect();

    assert.equal(c.failedConnects.get(good.id), undefined);
    assert.ok(c.calls.order.includes('startPolling'));
    assert.ok(c.calls.order.includes('updateStatus:true'));
    assert.ok(c.calls.order.includes('rememberDevice'));
});

test('the chooser filters on the known name prefixes unless pairing any device', async () => {
    const c = makeConnect();
    await c.connect();

    const [opts] = c.calls.requestDeviceArgs;
    assert.deepEqual(opts.filters.map(f => f.namePrefix), ['POWER', 'AFERIY', 'FOSSIBOT']);
    assert.ok(!opts.acceptAllDevices);
});

test('a cancelled chooser explains the empty-list case without latching a device', async () => {
    const c = makeConnect({ chooserDevice: null });
    await c.connect();

    assert.equal(c.readVar('device'), undefined);
    assert.match(c.calls.logs.join('\n'), /Nearby devices\/Location/);
});

// Safari has no Web Bluetooth at all; the guard must explain rather than throw.
test('an unsupported browser is reported, not crashed into', async () => {
    const c = makeConnect({ hasBluetooth: false });
    await c.connect();

    assert.match(c.calls.logs.join('\n'), /not supported/i);
    assert.equal(c.calls.toasts.length, 1);
    assert.deepEqual(c.calls.order, []);
});
