/**
 * Today review queue tests — pure, DOM-free.
 *
 * Covers:
 *  - order: overdue before weak before due
 *  - de-dup: no objective appears twice
 *  - skip re-queues at end
 *  - empty state returns []
 *  - dueCount unchanged by skips
 * Run:  node tests/today-queue.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReviewQueue, buildTodayPlan, pickFocus, normalizeTodaySkips } from '../js/utils/helpers.js';

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

function makeObjective(over = {}) {
  const now = Date.now();
  return {
    id: `o-${Math.random().toString(36).slice(2)}`,
    moduleId: 'm1',
    number: 1,
    title: 'Test Objective',
    status: 'todo',
    confidence: 0,
    createdAt: now,
    updatedAt: now,
    lastTouched: now,
    lastReviewed: null,
    totalStudyTime: 0,
    reviewHistory: [],
    sessionHistory: [],
    reviewSchedule: null,
    ...over,
  };
}

function makeState(modules = [], objectives = []) {
  return {
    modules: modules.length ? modules : [{ id: 'm1', code: 'T1', title: 'Testmodul' }],
    learningObjectives: objectives,
    exams: [],
    examResults: [],
    captures: [],
    resources: [],
    studySessions: [],
    planItems: [],
    weeklyReviews: [],
    settings: { currentModuleId: 'm1' },
  };
}

await test('empty state returns empty queue', async () => {
  const state = makeState();
  const queue = buildReviewQueue(state);
  assert.deepEqual(queue, []);
});

await test('order: overdue (focus) comes first', async () => {
  const now = Date.now();
  const overdue = makeObjective({
    id: 'overdue-1',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const due = makeObjective({
    id: 'due-1',
    reviewSchedule: { nextReview: now - 1 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const state = makeState([], [overdue, due]);
  const queue = buildReviewQueue(state);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].objective.id, 'overdue-1');
  assert.equal(queue[0].kind, 'overdue');
  assert.equal(queue[1].objective.id, 'due-1');
});

await test('order: when no overdue, weakest becomes focus (first), then due in nextUp', async () => {
  const now = Date.now();
  const due = makeObjective({
    id: 'due-1',
    reviewSchedule: { nextReview: now, interval: 1, reviewCount: 1 }, // due today, not overdue
    status: 'done',
  });
  const weak = makeObjective({
    id: 'weak-1',
    status: 'todo',
    confidence: 1,
    lastTouched: now - 30 * 86400000,
    reviewSchedule: { nextReview: now + 10 * 86400000, interval: 10, reviewCount: 0 },
  });
  const state = makeState([], [due, weak]);
  const queue = buildReviewQueue(state, { now });
  assert.equal(queue.length, 2);
  // No overdue → weakest becomes focus (first)
  assert.equal(queue[0].objective.id, 'weak-1');
  assert.equal(queue[0].kind, 'weakest');
  // due comes in nextUp
  assert.equal(queue[1].objective.id, 'due-1');
  assert.equal(queue[1].kind, 'due');
});

await test('order: overdue before weak before due', async () => {
  const now = Date.now();
  const overdue = makeObjective({
    id: 'overdue-1',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const due = makeObjective({
    id: 'due-1',
    reviewSchedule: { nextReview: now - 1 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const weak = makeObjective({
    id: 'weak-1',
    status: 'todo',
    confidence: 1,
    lastTouched: now - 30 * 86400000,
    reviewSchedule: { nextReview: now + 10 * 86400000, interval: 10, reviewCount: 0 },
  });
  const state = makeState([], [due, weak, overdue]);
  const queue = buildReviewQueue(state);
  assert.equal(queue.length, 3);
  assert.equal(queue[0].objective.id, 'overdue-1');
  assert.equal(queue[0].kind, 'overdue');
  assert.equal(queue[1].objective.id, 'due-1');
  assert.equal(queue[1].kind, 'due');
  assert.equal(queue[2].objective.id, 'weak-1');
  assert.equal(queue[2].kind, 'weak');
});

await test('de-dup: no objective appears twice', async () => {
  const now = Date.now();
  const overdue = makeObjective({
    id: 'obj-1',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const state = makeState([], [overdue]);
  const queue = buildReviewQueue(state);
  const ids = queue.map(q => q.objective.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates in queue');
});

await test('skipIds re-queues at end, never drops', async () => {
  const now = Date.now();
  const overdue = makeObjective({
    id: 'skip-me',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const due = makeObjective({
    id: 'keep-me',
    reviewSchedule: { nextReview: now - 1 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const state = makeState([], [overdue, due]);
  const queue = buildReviewQueue(state, { skipIds: ['skip-me'] });
  assert.equal(queue.length, 2);
  assert.equal(queue[0].objective.id, 'keep-me');
  assert.equal(queue[1].objective.id, 'skip-me');
});

await test('defer outcome: skipIds re-queue at end of queue', async () => {
  const now = Date.now();
  const a = makeObjective({ id: 'd-1', reviewSchedule: { nextReview: now - 1000, interval: 1, reviewCount: 1 }, status: 'done' });
  const b = makeObjective({ id: 'd-2', reviewSchedule: { nextReview: now - 2000, interval: 1, reviewCount: 1 }, status: 'done' });
  const state = makeState([], [a, b]);
  const deferred = buildReviewQueue(state, { now, skipIds: ['d-1'] });
  assert.equal(deferred.length, 2);
  assert.equal(deferred[0].objective.id, 'd-2');
  assert.equal(deferred[1].objective.id, 'd-1');
  assert.equal(deferred[1].kind, 'due');
});

await test('dueCount unchanged by skips', async () => {
  const now = Date.now();
  const overdue = makeObjective({
    id: 'skip-me',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const due = makeObjective({
    id: 'keep-me',
    reviewSchedule: { nextReview: now - 1 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const state = makeState([], [overdue, due]);
  const plan = buildTodayPlan(state);
  const queueWithSkips = buildReviewQueue(state, { skipIds: ['skip-me'] });
  assert.equal(plan.dueCount, 2);
  assert.equal(queueWithSkips.length, 2);
});

await test('dueCount includes all due objectives', async () => {
  const now = Date.now();
  const objs = Array.from({ length: 5 }, (_, i) => makeObjective({
    id: `due-${i}`,
    reviewSchedule: { nextReview: now - (i + 1) * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  }));
  const state = makeState([], objs);
  const plan = buildTodayPlan(state);
  assert.equal(plan.dueCount, 5);
});

await test('reason string derived from rhythmOf for overdue/due', async () => {
  const now = Date.now();
  const overdue = makeObjective({
    id: 'overdue-1',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const state = makeState([], [overdue]);
  const queue = buildReviewQueue(state, { now });
  assert.ok(queue[0].reason.includes('seit 2 Tagen fällig') || queue[0].reason.includes('fällig'));
});

await test('reason string derived from riskReasons for weak/weakest', async () => {
  const now = Date.now();
  const weak = makeObjective({
    id: 'weak-1',
    status: 'todo',
    confidence: 1,
    lastTouched: now - 30 * 86400000,
    reviewSchedule: { nextReview: now + 10 * 86400000, interval: 10, reviewCount: 0 },
  });
  const state = makeState([], [weak]);
  const queue = buildReviewQueue(state, { now });
  assert.ok(queue[0].reason.includes('Sicherheit 1/5'));
});

await test('focus is overdue when exists, else weakest', async () => {
  const now = Date.now();
  // With overdue
  const overdue = makeObjective({
    id: 'overdue-1',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const weak = makeObjective({
    id: 'weak-1',
    status: 'todo',
    confidence: 1,
    lastTouched: now - 30 * 86400000,
    reviewSchedule: { nextReview: now + 10 * 86400000, interval: 10, reviewCount: 0 },
  });
  let state = makeState([], [overdue, weak]);
  let focus = pickFocus(state);
  assert.equal(focus.kind, 'overdue');
  assert.equal(focus.objective.id, 'overdue-1');

  // Without overdue, weakest wins
  state = makeState([], [weak]);
  focus = pickFocus(state);
  assert.equal(focus.kind, 'weakest');
  assert.equal(focus.objective.id, 'weak-1');
});

await test('nextUp never repeats focus objective', async () => {
  const now = Date.now();
  const overdue = makeObjective({
    id: 'overdue-1',
    reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const due = makeObjective({
    id: 'due-1',
    reviewSchedule: { nextReview: now - 1 * 86400000, interval: 1, reviewCount: 1 },
    status: 'done',
  });
  const state = makeState([], [overdue, due]);
  const plan = buildTodayPlan(state);
  const allIds = [plan.focus?.objective?.id, ...plan.nextUp.map(n => n.objective.id)].filter(Boolean);
  assert.equal(new Set(allIds).size, allIds.length);
});

await test('skips expire when the calendar day changes', async () => {
  const state = makeState();
  state.settings.todaySkipIds = ['a', 'b'];
  state.settings.todaySkipDate = '2026-10-24';

  const changed = normalizeTodaySkips(state, new Date(2026, 9, 25, 10, 0).getTime());
  assert.equal(changed, true);
  assert.deepEqual(state.settings.todaySkipIds, []);
  assert.equal(state.settings.todaySkipDate, '2026-10-25');

  // Same day: skips survive.
  state.settings.todaySkipIds = ['c'];
  assert.equal(normalizeTodaySkips(state, new Date(2026, 9, 25, 23, 0).getTime()), false);
  assert.deepEqual(state.settings.todaySkipIds, ['c']);
});

await test('skipped objectives are re-queued at the end', async () => {
  const now = Date.now();
  const a = makeObjective({ id: 'a', reviewSchedule: { nextReview: now - 2 * 86400000, interval: 1, reviewCount: 1 }, status: 'done' });
  const b = makeObjective({ id: 'b', reviewSchedule: { nextReview: now - 86400000, interval: 1, reviewCount: 1 }, status: 'done' });
  const state = makeState([], [a, b]);

  assert.deepEqual(buildReviewQueue(state).map(i => i.objective.id), ['a', 'b']);
  assert.deepEqual(buildReviewQueue(state, { skipIds: ['a'] }).map(i => i.objective.id), ['b', 'a']);
});

await test('queue header total matches the queue, not the due count', async () => {
  const src = readFileSync(new URL('../js/views/today.js', import.meta.url), 'utf8');
  assert.ok(src.includes('${visibleCount} von ${queue.length}'), 'header counts the queue');
  assert.ok(!src.includes('von ${dueCount}'), 'header does not count only due items');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
