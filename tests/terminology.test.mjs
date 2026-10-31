/**
 * Destination terminology (W13).
 *
 * One name per destination across nav surfaces. The bottom tabbar may use a
 * documented short form (`DESTINATIONS[...].short`); every other surface uses
 * the full label.
 *
 * Run:  node tests/terminology.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTINATIONS } from '../js/utils/navigation.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const index = read('../index.html');
const palette = read('../js/components/palette.js');

const expected = {
  'today': 'Heute',
  'overview': 'Module',
  'weak-spots': 'Schwachstellen',
  'exams-global': 'Prüfungen',
  'weekly-review': 'Review',
  'tools': 'Werkzeuge',
  'settings': 'Einstellungen',
  'exam-prep': 'Prüfungsvorbereitung',
  'mock-exam': 'Mock-Prüfung',
  'captures': 'Erfassungen',
};

for (const [id, label] of Object.entries(expected)) {
  assert.equal(DESTINATIONS[id]?.label, label, `${id} label`);
}

// Only the tabbar's tight column may abbreviate, and only via `short`.
assert.equal(DESTINATIONS['weak-spots'].short, 'Schwach');
for (const [id, d] of Object.entries(DESTINATIONS)) {
  if (id !== 'weak-spots') assert.equal(d.short, undefined, `${id} should not define a short form`);
}

// Nav surfaces use the canonical labels (the label text appears in the shell).
for (const label of ['Heute', 'Module', 'Prüfungen', 'Review', 'Werkzeuge', 'Prüfungsvorbereitung', 'Mock-Prüfung', 'Erfassungen', 'Einstellungen']) {
  assert.ok(index.includes(label), `index.html uses "${label}"`);
}

// The tabbar labels are rendered from the registry, not hand-maintained HTML.
const tabbar = read('../js/components/tabbar.js');
assert.ok(tabbar.includes('DESTINATIONS'), 'tabbar reads the destination registry');
assert.ok(tabbar.includes('dest?.short || dest?.label'), 'tabbar uses short/label from DESTINATIONS');

// Capture action has one name; the page has another.
assert.ok(index.includes('>Schnell erfassen</span>'), 'sidebar capture action says "Schnell erfassen"');
assert.ok(!index.includes('>Erfassen</span>'), 'no bare "Erfassen" action label');
assert.ok(!index.includes('>Alle Erfassungen</button>'), 'More sheet uses "Erfassungen", not "Alle Erfassungen"');
assert.ok(palette.includes("label: 'Schnell erfassen'"), 'palette capture action says "Schnell erfassen"');

console.log('ok - one destination name per nav surface');
