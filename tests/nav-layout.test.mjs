/**
 * Navigation layout tests (registry, resolve/migrate, get/set).
 *
 * Dependency-free: plain Node assertions, no framework.
 * Run:  node tests/nav-layout.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 */

import assert from 'node:assert/strict';
import {
  NAV_LAYOUTS,
  NAV_LAYOUT_GROUPS,
  DEFAULT_NAV_LAYOUT,
  LEGACY_NAV_LAYOUTS,
  isNavLayoutId,
  resolveNavLayout,
  getNavLayout,
  setNavLayoutSetting,
} from '../js/utils/navLayout.js';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}

const SIX = ['tree', 'mega', 'dock', 'context', 'bento', 'mobile'];

await test('registry holds the six kept layouts in selector order', async () => {
  assert.deepEqual(NAV_LAYOUTS.map(l => l.id), SIX);
  assert.equal(DEFAULT_NAV_LAYOUT, 'tree');
  const ids = NAV_LAYOUTS.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
  const groupIds = NAV_LAYOUT_GROUPS.map(g => g.id);
  for (const l of NAV_LAYOUTS) {
    assert.ok(l.label && l.label.length > 0, `${l.id} needs a label`);
    assert.ok(l.hint && l.hint.length > 0, `${l.id} needs a hint`);
    assert.ok(groupIds.includes(l.group), `${l.id} needs a known selector group`);
  }
  for (const g of groupIds) {
    assert.ok(NAV_LAYOUTS.some(l => l.group === g), `group ${g} is not empty`);
  }
});

await test('isNavLayoutId accepts only known ids', async () => {
  for (const id of SIX) assert.equal(isNavLayoutId(id), true, id);
  // Cut layouts should return false
  for (const cut of ['rail', 'workspace', 'command', 'focus']) {
    assert.equal(isNavLayoutId(cut), false, `cut layout ${cut} should be false`);
  }
  for (const bad of ['full', 'topbar', '', 'TREE', null, undefined, 3, {}]) {
    assert.equal(isNavLayoutId(bad), false, String(bad));
  }
});

await test('legacy layout ids migrate to their successors', async () => {
  assert.deepEqual(LEGACY_NAV_LAYOUTS, {
    full: 'tree',
    topbar: 'mega',
    rail: 'tree',
    workspace: 'tree',
    command: 'context',
    focus: 'context',
  });
  assert.equal(resolveNavLayout('full', {}), 'tree');
  assert.equal(resolveNavLayout('topbar', {}), 'mega');
  assert.equal(resolveNavLayout('rail', {}), 'tree');
  assert.equal(resolveNavLayout('workspace', {}), 'tree');
  assert.equal(resolveNavLayout('command', {}), 'context');
  assert.equal(resolveNavLayout('focus', {}), 'context');
  assert.equal(getNavLayout({ settings: { navLayout: 'full' } }), 'tree');
  assert.equal(getNavLayout({ settings: { navLayout: 'topbar' } }), 'mega');
  assert.equal(getNavLayout({ settings: { navLayout: 'rail' } }), 'tree');
  assert.equal(getNavLayout({ settings: { navLayout: 'workspace' } }), 'tree');
  assert.equal(getNavLayout({ settings: { navLayout: 'command' } }), 'context');
  assert.equal(getNavLayout({ settings: { navLayout: 'focus' } }), 'context');
});

await test('resolveNavLayout prefers stored ids, migrates the sidebarExpanded flag', async () => {
  assert.equal(resolveNavLayout('bento', { settings: { sidebarExpanded: true } }), 'bento');
  assert.equal(resolveNavLayout(undefined, { settings: { sidebarExpanded: true } }), 'tree');
  assert.equal(resolveNavLayout(undefined, { settings: {} }), 'tree');
  assert.equal(resolveNavLayout('nonsense', null), 'tree');
  assert.equal(resolveNavLayout('constructor', {}), 'tree', 'prototype keys are not layouts');
});

await test('getNavLayout reads state settings safely', async () => {
  assert.equal(getNavLayout(null), 'tree');
  assert.equal(getNavLayout({}), 'tree');
  assert.equal(getNavLayout({ settings: { navLayout: 'bento' } }), 'bento');
  assert.equal(getNavLayout({ settings: { navLayout: 'nope' } }), 'tree');
});

await test('setNavLayoutSetting persists valid ids only', async () => {
  const state = { settings: { navLayout: 'tree' } };
  assert.equal(setNavLayoutSetting(state, 'context'), true);
  assert.equal(state.settings.navLayout, 'context');
  assert.equal(setNavLayoutSetting(state, 'full'), false, 'legacy ids are read, never written');
  assert.equal(state.settings.navLayout, 'context');
  const bare = {};
  assert.equal(setNavLayoutSetting(bare, 'mobile'), true);
  assert.equal(bare.settings.navLayout, 'mobile');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}