/**
 * Boot syntax guard (P0).
 *
 * Every browser module must at least parse. `node --check` treats `.js` as
 * CommonJS when the file is checked directly, so each file is copied to a
 * temporary `.mjs` first. This catches errors the runtime never reaches when
 * the entry module aborts on a syntax error (a missing brace once left the
 * whole app blank).
 *
 * Run:  node tests/syntax.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const jsRoot = fileURLToPath(new URL('../js/', import.meta.url));
const files = readdirSync(jsRoot, { recursive: true })
  .filter(f => String(f).endsWith('.js'))
  .map(f => String(f));

assert.ok(files.length > 20, `expected the browser modules (found ${files.length})`);

const dir = mkdtempSync(join(tmpdir(), 'emvs-syntax-'));
let checked = 0;
try {
  for (const rel of files) {
    const tmp = join(dir, `module-${checked}.mjs`);
    writeFileSync(tmp, readFileSync(join(jsRoot, rel)));
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (err) {
      const detail = String(err.stderr || err.message).split('\n').slice(0, 6).join('\n');
      assert.fail(`${rel.replace(/\\/g, '/')} does not parse:\n${detail}`);
    }
    checked += 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`ok - ${checked} browser modules parse as ESM`);
