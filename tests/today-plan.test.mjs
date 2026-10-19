import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.window = {};
const { buildTodayPlan } = await import('../js/views/today.js');
const now = Date.now();
const objectives = Array.from({ length: 7 }, (_, i) => ({
  id: `o${i + 1}`, moduleId: 'm1', number: i + 1, title: `Lernziel ${i + 1}`,
  status: 'todo', confidence: i % 5, createdAt: now - (40 + i) * 86400000,
  updatedAt: now - (40 + i) * 86400000, lastTouched: now - (40 + i) * 86400000,
  lastReviewed: null, totalStudyTime: 0, reviewHistory: [], sessionHistory: [],
  reviewSchedule: { nextReview: now - (8 - i) * 86400000, interval: 1 },
}));
const state = { modules: [{ id: 'm1', code: 'T1', title: 'Testmodul' }], learningObjectives: objectives,
  exams: [], examResults: [], captures: [], resources: [], studySessions: [], planItems: [],
  weeklyReviews: [], settings: { currentModuleId: 'm1' } };
const plan = buildTodayPlan(state);
const ids = [plan.focus?.objective?.id, ...plan.nextUp.map(x => x.objective.id), ...plan.due.map(x => x.id), plan.weak?.id].filter(Boolean);
assert.equal(new Set(ids).size, ids.length, 'main recommendation sections never repeat an objective');
assert.equal(plan.dueCount, objectives.length, 'total due count remains accurate');
assert.ok(plan.nextUp.length <= 2);
assert.ok(plan.due.length <= 5);
const today = readFileSync(new URL('../js/views/today.js', import.meta.url), 'utf8');
assert.ok(!today.includes('id="today-review-link"'), 'daily prompt does not duplicate the weekly-reflection CTA');
assert.ok(today.includes('id="today-review-now"'), 'due reminder retains its explicit action');
assert.ok(today.includes('Die fälligen Lernziele sind bereits oben eingeordnet.'));
const moduleHome = readFileSync(new URL('../js/views/module-home.js', import.meta.url), 'utf8');
assert.ok(moduleHome.includes('.filter(({ objective }) => objective.id !== weak?.id)'));
console.log('ok - Today plan de-duplicates objective recommendations and weekly-reflection CTA');
