// Harvests top-level functions out of the inline <script> in index.html so they
// can be unit tested without a browser. The app is deliberately a single file
// with no build step, so there is no module boundary to import from — instead we
// slice the source of named function declarations and evaluate them with their
// free variables bound to whatever stubs a test passes in.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INDEX_HTML = path.join(ROOT, 'index.html');

export function readHtml() {
    return fs.readFileSync(INDEX_HTML, 'utf8');
}

export function readScriptBlocks() {
    const blocks = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(readHtml()))) blocks.push(m[1]);
    if (!blocks.length) throw new Error('no inline <script> blocks found in index.html');
    return blocks;
}

// The app lives in the largest block; the other one only registers the SW.
export function readAppScript() {
    return readScriptBlocks().reduce((a, b) => (b.length > a.length ? b : a));
}

const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'do', 'else', 'yield', 'await', 'new']);

function isRegexStart(src, i, prev) {
    if (prev === '') return true;
    if (REGEX_PRECEDERS.has(prev)) return true;
    if (!/[\w$]/.test(prev)) return false;
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    let end = j + 1;
    while (j >= 0 && /[\w$]/.test(src[j])) j--;
    return REGEX_KEYWORDS.has(src.slice(j + 1, end));
}

function skipQuoted(src, i, quote) {
    for (let j = i + 1; j < src.length; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === quote) return j;
    }
    throw new Error(`unterminated ${quote} string at index ${i}`);
}

function skipRegex(src, i) {
    let inClass = false;
    for (let j = i + 1; j < src.length; j++) {
        const c = src[j];
        if (c === '\\') { j++; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) return j;
        else if (c === '\n') break;
    }
    throw new Error(`unterminated regex at index ${i}`);
}

function skipTemplate(src, i) {
    for (let j = i + 1; j < src.length; j++) {
        const c = src[j];
        if (c === '\\') { j++; continue; }
        if (c === '`') return j;
        if (c === '$' && src[j + 1] === '{') j = matchDelim(src, j + 1, '{', '}');
    }
    throw new Error(`unterminated template literal at index ${i}`);
}

// Index of the delimiter closing the one at `start`, skipping over strings,
// template literals, regexes and comments so their contents cannot unbalance us.
function matchDelim(src, start, open, close) {
    let depth = 0;
    let prev = '';
    for (let i = start; i < src.length; i++) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            const nl = src.indexOf('\n', i);
            i = nl < 0 ? src.length : nl;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            const e = src.indexOf('*/', i + 2);
            i = e < 0 ? src.length : e + 1;
            continue;
        }
        if (c === '"' || c === "'") { i = skipQuoted(src, i, c); prev = c; continue; }
        if (c === '`') { i = skipTemplate(src, i); prev = c; continue; }
        if (c === '/' && isRegexStart(src, i, prev)) { i = skipRegex(src, i); prev = '/'; continue; }

        if (c === open) depth++;
        else if (c === close && --depth === 0) return i;

        if (!/\s/.test(c)) prev = c;
    }
    throw new Error(`unbalanced ${open}${close} from index ${start}`);
}

export function extractFunction(name, src = readAppScript()) {
    const decl = new RegExp(`(?:^|[^\\w.$])((?:async\\s+)?function\\s+${name}\\s*\\()`, 'm');
    const m = decl.exec(src);
    if (!m) throw new Error(`no top-level declaration of function ${name}() in index.html`);

    const start = m.index + m[0].length - m[1].length;
    const parenClose = matchDelim(src, src.indexOf('(', start), '(', ')');
    const bodyOpen = src.indexOf('{', parenClose);
    return src.slice(start, matchDelim(src, bodyOpen, '{', '}') + 1);
}

// Evaluates the named functions with `env` supplying their free variables.
// Anything the function references that is absent from `env` and from the Node
// globals throws a ReferenceError when called, which is usually the signal that
// a test is missing a stub.
export function loadFunctions(names, env = {}) {
    const src = readAppScript();
    const bodies = names.map(n => extractFunction(n, src)).join('\n\n');
    const keys = Object.keys(env);
    const factory = new Function(...keys, `${bodies}\nreturn { ${names.join(', ')} };`);
    return factory(...keys.map(k => env[k]));
}

// Options of a <select> in index.html, for asserting on choices the UI offers.
export function selectOptions(id) {
    const html = readHtml();
    const idAt = html.indexOf(`id="${id}"`);
    if (idAt < 0) throw new Error(`no element with id="${id}" in index.html`);

    const open = html.lastIndexOf('<select', idAt);
    const close = html.indexOf('</select>', idAt);
    if (open < 0 || close < 0) throw new Error(`#${id} is not a <select>`);

    const block = html.slice(open, close);
    return [...block.matchAll(/<option\b[^>]*?\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
        .map(o => ({ value: o[1], label: o[2].trim() }));
}
