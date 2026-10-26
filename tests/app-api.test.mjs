/**
 * Global API contract (P0).
 *
 * Views call `window.EMVS.*` directly. A missing member fails only at the
 * moment a user triggers that flow (the review loop once called a refresh()
 * that was never defined), so this test statically checks that every used
 * member is assigned somewhere.
 *
 * Run:  node tests/app-api.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const jsRoot = fileURLToPath(new URL('../js/', import.meta.url));
const files = readdirSync(jsRoot, { recursive: true })
  .filter(f => String(f).endsWith('.js'))
  .map(f => String(f));

const sources = new Map(files.map(rel => [rel.replace(/\\/g, '/'), readFileSync(join(jsRoot, rel), 'utf8')]));
const app = sources.get('app.js');
assert.ok(app, 'app.js exists');

const defined = new Set();
const literal = app.match(/window\.EMVS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || '';
for (const m of literal.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) defined.add(m[1]);
for (const src of sources.values()) {
  for (const m of src.matchAll(/window\.EMVS\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
}

const used = new Map();
for (const [file, src] of sources) {
  for (const m of src.matchAll(/window\.EMVS\.([A-Za-z_$][\w$]*)/g)) {
    if (!used.has(m[1])) used.set(m[1], file);
  }
}

for (const [name, file] of used) {
  assert.ok(defined.has(name), `window.EMVS.${name} is used in ${file} but never assigned`);
}

console.log(`ok - ${used.size} window.EMVS members are defined`);
