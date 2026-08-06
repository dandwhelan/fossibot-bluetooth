// Shared fixtures for testing functions that expect a browser and a device.

// Minimal stand-in for the DOM. Every id resolves to an element, so code under
// test can poke at whatever it likes; tests then inspect `doc.el('some-id')`.
export function makeDocument() {
    const elements = new Map();

    const makeElement = id => {
        const classes = new Set();
        return {
            id,
            textContent: '',
            innerHTML: '',
            value: '',
            checked: false,
            disabled: false,
            style: {},
            classList: {
                add: (...c) => c.forEach(x => classes.add(x)),
                remove: (...c) => c.forEach(x => classes.delete(x)),
                toggle: (c, force) => (force ?? !classes.has(c)) ? classes.add(c) : classes.delete(c),
                contains: c => classes.has(c),
            },
            classes,
            appendChild() {},
            remove() {},
            addEventListener() {},
            removeEventListener() {},
            querySelectorAll: () => [],
            querySelector: () => null,
            setAttribute() {},
            getAttribute: () => null,
        };
    };

    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeElement(id));
            return elements.get(id);
        },
        createElement: id => makeElement(id),
        querySelectorAll: () => [],
        querySelector: () => null,
        body: makeElement('body'),
    };

    return { document, el: id => document.getElementById(id), elements };
}

const REG_OFFSET = 6;

// Builds the DataView a BLE notification would carry. `regs` is a sparse
// {index: value} map; everything else reads back as zero.
export function buildPacket({ header = 0x11, opCode = 0x04, regs = {}, regCount = 90, prefix = [0, 0, 0, 0] } = {}) {
    const bytes = new Uint8Array(REG_OFFSET + regCount * 2);
    bytes[0] = header;
    bytes[1] = opCode;
    prefix.forEach((b, i) => { bytes[2 + i] = b; });

    const view = new DataView(bytes.buffer);
    for (const [idx, val] of Object.entries(regs)) {
        const offset = REG_OFFSET + Number(idx) * 2;
        if (offset + 1 < bytes.length) view.setUint16(offset, val, false);
    }
    return view;
}

export function statusPacket(regs, opts = {}) {
    return buildPacket({ opCode: 0x04, regs, ...opts });
}

export function settingsPacket(regs, opts = {}) {
    return buildPacket({ opCode: 0x03, regs, regCount: 82, ...opts });
}

export function rawPacket(bytes) {
    return new DataView(Uint8Array.from(bytes).buffer);
}

export const asEvent = value => ({ target: { value } });
