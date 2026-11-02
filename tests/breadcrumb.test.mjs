/**
 * Module header + tab position.
 *
 * The compact header replaces the old breadcrumb line: the module code and the
 * four tabs make the current position obvious without a second navigation
 * trail. getBreadcrumb() stays available for layouts that still need a trail.
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

assert.deepEqual(labels('module', { id: 'm1', tab: 'ziele' }), ['Module', 'Modul T1', 'Lernziele']);
assert.deepEqual(labels('module', { id: 'm1', tab: 'plan' }), ['Module', 'Modul T1', 'Plan']);
assert.deepEqual(labels('module', { id: 'm1', tab: 'home' }), ['Module', 'Modul T1'], 'Home adds no extra crumb');
assert.deepEqual(labels('today', {}), ['Heute'], 'global views stay a single crumb');

const moduleSrc = readFileSync(new URL('../js/views/module.js', import.meta.url), 'utf8');
assert.ok(moduleSrc.includes('class="mod-head"'), 'module view renders the compact header');
assert.ok(!moduleSrc.includes('mod-breadcrumb'), 'module view no longer duplicates navigation in a breadcrumb');
assert.ok(moduleSrc.includes('MODULE_TABS.map'), 'module view renders all tab positions');
assert.ok(moduleSrc.includes('aria-selected='), 'active tab is exposed to assistive tech');

console.log('ok - module header and tabs describe the current position');
