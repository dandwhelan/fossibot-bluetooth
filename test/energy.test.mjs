// Daily Wh totals are integrated from polling samples. Errors here are
// invisible in normal use — the number is just quietly wrong — so the
// integration, the disconnect-gap guard, day rollover and the retention window
// all get pinned.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';
import { makeDocument } from './harness.mjs';

const HOUR = 3600000;

function makeEnergy({ energyDays = {}, tariff = 0, now = Date.parse('2026-03-10T12:00:00') } = {}) {
    const { document, el } = makeDocument();
    const store = new Map();
    const state = { now };

    const api = loadFunctions(['accumulateEnergy', 'saveEnergy', 'updateEnergyStrip', 'energyDayKey'], {
        document,
        energyDays,
        tariff,
        lastEnergyT: 0,
        lastEnergySave: 0,
        localStorage: {
            getItem: k => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
        },
        Date: class extends Date {
            constructor(...args) { super(...(args.length ? args : [state.now])); }
            static now() { return state.now; }
            static parse(...a) { return Date.parse(...a); }
        },
    });

    return { ...api, energyDays, store, el, at: t => { state.now = t; } };
}

const dayOf = (energy, t) => energy.energyDays[energy.energyDayKey(t)];

test('the first sample sets the clock without integrating anything', () => {
    const e = makeEnergy();
    const t0 = Date.parse('2026-03-10T12:00:00');

    e.accumulateEnergy(t0, 1000, 0);
    assert.deepEqual(e.energyDays, {}, 'integrated over an unknown interval');
});

test('watts are integrated over the interval between samples', () => {
    const e = makeEnergy();
    const t0 = Date.parse('2026-03-10T12:00:00');

    e.accumulateEnergy(t0, 0, 0);
    for (let i = 1; i <= 4; i++) e.accumulateEnergy(t0 + i * 1000, 3600, 1800);

    // 3600W for 4s = 4 Wh in, 1800W for 4s = 2 Wh out
    const day = dayOf(e, t0);
    assert.ok(Math.abs(day.in - 4) < 1e-9, `in was ${day.in}`);
    assert.ok(Math.abs(day.out - 2) < 1e-9, `out was ${day.out}`);
});

// A disconnect leaves a long gap; integrating across it would invent hours of
// energy that never flowed.
test('gaps longer than thirty seconds are not integrated', () => {
    const e = makeEnergy();
    const t0 = Date.parse('2026-03-10T12:00:00');

    e.accumulateEnergy(t0, 1000, 0);
    e.accumulateEnergy(t0 + 31000, 1000, 0);
    assert.deepEqual(e.energyDays, {}, 'integrated across a disconnect');

    e.accumulateEnergy(t0 + 31000 + 30000, 1000, 0);
    assert.ok(dayOf(e, t0).in > 0, 'a 30s gap should still count');
});

test('a sample that goes backwards in time is ignored', () => {
    const e = makeEnergy();
    const t0 = Date.parse('2026-03-10T12:00:00');

    e.accumulateEnergy(t0, 1000, 0);
    e.accumulateEnergy(t0 - 5000, 1000, 0);

    assert.deepEqual(e.energyDays, {});
});

// Each interval is booked against the day of the sample that closes it, so a
// span across midnight lands wholly in the new day. Sub-second misattribution
// at the boundary is the accepted cost of keeping the accounting this simple.
test('totals roll over into a new day at local midnight', () => {
    const e = makeEnergy();
    const late = Date.parse('2026-03-10T23:59:45');

    e.accumulateEnergy(late, 0, 0);
    e.accumulateEnergy(late + 5000, 3600, 0);    // 23:59:50, still the 10th
    e.accumulateEnergy(late + 10000, 3600, 0);   // 23:59:55, still the 10th
    e.accumulateEnergy(late + 20000, 3600, 0);   // 00:00:05, now the 11th

    assert.equal(e.energyDayKey(late), '2026-03-10');
    assert.equal(e.energyDayKey(late + 20000), '2026-03-11');

    assert.ok(dayOf(e, late).in > 0, 'nothing recorded before midnight');
    assert.ok(dayOf(e, late + 20000).in > 0, 'the rollover did not start a new day');
    assert.equal(Object.keys(e.energyDays).length, 2);
});

test('day keys are zero-padded so they sort chronologically', () => {
    const e = makeEnergy();

    assert.equal(e.energyDayKey(Date.parse('2026-01-05T10:00:00')), '2026-01-05');
    assert.equal(e.energyDayKey(Date.parse('2026-12-31T10:00:00')), '2026-12-31');

    const keys = ['2026-01-05', '2026-02-01', '2026-10-01', '2026-12-31'];
    assert.deepEqual([...keys].sort(), keys);
});

test('saving keeps the most recent 31 days and drops older ones', () => {
    const e = makeEnergy();
    const start = Date.parse('2026-01-01T12:00:00');
    const days = Array.from({ length: 40 }, (_, i) => e.energyDayKey(start + i * 86400000));
    days.forEach((key, i) => { e.energyDays[key] = { in: i, out: 0 }; });

    e.saveEnergy(Date.now());

    const kept = Object.keys(e.energyDays).sort();
    assert.equal(kept.length, 31);
    assert.deepEqual(kept, days.slice(-31), 'dropped the wrong end of the range');
    assert.deepEqual(JSON.parse(e.store.get('POWER-energy')), e.energyDays);
});

test('the energy strip stays blank below one watt-hour', () => {
    const now = Date.parse('2026-03-10T12:00:00');
    const e = makeEnergy({ energyDays: { '2026-03-10': { in: 0.4, out: 0.2 } }, now });

    e.updateEnergyStrip();
    assert.equal(e.el('energy-strip').textContent, '');
});

test('the energy strip switches to kWh above a thousand watt-hours', () => {
    const now = Date.parse('2026-03-10T12:00:00');
    const e = makeEnergy({ energyDays: { '2026-03-10': { in: 2500, out: 900 } }, now });

    e.updateEnergyStrip();
    const text = e.el('energy-strip').textContent;
    assert.match(text, /2\.50 kWh/);
    assert.match(text, /900 Wh/);
});

test('a tariff adds a cost estimate based on energy in', () => {
    const now = Date.parse('2026-03-10T12:00:00');
    const priced = makeEnergy({ energyDays: { '2026-03-10': { in: 2000, out: 0 } }, tariff: 0.25, now });
    priced.updateEnergyStrip();
    assert.match(priced.el('energy-strip').textContent, /0\.50/);

    const free = makeEnergy({ energyDays: { '2026-03-10': { in: 2000, out: 0 } }, tariff: 0, now });
    free.updateEnergyStrip();
    assert.ok(!free.el('energy-strip').textContent.includes('💰'));
});
