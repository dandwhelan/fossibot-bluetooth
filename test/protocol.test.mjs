import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './extract.mjs';

const { calculateChecksum, generateCommandBytes } = loadFunctions([
    'calculateChecksum',
    'generateCommandBytes',
]);

const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
const bytesOf = str => [...Buffer.from(str, 'latin1')];

test('checksum matches the published CRC-16/MODBUS check value', () => {
    assert.equal(calculateChecksum(bytesOf('123456789')), 0x4b37);
});

test('checksum is seeded to 0xFFFF and consumes every byte', () => {
    assert.equal(calculateChecksum([]), 0xffff);
    assert.notEqual(calculateChecksum([0x11, 0x06]), calculateChecksum([0x06, 0x11]));
    assert.notEqual(calculateChecksum([0x00]), calculateChecksum([]));
});

test('checksum stays inside 16 bits', () => {
    for (let reg = 0; reg < 90; reg++) {
        const crc = calculateChecksum([0x11, 0x06, 0x00, reg, 0x03, 0xe8]);
        assert.ok(Number.isInteger(crc) && crc >= 0 && crc <= 0xffff, `reg ${reg} produced ${crc}`);
    }
});

// PROTOCOL.md: Header(11) Op(06) RegHi RegLo ValHi ValLo CRC_Hi CRC_Lo
test('write packets are 8 bytes of header, fixed opcode, big-endian reg and value', () => {
    const pkt = generateCommandBytes(0x11, 0x0102, 0x0304);
    assert.equal(pkt.length, 8);
    assert.equal(pkt[0], 0x11);
    assert.equal(pkt[1], 0x06);
    assert.deepEqual([...pkt.slice(2, 6)], [0x01, 0x02, 0x03, 0x04]);
});

test('CRC is appended hi-byte first', () => {
    const payload = [0x11, 0x06, 0x00, 0x39, 0x00, 0x01];
    const crc = calculateChecksum(payload);
    const pkt = generateCommandBytes(0x11, 57, 1);

    assert.equal(pkt[6], (crc >> 8) & 0xff);
    assert.equal(pkt[7], crc & 0xff);
    assert.notEqual(pkt[6], pkt[7], 'pick a vector where the two orders differ');
});

// Frozen wire bytes. These are the only description of the write format outside
// the implementation itself — PROTOCOL.md documents the layout but carries no
// worked CRC — so a silent regression here would break every command sent.
test('golden write packets', () => {
    const vectors = [
        [57, 1, '11 06 00 39 00 01 97 9a'],    // silent charging on
        [57, 0, '11 06 00 39 00 00 57 5b'],    // silent charging off
        [27, 3, '11 06 00 1b 00 03 5c bb'],    // light mode SOS
        [24, 0, '11 06 00 18 00 00 5d 0b'],    // USB output off
        [64, 1, '11 06 00 40 00 01 4e 4b'],    // power off
        [68, 5, '11 06 00 44 00 05 4c 0b'],    // shutdown timer 5 min
        [68, 480, '11 06 00 44 01 e0 57 cb'],  // shutdown timer 8 h
        [13, 5, '11 06 00 0d 00 05 9a da'],    // AC charge rate level 5
        [67, 1100, '11 06 00 43 04 4c bb 79'], // charge limit 110.0%
        [66, 900, '11 06 00 42 03 84 dd 2b'],  // discharge limit 90.0%
    ];

    for (const [reg, val, expected] of vectors) {
        assert.equal(hex(generateCommandBytes(0x11, reg, val)), expected, `reg ${reg} = ${val}`);
    }
});

test('packet is a Uint8Array so writeValue accepts it directly', () => {
    assert.ok(generateCommandBytes(0x11, 57, 1) instanceof Uint8Array);
});
