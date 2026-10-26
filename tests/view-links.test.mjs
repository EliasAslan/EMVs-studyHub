/**
 * View navigation links (W10).
 *
 * Internal navigation must go through the router's navigate() so that
 * scroll-reset / focus handling stays consistent. Raw `href="#/…"` links in
 * views bypass that. This guards js/views/ against reintroducing them.
 *
 * Dependency-free: plain Node assertions, no framework.
 * Run:  node tests/view-links.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const viewsDir = new URL('../js/views/', import.meta.url);
const files = readdirSync(viewsDir).filter(f => f.endsWith('.js'));

let failures = 0;
for (const file of files) {
  const src = readFileSync(new URL(file, viewsDir), 'utf8');
  if (src.includes('href="#/')) {
    failures += 1;
    console.log(`FAIL - ${file} contains a raw internal href="#/…"); use navigate() instead`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`ok - no raw internal hash links in ${files.length} view file(s)`);
}

// navigate() understands a `module` param (used by "Alle Schwachstellen →").
const router = readFileSync(new URL('../js/views/router.js', import.meta.url), 'utf8');
assert.match(router, /params\.module/, 'navigate() reads params.module');
