// checkAlerts() decides when to raise a notification. Its state is a set of
// "already told them" latches with asymmetric reset thresholds, so the bugs it
// can develop — an alert that fires every poll, or one that never fires again
// after the first time — only show up across a sequence of samples.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';

const SAMPLE = {
    battery: 50,
    isCharging: false,
    errorCode: 0,
    sysStatus: 'Standby',
    outputW: 0,
    acVolts: 0,
    chargeLimitPct: 100,
};

function makeAlerts({ lowBattThreshold = 20, mainCap = 2048 } = {}) {
    const notifications = [];
    const { checkAlerts } = loadFunctions(['checkAlerts'], {
        lowBattThreshold,
        lowBattNotified: false,
        faultNotified: false,
        chargeFullNotified: false,
        overloadNotified: false,
        acWasPresent: false,
        settings: { mainCap },
        notifyUser: (title, body) => notifications.push({ title, body }),
    });

    return {
        notifications,
        feed: overrides => checkAlerts({ ...SAMPLE, ...overrides }),
        titles: () => notifications.map(n => n.title),
    };
}

test('low battery fires once and does not repeat while it stays low', () => {
    const a = makeAlerts();
    a.feed({ battery: 15 });
    a.feed({ battery: 14 });
    a.feed({ battery: 12 });

    assert.equal(a.notifications.length, 1);
    assert.match(a.notifications[0].title, /Low Battery/);
});

test('low battery re-arms only after recovering past the threshold plus five', () => {
    const a = makeAlerts();
    a.feed({ battery: 15 });
    a.feed({ battery: 23 });   // inside the hysteresis band, still latched
    a.feed({ battery: 15 });
    assert.equal(a.notifications.length, 1, 'refired without clearing the band');

    a.feed({ battery: 40 });   // clears
    a.feed({ battery: 15 });
    assert.equal(a.notifications.length, 2);
});

test('charging suppresses and clears the low battery alert', () => {
    const a = makeAlerts();
    a.feed({ battery: 10, isCharging: true });
    assert.equal(a.notifications.length, 0);

    a.feed({ battery: 10, isCharging: false });
    assert.equal(a.notifications.length, 1);
});

// A disconnected or still-initialising device reads 0, which must not be
// mistaken for a flat battery.
test('a zero reading never raises low battery', () => {
    const a = makeAlerts();
    a.feed({ battery: 0 });
    a.feed({ battery: 0 });

    assert.deepEqual(a.titles(), []);
});

test('the low battery threshold is configurable', () => {
    const a = makeAlerts({ lowBattThreshold: 50 });
    a.feed({ battery: 45 });

    assert.equal(a.notifications.length, 1);
});

test('charge complete fires at the limit and re-arms five percent below it', () => {
    const a = makeAlerts();
    a.feed({ battery: 89, isCharging: true, chargeLimitPct: 90 });
    assert.equal(a.notifications.length, 0);

    a.feed({ battery: 90, isCharging: true, chargeLimitPct: 90 });
    a.feed({ battery: 91, isCharging: true, chargeLimitPct: 90 });
    assert.equal(a.notifications.length, 1, 'charge complete repeated');
    assert.match(a.notifications[0].title, /Charge Complete/);

    a.feed({ battery: 84, isCharging: true, chargeLimitPct: 90 });
    a.feed({ battery: 90, isCharging: true, chargeLimitPct: 90 });
    assert.equal(a.notifications.length, 2);
});

// Reg 21 doubles as a state code when nothing is plugged in, so only a
// mains-level voltage counts as AC present.
test('AC loss fires on the transition, not on every unplugged sample', () => {
    const a = makeAlerts();
    a.feed({ acVolts: 0 });
    a.feed({ acVolts: 1.5 });   // reg 21 state code, not mains
    assert.deepEqual(a.titles(), [], 'a state code was read as mains power');

    a.feed({ acVolts: 240 });
    assert.deepEqual(a.titles(), []);

    a.feed({ acVolts: 0 });
    assert.equal(a.notifications.length, 1);
    assert.match(a.notifications[0].title, /AC Input Lost/);

    a.feed({ acVolts: 0 });
    assert.equal(a.notifications.length, 1, 'AC loss repeated while unplugged');
});

// Losing mains is what makes reg 21 start reporting a state code, so the drop
// from a real voltage to a low one has to register as a loss. Anything that
// treats a small non-zero reading as "still plugged in" misses the alert
// entirely — 15 is the cold-temp protection code from CLAUDE.md.
test('dropping from mains to a reg 21 state code counts as AC loss', () => {
    const a = makeAlerts();
    a.feed({ acVolts: 240 });
    a.feed({ acVolts: 1.5 });

    assert.equal(a.notifications.length, 1);
    assert.match(a.notifications[0].title, /AC Input Lost/);
});

// The threshold has to sit below US mains as well as EU mains, or the alert
// silently never arms on a 120V supply.
test('120V mains counts as AC present', () => {
    const a = makeAlerts();
    a.feed({ acVolts: 120 });
    a.feed({ acVolts: 0 });

    assert.equal(a.notifications.length, 1, '120V was not treated as mains power');
});

test('a brownout below mains level still counts as AC loss', () => {
    const a = makeAlerts();
    a.feed({ acVolts: 230 });
    a.feed({ acVolts: 60 });

    assert.equal(a.notifications.length, 1);
});

test('overload fires near the rated output and re-arms below 80 percent', () => {
    const a = makeAlerts({ mainCap: 2048 });   // F2400 -> 2400W rated
    a.feed({ outputW: 2200 });
    assert.equal(a.notifications.length, 0);

    a.feed({ outputW: 2350 });
    a.feed({ outputW: 2380 });
    assert.equal(a.notifications.length, 1, 'overload repeated');
    assert.match(a.notifications[0].title, /High Output Load/);

    a.feed({ outputW: 1000 });
    a.feed({ outputW: 2350 });
    assert.equal(a.notifications.length, 2);
});

test('overload uses the 3600W rating on larger packs', () => {
    const a = makeAlerts({ mainCap: 3840 });
    a.feed({ outputW: 2500 });
    assert.equal(a.notifications.length, 0, '2500W is not an overload on an F3600');

    a.feed({ outputW: 3500 });
    assert.equal(a.notifications.length, 1);
});

test('no overload alerts when the pack size is unknown', () => {
    const a = makeAlerts({ mainCap: 0 });
    a.feed({ outputW: 99999 });

    assert.deepEqual(a.titles(), []);
});

// checkAlerts itself treats any non-zero code as a fault. Only the caller in
// handleNotification knows that 78 and 79 are the real ones, and it passes 0
// for everything else — see notification.test.mjs. If a second call site ever
// appears, it has to do the same filtering or healthy devices reporting 136
// will raise fault notifications.
test('any non-zero error code raises a fault, once, until it clears', () => {
    const a = makeAlerts();
    a.feed({ errorCode: 78, sysStatus: 'Inverter Fault' });
    a.feed({ errorCode: 78, sysStatus: 'Inverter Fault' });
    assert.equal(a.notifications.length, 1);
    assert.equal(a.notifications[0].body, 'Inverter Fault');

    a.feed({ errorCode: 0 });
    a.feed({ errorCode: 79, sysStatus: 'Error 79' });
    assert.equal(a.notifications.length, 2);
});

test('a healthy sample raises nothing at all', () => {
    const a = makeAlerts();
    a.feed({ battery: 80, acVolts: 240, outputW: 300 });
    a.feed({ battery: 79, acVolts: 240, outputW: 320 });

    assert.deepEqual(a.titles(), []);
});
