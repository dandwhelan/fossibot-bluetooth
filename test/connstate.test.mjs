// What the user is told about the connection. The dashboard reads "--"
// whether the app is loading, disconnected or broken, and the Activity Log
// that carried every real explanation lives two taps away in Diagnostics —
// so a failure reported only there is a failure reported nowhere. These pin
// the wording and the state each situation puts on screen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';
import { makeDocument } from './harness.mjs';

const UI = ['friendlyConnectError', 'connStateCopy', 'setConnState', 'renderConnectHelp',
    'dismissConnectHelp', 'savedDeviceName'];

function makeUI({ knownDevices = [], device = null } = {}) {
    const dom = makeDocument();
    const api = loadFunctions(UI, {
        document: dom.document,
        knownDevices,
        device,
        connState: 'idle',
        connectHelpDismissed: false,
    });
    return { ...api, ...dom };
}

const saved = [{ id: 'a', name: "Dan's F2400", lastSeen: 1 }];

// Jargon is what makes a failure unreadable: a DOMException name tells the
// user nothing they can act on.
test('every connect failure becomes a plain-English cause and next step', () => {
    const { friendlyConnectError } = makeUI();

    const cases = [
        [Object.assign(new Error('User cancelled'), { name: 'NotFoundError' }), /picked/i, /switch the station on|nearby/i],
        [Object.assign(new Error('user gesture'), { name: 'SecurityError' }), /tap connect again/i, /tap/i],
        [new Error('Timeout (5s)'), /did not answer/i, /switched on/i],
        [Object.assign(new Error('GATT operation failed'), { name: 'NetworkError' }), /dropped/i, /closer|off and on/i],
        [Object.assign(new Error('no service'), { name: 'NotSupportedError' }), /not a power station/i, /POWER, AFERIY or FOSSIBOT/],
    ];

    for (const [error, title, detail] of cases) {
        const copy = friendlyConnectError(error);
        assert.match(copy.title, title, `title for ${error.name || 'Error'}`);
        assert.match(copy.detail, detail, `detail for ${error.name || 'Error'}`);
        assert.doesNotMatch(copy.title, /Error|GATT|DOMException/,
            `${error.name} leaked a raw exception name into the headline`);
    }
});

test('an unrecognised failure still says what to do next', () => {
    const { friendlyConnectError } = makeUI();
    const copy = friendlyConnectError(new Error(''));
    assert.match(copy.title, /could not connect/i);
    assert.match(copy.detail, /switched on/i);
});

test('the status bar names the state, the device and the action for each state', () => {
    const ui = makeUI({ knownDevices: saved, device: { name: 'POWER-F2400' } });

    ui.setConnState('idle');
    assert.equal(ui.el('conn-bar').getAttribute('data-state'), 'idle');
    assert.match(ui.el('conn-title').textContent, /not connected/i);
    assert.match(ui.el('conn-detail').textContent, /Dan's F2400/);
    assert.equal(ui.el('conn-cta').textContent, 'Connect');

    ui.setConnState('scanning');
    assert.equal(ui.el('conn-bar').getAttribute('data-state'), 'scanning');
    assert.match(ui.el('conn-title').textContent, /connecting/i);

    ui.setConnState('connected');
    assert.equal(ui.el('conn-bar').getAttribute('data-state'), 'connected');
    assert.match(ui.el('conn-title').textContent, /^connected$/i);
    assert.equal(ui.el('conn-detail').textContent, 'POWER-F2400');
    assert.equal(ui.el('conn-cta').textContent, 'Disconnect');
});

test('an unpaired app never invites a tap on a device it does not have', () => {
    const ui = makeUI();
    ui.setConnState('idle');
    assert.match(ui.el('conn-detail').textContent, /your power station/i);
    assert.doesNotMatch(ui.el('conn-detail').textContent, /reconnect/i);
});

test('overrides replace the stock copy so a failure keeps its own wording', () => {
    const ui = makeUI({ knownDevices: saved });
    ui.setConnState('error', { title: 'Could not find your power station', detail: 'Check it is switched on.' });
    assert.equal(ui.el('conn-title').textContent, 'Could not find your power station');
    assert.equal(ui.el('conn-detail').textContent, 'Check it is switched on.');
    assert.equal(ui.el('conn-bar').getAttribute('data-state'), 'error');
});

// The walkthrough is the whole point for a first-time user, and pure noise
// for someone whose station is already saved.
test('the first run gets the walkthrough; a paired app gets one named button', () => {
    const fresh = makeUI();
    fresh.setConnState('idle');
    assert.ok(!fresh.el('connect-help-steps').classList.contains('hidden'), 'first run hid the steps');
    assert.equal(fresh.el('connect-help-cta').textContent, 'Connect');
    assert.ok(fresh.el('connect-help-alt').classList.contains('hidden'),
        'offered to pair a different station before pairing any');

    const paired = makeUI({ knownDevices: saved });
    paired.setConnState('idle');
    assert.ok(paired.el('connect-help-steps').classList.contains('hidden'), 'repeated the walkthrough after pairing');
    assert.equal(paired.el('connect-help-cta').textContent, "Connect to Dan's F2400");
    assert.ok(!paired.el('connect-help-alt').classList.contains('hidden'));
});

test('a scan in progress reads as progress, not as a failure', () => {
    const ui = makeUI({ knownDevices: saved });
    ui.setConnState('scanning', { title: 'Reconnecting…', detail: "Looking for Dan's F2400" });
    assert.equal(ui.el('connect-help-title').textContent, 'Reconnecting…');
    assert.equal(ui.el('connect-help-note').textContent, "Looking for Dan's F2400");
    assert.ok(ui.el('connect-help-cta').classList.contains('busy'));
    assert.ok(ui.el('connect-help-steps').classList.contains('hidden'), 'showed setup steps mid-connect');
});

test('a failure puts its cause and next step on the card, not only in the log', () => {
    const ui = makeUI({ knownDevices: saved });
    ui.setConnState('error', ui.friendlyConnectError(new Error('Timeout (5s)')));
    assert.match(ui.el('connect-help-title').textContent, /did not answer/i);
    assert.match(ui.el('connect-help-note').textContent, /switched on/i);
    assert.equal(ui.el('connect-help-cta').textContent, 'Try again');
});

// The card stands in for the dashboard rather than covering it, so the two
// must never be on screen together — nor both missing.
test('the card takes the dashboard\'s place while disconnected and gives it back on connect', () => {
    const ui = makeUI({ knownDevices: saved });

    ui.setConnState('idle');
    assert.ok(!ui.el('connect-help').classList.contains('hidden'));
    assert.ok(ui.el('dash-main').classList.contains('needs-connect'), 'left the all-dashes dashboard on screen');

    ui.setConnState('connected');
    assert.ok(ui.el('connect-help').classList.contains('hidden'));
    assert.ok(!ui.el('dash-main').classList.contains('needs-connect'), 'kept the dashboard hidden while connected');
});

test('dismissing the card brings the dashboard back and keeps it back', () => {
    const ui = makeUI({ knownDevices: saved });
    ui.setConnState('idle');

    // Hiding the card without restoring what it stood in for leaves a blank page.
    ui.dismissConnectHelp();
    assert.ok(ui.el('connect-help').classList.contains('hidden'));
    assert.ok(!ui.el('dash-main').classList.contains('needs-connect'),
        'dismissing the card left the dashboard hidden too');

    ui.setConnState('error', { title: 'Could not connect', detail: 'Try again.' });
    assert.ok(ui.el('connect-help').classList.contains('hidden'), 'a dismissed card came back on the next failure');
    assert.ok(!ui.el('dash-main').classList.contains('needs-connect'));
});
