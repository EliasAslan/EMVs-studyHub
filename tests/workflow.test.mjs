import assert from 'node:assert/strict';
import * as store from '../js/services/store.js';
import { localStorageAdapter, setAdapter } from '../js/services/storageAdapter.js';
import {
  getReviewAttention,
  getResourceUsage,
} from '../js/utils/helpers.js';

// Fake localStorage (string-backed, like the real one).
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};
setAdapter(localStorageAdapter);
store.clearStorageError();

const NOW = new Date('2026-10-10T12:00:00Z').getTime();

let passed = 0;
async function test(name, fn) {
  globalThis.localStorage._m.clear();
  setAdapter(localStorageAdapter);
  store.clearStorageError();
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}: ${e.message}`);
    console.error(e.stack);
    process.exitCode = 1;
  }
}

function baseState() {
  return {
    modules: [{ id: 'm1', code: 'T1', title: 'Test', accent: '#b45309', targetGrade: 5.0, createdAt: NOW, updatedAt: NOW }],
    learningObjectives: [{
      id: 'o1', moduleId: 'm1', number: 1, title: 'O', description: '', status: 'todo',
      confidence: 3, notes: '', confidenceHistory: [], sessionHistory: [], reviewHistory: [],
      lastTouched: NOW, lastReviewed: null, totalStudyTime: 0, reviewSchedule: null,
      createdAt: NOW, updatedAt: NOW,
    }],
    resources: [{
      id: 'r1', moduleId: 'm1', name: 'R', type: 'Video', focus: '70', status: 'todo', url: '',
      linkedObjectiveIds: ['o1'], notes: '', usageHistory: [], understood: false,
      understoodAt: null, understoodHistory: [], lastUsed: null, createdAt: NOW, updatedAt: NOW,
    }],
    studySessions: [],
    exams: [],
    examResults: [],
    planItems: [],
    captures: [],
    weeklyReviews: [],
    settings: { theme: 'light', currentModuleId: 'm1' },
  };
}

function session(id, objIds = ['o1'], duration = 30, start = new Date(NOW).toISOString()) {
  return {
    id, moduleId: 'm1', startTime: start, duration,
    linkedObjectiveIds: objIds, linkedResourceIds: [], note: 'n',
    createdAt: NOW, updatedAt: NOW,
  };
}

await test('logging a session updates objective time and history', async () => {
  const st = baseState();
  const before = Date.now();
  store.updateObjectiveHistory(st, session('s1', ['o1'], 45));
  const o = st.learningObjectives[0];
  assert.equal(o.totalStudyTime, 45);
  assert.equal(o.sessionHistory.length, 1);
  assert.deepEqual(o.sessionHistory[0], { sessionId: 's1', date: new Date(NOW).toISOString(), duration: 45, note: 'n' });
  assert.ok(o.lastTouched >= before);
  store.updateObjectiveHistory(st, session('s2', ['o1'], 15));
  assert.equal(st.learningObjectives[0].totalStudyTime, 60);
  assert.equal(st.learningObjectives[0].sessionHistory[0].sessionId, 's2');
});

await test('session history keeps newest 20 and ignores unknown objectives', async () => {
  const st = baseState();
  for (let i = 0; i < 25; i++) store.updateObjectiveHistory(st, session(`s${i}`, ['o1'], 10));
  const o = st.learningObjectives[0];
  assert.equal(o.sessionHistory.length, 20);
  assert.equal(o.sessionHistory[0].sessionId, 's24');
  assert.equal(o.totalStudyTime, 250);
  const snapshot = JSON.stringify(o);
  store.updateObjectiveHistory(st, session('sx', ['nope'], 99));
  assert.equal(JSON.stringify(o), snapshot, 'unknown objective ids change nothing');
});

await test('recalculate rebuilds totals from sessions and preserves reviews', async () => {
  const st = baseState();
  st.learningObjectives[0].totalStudyTime = 9999; // stale, inflated
  st.learningObjectives[0].sessionHistory = [{ sessionId: 'ghost', date: 'x', duration: 1, note: '' }];
  st.learningObjectives[0].lastReviewed = NOW - 1000;
  st.learningObjectives[0].reviewHistory = [{ timestamp: NOW - 1000, outcome: 'solid' }];
  st.studySessions.push(session('s1', ['o1'], 20), session('s2', ['o1'], 10));
  store.recalculateObjectiveHistory(st);
  const o = st.learningObjectives[0];
  assert.equal(o.totalStudyTime, 30, 'rebuilt from sessions, not kept stale');
  assert.deepEqual(o.sessionHistory.map((e) => e.sessionId), ['s2', 's1'], 'chronological replay, newest first');
  assert.equal(o.lastReviewed, NOW - 1000, 'review judgment preserved');
  assert.equal(o.reviewHistory.length, 1, 'review history preserved');
});

await test('objective progress survives save and reload', async () => {
  const st = store.getSeedData();
  st.modules.push({ id: 'm1', code: 'T1', title: 'T', accent: '#b45309', targetGrade: 5, createdAt: NOW, updatedAt: NOW });
  st.learningObjectives.push({
    id: 'o1', moduleId: 'm1', number: 1, title: 'O', description: '', status: 'todo',
    confidence: 2, notes: '', confidenceHistory: [{ value: 2, timestamp: NOW }],
    sessionHistory: [], reviewHistory: [], lastTouched: NOW, lastReviewed: null,
    totalStudyTime: 0, reviewSchedule: null, createdAt: NOW, updatedAt: NOW,
  });
  st.studySessions.push(session('s1'));
  store.updateObjectiveHistory(st, st.studySessions[0]);
  assert.equal(store.save(st), true);
  const reloaded = store.load();
  const o = reloaded.learningObjectives.find((x) => x.id === 'o1');
  assert.equal(o.totalStudyTime, 30);
  assert.equal(o.sessionHistory.length, 1);
  assert.equal(o.sessionHistory[0].sessionId, 's1');
  assert.deepEqual(o.confidenceHistory, [{ value: 2, timestamp: NOW }]);
});

await test('linked sessions count as resource use without writes', async () => {
  const st = baseState();
  st.resources[0].usageHistory = [{ timestamp: 1000 }];
  st.studySessions.push({ ...session('s1'), linkedResourceIds: ['r1'], startTime: new Date(NOW - 5000).toISOString() });
  const before = JSON.stringify(st.resources[0]);
  const usage = getResourceUsage(st, st.resources[0]);
  assert.equal(usage.sessions.length, 1, 'session link is a use');
  assert.equal(usage.manual.length, 1, 'manual marks counted separately');
  assert.equal(usage.totalUses, 2);
  assert.ok(usage.lastUsedTs >= NOW - 5000);
  assert.equal(JSON.stringify(st.resources[0]), before, 'derivation writes nothing');
  assert.equal(st.resources[0].understood, false, 'use never implies understood');
});

await test('review attention is scoped to the module', async () => {
  const st = baseState();
  st.modules.push({ id: 'm2', code: 'T2', title: 'T2', accent: '#000', targetGrade: 5, createdAt: NOW, updatedAt: NOW });
  st.learningObjectives.push({
    id: 'o2', moduleId: 'm2', number: 1, title: 'Weak', description: '', status: 'todo',
    confidence: 1, notes: '', confidenceHistory: [], sessionHistory: [], reviewHistory: [],
    lastTouched: NOW, lastReviewed: NOW, totalStudyTime: 0,
    reviewSchedule: { interval: 1, nextReview: NOW - 1000, reviewCount: 0 },
    createdAt: NOW, updatedAt: NOW,
  });
  const forA = getReviewAttention(st, { moduleId: 'm1', now: NOW });
  assert.equal(forA.dueCount, 0, 'other-module due stays out');
  assert.deepEqual(forA.weakSpots, [], 'other-module weakness stays out');
  const forB = getReviewAttention(st, { moduleId: 'm2', now: NOW });
  assert.equal(forB.dueCount, 1);
  assert.equal(forB.due[0].id, 'o2');
  assert.equal(forB.weakSpots[0].objective.id, 'o2', 'low confidence surfaces');
  const all = getReviewAttention(st, { moduleId: null, now: NOW });
  assert.equal(all.dueCount, 1, 'unscoped sees everything');
});

await test('review attention caps lists and reports empty state', async () => {
  const st = baseState();
  for (let i = 0; i < 7; i++) {
    st.learningObjectives.push({
      id: `od${i}`, moduleId: 'm1', number: 10 + i, title: `D${i}`, description: '', status: 'todo',
      confidence: 5, notes: '', confidenceHistory: [], sessionHistory: [], reviewHistory: [],
      lastTouched: NOW, lastReviewed: NOW, totalStudyTime: 0,
      reviewSchedule: { interval: 1, nextReview: NOW - (i + 1) * 1000, reviewCount: 0 },
      createdAt: NOW, updatedAt: NOW,
    });
  }
  const a = getReviewAttention(st, { moduleId: 'm1', limit: 3, now: NOW });
  assert.equal(a.due.length, 3, 'display list capped');
  assert.equal(a.dueCount, 7, 'count stays complete');
  assert.equal(a.weakSpots.length, 0, 'confident fresh objectives are no weak spots');
  assert.deepEqual(a.leftovers, [], 'no plan items, no leftovers');
  const empty = getReviewAttention(baseState(), { now: NOW });
  assert.equal(empty.dueCount, 0);
  assert.deepEqual(empty.due, []);
  assert.deepEqual(empty.weakSpots, []);
  assert.deepEqual(empty.leftovers, []);
});

await test('review attention surfaces unfinished past-week plan items', async () => {
  const st = baseState();
  st.planItems.push(
    { id: 'p-old', moduleId: 'm1', week: 5, title: 'Alt', text: 'liegen geblieben', type: 'task', linkedObjectiveIds: [], linkedResourceIds: [], done: false, dropped: false, notes: '', dueDate: null, createdAt: NOW, updatedAt: NOW },
    { id: 'p-done', moduleId: 'm1', week: 5, title: 'Fertig', text: 'erledigt', type: 'task', linkedObjectiveIds: [], linkedResourceIds: [], done: true, dropped: false, notes: '', dueDate: null, createdAt: NOW, updatedAt: NOW },
  );
  const a = getReviewAttention(st, { moduleId: 'm1', now: NOW });
  assert.equal(a.leftovers.length, 1, 'only the open past-week item');
  assert.equal(a.leftovers[0].id, 'p-old');
});

console.log(`\n${passed} passed`);
