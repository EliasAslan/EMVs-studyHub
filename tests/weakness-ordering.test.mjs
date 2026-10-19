/**
 * Weakness ordering regression tests.
 *
 * These tests anchor the weakness ranking weights so that behavioral
 * changes are caught. Weights are judgment-tuned; these cases ensure
 * the intended priority ordering is preserved.
 *
 * Run: node tests/weakness-ordering.test.mjs
 */

import * as store from '../js/services/store.js';
import * as helpers from '../js/utils/helpers.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || 'values differ'}\n  got:  ${a}\n  want: ${b}`);
}

const origConsoleError = console.error;
console.error = () => {};

const DAY = 86400000;
const NOW = Date.UTC(2024, 6, 15, 12, 0, 0);
const T0 = Date.UTC(2024, 0, 1, 12, 0, 0);

function blankState() {
  return store.getSeedData();
}

// ---------------------------------------------------------------------------
// (a) weakly-tested objective outranks moderately stale unrated one
// ---------------------------------------------------------------------------

test('weakly-tested objective outranks moderately stale unrated one', () => {
  const s = blankState();

  // Module
  const modId = 'm1';
  s.modules.push({ id: modId, code: 'DB1', title: 'Datenbanken', accent: '#b45309', targetGrade: 5.0, createdAt: T0, updatedAt: T0 });

  // Objective A: weakly tested (exam with weak rating) — 3 pts from exam
  const objA = {
    id: 'obj-weak', moduleId: modId, number: 1, title: 'Schwach getestet', description: '',
    status: 'todo', confidence: 4, notes: '', confidenceHistory: [], lastTouched: NOW,
    lastReviewed: NOW, totalStudyTime: 100,
    reviewHistory: [], reviewSchedule: { interval: 90, nextReview: NOW + 90 * DAY, reviewCount: 10 },
    sessionHistory: [], createdAt: T0, updatedAt: NOW,
  };
  s.learningObjectives.push(objA);

  // Objective B: moderately stale (10 days = ~1.3 pts) but no exam signal — should score lower than weak exam
  const objB = {
    id: 'obj-stale', moduleId: modId, number: 2, title: 'Stale', description: '',
    status: 'todo', confidence: 4, notes: '', confidenceHistory: [], lastTouched: NOW - 10 * DAY,
    lastReviewed: NOW, totalStudyTime: 100,
    reviewHistory: [], reviewSchedule: { interval: 90, nextReview: NOW + 90 * DAY, reviewCount: 10 },
    sessionHistory: [], createdAt: T0, updatedAt: NOW - 10 * DAY,
  };
  s.learningObjectives.push(objB);

  // Exam with weak rating for objA
  s.exams.push({
    id: 'exam-1', moduleId: modId, name: 'Exam', date: '', weight: 50, score: '20', max: '40',
    linkedObjectiveIds: ['obj-weak'],
    objectiveResults: [{ objectiveId: 'obj-weak', rating: 'weak', note: '' }],
  });

  const spots = helpers.getWeakSpots(s, { moduleId: modId, now: NOW });
  assert(spots.length >= 2, 'at least two weak spots');
  assert(spots[0].objective.id === 'obj-weak', 'weakly-tested objective (3pts) should rank above moderately stale (~1.3pts)');
});

// ---------------------------------------------------------------------------
// (b) strong rating offsets weaker signals (stabilizer case)
// ---------------------------------------------------------------------------

test('strong rating offsets weaker signals (stabilizer case)', () => {
  const s = blankState();
  const modId = 'm1';
  s.modules.push({ id: modId, code: 'DB1', title: 'Datenbanken', accent: '#b45309', targetGrade: 5.0, createdAt: T0, updatedAt: T0 });

  // Objective with both weak and strong ratings — strong should offset
  const obj = {
    id: 'obj-mixed', moduleId: modId, number: 1, title: 'Mixed signals', description: '',
    status: 'todo', confidence: 3, notes: '', confidenceHistory: [], lastTouched: NOW - 2 * DAY,
    lastReviewed: NOW - 5 * DAY, totalStudyTime: 100,
    reviewHistory: [], reviewSchedule: { interval: 10, nextReview: NOW + 5 * DAY, reviewCount: 3 },
    sessionHistory: [], createdAt: T0, updatedAt: NOW - 2 * DAY,
  };
  s.learningObjectives.push(obj);

  // Two exams: one weak, one strong for the same objective
  s.exams.push({
    id: 'exam-weak', moduleId: modId, name: 'Exam weak', date: '', weight: 30, score: '15', max: '40',
    linkedObjectiveIds: ['obj-mixed'],
    objectiveResults: [{ objectiveId: 'obj-mixed', rating: 'weak', note: '' }],
  });
  s.exams.push({
    id: 'exam-strong', moduleId: modId, name: 'Exam strong', date: '', weight: 30, score: '35', max: '40',
    linkedObjectiveIds: ['obj-mixed'],
    objectiveResults: [{ objectiveId: 'obj-mixed', rating: 'strong', note: '' }],
  });

  const breakdown = helpers.getWeaknessBreakdown(s, obj, NOW);
  // weak×3 = 3, strong×2 = 2 offset -> net 1 (but floored at -3 minimum, so 3-2=1)
  // Actually: points = max(-3, 3*1 + 1*0 + 0*2 - 1*2) = max(-3, 1) = 1
  assert(breakdown.signals.some(x => x.key === 'exam' && x.points === 1), 'exam signal should be net 1 (weak - strong offset)');
  assert(breakdown.stabilizers.some(s => s.includes('stark geprüft')), 'strong rating should appear as stabilizer');
});

// ---------------------------------------------------------------------------
// (c) zero-score objective is not listed (getWeakSpots filter score > 0)
// ---------------------------------------------------------------------------

test('zero-score objective is not listed by getWeakSpots', () => {
  const s = blankState();
  const modId = 'm1';
  s.modules.push({ id: modId, code: 'DB1', title: 'Datenbanken', accent: '#b45309', targetGrade: 5.0, createdAt: T0, updatedAt: T0 });

  // Objective with no weakness signals at all
  const obj = {
    id: 'obj-healthy', moduleId: modId, number: 1, title: 'Healthy', description: '',
    status: 'done', confidence: 5, notes: '', confidenceHistory: [], lastTouched: NOW,
    lastReviewed: NOW - 1 * DAY, totalStudyTime: 100,
    reviewHistory: [], reviewSchedule: { interval: 90, nextReview: NOW + 90 * DAY, reviewCount: 10 },
    sessionHistory: [], createdAt: T0, updatedAt: NOW,
  };
  s.learningObjectives.push(obj);

  const spots = helpers.getWeakSpots(s, { moduleId: modId, now: NOW });
  assert(spots.length === 0, 'no weak spots for zero-score objective');
});

// Also test the actual current behavior for (a)
test('current behavior: exam weak signal vs stale signal', () => {
  const s = blankState();
  const modId = 'm1';
  s.modules.push({ id: modId, code: 'DB1', title: 'Datenbanken', accent: '#b45309', targetGrade: 5.0, createdAt: T0, updatedAt: T0 });

  // Weak exam only (no stale, no other signals)
  const objWeak = {
    id: 'obj-weak', moduleId: modId, number: 1, title: 'Weak exam only', description: '',
    status: 'todo', confidence: 4, notes: '', confidenceHistory: [], lastTouched: NOW,
    lastReviewed: NOW, totalStudyTime: 100,
    reviewHistory: [], reviewSchedule: { interval: 90, nextReview: NOW + 90 * DAY, reviewCount: 10 },
    sessionHistory: [], createdAt: T0, updatedAt: NOW,
  };
  s.learningObjectives.push(objWeak);

  // Stale only (40 days, no exam)
  const objStale = {
    id: 'obj-stale', moduleId: modId, number: 2, title: 'Stale only', description: '',
    status: 'todo', confidence: 4, notes: '', confidenceHistory: [], lastTouched: NOW - 40 * DAY,
    lastReviewed: NOW, totalStudyTime: 100,
    reviewHistory: [], reviewSchedule: { interval: 90, nextReview: NOW + 90 * DAY, reviewCount: 10 },
    sessionHistory: [], createdAt: T0, updatedAt: NOW - 40 * DAY,
  };
  s.learningObjectives.push(objStale);

  s.exams.push({
    id: 'exam-1', moduleId: modId, name: 'Exam', date: '', weight: 50, score: '20', max: '40',
    linkedObjectiveIds: ['obj-weak'],
    objectiveResults: [{ objectiveId: 'obj-weak', rating: 'weak', note: '' }],
  });

  const weakBreakdown = helpers.getWeaknessBreakdown(s, objWeak, NOW);
  const staleBreakdown = helpers.getWeaknessBreakdown(s, objStale, NOW);

  console.log('Weak exam score:', weakBreakdown.score, weakBreakdown.signals.map(x => `${x.key}=${x.points}`).join(', '));
  console.log('Stale score:', staleBreakdown.score, staleBreakdown.signals.map(x => `${x.key}=${x.points}`).join(', '));

  // Document current behavior: stale (4pts) > weak exam (3pts)
  // This test documents the current ordering
  assert(staleBreakdown.score >= weakBreakdown.score, 'current behavior: stale can outrank weak exam');
});

console.error = origConsoleError;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}