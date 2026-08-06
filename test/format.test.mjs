// formatRegisterData() turns raw register values into what the Diag tab shows.
// Every scaling factor here is a place a value can be silently displayed ten
// times too large or too small.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions, loadLiteral } from './extract.mjs';

const KNOWN_REGS = loadLiteral('KNOWN_REGS');
const { formatRegisterData } = loadFunctions(['formatRegisterData'], { KNOWN_REGS });

// Formats a value as if it sat in a register that uses the given format.
const asFormat = (format, val) => {
    const reg = Number(Object.keys(KNOWN_REGS).find(k => KNOWN_REGS[k].format === format));
    assert.ok(Number.isInteger(reg), `no register in KNOWN_REGS uses the "${format}" format`);
    return formatRegisterData(reg, val);
};

test('registers with no entry or no format render as empty', () => {
    assert.equal(formatRegisterData(9999, 5), '');
    assert.equal(formatRegisterData(3, 5), '', 'reg 3 carries a unit, not a format');
});

test('an undefined value renders as empty rather than NaN', () => {
    for (const reg of Object.keys(KNOWN_REGS).map(Number)) {
        assert.equal(formatRegisterData(reg, undefined), '');
    }
});

test('scaled numeric formats divide by the right factor', () => {
    assert.equal(asFormat('volt', 2301), '230.1V');
    assert.equal(asFormat('freq01', 500), '50.0Hz');
    assert.equal(asFormat('watt', 1100), '1100W');
    assert.equal(asFormat('percent01', 1000), '100.0%');
    assert.equal(asFormat('capacity', 374), '37.4Ah');
});

test('extension SOC subtracts the ten offset and reports absence', () => {
    assert.equal(asFormat('ext_soc', 0), 'N/A');
    assert.equal(asFormat('ext_soc', 10), '0.0%');
    assert.equal(asFormat('ext_soc', 1010), '100.0%');
});

test('toggles and light modes render their labels', () => {
    assert.equal(asFormat('toggle', 0), 'OFF');
    assert.equal(asFormat('toggle', 1), 'ON');

    assert.equal(asFormat('light', 0), 'OFF');
    assert.equal(asFormat('light', 3), 'SOS');
});

// Out-of-range values come off a real device; falling back to the raw number
// keeps the Diag tab useful instead of printing "undefined".
test('out-of-range enum values fall back to the raw value', () => {
    assert.equal(asFormat('light', 9), 9);
    assert.equal(asFormat('charge_level', 9), 'Lvl 9 (1800W)');
});

test('charge levels map to their documented wattages', () => {
    for (const [level, watts] of [[1, 300], [2, 500], [3, 700], [4, 900], [5, 1100]]) {
        assert.equal(asFormat('charge_level', level), `Lvl ${level} (${watts}W)`);
    }
});

test('durations render as hours and minutes, and zero as a placeholder', () => {
    assert.equal(asFormat('time', 0), '--');
    assert.equal(asFormat('time', 45), '0h 45m');
    assert.equal(asFormat('time', 125), '2h 5m');
});

// Reg 68 uses the 'mins' format, where 0 would read as "Never" — the value the
// UI must never offer. This pins the label, not permission to write it.
test('minute timers render as minutes, with zero labelled Never', () => {
    assert.equal(asFormat('mins', 480), '480 min');
    assert.equal(asFormat('mins', 0), 'Never');
});

test('flag registers render as uppercase hex', () => {
    assert.equal(asFormat('flags', 0xe3d8), '0xE3D8');
    assert.equal(asFormat('flags', 0), '0x0');
});

test('the register map keeps its documented formats for the registers that matter', () => {
    assert.equal(KNOWN_REGS[8].format, 'raw', 'reg 8 is the error code');
    assert.equal(KNOWN_REGS[13].format, 'charge_level');
    assert.equal(KNOWN_REGS[42].format, 'flags');
    assert.equal(KNOWN_REGS[56].format, 'percent01', 'reg 56 is main SOC x10');
});

// 'raw' deliberately renders nothing: renderDiagnostics already prints the
// decimal and hex in their own columns, and this is the extra decoded column.
// Every other declared format must produce something, so a typo in a format
// name ('volts' for 'volt') shows up here rather than as a blank cell.
test('every declared format renders, apart from the deliberately bare raw', () => {
    const unhandled = Object.entries(KNOWN_REGS)
        .filter(([reg, info]) => info.format && info.format !== 'raw')
        .filter(([reg]) => formatRegisterData(Number(reg), 1) === '')
        .map(([reg, info]) => `reg ${reg} (${info.format})`);

    assert.deepEqual(unhandled, [], 'these registers declare a format with no branch to render it');
});

test('the raw format is bare because the value has its own column', () => {
    const rawRegs = Object.entries(KNOWN_REGS).filter(([, i]) => i.format === 'raw').map(([r]) => Number(r));

    assert.ok(rawRegs.includes(8), 'reg 8 is the canonical raw register');
    for (const reg of rawRegs) assert.equal(formatRegisterData(reg, 136), '');
});
