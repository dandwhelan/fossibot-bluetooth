const fs = require('fs');

if (process.argv.length < 3) {
    console.log("Usage: node parse_log.js <filename> [outfile]");
    process.exit(1);
}

const filename = process.argv[2];
const outFile = process.argv[3];

if (outFile && fs.existsSync(outFile)) {
    fs.unlinkSync(outFile);
}

const log = (msg) => {
    if (outFile) fs.appendFileSync(outFile, msg + '\n', 'utf8');
    else console.log(msg);
};

let buf;
try {
    buf = fs.readFileSync(filename);
} catch (e) {
    console.error("Error reading file:", e.message);
    process.exit(1);
}

let offset = 0;

// Header
if (buf.length < 16) {
    log("File too short");
    process.exit(1);
}

const magic = buf.subarray(0, 8).toString();
if (magic !== 'btsnoop\0') {
    log(`Invalid magic: ${magic}`);
    process.exit(1);
}
offset += 16; // Skip header

let packetNum = 0;
while (offset < buf.length) {
    if (offset + 24 > buf.length) break;

    const inc_len = buf.readUInt32BE(offset + 4);
    offset += 24;

    if (offset + inc_len > buf.length) break;
    const packetData = buf.subarray(offset, offset + inc_len);
    offset += inc_len;
    packetNum++;

    if (packetData.length < 1) continue;

    const type = packetData[0];
    if (type === 0x02) { // ACL
        if (packetData.length < 5) continue;
        const handleFlags = packetData.readUInt16LE(1);
        const handle = handleFlags & 0x0FFF;

        const payload = packetData.subarray(5);
        if (payload.length < 4) continue;
        const l2capLen = payload.readUInt16LE(0);
        const l2capCid = payload.readUInt16LE(2);

        const l2capPayload = payload.subarray(4);

        if (l2capCid === 0x0004) { // ATT
            if (l2capPayload.length < 1) continue;
            const opcode = l2capPayload[0];

            if ([0x12, 0x52, 0x1B].includes(opcode)) {
                if (l2capPayload.length < 3) continue;
                // Opcode(1) + Handle(2) + Value
                const attHandle = l2capPayload.readUInt16LE(1);
                const value = l2capPayload.subarray(3);

                let ascii = '';
                for (let i = 0; i < value.length; i++) {
                    const c = value[i];
                    if (c >= 32 && c <= 126) ascii += String.fromCharCode(c);
                    else ascii += '.';
                }

                log(`#${packetNum} Op:0x${opcode.toString(16)} Hdl:0x${attHandle.toString(16)} Len:${value.length} Data:${value.toString('hex')}`);
                log(`  TXT: ${ascii}`);
            }
        }
    }
}
