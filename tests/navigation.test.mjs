/**
 * Navigation model tests (global/module nav state, tabs, countdowns,
 * to-do + notes selectors).
 *
 * Dependency-free: plain Node assertions, no framework.
 * Run:  node tests/navigation.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 */

import assert from 'node:assert/strict';
import {
  MODULE_TABS,
  DEFAULT_MODULE_TAB,
  GLOBAL_VIEWS,
  LEGACY_VIEW_TO_TAB,
  isModuleTabKey,
  resolveModuleTab,
  getNavState,
  formatCountdown,
  getOpenPlanItems,
  getRecentCaptures,
} from '../js/utils/navigation.js';

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

const DAY = 86400000;
function ymd(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Fixed "today" at local noon to avoid midnight edge flakes.
const NOW = new Date(2026, 9, 15, 12, 0, 0).getTime();

await test('module tabs: exactly Home + four working tabs', async () => {
  assert.deepEqual(MODULE_TABS.map(t => t.key), ['home', 'ziele', 'plan', 'sessions', 'material']);
  assert.equal(DEFAULT_MODULE_TAB, 'home');
  assert.deepEqual(GLOBAL_VIEWS, ['today', 'overview', 'weak-spots', 'exams-global']);
});

await test('every legacy module view maps to a real tab', async () => {
  for (const [legacy, tab] of Object.entries(LEGACY_VIEW_TO_TAB)) {
    assert.ok(isModuleTabKey(tab), `${legacy} → ${tab} must be a real tab`);
  }
  assert.equal(LEGACY_VIEW_TO_TAB['module-resources'], 'material');
  assert.equal(LEGACY_VIEW_TO_TAB['module-exams'], 'material');
});

await test('resolveModuleTab falls back to home', async () => {
  assert.equal(resolveModuleTab('ziele'), 'ziele');
  assert.equal(resolveModuleTab('home'), 'home');
  assert.equal(resolveModuleTab('material'), 'material');
  assert.equal(resolveModuleTab(''), 'home');
  assert.equal(resolveModuleTab(null), 'home');
  assert.equal(resolveModuleTab(undefined), 'home');
  assert.equal(resolveModuleTab('dens'), 'home', 'typo’d tab never strands the user');
});

await test('getNavState separates global and module navigation', async () => {
  assert.deepEqual(getNavState('today', {}, 'm1'), { global: 'today', moduleId: 'm1', moduleTab: null });
  assert.deepEqual(getNavState('overview', {}, 'm1'), { global: 'overview', moduleId: 'm1', moduleTab: null });
  assert.deepEqual(getNavState('settings', {}, 'm1'), { global: 'settings', moduleId: 'm1', moduleTab: null });
  assert.deepEqual(
    getNavState('module', { id: 'm2', tab: 'plan' }, 'm1'),
    { global: null, moduleId: 'm2', moduleTab: 'plan' },
    'route module wins over stored current module');
  assert.deepEqual(
    getNavState('module', {}, 'm1'),
    { global: null, moduleId: 'm1', moduleTab: 'home' },
    'missing id/tab fall back to context + Home');
  assert.deepEqual(
    getNavState('module', { id: 'm2', tab: 'bogus' }, null),
    { global: null, moduleId: 'm2', moduleTab: 'home' },
    'unknown tab resolves to Home, never to nothing');
});

await test('formatCountdown: wording, urgency, invalid dates', async () => {
  assert.deepEqual(formatCountdown(ymd(NOW), NOW), { days: 0, text: 'heute', urgent: true });
  assert.deepEqual(formatCountdown(ymd(NOW + DAY), NOW), { days: 1, text: 'morgen', urgent: true });
  assert.deepEqual(formatCountdown(ymd(NOW + 5 * DAY), NOW), { days: 5, text: 'in 5 Tagen', urgent: true });
  assert.deepEqual(formatCountdown(ymd(NOW + 14 * DAY), NOW), { days: 14, text: 'in 14 Tagen', urgent: true });
  assert.deepEqual(formatCountdown(ymd(NOW + 15 * DAY), NOW), { days: 15, text: 'in 15 Tagen', urgent: false });
  const past = formatCountdown(ymd(NOW - 3 * DAY), NOW);
  assert.equal(past.text, 'überschritten');
  assert.equal(past.urgent, false);
  assert.equal(formatCountdown('', NOW), null, 'missing date → null');
  assert.equal(formatCountdown(null, NOW), null);
  assert.equal(formatCountdown(undefined, NOW), null);
  assert.equal(formatCountdown('kein-datum', NOW), null, 'garbage → null');
  assert.equal(formatCountdown('2026-13-99', NOW), null, 'impossible date → null');
  assert.equal(formatCountdown(42, NOW), null, 'non-string → null');
});

await test('getOpenPlanItems: open first, leftovers before upcoming', async () => {
  const state = {
    planItems: [
      { id: 'done', moduleId: 'm1', week: 1, text: 'Erledigt', done: true, dropped: false, createdAt: 1 },
      { id: 'dropped', moduleId: 'm1', week: 1, text: 'Fallen gelassen', done: false, dropped: true, createdAt: 2 },
      { id: 'old', moduleId: 'm1', week: 1, text: 'Überfällig', done: false, dropped: false, createdAt: 3 },
      { id: 'new', moduleId: 'm1', week: 99, text: 'Später', done: false, dropped: false, createdAt: 4 },
      { id: 'other', moduleId: 'm2', week: 1, text: 'Anderes Modul', done: false, dropped: false, createdAt: 5 },
    ],
  };
  const all = getOpenPlanItems(state, { limit: 10, now: new Date(NOW) });
  assert.deepEqual(all.map(i => i.id), ['old', 'other', 'new'], 'done/dropped excluded, leftovers first');
  const scoped = getOpenPlanItems(state, { moduleId: 'm1', limit: 10, now: new Date(NOW) });
  assert.deepEqual(scoped.map(i => i.id), ['old', 'new']);
  assert.deepEqual(getOpenPlanItems(state, { limit: 1, now: new Date(NOW) }).map(i => i.id), ['old'], 'limit respected');
  assert.deepEqual(getOpenPlanItems({ planItems: [] }, {}), []);
  assert.deepEqual(getOpenPlanItems({}, {}), [], 'missing collection → []');
});

await test('getRecentCaptures: newest content first, empties skipped', async () => {
  const state = {
    captures: [
      { id: 'a', content: '  ', timestamp: new Date(NOW).toISOString() },
      { id: 'b', content: 'Zweite Notiz', timestamp: new Date(NOW - DAY).toISOString() },
      { id: 'c', content: 'Neueste Notiz', timestamp: new Date(NOW).toISOString() },
      { id: 'd', content: null, timestamp: new Date(NOW).toISOString() },
    ],
  };
  const out = getRecentCaptures(state, { limit: 5 });
  assert.deepEqual(out.map(c => c.id), ['c', 'b'], 'blank/null content skipped, newest first');
  assert.deepEqual(getRecentCaptures(state, { limit: 1 }).map(c => c.id), ['c']);
  assert.deepEqual(getRecentCaptures({ captures: [] }, {}), []);
  assert.deepEqual(getRecentCaptures({}, {}), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
