/**
 * Demo-seed upload exclusion tests (Phase 10).
 *
 * Dependency-free: plain Node assertions, no framework.
 * Run:  node tests/demo-exclusion.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 *
 * Covers:
 *  - fresh demo seeds stay local but never reach the cloud (all collections)
 *  - demo-tagged examResults/captures/weeklyReviews excluded too
 *  - genuine user records still upload, including ones linked to demo content
 *  - FK closure force-includes referenced demo modules/exams, nothing more
 *  - unrecognized records (missing ids) keep existing behavior (no silent drop)
 *  - repeated uploads add no demo copies; repeated downloads are identical
 *  - pre-existing cloud demo rows remain readable via download
 */

import assert from 'node:assert/strict';
import { getDemoSeedData } from '../js/services/store.js';
import { toCloudDataset } from '../js/services/cloudMap.js';
import {
  uploadLocalData,
  downloadCloudData,
  excludeDemoRecords,
  isDemoId,
  getLastSyncedUid,
} from '../js/services/cloudSync.js';

// Fake localStorage for the account-association key.
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  globalThis.localStorage._m.clear();
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

// Minimal mock Supabase client: PK-merge upsert keyed by (user_id, id),
// mirroring supabaseData.js id validation (missing/non-string ids throw).
function makeClient({ userId = 'user-a', tables = {} } = {}) {
  const store = JSON.parse(JSON.stringify(tables));
  return {
    _store: store,
    auth: {
      async getUser() {
        return { data: { user: userId ? { id: userId } : null }, error: null };
      },
    },
    from(table) {
      return {
        select() {
          return {
            async eq() {
              return { data: (store[table] || []).map((r) => ({ ...r })), error: null };
            },
          };
        },
        async upsert(payload) {
          if (!Array.isArray(payload)) throw new TypeError('Rows must be an array.');
          store[table] = store[table] || [];
          for (const row of payload) {
            if (table !== 'user_settings' && (typeof row.id !== 'string' || !row.id)) {
              throw new TypeError(`Every ${table} row must have a non-empty string id.`);
            }
            const full = { ...row, user_id: userId };
            const ix = store[table].findIndex(
              (r) => r.user_id === full.user_id && (r.id === full.id || table === 'user_settings'),
            );
            if (ix >= 0) store[table][ix] = { ...store[table][ix], ...full };
            else store[table].push(full);
          }
          return { error: null };
        },
      };
    },
  };
}

const DATA_TABLES = [
  'modules', 'learning_objectives', 'resources', 'study_sessions', 'exams',
  'exam_results', 'plan_items', 'captures', 'weekly_reviews',
];

function cloudDemoIds(client) {
  const ids = [];
  for (const [table, rows] of Object.entries(client._store)) {
    for (const r of rows) {
      if (typeof r.id === 'string' && r.id.startsWith('demo-')) ids.push(`${table}/${r.id}`);
    }
  }
  return ids;
}

await test('isDemoId flags only demo-prefixed string ids', async () => {
  assert.equal(isDemoId('demo-mod-abc'), true);
  assert.equal(isDemoId('demo-obj1-abc'), true);
  assert.equal(isDemoId('demo-x'), true);
  assert.equal(isDemoId('u-mod-1'), false);
  assert.equal(isDemoId(''), false);
  assert.equal(isDemoId(null), false);
  assert.equal(isDemoId(undefined), false);
  assert.equal(isDemoId(42), false);
  assert.equal(isDemoId({}), false);
  assert.equal(isDemoId('Demo-mod-1'), false, 'case-sensitive: seed emits lowercase');
  assert.equal(isDemoId('mdemo-1'), false, 'prefix must be at the start');
});

await test('fresh demo seed uploads nothing but settings and stays local', async () => {
  const demo = getDemoSeedData();
  const snapshot = JSON.stringify(demo);
  const dataset = toCloudDataset(excludeDemoRecords(demo));
  for (const table of DATA_TABLES) {
    assert.deepEqual(dataset[table], [], `${table}: no demo rows in upload dataset`);
  }
  assert.equal(dataset.user_settings.length, 1, 'settings row still uploads');
  assert.equal(JSON.stringify(demo), snapshot, 'filtering never mutates local state');

  const client = makeClient({});
  const res = await uploadLocalData(client, demo);
  assert.equal(res.uid, 'user-a');
  assert.deepEqual(cloudDemoIds(client), [], 'zero demo ids in cloud after upload');
  assert.equal(client._store.user_settings.length, 1, 'exactly one settings row');
  assert.equal(JSON.stringify(demo), snapshot, 'local state byte-identical after upload');
  assert.equal(getLastSyncedUid(), 'user-a');
});

await test('demo-tagged examResults/captures/weeklyReviews are excluded too', async () => {
  const demo = getDemoSeedData();
  demo.examResults.push({ id: 'demo-er-1', examId: demo.exams[0].id, moduleId: demo.modules[0].id, score: 4, max: 6, grade: 4, date: null, objectiveResults: [], notes: '', createdAt: 1 });
  demo.captures.push({ id: 'demo-cap-1', moduleId: demo.modules[0].id, objectiveId: null, type: 'thought', content: 'c', tags: [], timestamp: new Date(1).toISOString(), createdAt: 1, updatedAt: 1 });
  demo.weeklyReviews.push({ id: 'demo-wr-1', week: 3, year: 2026, moduleId: null, moduleTitle: '', wentWell: '', didntWork: '', nextWeek: '', learned: '', adjustments: '', studyTime: 0, sessionsCount: 0, objectivesReviewed: 0, createdAt: 1, updatedAt: 1 });
  const dataset = toCloudDataset(excludeDemoRecords(demo));
  for (const table of DATA_TABLES) {
    assert.deepEqual(dataset[table], [], `${table}: excluded`);
  }
  const client = makeClient({});
  await uploadLocalData(client, demo);
  assert.deepEqual(cloudDemoIds(client), [], 'no demo ids in cloud');
});

await test('user records linked to demo content upload; closure stays minimal', async () => {
  const demo = getDemoSeedData();
  const demoMod = demo.modules[0].id;
  const demoObj = demo.learningObjectives[0].id;
  const demoExam = demo.exams[0].id;
  const now = 1700000000000;
  demo.modules.push({ id: 'u-mod-1', code: 'U1', title: 'User', accent: '#000', targetGrade: 5.0, createdAt: now, updatedAt: now });
  demo.studySessions.push({
    id: 'u-ses-1', moduleId: demoMod, startTime: new Date(now).toISOString(),
    duration: 30, linkedObjectiveIds: [demoObj], linkedResourceIds: [], note: 'user work in demo module',
    createdAt: now, updatedAt: now,
  });
  demo.captures.push({
    id: 'u-cap-1', moduleId: null, objectiveId: demoObj, type: 'question',
    content: 'user capture on demo objective', tags: [], timestamp: new Date(now).toISOString(),
    createdAt: now, updatedAt: now,
  });
  demo.examResults.push({
    id: 'u-er-1', examId: demoExam, moduleId: demoMod, score: 5, max: 6,
    grade: 5, date: null, objectiveResults: [], notes: '', createdAt: now,
  });
  demo.weeklyReviews.push({
    id: 'u-wr-1', week: 9, year: 2026, moduleId: demoMod, moduleTitle: '', wentWell: 'g',
    didntWork: 'b', nextWeek: 'n', learned: 'l', adjustments: 'a',
    studyTime: 10, sessionsCount: 1, objectivesReviewed: 1, createdAt: now, updatedAt: now,
  });

  const dataset = toCloudDataset(excludeDemoRecords(demo));
  const ids = (table) => dataset[table].map((r) => r.id);
  // Genuine user records included, including demo-linked ones.
  assert.ok(ids('study_sessions').includes('u-ses-1'), 'user session in demo module included');
  assert.ok(ids('captures').includes('u-cap-1'), 'user capture on demo objective included');
  assert.ok(ids('exam_results').includes('u-er-1'), 'user exam result on demo exam included');
  assert.ok(ids('weekly_reviews').includes('u-wr-1'), 'user review scoped to demo module included');
  assert.ok(ids('modules').includes('u-mod-1'), 'user module included');
  // FK closure: referenced demo module + demo exam force-included (stable ids).
  assert.ok(ids('modules').includes(demoMod), 'referenced demo module force-included for FK safety');
  assert.equal(dataset.modules.length, 2, 'no other modules');
  assert.ok(ids('exams').includes(demoExam), 'referenced demo exam force-included for FK safety');
  assert.equal(dataset.exams.length, 1, 'unreferenced demo content stays out');
  // Closure is minimal: demo objectives/resources/plan items never FK-required.
  assert.deepEqual(ids('learning_objectives'), [], 'demo objectives stay excluded');
  assert.deepEqual(ids('resources'), [], 'demo resources stay excluded');
  assert.deepEqual(ids('plan_items'), [], 'demo plan items stay excluded');

  const client = makeClient({});
  const snapshot = JSON.stringify(demo);
  const res = await uploadLocalData(client, demo);
  assert.equal(res.uid, 'user-a', 'upload with mixed demo/user data succeeds (FK-safe)');
  assert.equal(JSON.stringify(demo), snapshot, 'local state byte-identical');
  assert.equal(getLastSyncedUid(), 'user-a');
  const cloudModules = client._store.modules.map((r) => r.id).sort();
  assert.deepEqual(cloudModules, ['u-mod-1', demoMod].sort(), 'cloud holds user module + one adopted demo module');
});

await test('unrecognized records keep existing behavior (no silent drop)', async () => {
  const state = getDemoSeedData();
  state.modules.push({ moduleId: 'x' }); // no id: not classifiable as demo
  state.modules.push(null); // non-object entry: not classifiable as demo
  const filtered = excludeDemoRecords(state);
  assert.equal(filtered.modules.length, 2, 'id-less and null entries survive filtering (demo module excluded)');
  assert.ok(!filtered.modules.some((m) => m && isDemoId(m.id)), 'the dropped entry is exactly the demo module');
  const client = makeClient({});
  const snapshot = JSON.stringify(state);
  await assert.rejects(
    () => uploadLocalData(client, state),
    /non-empty string id/,
    'upsert still rejects id-less rows exactly as before',
  );
  assert.equal(JSON.stringify(state), snapshot, 'failed upload leaves local state unchanged');
  assert.equal(getLastSyncedUid(), null, 'ledger untouched on failure');
});

await test('repeated uploads add no demo copies', async () => {
  const client = makeClient({});
  const first = getDemoSeedData();
  await uploadLocalData(client, first);
  // A second, distinct demo generation (as minted after a reset at another
  // time): remap every demo id deterministically instead of relying on the clock.
  const second = JSON.parse(JSON.stringify(first));
  const remap = new Map();
  for (const c of ['modules', 'learningObjectives', 'resources', 'studySessions', 'exams', 'examResults', 'planItems', 'captures', 'weeklyReviews']) {
    for (const item of second[c]) {
      if (item && typeof item.id === 'string' && item.id.startsWith('demo-') && !remap.has(item.id)) {
        remap.set(item.id, `${item.id}-gen2`);
      }
    }
  }
  const rewrite = (v) => (typeof v === 'string' && remap.has(v) ? remap.get(v) : v);
  for (const c of ['modules', 'learningObjectives', 'resources', 'studySessions', 'exams', 'examResults', 'planItems', 'captures', 'weeklyReviews']) {
    for (const item of second[c]) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.id === 'string') item.id = rewrite(item.id);
      for (const k of ['moduleId', 'objectiveId', 'examId']) {
        if (typeof item[k] === 'string') item[k] = rewrite(item[k]);
      }
      for (const k of ['linkedObjectiveIds', 'linkedResourceIds']) {
        if (Array.isArray(item[k])) item[k] = item[k].map(rewrite);
      }
      if (Array.isArray(item.objectiveResults)) {
        for (const r of item.objectiveResults) {
          if (r && typeof r.objectiveId === 'string') r.objectiveId = rewrite(r.objectiveId);
        }
      }
    }
  }
  if (second.settings && typeof second.settings.currentModuleId === 'string') {
    second.settings.currentModuleId = rewrite(second.settings.currentModuleId);
  }
  assert.notEqual(second.modules[0].id, first.modules[0].id, 'setup: distinct demo generations');
  await uploadLocalData(client, second);
  assert.deepEqual(cloudDemoIds(client), [], 'still zero demo ids after two uploads');
  assert.equal(client._store.user_settings.length, 1, 'settings row overwritten, not duplicated');
});

await test('repeated downloads are identical and demo rows stay readable', async () => {
  const client = makeClient({
    tables: {
      modules: [
        { user_id: 'user-a', id: 'demo-mod-old', code: 'DB1', title: 'Old demo', accent: '#b45309', target_grade: 5.0, created_at: 1, updated_at: 1 },
        { user_id: 'user-a', id: 'u-mod-1', code: 'U1', title: 'User', accent: '#000', target_grade: 5.0, created_at: 2, updated_at: 2 },
      ],
      learning_objectives: [
        { user_id: 'user-a', id: 'demo-obj-old', module_id: 'demo-mod-old', number: 1, title: 'Old', description: '', status: 'todo', confidence: 1, notes: '', confidence_history: [], session_history: [], review_history: [], last_touched: 1, last_reviewed: null, total_study_time: 0, review_schedule: null, created_at: 1, updated_at: 1 },
      ],
    },
  });
  const a = await downloadCloudData(client);
  const b = await downloadCloudData(client);
  assert.deepEqual(b.state, a.state, 'same cloud dataset downloads identically twice');
  const modIds = a.state.modules.map((m) => m.id).sort();
  assert.deepEqual(modIds, ['demo-mod-old', 'u-mod-1'], 'pre-existing cloud demo rows remain readable');
  assert.ok(a.state.learningObjectives.some((o) => o.id === 'demo-obj-old'), 'demo objective readable');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
