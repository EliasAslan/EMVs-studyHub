/**
 * Phase 9 reliability regression tests.
 *
 * Dependency-free: plain Node assertions, no framework.
 * Run:  node tests/reliability.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 *
 * Covers the three Phase 9 fixes (store-level, DOM-free):
 *  1. importData rejects non-object entries instead of silently
 *     spreading them into blank rows ({...null} === {}).
 *  2. unlinkObjectiveEverywhere / unlinkResourceEverywhere strip deleted
 *     ids from all linked entities so exam/plan/resource views agree.
 *  3. updateObjectiveHistory / recalculateObjectiveHistory derive
 *     lastTouched from the session date, not Date.now(), so editing or
 *     deleting one old session cannot mark every survivor "just touched".
 */

import * as store from '../js/services/store.js';

// ---------------------------------------------------------------------------
// Minimal runner (mirrors tests/storage.test.mjs)
// ---------------------------------------------------------------------------

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

// Mute expected error logging from the code under test.
const origConsoleError = console.error;
console.error = () => {};

const DAY = 86400000;
const T_OLD = Date.UTC(2024, 0, 10, 8, 0, 0);
const T_NEW = Date.UTC(2024, 2, 5, 8, 0, 0);
const T0 = Date.UTC(2023, 11, 1, 8, 0, 0);

function blankState() {
  const s = store.getSeedData();
  return s;
}

function validBackupJson() {
  const s = blankState();
  s.modules.push({ id: 'm1', code: 'DB1', title: 'Datenbanken', accent: '#b45309', targetGrade: 5.0, createdAt: T0, updatedAt: T0 });
  s.learningObjectives.push({
    id: 'o1', moduleId: 'm1', number: 1, title: 'Normalformen', description: '',
    status: 'todo', confidence: 2, notes: '', confidenceHistory: [], lastTouched: T0,
    lastReviewed: null, totalStudyTime: 0, reviewHistory: [], reviewSchedule: null,
    sessionHistory: [], createdAt: T0, updatedAt: T0,
  });
  return JSON.stringify(s);
}

// ---------------------------------------------------------------------------
// 1. importData entry validation
// ---------------------------------------------------------------------------

test('importData: valid backup imports unchanged (ids preserved)', () => {
  const r = store.importData(validBackupJson());
  assert(r.success === true, 'expected success');
  assert(r.data.modules[0].id === 'm1', 'module id preserved');
  assert(r.data.learningObjectives[0].id === 'o1', 'objective id preserved');
});

test('importData: null array entry is rejected, never a blank row', () => {
  const s = JSON.parse(validBackupJson());
  s.modules.push(null);
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure');
  assert(/modules/.test(r.error || ''), `error should name the array, got: ${r.error}`);
});

test('importData: string/number entries are rejected', () => {
  for (const bad of ['x', 42, ['nested']]) {
    const s = JSON.parse(validBackupJson());
    s.studySessions.push(bad);
    const r = store.importData(JSON.stringify(s));
    assert(r.success === false, `expected failure for ${JSON.stringify(bad)}`);
  }
});

test('importData: entities without ids still get generated ids', () => {
  const s = JSON.parse(validBackupJson());
  s.captures.push({ moduleId: 'm1', content: 'hi' });
  const r = store.importData(JSON.stringify(s));
  assert(r.success === true, 'expected success');
  assert(typeof r.data.captures[0].id === 'string' && r.data.captures[0].id.length > 0, 'id generated');
});

// ---------------------------------------------------------------------------
// 2. Unlink helpers
// ---------------------------------------------------------------------------

function linkedState() {
  const s = blankState();
  s.resources.push({ id: 'r1', moduleId: 'm1', name: 'Res', linkedObjectiveIds: ['o1', 'o2'] });
  s.studySessions.push({
    id: 's1', moduleId: 'm1', startTime: new Date(T_OLD).toISOString(), duration: 20,
    linkedObjectiveIds: ['o1'], linkedResourceIds: ['r1'], note: '',
  });
  s.exams.push({
    id: 'e1', moduleId: 'm1', name: 'Exam', date: '', weight: 50, score: '', max: '',
    linkedObjectiveIds: ['o1', 'o2'],
    objectiveResults: [
      { objectiveId: 'o1', rating: 'weak', note: '' },
      { objectiveId: 'o2', rating: null, note: '' },
    ],
  });
  s.planItems.push({ id: 'p1', moduleId: 'm1', week: 3, title: 'W3', text: 'do', linkedObjectiveIds: ['o1'], linkedResourceIds: ['r1'] });
  s.captures.push({ id: 'c1', moduleId: 'm1', objectiveId: 'o1', content: 'note' });
  return s;
}

test('unlinkObjectiveEverywhere: strips o1 from every linked entity', () => {
  const s = linkedState();
  store.unlinkObjectiveEverywhere(s, 'o1');
  assertEqual(s.resources[0].linkedObjectiveIds, ['o2'], 'resource unlinked');
  assertEqual(s.studySessions[0].linkedObjectiveIds, [], 'session unlinked');
  assertEqual(s.exams[0].linkedObjectiveIds, ['o2'], 'exam unlinked');
  assert(s.exams[0].objectiveResults.every(r => r.objectiveId !== 'o1'), 'diagnosis entry removed');
  assertEqual(s.exams[0].objectiveResults.map(r => r.objectiveId), ['o2'], 'diagnosis re-synced');
  assertEqual(s.planItems[0].linkedObjectiveIds, [], 'plan item unlinked');
  assert(s.captures[0].objectiveId === null, 'capture unlinked (text kept)');
  // Entities themselves survive; unrelated links survive.
  assert(s.resources.length === 1 && s.exams.length === 1 && s.captures.length === 1, 'no entity deleted');
  assert(s.captures[0].content === 'note' && s.planItems[0].text === 'do', 'content preserved');
});

test('unlinkObjectiveEverywhere: global count and module-view basis agree', () => {
  const s = linkedState();
  const alive = new Set(['o2']); // o1 deleted
  const beforeGlobal = s.exams[0].linkedObjectiveIds.length; // what exams-global counts
  assert(beforeGlobal === 2, 'setup: 2 links before unlink');
  store.unlinkObjectiveEverywhere(s, 'o1');
  const globalCount = s.exams[0].linkedObjectiveIds.length;
  const moduleCount = s.exams[0].linkedObjectiveIds.filter(id => alive.has(id)).length;
  assert(globalCount === moduleCount && globalCount === 1, 'views agree after unlink');
});

test('unlinkResourceEverywhere: strips r1 from sessions and plan items', () => {
  const s = linkedState();
  store.unlinkResourceEverywhere(s, 'r1');
  assertEqual(s.studySessions[0].linkedResourceIds, [], 'session unlinked');
  assertEqual(s.planItems[0].linkedResourceIds, [], 'plan item unlinked');
  assert(s.studySessions[0].note === '' && s.planItems[0].text === 'do', 'content preserved');
});

test('unlink helpers: unknown ids and empty state are no-ops', () => {
  const s = linkedState();
  const before = JSON.stringify(s);
  store.unlinkObjectiveEverywhere(s, 'nope');
  store.unlinkResourceEverywhere(s, 'nope');
  // updatedAt untouched when nothing matched; compare without timestamps.
  const stripTs = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'updatedAt' ? 0 : v)));
  assertEqual(stripTs(s), stripTs(JSON.parse(before)), 'no-op for unknown ids');
  store.unlinkObjectiveEverywhere(blankState(), 'o1');
  store.unlinkResourceEverywhere(blankState(), 'r1');
});

// ---------------------------------------------------------------------------
// 3. lastTouched derived from session dates
// ---------------------------------------------------------------------------

function historyState() {
  const s = blankState();
  s.learningObjectives.push({
    id: 'o1', moduleId: 'm1', number: 1, title: 'T', description: '',
    status: 'todo', confidence: 1, notes: '', confidenceHistory: [], lastTouched: T0,
    lastReviewed: null, totalStudyTime: 0, reviewHistory: [], reviewSchedule: null,
    sessionHistory: [], createdAt: T0, updatedAt: T0,
  });
  s.learningObjectives.push({
    id: 'o2', moduleId: 'm1', number: 2, title: 'U', description: '',
    status: 'todo', confidence: 1, notes: '', confidenceHistory: [], lastTouched: T0,
    lastReviewed: null, totalStudyTime: 0, reviewHistory: [], reviewSchedule: null,
    sessionHistory: [], createdAt: T0, updatedAt: T0,
  });
  return s;
}

test('updateObjectiveHistory: backdated session sets session date, not now', () => {
  const s = historyState();
  const before = Date.now();
  store.updateObjectiveHistory(s, {
    id: 's-old', moduleId: 'm1', startTime: new Date(T_OLD).toISOString(),
    duration: 20, linkedObjectiveIds: ['o1'], note: '',
  });
  const o1 = s.learningObjectives.find(o => o.id === 'o1');
  assert(o1.lastTouched === T_OLD, `expected session date, got ${o1.lastTouched}`);
  assert(o1.lastTouched < before, 'must not be wall-clock now');
  assert(o1.totalStudyTime === 20, 'duration added');
});

test('updateObjectiveHistory: older session never moves lastTouched backwards', () => {
  const s = historyState();
  store.updateObjectiveHistory(s, {
    id: 's-new', moduleId: 'm1', startTime: new Date(T_NEW).toISOString(),
    duration: 30, linkedObjectiveIds: ['o1'], note: '',
  });
  store.updateObjectiveHistory(s, {
    id: 's-old', moduleId: 'm1', startTime: new Date(T_OLD).toISOString(),
    duration: 20, linkedObjectiveIds: ['o1'], note: '',
  });
  const o1 = s.learningObjectives.find(o => o.id === 'o1');
  assert(o1.lastTouched === T_NEW, `latest date wins, got ${o1.lastTouched}`);
  assert(o1.totalStudyTime === 50, 'both durations counted');
});

test('recalculateObjectiveHistory: deleting an old session keeps survivor dates', () => {
  const s = historyState();
  s.studySessions.push(
    { id: 's-old', moduleId: 'm1', startTime: new Date(T_OLD).toISOString(), duration: 20, linkedObjectiveIds: ['o1', 'o2'], note: '' },
    { id: 's-new', moduleId: 'm1', startTime: new Date(T_NEW).toISOString(), duration: 30, linkedObjectiveIds: ['o1'], note: '' },
  );
  // Simulate the session-delete flow: drop one session, recalculate.
  s.studySessions = s.studySessions.filter(x => x.id !== 's-old');
  store.recalculateObjectiveHistory(s);
  const o1 = s.learningObjectives.find(o => o.id === 'o1');
  const o2 = s.learningObjectives.find(o => o.id === 'o2');
  assert(o1.lastTouched === T_NEW, `o1 keeps remaining session date, got ${o1.lastTouched}`);
  assert(o1.totalStudyTime === 30, 'o1 total reflects survivors only');
  assert(o1.lastTouched < Date.now() - DAY, 'o1 must not read as touched today');
  assert(o2.totalStudyTime === 0, 'o2 total reset (its only session was deleted)');
  assert(o2.sessionHistory.length === 0, 'o2 history rebuilt empty');
});

test('updateObjectiveHistory: non-numeric duration cannot corrupt totals', () => {
  const s = historyState();
  store.updateObjectiveHistory(s, {
    id: 's-x', moduleId: 'm1', startTime: new Date(T_NEW).toISOString(),
    duration: 'abc', linkedObjectiveIds: ['o1'], note: '',
  });
  const o1 = s.learningObjectives.find(o => o.id === 'o1');
  assert(typeof o1.totalStudyTime === 'number', 'total stays numeric');
  assert(o1.totalStudyTime === 0, 'garbage duration counts as 0');
  assert(o1.lastTouched === T_NEW, 'date still recorded');
});

console.error = origConsoleError;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
