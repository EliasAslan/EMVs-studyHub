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
  DEFAULT_NAV_LAYOUT,
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

await test('registry holds the five layouts in selector order', async () => {
  assert.deepEqual(NAV_LAYOUTS.map(l => l.id), ['full', 'rail', 'workspace', 'topbar', 'dock']);
  assert.equal(DEFAULT_NAV_LAYOUT, 'rail');
  const ids = NAV_LAYOUTS.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
  for (const l of NAV_LAYOUTS) {
    assert.ok(l.label && l.label.length > 0, `${l.id} needs a label`);
    assert.ok(l.hint && l.hint.length > 0, `${l.id} needs a hint`);
  }
});

await test('isNavLayoutId accepts only known ids', async () => {
  assert.equal(isNavLayoutId('full'), true);
  assert.equal(isNavLayoutId('rail'), true);
  assert.equal(isNavLayoutId('workspace'), true);
  assert.equal(isNavLayoutId('topbar'), true);
  assert.equal(isNavLayoutId('dock'), true);
  assert.equal(isNavLayoutId(''), false);
  assert.equal(isNavLayoutId(null), false);
  assert.equal(isNavLayoutId(undefined), false);
  assert.equal(isNavLayoutId('RAIL'), false, 'ids are case-sensitive');
});

await test('resolveNavLayout prefers stored ids, migrates legacy flag', async () => {
  assert.equal(resolveNavLayout('full', {}), 'full');
  assert.equal(resolveNavLayout('workspace', { settings: { sidebarExpanded: true } }), 'workspace', 'stored id wins over legacy flag');
  assert.equal(resolveNavLayout('bogus', {}), 'rail', 'unknown → default');
  assert.equal(resolveNavLayout('', {}), 'rail');
  assert.equal(resolveNavLayout(null, {}), 'rail');
  assert.equal(resolveNavLayout(undefined, { settings: { sidebarExpanded: true } }), 'full', 'legacy expanded migrates to full');
  assert.equal(resolveNavLayout(undefined, { settings: { sidebarExpanded: false } }), 'rail');
  assert.equal(resolveNavLayout(undefined, {}), 'rail', 'no flag → default');
  assert.equal(resolveNavLayout(undefined, null), 'rail', 'null state → default');
});

await test('getNavLayout reads state settings safely', async () => {
  assert.equal(getNavLayout({ settings: { navLayout: 'workspace' } }), 'workspace');
  assert.equal(getNavLayout({ settings: {} }), 'rail');
  assert.equal(getNavLayout({ settings: { navLayout: 'nope' } }), 'rail', 'invalid stored id falls back');
  assert.equal(getNavLayout({}), 'rail');
  assert.equal(getNavLayout(null), 'rail');
  assert.equal(getNavLayout(undefined), 'rail');
});

await test('setNavLayoutSetting persists valid ids only', async () => {
  const state = { settings: {} };
  assert.equal(setNavLayoutSetting(state, 'workspace'), true);
  assert.equal(state.settings.navLayout, 'workspace');
  assert.equal(setNavLayoutSetting(state, 'full'), true);
  assert.equal(state.settings.navLayout, 'full');
  assert.equal(setNavLayoutSetting(state, 'sidebar'), false, 'unknown id rejected');
  assert.equal(state.settings.navLayout, 'full', 'rejected id leaves state untouched');
  assert.equal(setNavLayoutSetting(state, ''), false);
  assert.equal(setNavLayoutSetting(state, null), false);
  const bare = {};
  assert.equal(setNavLayoutSetting(bare, 'rail'), true, 'missing settings object is created');
  assert.equal(bare.settings.navLayout, 'rail');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
