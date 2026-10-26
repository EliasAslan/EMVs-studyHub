/**
 * Dead-style and dead-code cleanup (W15).
 *
 * Classes retired by this work must not linger in CSS: they would silently
 * accumulate and make the next redesign guess which rules still matter.
 *
 * Run:  node tests/orphan-styles.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGACY_NAV_LAYOUTS, isNavLayoutId } from '../js/utils/navLayout.js';

const css = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
const today = readFileSync(new URL('../js/views/today.js', import.meta.url), 'utf8');

// Selectors for retired UI that no view emits anymore.
for (const dead of [
  '.nextup-',
  '.today-due',
  '.today-weak',
  '.rail-toggle',
  '.rail-div',
  '[data-navlayout="tree"]',
  '.ov-demo',
  '.tree-row',
  '.tree-group',
  '.tree-caret',
  '.tree-status',
]) {
  assert.ok(!css.includes(dead), `css/main.css still styles ${dead}`);
}

// The matching render helpers are gone too.
for (const fn of ['renderNextUp', 'renderDueRow', 'renderWeak', 'renderFocus', 'renderExamLine']) {
  assert.ok(!today.includes(`function ${fn}`), `today.js still defines ${fn}()`);
}

// Every legacy layout resolves to a layout that still exists — otherwise
// stored settings would land on a shell with no renderer.
for (const [from, to] of Object.entries(LEGACY_NAV_LAYOUTS)) {
  assert.ok(isNavLayoutId(to), `legacy ${from} → unknown layout ${to}`);
}

console.log('ok - retired styles and helpers are gone; legacy layouts resolve');
