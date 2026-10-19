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
// 1b. importData sanitizer validation (W2.1)
// ---------------------------------------------------------------------------

test('importData: invalid ID format rejected', () => {
  const s = JSON.parse(validBackupJson());
  s.modules[0].id = 'invalid id!'; // spaces and special chars
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure for invalid ID');
  assert(/modules/.test(r.error), 'error should name modules array');
});

test('importData: valid ID format accepted', () => {
  const s = JSON.parse(validBackupJson());
  // Change both module ID and the objective's moduleId reference
  s.modules[0].id = 'valid-id-123';
  s.learningObjectives[0].moduleId = 'valid-id-123';
  const r = store.importData(JSON.stringify(s));
  assert(r.success === true, 'valid ID should pass');
});

test('importData: objective status enum enforced', () => {
  const s = JSON.parse(validBackupJson());
  s.learningObjectives[0].status = 'invalid-status';
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure for invalid status');
});

test('importData: resource type enum enforced', () => {
  const s = JSON.parse(validBackupJson());
  s.resources.push({ moduleId: 'm1', name: 'Res', type: 'NotAType' });
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure for invalid resource type');
});

test('importData: capture type enum enforced', () => {
  const s = JSON.parse(validBackupJson());
  s.captures.push({ moduleId: 'm1', content: 'hi', type: 'notatype' });
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure for invalid capture type');
});

test('importData: plan item type enum enforced', () => {
  const s = JSON.parse(validBackupJson());
  s.planItems.push({ moduleId: 'm1', week: 1, title: 'Test', text: 'do', type: 'notatype' });
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure for invalid plan type');
});

test('importData: numeric clamps work (confidence 0-5)', () => {
  const s = JSON.parse(validBackupJson());
  s.learningObjectives[0].confidence = 10; // too high
  const r = store.importData(JSON.stringify(s));
  assert(r.success === true, 'should clamp, not fail');
  assert(r.data.learningObjectives[0].confidence === 5, 'confidence clamped to 5');
  
  s.learningObjectives[0].confidence = -2; // too low
  const r2 = store.importData(JSON.stringify(s));
  assert(r2.data.learningObjectives[0].confidence === 0, 'confidence clamped to 0');
});

test('importData: numeric clamps work (session duration 1-480)', () => {
  const s = JSON.parse(validBackupJson());
  s.studySessions.push({ moduleId: 'm1', duration: 1000, startTime: new Date().toISOString() });
  const r = store.importData(JSON.stringify(s));
  assert(r.success === true, 'should clamp');
  assert(r.data.studySessions[r.data.studySessions.length - 1].duration === 480, 'duration clamped to 480');
});

test('importData: numeric clamps work (week 1-53)', () => {
  const s = JSON.parse(validBackupJson());
  s.planItems.push({ moduleId: 'm1', week: 99, title: 'Test', text: 'do' });
  const r = store.importData(JSON.stringify(s));
  assert(r.data.planItems[r.data.planItems.length - 1].week === 53, 'week clamped to 53');
});

test('importData: module targetGrade clamped 1-6', () => {
  const s = JSON.parse(validBackupJson());
  s.modules[0].targetGrade = 10;
  const r = store.importData(JSON.stringify(s));
  assert(r.data.modules[0].targetGrade === 6, 'targetGrade clamped to 6');
});

test('importData: accent hex color enforced', () => {
  const s = JSON.parse(validBackupJson());
  s.modules[0].accent = 'not-a-color';
  const r = store.importData(JSON.stringify(s));
  assert(r.data.modules[0].accent === '#b45309', 'invalid accent defaults to #b45309');
  
  s.modules[0].accent = '#abc123';
  const r2 = store.importData(JSON.stringify(s));
  assert(r2.data.modules[0].accent === '#abc123', 'valid accent preserved');
});

test('importData: history arrays capped at 100', () => {
  const s = JSON.parse(validBackupJson());
  s.learningObjectives[0].confidenceHistory = Array.from({length: 150}, (_, i) => ({ value: i % 6, timestamp: Date.now() }));
  const r = store.importData(JSON.stringify(s));
  assert(r.data.learningObjectives[0].confidenceHistory.length === 100, 'confidenceHistory capped at 100');
});

test('importData: unknown moduleId drops entry', () => {
  const s = JSON.parse(validBackupJson());
  s.learningObjectives.push({ moduleId: 'non-existent', title: 'Orphan', number: 1 });
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure for unknown moduleId');
});

test('importData: exam rating enum enforced', () => {
  const s = JSON.parse(validBackupJson());
  s.exams.push({
    id: 'e1', moduleId: 'm1', name: 'Exam', date: '', weight: 50, score: '20', max: '40',
    linkedObjectiveIds: ['o1'],
    objectiveResults: [{ objectiveId: 'o1', rating: 'invalid' }]
  });
  const r = store.importData(JSON.stringify(s));
  assert(r.success === false, 'expected failure for invalid exam rating');
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

// ---------------------------------------------------------------------------
// 4. recordReview: shaky repeats rung, lost steps back, solid advances
// ---------------------------------------------------------------------------

function reviewState() {
  const s = blankState();
  s.learningObjectives.push({
    id: 'o1', moduleId: 'm1', number: 1, title: 'T', description: '',
    status: 'in-progress', confidence: 3, notes: '', confidenceHistory: [],
    lastTouched: T0, lastReviewed: null, totalStudyTime: 0,
    reviewHistory: [], reviewSchedule: null, sessionHistory: [],
    createdAt: T0, updatedAt: T0,
  });
  return s;
}

function makeReviewedState(reviewCount) {
  // reviewCount = number of completed reviews = reviewHistory.length
  // The schedule.interval = interval used for the LAST review = REVIEW_INTERVALS[min(reviewCount-1, 5)]
  // The schedule.reviewCount = reviewCount
  const s = reviewState();
  const intervals = [1, 4, 10, 21, 45, 90];
  for (let i = 0; i < reviewCount; i++) {
    const idx = Math.min(i, 5);
    s.learningObjectives[0].reviewHistory.push({
      outcome: 'solid', interval: intervals[idx], timestamp: T0 + i * 86400000
    });
  }
  const lastUsedIdx = reviewCount > 0 ? Math.min(reviewCount - 1, 5) : 0;
  s.learningObjectives[0].reviewSchedule = {
    interval: intervals[lastUsedIdx],
    nextReview: T0 + (reviewCount + 1) * 86400000,
    reviewCount: reviewCount
  };
  return s;
}

test('recordReview: shaky repeats current rung (same interval as promised)', () => {
  // Before any reviews (reviewCount = 0, history.length = 0) -> promised = reviewIntervalFor(0) = 1
  const s0 = reviewState();
  const e0 = store.recordReview(s0.learningObjectives[0], 'shaky');
  assert(e0.interval === 1, 'reviewCount=0: shaky gives 1 day (promised = REVIEW_INTERVALS[0])');

  // After 1 review (reviewCount = 1, history.length = 1) -> schedule.interval = 1, promised = 1
  const s1 = makeReviewedState(1);
  const e1 = store.recordReview(s1.learningObjectives[0], 'shaky');
  assert(e1.interval === 1, 'reviewCount=1: shaky repeats 1 day (promised = schedule.interval = REVIEW_INTERVALS[0])');

  // After 2 reviews (reviewCount = 2, history.length = 2) -> schedule.interval = 4, promised = 4
  const s2 = makeReviewedState(2);
  const e2 = store.recordReview(s2.learningObjectives[0], 'shaky');
  assert(e2.interval === 4, 'reviewCount=2: shaky repeats 4 days (promised = schedule.interval = REVIEW_INTERVALS[1])');

  // After 3 reviews (reviewCount = 3, history.length = 3) -> schedule.interval = 10, promised = 10
  const s3 = makeReviewedState(3);
  const e3 = store.recordReview(s3.learningObjectives[0], 'shaky');
  assert(e3.interval === 10, 'reviewCount=3: shaky repeats 10 days (promised = schedule.interval = REVIEW_INTERVALS[2])');

  // After 5 reviews (reviewCount = 5, history.length = 5) -> schedule.interval = 45, promised = 45
  const s5 = makeReviewedState(5);
  const e5 = store.recordReview(s5.learningObjectives[0], 'shaky');
  assert(e5.interval === 45, 'reviewCount=5: shaky repeats 45 days (promised = schedule.interval = REVIEW_INTERVALS[4])');

  // After 6+ reviews (reviewCount >= 6, at max interval) -> schedule.interval = 90, promised = 90
  const s6 = makeReviewedState(6);
  const e6 = store.recordReview(s6.learningObjectives[0], 'shaky');
  assert(e6.interval === 90, 'reviewCount=6: shaky stays at max 90 days');
});

test('recordReview: lost steps one rung back (floor at 0)', () => {
  // reviewCount=1: before=1, lost -> reviewIntervalFor(0) = 1 day
  const s1 = makeReviewedState(1);
  const e1 = store.recordReview(s1.learningObjectives[0], 'lost');
  assert(e1.interval === 1, 'reviewCount=1: lost goes to REVIEW_INTERVALS[0] = 1 day');

  // reviewCount=2: before=2, lost -> reviewIntervalFor(1) = 4 days
  const s2 = makeReviewedState(2);
  const e2 = store.recordReview(s2.learningObjectives[0], 'lost');
  assert(e2.interval === 4, 'reviewCount=2: lost steps back to 4 days (REVIEW_INTERVALS[1])');

  // reviewCount=3: before=3, lost -> reviewIntervalFor(2) = 10 days
  const s3 = makeReviewedState(3);
  const e3 = store.recordReview(s3.learningObjectives[0], 'lost');
  assert(e3.interval === 10, 'reviewCount=3: lost steps back to 10 days (REVIEW_INTERVALS[2])');
});

test('recordReview: solid advances one rung up the ladder', () => {
  // reviewCount=0: before=0, solid -> reviewIntervalFor(0) = 1 day
  const s0 = reviewState();
  const e0 = store.recordReview(s0.learningObjectives[0], 'solid');
  assert(e0.interval === 1, 'reviewCount=0: solid gives 1 day (REVIEW_INTERVALS[0])');

  // reviewCount=1: before=1, solid -> reviewIntervalFor(1) = 4 days
  const s1 = makeReviewedState(1);
  const e1 = store.recordReview(s1.learningObjectives[0], 'solid');
  assert(e1.interval === 4, 'reviewCount=1: solid advances to 4 days (REVIEW_INTERVALS[1])');

  // reviewCount=5: before=5, solid -> reviewIntervalFor(5) = 90 days
  const s5 = makeReviewedState(5);
  const e5 = store.recordReview(s5.learningObjectives[0], 'solid');
  assert(e5.interval === 90, 'reviewCount=5: solid advances to max 90 days');

  // reviewCount=6: before=6, solid -> reviewIntervalFor(6) = 90 days (capped)
  const s6 = makeReviewedState(6);
  const e6 = store.recordReview(s6.learningObjectives[0], 'solid');
  assert(e6.interval === 90, 'reviewCount=6: solid stays at max 90 days');
});

// ---------------------------------------------------------------------------
// 5. pushCapped: history arrays capped at 100 entries
// ---------------------------------------------------------------------------

test('pushCapped: reviewHistory capped at 100, ladder math unaffected', () => {
  const s = reviewState();
  // Add 105 reviews — should keep only last 100
  for (let i = 0; i < 105; i++) {
    store.recordReview(s.learningObjectives[0], 'solid');
  }
  const obj = s.learningObjectives[0];
  assert(obj.reviewHistory.length === 100, 'reviewHistory capped at 100');
  // Ladder math uses reviewHistory.length for position — should be 100
  // But reviewIntervalFor caps at index 5 (90 days), so interval should still be 90
  const lastInterval = obj.reviewSchedule.interval;
  assert(lastInterval === 90, 'ladder math still works at cap (max interval)');
});

test('pushCapped: confidenceHistory capped at 100', () => {
  const { pushCapped } = store;
  const arr = [];
  for (let i = 0; i < 105; i++) {
    pushCapped(arr, { value: i % 6, timestamp: Date.now() });
  }
  assert(arr.length === 100, 'confidenceHistory capped at 100');
  assert(arr[0].value === 5, 'oldest entries dropped, first kept is index 5 (0-based: 5th push)');
});

test('pushCapped: usageHistory capped at 100', () => {
  const { pushCapped, markResourceUsed, ensureResourceFields } = store;
  const res = { id: 'r1', moduleId: 'm1', name: 'Res', type: 'video', url: '', understood: false };
  ensureResourceFields(res);
  for (let i = 0; i < 105; i++) {
    markResourceUsed(res);
  }
  assert(res.usageHistory.length === 100, 'usageHistory capped at 100');
});

test('pushCapped: understoodHistory capped at 100', () => {
  const { pushCapped, setResourceUnderstood, ensureResourceFields } = store;
  const res = { id: 'r1', moduleId: 'm1', name: 'Res', type: 'video', url: '', understood: false };
  ensureResourceFields(res);
  for (let i = 0; i < 105; i++) {
    setResourceUnderstood(res, i % 2 === 0);
  }
  assert(res.understoodHistory.length === 100, 'understoodHistory capped at 100');
});

console.error = origConsoleError;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
