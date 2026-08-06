// The app ships straight from index.html with no build step, so a syntax error
// in the inline script reaches GitHub Pages unchallenged. This is the
// `node --check` step from CLAUDE.md, wired up so it runs on every commit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readScriptBlocks } from './extract.mjs';

const run = promisify(execFile);

test('every inline script block parses', async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fossibot-syntax-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    const blocks = readScriptBlocks();
    assert.ok(blocks.length >= 1);

    for (const [i, block] of blocks.entries()) {
        const file = path.join(dir, `block-${i}.js`);
        await fs.writeFile(file, block);
        await assert.doesNotReject(
            run(process.execPath, ['--check', file]),
            `inline <script> block ${i} does not parse`,
        );
    }
});
