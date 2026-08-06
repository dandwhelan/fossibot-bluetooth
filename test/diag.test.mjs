// The Diag tab's Copy JSON / import pair is the maintainer's main tool for
// debugging user reports, so a dump has to survive the round trip. The import
// side also parses whatever a reporter pastes in, so it has to reject junk
// without taking the tab down with it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';
import { makeDocument } from './harness.mjs';

function makeDiag({ device = { name: 'POWER-2400' }, registers = [], settingsRegisters = [] } = {}) {
    const { document, el } = makeDocument();
    const calls = { toasts: [], logs: [], errors: [], alerts: [], renders: 0, copied: [] };
    const importedDiagDataList = [];

    const api = loadFunctions(['copyDiagnosticsV2', 'processDiagImport'], {
        document,
        console: {
            log() {}, warn() {},
            error: (...a) => calls.errors.push(a.map(String).join(' ')),
        },
        navigator: { clipboard: { writeText: async json => { calls.copied.push(json); } } },
        alert: msg => calls.alerts.push(String(msg)),
        log: msg => calls.logs.push(String(msg)),
        showToast: (msg, type) => calls.toasts.push({ msg: String(msg), type }),
        device,
        registers,
        settingsRegisters,
        settings: { mainCap: 2048, expCap: 1024 },
        importedDiagDataList,
        isCompareMode: false,
        closeImportModal: () => {},
        updateCompareButtonState: () => {},
        renderDiagnostics: () => { calls.renders++; },
    });

    const paste = text => { el('import-diag-data').value = text; };
    return { ...api, calls, importedDiagDataList, paste, el };
}

const lastToast = calls => calls.toasts.at(-1);

test('a dump survives the round trip back through import', async () => {
    const registers = [];
    registers[8] = 136;
    registers[20] = 450;
    registers[56] = 731;
    const settingsRegisters = [];
    settingsRegisters[13] = 5;
    settingsRegisters[57] = 1;

    const d = makeDiag({ registers, settingsRegisters });
    await d.copyDiagnosticsV2();

    const [json] = d.calls.copied;
    assert.ok(json, 'nothing was copied');

    d.paste(json);
    d.processDiagImport();

    const imported = d.importedDiagDataList[0];
    assert.equal(imported.device, 'POWER-2400');
    assert.equal(imported.inputRegisters[56], 731);
    assert.equal(imported.settingsRegisters[13], 5);
    assert.equal(imported.systemInfo.mainCap, 2048);
});

test('a dump taken while offline still round trips', async () => {
    const d = makeDiag({ device: null, registers: [1, 2, 3] });
    await d.copyDiagnosticsV2();

    d.paste(d.calls.copied[0]);
    d.processDiagImport();

    assert.equal(d.importedDiagDataList[0].device, 'Offline');
});

test('the dump carries a version and a timestamp', async () => {
    const d = makeDiag({ registers: [1] });
    await d.copyDiagnosticsV2();

    const dump = JSON.parse(d.calls.copied[0]);
    assert.equal(dump.version, 2);
    assert.ok(!Number.isNaN(Date.parse(dump.timestamp)), 'timestamp is not parseable');
});

test('importing the same device replaces its entry rather than duplicating it', async () => {
    const d = makeDiag({ registers: [] });
    await d.copyDiagnosticsV2();
    const json = d.calls.copied[0];

    d.paste(json);
    d.processDiagImport();
    d.paste(json.replace('"56": 0', '"56": 900'));
    d.processDiagImport();

    assert.equal(d.importedDiagDataList.length, 1);
    assert.match(lastToast(d.calls).msg, /Updated/);
});

test('importing a second device appends it', () => {
    const d = makeDiag();

    d.paste(JSON.stringify({ device: 'F3600', inputRegisters: [1] }));
    d.processDiagImport();
    d.paste(JSON.stringify({ device: 'P210', inputRegisters: [2] }));
    d.processDiagImport();

    assert.deepEqual(d.importedDiagDataList.map(x => x.device), ['F3600', 'P210']);
});

test('an empty paste is refused', () => {
    const d = makeDiag();
    d.paste('   ');
    d.processDiagImport();

    assert.equal(lastToast(d.calls).type, 'error');
    assert.equal(d.importedDiagDataList.length, 0);
});

test('malformed JSON is refused without throwing', () => {
    const d = makeDiag();

    for (const junk of ['{not json', '[1,2', 'undefined', '{"a":']) {
        d.paste(junk);
        assert.doesNotThrow(() => d.processDiagImport(), `threw on ${junk}`);
        assert.equal(lastToast(d.calls).type, 'error');
    }
    assert.equal(d.importedDiagDataList.length, 0);
});

test('valid JSON without register data is refused', () => {
    const d = makeDiag();

    for (const shape of ['{}', '{"device":"F2400"}', '[]', '"a string"', '42']) {
        d.paste(shape);
        d.processDiagImport();
        assert.equal(lastToast(d.calls).type, 'error', `accepted ${shape}`);
    }
    assert.equal(d.importedDiagDataList.length, 0);
});

test('a dump with only settings registers is accepted', () => {
    const d = makeDiag();
    d.paste(JSON.stringify({ device: 'F2400', settingsRegisters: [0, 1, 2] }));
    d.processDiagImport();

    assert.equal(d.importedDiagDataList.length, 1);
    assert.notEqual(lastToast(d.calls).type, 'error');
});

test('an import with no device name is labelled rather than dropped', () => {
    const d = makeDiag();
    d.paste(JSON.stringify({ inputRegisters: [1, 2] }));
    d.processDiagImport();

    assert.equal(d.importedDiagDataList.length, 1);
    assert.match(lastToast(d.calls).msg, /Unknown/);
});

test('a successful import redraws the diagnostics tab', () => {
    const d = makeDiag();
    d.paste(JSON.stringify({ device: 'F2400', inputRegisters: [1] }));
    d.processDiagImport();

    assert.equal(d.calls.renders, 1);
});
