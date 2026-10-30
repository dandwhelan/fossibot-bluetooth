import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';

function note(registers, settingsRegisters = []) {
    return loadFunctions(['bypassScheduleNote'], { registers, settingsRegisters }).bypassScheduleNote();
}

test('bypass with a pending schedule is called out', () => {
    const regs = [];
    regs[41] = 0x0C;
    regs[57] = 90;
    regs[56] = 800;
    assert.match(note(regs), /bypass active.*90 min/s);
});

test('no note without bypass or without a pending schedule', () => {
    const noBypass = [];
    noBypass[41] = 0x08;
    noBypass[57] = 90;
    assert.equal(note(noBypass), '');

    const noTimer = [];
    noTimer[41] = 0x0C;
    noTimer[57] = 0;
    assert.equal(note(noTimer), '');
});
