
const fs = require('fs');

function calculateChecksum(arr) {
    let t = 0xffff;
    console.log(`Debug Packet Length: ${arr.length}`);
    for (let byte of arr) {
        t ^= byte;
        for (let i = 0; i < 8; i++) t = (t & 1) ? ((t >> 1) ^ 40961) : (t >> 1);
    }
    return t & 0xffff;
}

// Packet Structure: Header(11) Op(07) SSIDLen PassLen SSID Pass CRC(2)
// SSID: "Test" -> 54 65 73 74 (4 bytes)
// Pass: "TEST1234" -> 54 45 53 54 31 32 33 34 (8 bytes)

const ssid = "Test";
const pass = "TEST1234";

const ssidBytes = Buffer.from(ssid, 'utf8');
const passBytes = Buffer.from(pass, 'utf8');

console.log(`SSID: "${ssid}" (Len ${ssidBytes.length})`);
console.log(`Pass: "${pass}" (Len ${passBytes.length})`);

const packet = [
    0x11, 0x07,
    ssidBytes.length, passBytes.length,
    ...ssidBytes,
    ...passBytes
];

const crc = calculateChecksum(packet);
const crcHi = (crc >> 8) & 0xff;
const crcLo = crc & 0xff;

const finalPacket = [...packet, crcHi, crcLo];

// Format as hex string
const hexString = finalPacket.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

console.log(`Packet Hex: ${hexString}`);
