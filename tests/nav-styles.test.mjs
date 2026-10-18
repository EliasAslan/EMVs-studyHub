/**
 * Tests for the data behind the ten navigation styles: destination
 * registry, context modes, mega menu, tree model, bento data.
 * Pure Node, no DOM.  Run: node tests/nav-styles.test.mjs  (or: npm test)
 */

import assert from 'node:assert/strict';
import {
  DESTINATIONS, CONTEXT_MODES, MEGA_MENUS, shortcutMap, destinationIdFor,
  contextModeFor, resolveContextMode, routeTitle, getBreadcrumb,
} from '../js/utils/navigation.js';
import { buildNavTree, getBentoData, getUpcomingExams, getRecentActivity, relativeTime } from '../js/utils/navData.js';
import { getDemoSeedData } from '../js/services/store.js';

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`ok - ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`FAIL - ${name}: ${e.message}`); }
}

await test('shortcut keys are unique and map to real destinations', async () => {
  const map = shortcutMap();
  const keys = Object.values(DESTINATIONS).map(d => d.key).filter(Boolean);
  assert.equal(new Set(keys).size, keys.length, 'no key is used twice');
  for (const [key, id] of Object.entries(map)) assert.ok(DESTINATIONS[id], `${key} → ${id}`);
  assert.equal(map['1'], 'today');
  assert.equal(map['2'], 'overview');
  assert.equal(map['3'], 'weak-spots', 'weak spots live on 3, as the keyboard handler always did');
  assert.equal(map['4'], 'exams-global');
});

await test('every destination is either a router view or a module tab', async () => {
  for (const [id, d] of Object.entries(DESTINATIONS)) {
    assert.ok(d.label && d.ico, `${id} has label and icon`);
    assert.ok(Boolean(d.view) !== Boolean(d.moduleTab), `${id} is exactly one of view/moduleTab`);
  }
});

await test('destinationIdFor maps routes, including module tabs', async () => {
  assert.equal(destinationIdFor('today'), 'today');
  assert.equal(destinationIdFor('module', { tab: 'ziele' }), 'module:ziele');
  assert.equal(destinationIdFor('module', {}), 'module:home');
  assert.equal(destinationIdFor('module', { tab: 'bogus' }), 'module:home');
  assert.equal(destinationIdFor('nonexistent'), null);
});

await test('context: four modes, each destination in exactly one mode', async () => {
  assert.deepEqual(CONTEXT_MODES.map(m => m.id), ['learn', 'practice', 'plan', 'review']);
  const seen = new Map();
  for (const m of CONTEXT_MODES) {
    assert.ok(m.items.length > 0, `${m.id} is not empty`);
    for (const id of m.items) {
      assert.ok(DESTINATIONS[id], `${m.id} → ${id} exists`);
      assert.ok(!seen.has(id), `${id} appears in ${seen.get(id)} and ${m.id}`);
      seen.set(id, m.id);
    }
  }
  assert.equal(contextModeFor('weak-spots'), 'review');
  assert.equal(contextModeFor('today'), 'plan');
  assert.equal(contextModeFor('settings'), null);
});

await test('context: the page decides the mode, else the stored choice, else a default', async () => {
  assert.equal(resolveContextMode('weak-spots', 'learn'), 'review');
  assert.equal(resolveContextMode('settings', 'practice'), 'practice');
  assert.equal(resolveContextMode(null, 'bogus'), 'plan');
  assert.equal(resolveContextMode(null, undefined), 'plan');
});

await test('mega menu only references real destinations', async () => {
  for (const m of MEGA_MENUS) {
    if (m.dest) assert.ok(DESTINATIONS[m.dest], `${m.id} → ${m.dest}`);
    for (const g of m.groups || []) {
      assert.ok(g.title, `${m.id} group has a title`);
      for (const id of g.items || []) assert.ok(DESTINATIONS[id], `${m.id}/${g.title} → ${id}`);
    }
  }
});

await test('routeTitle and breadcrumb describe the current page', async () => {
  const state = getDemoSeedData();
  const mod = state.modules[0];
  assert.deepEqual(routeTitle('today', {}, state), { title: 'Heute', sub: '' });
  assert.deepEqual(routeTitle('module', { id: mod.id, tab: 'ziele' }, state), { title: `Modul ${mod.code}`, sub: 'Ziele' });
  assert.equal(routeTitle('module', { id: 'missing', tab: 'plan' }, state).title, 'Modul');
  const trail = getBreadcrumb('module', { id: mod.id, tab: 'plan' }, state);
  assert.deepEqual(trail.map(c => c.label), ['Module', `Modul ${mod.code}`, 'Plan']);
  assert.deepEqual(getBreadcrumb('module', { id: mod.id, tab: 'home' }, state).map(c => c.label), ['Module', `Modul ${mod.code}`]);
  assert.deepEqual(getBreadcrumb('settings').map(c => c.label), ['Einstellungen']);
});

await test('tree: subjects → chapters → topics with stable ids', async () => {
  const state = getDemoSeedData();
  const tree = buildNavTree(state);
  assert.equal(tree.length, 1);
  const subject = tree[0];
  assert.equal(subject.type, 'subject');
  assert.deepEqual(subject.children.map(c => c.tab), ['home', 'ziele', 'plan', 'sessions', 'material']);
  const ziele = subject.children.find(c => c.tab === 'ziele');
  assert.equal(ziele.children.length, state.learningObjectives.length);
  assert.ok(ziele.children.every(c => c.type === 'topic' && c.kind === 'objective'));
  const ids = [];
  (function walk(n) { ids.push(n.id); (n.children || []).forEach(walk); })(subject);
  assert.equal(new Set(ids).size, ids.length, 'node ids are unique');
  assert.deepEqual(buildNavTree({ modules: [] }), []);
});

await test('tree: long topic lists are capped and report what was left out', async () => {
  const state = getDemoSeedData();
  const modId = state.modules[0].id;
  state.learningObjectives = Array.from({ length: 75 }, (_, i) => ({ id: `o${i}`, moduleId: modId, number: i + 1, title: `Ziel ${i + 1}`, status: 'todo' }));
  const ziele = buildNavTree(state)[0].children.find(c => c.tab === 'ziele');
  assert.equal(ziele.count, 75);
  assert.equal(ziele.children.length, 60);
  assert.equal(ziele.more, 15);
});

await test('bento: upcoming exams are future-only, soonest first, invalid dates skipped', async () => {
  const now = new Date(2026, 9, 18, 12).getTime();
  const state = { modules: [{ id: 'm', code: 'M1' }], exams: [
    { id: 'a', moduleId: 'm', name: 'Später', date: '2026-11-30' },
    { id: 'b', moduleId: 'm', name: 'Bald', date: '2026-10-20' },
    { id: 'c', moduleId: 'm', name: 'Vorbei', date: '2026-10-01' },
    { id: 'd', moduleId: 'm', name: 'Kaputt', date: 'bald' },
    { id: 'e', moduleId: 'm', name: 'Leer', date: '' },
  ] };
  const list = getUpcomingExams(state, { nowMs: now });
  assert.deepEqual(list.map(e => e.id), ['b', 'a']);
  assert.equal(list[0].text, 'in 2 Tagen');
  assert.equal(list[0].moduleCode, 'M1');
  assert.equal(list[0].urgent, true);
});

await test('bento: recent activity merges sessions, captures and reviews, newest first', async () => {
  const state = getDemoSeedData();
  state.captures = [{ id: 'c1', content: 'Was ist ein Fremdschlüssel?', timestamp: new Date(Date.now() - 60000).toISOString(), moduleId: state.modules[0].id },
    { id: 'c2', content: '   ', timestamp: new Date().toISOString() }];
  const act = getRecentActivity(state, { limit: 10 });
  assert.equal(act[0].kind, 'capture', 'the minute-old note is newest');
  assert.ok(act.every((a, i) => i === 0 || act[i - 1].at >= a.at), 'sorted newest first');
  assert.ok(!act.some(a => a.title.trim() === ''), 'empty notes are skipped');
  assert.equal(getRecentActivity({}, { limit: 5 }).length, 0);
});

await test('bento: one call returns everything the launchpad shows', async () => {
  const data = getBentoData(getDemoSeedData());
  assert.equal(data.subjects.length, 1);
  assert.equal(data.subjects[0].total, 3);
  assert.equal(data.subjects[0].pct, 0);
  assert.ok(data.dueCount >= 1);
  assert.equal(data.exams.length, 1);
  assert.ok(data.openTasks >= 1);
  const empty = getBentoData({});
  assert.deepEqual([empty.subjects.length, empty.dueCount, empty.exams.length, empty.activity.length, empty.openTasks], [0, 0, 0, 0, 0]);
});

await test('relativeTime words', async () => {
  const now = 1_000_000_000_000;
  assert.equal(relativeTime(now - 10_000, now), 'gerade eben');
  assert.equal(relativeTime(now - 5 * 60_000, now), 'vor 5 Min.');
  assert.equal(relativeTime(now - 3 * 3_600_000, now), 'vor 3 Std.');
  assert.equal(relativeTime(now - 30 * 3_600_000, now), 'gestern');
  assert.equal(relativeTime(now - 5 * 86_400_000, now), 'vor 5 Tagen');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log(`failed tests: ${failures.join('; ')}`); process.exitCode = 1; }
