/**
 * Row interaction contract (W11).
 *
 * Rows must never nest interactive elements (buttons / role=button) inside a
 * `role="link"` wrapper. Icon-only controls must carry an accessible name.
 *
 * Static source assertions; no DOM required.
 * Run:  node tests/a11y-rows.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// Views whose rows were converted to a single interaction contract:
// the row itself is not a link; its buttons are the only targets.
for (const rel of [
  '../js/views/today.js',
  '../js/views/overview.js',
  '../js/views/module-objectives.js',
  '../js/views/module-resources.js',
  '../js/views/weak-spots.js',
]) {
  assert.ok(!read(rel).includes('role="link"'), `${rel}: no role="link" rows with nested controls`);
}

// Icon-only buttons need an accessible name.
for (const rel of [
  '../js/views/today.js',
  '../js/views/module-home.js',
  '../js/views/module-objectives.js',
  '../js/views/module-resources.js',
  '../js/views/weak-spots.js',
]) {
  const src = read(rel);
  for (const m of src.matchAll(/<button\b[^>]*>[▶✓✕✎×]<\/button>/g)) {
    assert.match(m[0], /aria-label=/, `${rel}: icon-only button needs aria-label: ${m[0]}`);
  }
}

// Today's section rows are real buttons, not div role="link".
const today = read('../js/views/today.js');
assert.match(today, /<button type="button" class="today-session" data-module=/, 'recent session rows are buttons');
assert.match(today, /<button type="button" class="today-session today-note" data-capture=/, 'note rows are buttons');
assert.ok(!today.includes('today-due" role='), 'due rows are non-interactive');

// Keyboard: a bubbling keydown trap must not cancel Enter/Space on the
// buttons inside the hero card. The card itself is not focusable.
assert.ok(!today.includes("'.q-card')?.addEventListener('keydown'"), 'hero card has no keydown trap');

// Today's confidence dots are real controls, not dead tab stops: every dot
// is wired to a handler and exposes its pressed state.
assert.ok(today.includes("el.querySelectorAll('.q-card .confidence-dot')"), 'confidence dots are wired');
assert.match(today, /confidence-dot[^>]*role="button"/, 'confidence dots are buttons');
assert.match(today, /aria-pressed=/, 'confidence dots expose their state');

// Clicking the hero background and pressing "Review starten" must take the
// same path (session → outcome card), and the outcome card must not restart.
assert.ok(today.includes('beginReview(objectiveById(btn.dataset.obj))'), 'review button uses the shared start path');
assert.ok(today.includes('beginReview(objectiveById(e.currentTarget.dataset.obj))'), 'card click uses the shared start path');
assert.ok(today.includes(".q-card:not(.q-outcome)"), 'outcome card does not start a second session');

console.log('ok - row interaction contract (no nested interactive rows, icon buttons labelled)');
