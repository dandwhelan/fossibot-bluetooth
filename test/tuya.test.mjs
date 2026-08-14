// The Tuya BLE Switch Robot protocol layer. All of this is hardware-free: the
// crypto, framing, fragmentation and datapoint coding are pure functions, so
// the parts that would be miserable to debug over the air are pinned here.
//
// The AES helpers are the reason this file exists. Tuya zero-pads to the block
// size and crypto.subtle only speaks PKCS#7, so both directions use a trick to
// bridge that; the round-trip tests below check them against Node's own
// no-padding AES rather than against themselves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import { loadFunctions, loadLiteral, readAppScript } from './extract.mjs';

const TUYA_CODE = loadLiteral('TUYA_CODE');
const TUYA_DT = loadLiteral('TUYA_DT');
const TUYA_DP_TABLES = loadLiteral('TUYA_DP_TABLES');
const TUYA_PRODUCT_TABLES = loadLiteral('TUYA_PRODUCT_TABLES');
const MD5_S = loadLiteral('MD5_S');
const TUYA_MTU = 20;

const env = { TUYA_CODE, TUYA_DT, TUYA_DP_TABLES, TUYA_PRODUCT_TABLES, MD5_S, TUYA_MTU };

const t = loadFunctions([
    'md5', 'tuyaConcat', 'tuyaBytes', 'tuyaCrc16', 'tuyaPackInt', 'tuyaUnpackInt',
    'tuyaAesEncrypt', 'tuyaAesDecrypt', 'tuyaBuildPackets', 'tuyaParseFrame',
    'tuyaNewReassembler', 'tuyaFeedFragment', 'tuyaEncodeDps', 'tuyaDecodeDps',
    'tuyaReadDpReport', 'tuyaSkipTimestamp', 'tuyaTimezoneUnits', 'tuyaTimeReply',
    'tuyaDpTable', 'tuyaProductKnown', 'tuyaValidateOption', 'tuyaParseCredentials',
    'tuyaPairingBlob', 'tuyaCredsComplete'
], env);

const hex = b => Buffer.from(b).toString('hex');
const enc = s => new TextEncoder().encode(s);

// Fragment 0 is varint(0), varint(total length), the protocol version byte and
// then the payload. The length varint grows past one byte on longer frames, so
// nothing here may assume a fixed offset.
function fragmentZero(packet) {
    const [num, afterNum] = t.tuyaUnpackInt(packet, 0);
    const [total, afterTotal] = t.tuyaUnpackInt(packet, afterNum);
    return { num, total, version: packet[afterTotal], payload: packet.slice(afterTotal + 1) };
}

test('the GATT MTU the packet builder is tested against is the one in the app', () => {
    assert.match(readAppScript(), /const TUYA_MTU = 20;/);
});

// ---- MD5 ----

test('md5 matches known vectors', () => {
    assert.equal(hex(t.md5(enc(''))), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.equal(hex(t.md5(enc('abc'))), '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(hex(t.md5(enc('The quick brown fox jumps over the lazy dog'))),
        '9e107d9d372bb6826bd81d3542a419d6');
});

test('md5 matches Node across the block-boundary lengths', () => {
    // 55/56 and 63/64 are where the length padding spills into an extra block.
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
        const s = 'x'.repeat(n);
        assert.equal(hex(t.md5(enc(s))), createHash('md5').update(s).digest('hex'), `length ${n}`);
    }
});

test('session key derives from the first six local_key chars plus srand', () => {
    // Only local_key[:6] is key material; the full 16 chars produce a
    // valid-looking session key that the device silently rejects.
    const key6 = t.tuyaBytes('abcdef');
    const srand = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const expected = createHash('md5').update(Buffer.concat([Buffer.from('abcdef'), Buffer.from(srand)])).digest('hex');
    assert.equal(hex(t.md5(t.tuyaConcat(key6, srand))), expected);
    assert.notEqual(hex(t.md5(t.tuyaConcat(t.tuyaBytes('abcdefghijklmnop'), srand))), expected);
});

// ---- CRC-16 Modbus ----

test('crc16 is Modbus, not one of the other CRC-16s', () => {
    assert.equal(t.tuyaCrc16(enc('123456789')), 0x4b37);
    assert.equal(t.tuyaCrc16(new Uint8Array()), 0xffff);
});

// ---- varint ----

test('varint round trips, including multi-byte values', () => {
    for (const v of [0, 1, 127, 128, 300, 16383, 16384, 2097151, 268435455]) {
        const [got, next] = t.tuyaUnpackInt(t.tuyaPackInt(v), 0);
        assert.equal(got, v);
        assert.equal(next, t.tuyaPackInt(v).length);
    }
    assert.equal(t.tuyaPackInt(0).length, 1);
    assert.equal(t.tuyaPackInt(127).length, 1);
    assert.equal(t.tuyaPackInt(128).length, 2);
});

test('varint rejects more than five bytes and truncated input', () => {
    assert.throws(() => t.tuyaUnpackInt(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]), 0), /5 bytes/);
    assert.throws(() => t.tuyaUnpackInt(new Uint8Array([0x80]), 0), /truncated/);
});

// ---- AES with zero padding ----

test('encrypt produces zero-padded ciphertext, with no PKCS#7 block left on the end', async () => {
    const key = t.md5(enc('abc123'));
    const iv = new Uint8Array(16).map((_, i) => i);
    for (const n of [16, 32, 48, 160]) {
        const plain = new Uint8Array(n).map((_, i) => (i * 7) & 0xff);
        const got = await t.tuyaAesEncrypt(key, iv, plain);

        const cipher = createCipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);
        const want = Buffer.concat([cipher.update(Buffer.from(plain)), cipher.final()]);

        assert.equal(hex(got), want.toString('hex'), `${n} bytes`);
        assert.equal(got.length, n, 'ciphertext must be the same length as the plaintext');
    }
});

test('decrypt reads back a zero-padded ciphertext subtle would otherwise reject', async () => {
    const key = t.md5(enc('abc123'));
    const iv = new Uint8Array(16).map((_, i) => 255 - i);
    for (const n of [16, 32, 160]) {
        const plain = new Uint8Array(n).map((_, i) => (i * 13) & 0xff);
        const back = await t.tuyaAesDecrypt(key, iv, await t.tuyaAesEncrypt(key, iv, plain));
        assert.equal(hex(back), hex(plain), `${n} bytes`);
    }
});

test('a zero-padded frame really is what goes on the wire', async () => {
    // A frame whose plaintext already fills a block still gains a whole block of
    // zeros, matching the reference implementation's `16 - len % 16`.
    const key = t.md5(enc('abcdef'));
    const packets = await t.tuyaBuildPackets(1, TUYA_CODE.DPS, new Uint8Array(2), key);
    const blob = t.tuyaConcat(...packets.map((p, i) => p.slice(i === 0 ? 3 : 1)));
    assert.equal((blob.length - 17) % 16, 0);
});

// ---- framing ----

async function roundTrip(seq, code, data, key, flagKeys) {
    const packets = await t.tuyaBuildPackets(seq, code, data, key);
    const state = t.tuyaNewReassembler();
    let blob = null;
    for (const p of packets) blob = t.tuyaFeedFragment(state, p) || blob;
    assert.ok(blob, 'fragments should reassemble');
    return { packets, frame: await t.tuyaParseFrame(blob, flagKeys) };
}

test('a frame survives build, fragment, reassemble and parse', async () => {
    const key = t.md5(enc('abcdef'));
    const payload = enc('hello fingerbot');
    const { frame } = await roundTrip(1, TUYA_CODE.DEVICE_INFO, payload, key, { 4: key });
    assert.equal(frame.seq, 1);
    assert.equal(frame.code, TUYA_CODE.DEVICE_INFO);
    assert.equal(frame.responseTo, 0);
    assert.equal(new TextDecoder().decode(frame.data), 'hello fingerbot');
});

test('device info is keyed with the login key, everything else with the session key', async () => {
    const key = t.md5(enc('abcdef'));
    const info = await t.tuyaBuildPackets(1, TUYA_CODE.DEVICE_INFO, new Uint8Array(0), key);
    const dps = await t.tuyaBuildPackets(2, TUYA_CODE.DPS, new Uint8Array(0), key);
    assert.equal(fragmentZero(info[0]).payload[0], 0x04, 'device info carries security flag 4');
    assert.equal(fragmentZero(dps[0]).payload[0], 0x05, 'later frames carry security flag 5');
});

test('every fragment fits the 20-byte MTU and the first carries length and version', async () => {
    const key = t.md5(enc('abcdef'));
    const big = new Uint8Array(200).map((_, i) => i & 0xff);
    const { packets, frame } = await roundTrip(7, TUYA_CODE.DPS, big, key, { 5: key });

    assert.ok(packets.length > 1, 'a 200-byte payload should need several fragments');
    for (const p of packets) assert.ok(p.length <= TUYA_MTU, `fragment of ${p.length} bytes exceeds the MTU`);

    const first = fragmentZero(packets[0]);
    assert.equal(first.num, 0, 'first fragment is numbered 0');
    assert.equal(first.version, 0x30, 'protocol version 3 is sent as 3 << 4');
    // This frame's length needs a two-byte varint, so the version byte has moved
    // along — the header is only readable by decoding it.
    assert.ok(first.total > 127, 'this payload should push the length varint past one byte');
    const carried = first.payload.length + packets.slice(1).reduce((n, p) => n + p.length - 1, 0);
    assert.equal(first.total, carried, 'the declared length must match what the fragments carry');
    assert.equal(hex(frame.data), hex(big));
    assert.equal(frame.seq, 7);
});

test('a corrupted frame is rejected on its CRC rather than parsed', async () => {
    const key = t.md5(enc('abcdef'));
    const packets = await t.tuyaBuildPackets(1, TUYA_CODE.DPS, enc('payload'), key);
    const state = t.tuyaNewReassembler();
    let blob = null;
    for (const p of packets) blob = t.tuyaFeedFragment(state, p) || blob;
    blob[20] ^= 0xff;
    await assert.rejects(() => t.tuyaParseFrame(blob, { 5: key }), /CRC mismatch|frame /);
});

test('an unknown security flag is refused rather than decrypted with the wrong key', async () => {
    const key = t.md5(enc('abcdef'));
    const packets = await t.tuyaBuildPackets(1, TUYA_CODE.DPS, enc('x'), key);
    const state = t.tuyaNewReassembler();
    let blob = null;
    for (const p of packets) blob = t.tuyaFeedFragment(state, p) || blob;
    await assert.rejects(() => t.tuyaParseFrame(blob, { 4: key }), /unknown security flag/);
});

// ---- reassembly ----

test('reassembly drops the buffer on a missing fragment', async () => {
    const key = t.md5(enc('abcdef'));
    const packets = await t.tuyaBuildPackets(1, TUYA_CODE.DPS, new Uint8Array(200), key);
    const state = t.tuyaNewReassembler();

    assert.equal(t.tuyaFeedFragment(state, packets[0]), null);
    assert.equal(t.tuyaFeedFragment(state, packets[3]), null, 'a gap yields nothing');
    assert.equal(state.expected, 0, 'and resets, rather than assembling a frame with a hole in it');
});

test('a retransmission starting over at fragment 0 is picked up, not discarded', async () => {
    const key = t.md5(enc('abcdef'));
    const packets = await t.tuyaBuildPackets(1, TUYA_CODE.DPS, enc('retransmitted payload'), key);
    const state = t.tuyaNewReassembler();

    t.tuyaFeedFragment(state, packets[0]);
    t.tuyaFeedFragment(state, packets[1]);

    let blob = null;
    for (const p of packets) blob = t.tuyaFeedFragment(state, p) || blob;
    assert.ok(blob, 'starting again at fragment 0 should reassemble cleanly');
    const frame = await t.tuyaParseFrame(blob, { 5: key });
    assert.equal(new TextDecoder().decode(frame.data), 'retransmitted payload');
});

test('reassembly recovers after a dropped frame', async () => {
    const key = t.md5(enc('abcdef'));
    const first = await t.tuyaBuildPackets(1, TUYA_CODE.DPS, new Uint8Array(200), key);
    const second = await t.tuyaBuildPackets(2, TUYA_CODE.DPS, enc('after the gap'), key);
    const state = t.tuyaNewReassembler();

    t.tuyaFeedFragment(state, first[0]);
    t.tuyaFeedFragment(state, first[4]);

    let blob = null;
    for (const p of second) blob = t.tuyaFeedFragment(state, p) || blob;
    const frame = await t.tuyaParseFrame(blob, { 5: key });
    assert.equal(new TextDecoder().decode(frame.data), 'after the gap');
});

// ---- datapoints ----

test('datapoint records encode to the documented TLV layout', () => {
    assert.equal(hex(t.tuyaEncodeDps([{ dp: 2, type: TUYA_DT.BOOL, value: true }])), '02010101');
    assert.equal(hex(t.tuyaEncodeDps([{ dp: 9, type: TUYA_DT.VALUE, value: 80 }])), '09020400000050');
    assert.equal(hex(t.tuyaEncodeDps([{ dp: 8, type: TUYA_DT.ENUM, value: 1 }])), '08040101');
});

test('DT_VALUE is always four signed bytes', () => {
    const bytes = t.tuyaEncodeDps([{ dp: 10, type: TUYA_DT.VALUE, value: -1 }]);
    assert.equal(bytes[2], 4);
    assert.equal(hex(bytes.slice(3)), 'ffffffff');
});

test('datapoints round trip through encode and decode', () => {
    const records = [
        { dp: 2, type: TUYA_DT.BOOL, value: true },
        { dp: 8, type: TUYA_DT.ENUM, value: 2 },
        { dp: 9, type: TUYA_DT.VALUE, value: 80 },
        { dp: 12, type: TUYA_DT.VALUE, value: 47 }
    ];
    const { dps, leftover } = t.tuyaDecodeDps(t.tuyaEncodeDps(records));
    assert.equal(leftover, 0);
    assert.equal(dps[2].value, true);
    assert.equal(dps[8].value, 2);
    assert.equal(dps[9].value, 80);
    assert.equal(dps[12].value, 47);
});

test('a value shorter than four bytes is sign-extended from its declared width', () => {
    // The device picks the width, so a 1-byte -1 must not read as 255.
    const { dps } = t.tuyaDecodeDps(new Uint8Array([12, TUYA_DT.VALUE, 1, 0xff]));
    assert.equal(dps[12].value, -1);
    const { dps: two } = t.tuyaDecodeDps(new Uint8Array([12, TUYA_DT.VALUE, 2, 0xff, 0xfe]));
    assert.equal(two[12].value, -2);
    const { dps: pos } = t.tuyaDecodeDps(new Uint8Array([12, TUYA_DT.VALUE, 1, 0x64]));
    assert.equal(pos[12].value, 100);
});

test('a malformed record run is reported rather than half-parsed', () => {
    assert.equal(t.tuyaDecodeDps(new Uint8Array([2, 9, 1, 0])), null, 'type 9 does not exist');
    assert.equal(t.tuyaDecodeDps(new Uint8Array([2, 2, 40, 0])), null, 'length runs past the buffer');
});

test('a signed report is read from whichever offset consumes it exactly', () => {
    // The reference implementation reads flags at offset 2 but parses records
    // from offset 2 as well, while its timestamped variant parses from 3.
    // Both layouts have to survive, so the offset is chosen by what fits.
    const records = t.tuyaEncodeDps([{ dp: 12, type: TUYA_DT.VALUE, value: 90 }]);
    const atThree = t.tuyaConcat(new Uint8Array([0x00, 0x01, 0x00]), records);
    assert.equal(t.tuyaReadDpReport(atThree, [3, 2])[12].value, 90);

    const atTwo = t.tuyaConcat(new Uint8Array([0x00, 0x01]), records);
    assert.equal(t.tuyaReadDpReport(atTwo, [3, 2])[12].value, 90);
});

test('an unreadable report yields nothing rather than throwing at the caller', () => {
    assert.deepEqual(t.tuyaReadDpReport(new Uint8Array([1, 9, 9, 9]), [3, 2]), {});
});

test('timestamps are skipped by their format byte', () => {
    assert.equal(t.tuyaSkipTimestamp(new Uint8Array([0, ...new Array(13).fill(0x30)]), 0), 14);
    assert.equal(t.tuyaSkipTimestamp(new Uint8Array([1, 0, 0, 0, 0]), 0), 5);
    assert.throws(() => t.tuyaSkipTimestamp(new Uint8Array([2]), 0), /unknown timestamp/);
});

// ---- clock replies ----

test('a time request is answered in the format the device asked for', () => {
    const when = new Date('2026-03-04T05:06:07Z');
    const one = t.tuyaTimeReply(TUYA_CODE.RECEIVE_TIME1_REQ, when);
    assert.equal(new TextDecoder().decode(one.slice(0, one.length - 2)), String(when.getTime()));
    assert.equal(one.length, String(when.getTime()).length + 2);

    const two = t.tuyaTimeReply(TUYA_CODE.RECEIVE_TIME2_REQ, when);
    assert.equal(two.length, 9, 'seven date bytes plus a two-byte offset');
    assert.equal(two[0], when.getFullYear() % 100);
    assert.equal(two[1], when.getMonth() + 1);
    assert.equal(two[6], (when.getDay() + 6) % 7, 'weekday counts from Monday, as Python does');
});

test('the UTC offset is in hundredths of an hour', () => {
    assert.equal(t.tuyaTimezoneUnits({ getTimezoneOffset: () => -60 }), 100);
    assert.equal(t.tuyaTimezoneUnits({ getTimezoneOffset: () => 0 }), 0);
    assert.equal(t.tuyaTimezoneUnits({ getTimezoneOffset: () => 300 }), -500);
});

// ---- pairing ----

test('the pairing blob is uuid, then six key bytes, then device id, in 44 bytes', () => {
    const blob = t.tuyaPairingBlob({
        uuid: '0123456789abcdef', local_key: 'ABCDEFGHIJKLMNOP', device_id: 'bf12345678901234abcd'
    });
    assert.equal(blob.length, 44);
    assert.equal(new TextDecoder().decode(blob.slice(0, 16)), '0123456789abcdef');
    assert.equal(new TextDecoder().decode(blob.slice(16, 22)), 'ABCDEF', 'only six key chars are sent');
    assert.equal(new TextDecoder().decode(blob.slice(22, 42)), 'bf12345678901234abcd');
    assert.deepEqual([...blob.slice(42)], [0, 0], 'the tail is zero padding');
});

// ---- datapoint maps ----

test('a known product id selects its datapoint map', () => {
    assert.equal(t.tuyaDpTable({ product_id: 'y6kttvd6' }), TUYA_DP_TABLES.fingerbot);
    assert.equal(t.tuyaDpTable({ product_id: 'blliqpsj' }), TUYA_DP_TABLES.fingerbot_plus);
    assert.equal(t.tuyaDpTable({ product_id: '3yqdo5yt' }), TUYA_DP_TABLES.cubetouch);
});

test('an unknown product id falls back to the Fingerbot map and says so', () => {
    // ADSBB201's product id is not confirmed, so the fallback is the normal path
    // rather than an error — but the panel has to be able to flag it.
    assert.equal(t.tuyaDpTable({ product_id: 'whoknows' }), TUYA_DP_TABLES.fingerbot);
    assert.equal(t.tuyaDpTable({}), TUYA_DP_TABLES.fingerbot);
    assert.equal(t.tuyaProductKnown({ product_id: 'whoknows' }), false);
    assert.equal(t.tuyaProductKnown({ product_id: 'y6kttvd6' }), true);
});

test('the CubeTouch map really is a different layout, not a copy', () => {
    assert.equal(TUYA_DP_TABLES.fingerbot.switch.dp, 2);
    assert.equal(TUYA_DP_TABLES.cubetouch.switch.dp, 1);
    assert.equal(TUYA_DP_TABLES.cubetouch.battery.dp, 8);
});

test('every product id maps to a table that exists', () => {
    for (const [product, table] of Object.entries(TUYA_PRODUCT_TABLES)) {
        assert.ok(TUYA_DP_TABLES[table], `${product} points at a missing table ${table}`);
    }
});

// ---- validation ----

test('positions are held to the range the resolved map declares', () => {
    const fingerbot = TUYA_DP_TABLES.fingerbot;
    assert.match(t.tuyaValidateOption('up_position', 60, fingerbot, {}), /between 0 and 50/);
    assert.equal(t.tuyaValidateOption('up_position', 40, fingerbot, {}), null);
    assert.match(t.tuyaValidateOption('down_position', 40, fingerbot, {}), /between 51 and 100/);

    // CubeTouch allows the full sweep on both, so the constant must not be shared.
    assert.equal(t.tuyaValidateOption('up_position', 60, TUYA_DP_TABLES.cubetouch, {}), null);
});

test('settings the device would silently ignore are refused', () => {
    const fingerbot = TUYA_DP_TABLES.fingerbot;
    assert.match(t.tuyaValidateOption('hold_time', 5, fingerbot, { mode: 'switch' }), /push mode/);
    assert.equal(t.tuyaValidateOption('hold_time', 5, fingerbot, { mode: 'push' }), null);
    assert.match(t.tuyaValidateOption('up_position', 20, fingerbot, { mode: 'program' }), /program mode/);
    assert.match(t.tuyaValidateOption('hold_time', 40, fingerbot, { mode: 'push' }), /between 0 and 10/);
});

test('read-only and absent datapoints cannot be written', () => {
    assert.match(t.tuyaValidateOption('battery', 50, TUYA_DP_TABLES.fingerbot, {}), /read-only/);
    assert.match(t.tuyaValidateOption('manual_control', true, TUYA_DP_TABLES.fingerbot, {}), /not supported/);
    assert.equal(t.tuyaValidateOption('manual_control', true, TUYA_DP_TABLES.fingerbot_plus, {}), null);
});

// ---- credentials ----

test('credentials are read from a tinytuya entry or from flat field names', () => {
    const fromTinytuya = t.tuyaParseCredentials(JSON.stringify({
        name: 'Switch Robot', id: 'bf12345678901234abcd', key: 'ABCDEFGHIJKLMNOP',
        uuid: '0123456789abcdef', product_id: 'y6kttvd6', category: 'szjqr'
    }));
    assert.equal(fromTinytuya.device_id, 'bf12345678901234abcd');
    assert.equal(fromTinytuya.local_key, 'ABCDEFGHIJKLMNOP');

    const flat = t.tuyaParseCredentials(JSON.stringify({
        device_id: 'bf1', uuid: 'u1', local_key: 'ABCDEFGH', product_id: 'y6kttvd6'
    }));
    assert.equal(flat.device_id, 'bf1');
    assert.equal(flat.category, 'szjqr', 'the fingerbot category is the default');
});

test('a whole devices.json array picks the first entry', () => {
    const creds = t.tuyaParseCredentials(JSON.stringify([
        { id: 'bf1', uuid: 'u1', key: 'ABCDEFGH' }
    ]));
    assert.equal(creds.device_id, 'bf1');
});

test('incomplete credentials are rejected with what is missing', () => {
    assert.throws(() => t.tuyaParseCredentials('not json'), /valid JSON/);
    assert.throws(() => t.tuyaParseCredentials('{"id":"bf1"}'), /missing uuid, local_key/);
    assert.throws(() => t.tuyaParseCredentials('{"id":"bf1","uuid":"u","key":"abc"}'), /too short/);
});

test('a short local_key never counts as ready, since only six chars are usable', () => {
    assert.equal(t.tuyaCredsComplete({ device_id: 'a', uuid: 'b', local_key: 'abc' }), false);
    assert.equal(t.tuyaCredsComplete({ device_id: 'a', uuid: 'b', local_key: 'abcdef' }), true);
    assert.equal(t.tuyaCredsComplete(null), false);
});
