/**
 * Section heading outline (W12).
 *
 * Section labels are real headings (<h2>/<h3>) carrying the .section-label
 * class for styling — not <div>s. This keeps the document outline usable for
 * assistive tech without changing the visual design.
 *
 * Run:  node tests/headings.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const viewsDir = new URL('../js/views/', import.meta.url);
const files = [
  ...readdirSync(viewsDir).filter(f => f.endsWith('.js')).map(f => new URL(f, viewsDir)),
  new URL('../js/services/auth.js', import.meta.url),
];

let headingCount = 0;
for (const url of files) {
  const src = readFileSync(url, 'utf8');
  if (!src.includes('section-label')) continue;

  assert.ok(!src.includes('<div class="section-label"'), `${url.pathname}: section label must be a heading`);
  const headings = [...src.matchAll(/<h([23]) class="section-label[^"]*"/g)];
  assert.ok(headings.length > 0, `${url.pathname}: uses .section-label but no <h2>/<h3>`);
  headingCount += headings.length;

  // Every class="…section-label…" occurrence must sit on an h1–h3.
  for (const m of src.matchAll(/<([a-z0-9]+)[^>]*class="[^"]*section-label/g)) {
    assert.ok(['h1', 'h2', 'h3'].includes(m[1]), `${url.pathname}: .section-label on <${m[1]}>`);
  }
}

assert.ok(headingCount >= 30, `expected the section labels to be headings (found ${headingCount})`);
console.log(`ok - ${headingCount} section headings are semantic h2/h3`);
