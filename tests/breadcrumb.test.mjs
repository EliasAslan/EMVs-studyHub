/**
 * Module breadcrumb (W14).
 *
 * Module sub-tabs render the existing getBreadcrumb() trail as a quiet line
 * under the page title, so the current position is always visible.
 *
 * Run:  node tests/breadcrumb.test.mjs   (or: npm test)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getBreadcrumb } from '../js/utils/navigation.js';

const state = {
  modules: [{ id: 'm1', code: 'T1', title: 'Testmodul' }],
  settings: { currentModuleId: 'm1' },
};
const labels = (view, params) => getBreadcrumb(view, params, state).map(c => c.label);

assert.deepEqual(labels('module', { id: 'm1', tab: 'ziele' }), ['Module', 'Modul T1', 'Ziele']);
assert.deepEqual(labels('module', { id: 'm1', tab: 'plan' }), ['Module', 'Modul T1', 'Plan']);
assert.deepEqual(labels('module', { id: 'm1', tab: 'home' }), ['Module', 'Modul T1'], 'Home adds no extra crumb');
assert.deepEqual(labels('today', {}), ['Heute'], 'global views stay a single crumb');

const moduleSrc = readFileSync(new URL('../js/views/module.js', import.meta.url), 'utf8');
assert.ok(moduleSrc.includes('getBreadcrumb('), 'module view uses getBreadcrumb()');
assert.ok(moduleSrc.includes('class="mod-breadcrumb"'), 'module view renders the breadcrumb');
assert.ok(moduleSrc.includes('escapeHtml(c.label)'), 'breadcrumb labels are escaped');

console.log('ok - module breadcrumb trail uses getBreadcrumb()');
