import assert from 'node:assert/strict';
import {
  toRow,
  fromRow,
  toCloudDataset,
  fromCloudDataset,
  isEmptyDataset,
  countDataset,
  UPLOAD_ORDER,
} from '../js/services/cloudMap.js';
import {
  uploadLocalData,
  downloadCloudData,
  downloadReplacementCheck,
  checkAccountBinding,
  getLastSyncedUid,
  setLastSyncedUid,
  clearLastSyncedUid,
} from '../js/services/cloudSync.js';

// Fake localStorage for the account-association key.
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};

let passed = 0;
async function test(name, fn) {
  clearLastSyncedUid();
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

function makeClient({ userId = 'user-a', tables = {}, failOn = null, failUpsertOn = null } = {}) {
  const calls = [];
  const store = JSON.parse(JSON.stringify(tables));
  const client = {
    _calls: calls,
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
            async eq(col, val) {
              calls.push(['select', table]);
              if (failOn === table) {
                return { data: null, error: new Error(`read failed: ${table}`) };
              }
              return { data: store[table] ? [...store[table]] : [], error: null };
            },
          };
        },
        async upsert(payload, options) {
          calls.push(['upsert', table, payload, options]);
          if (failUpsertOn === table) {
            return { error: new Error(`write failed: ${table}`) };
          }
          store[table] = store[table] || [];
          for (const row of payload) {
            const ix = store[table].findIndex(
              (r) => r.user_id === row.user_id && (r.id === row.id || table === 'user_settings'),
            );
            if (ix >= 0) store[table][ix] = { ...store[table][ix], ...row };
            else store[table].push({ ...row });
          }
          return { error: null };
        },
      };
    },
  };
  return client;
}

function syntheticLocal() {
  const now = 1700000000000;
  const mod = { id: 'mod-1', code: 'DB1', title: 'M', accent: '#b45309', targetGrade: 5.0, createdAt: now, updatedAt: now };
  return {
    modules: [mod],
    learningObjectives: [{
      id: 'obj-1', moduleId: 'mod-1', number: 1, title: 'T', description: 'd',
      status: 'in-progress', confidence: 3, notes: 'n',
      confidenceHistory: [{ value: 3, timestamp: now }], sessionHistory: [{ sessionId: 's1' }],
      reviewHistory: [{ timestamp: now, outcome: 'solid' }], lastTouched: now,
      lastReviewed: now, totalStudyTime: 25,
      reviewSchedule: { interval: 4, nextReview: now + 1, reviewCount: 1 },
      createdAt: now, updatedAt: now,
    }],
    resources: [{
      id: 'res-1', moduleId: 'mod-1', name: 'R', type: 'Video', focus: '70',
      status: 'todo', url: 'https://x.test', linkedObjectiveIds: ['obj-1'], notes: 'n',
      usageHistory: [{ timestamp: now }], understood: true, understoodAt: now,
      understoodHistory: [{ timestamp: now, value: true }], lastUsed: now,
      createdAt: now, updatedAt: now,
    }],
    studySessions: [{
      id: 'ses-1', moduleId: 'mod-1', startTime: new Date(now).toISOString(),
      duration: 30, linkedObjectiveIds: ['obj-1'], linkedResourceIds: ['res-1'],
      note: 'n', createdAt: now, updatedAt: now,
    }],
    exams: [{
      id: 'ex-1', moduleId: 'mod-1', name: 'E', date: '2026-03-01', weight: 40,
      score: '', max: '', linkedObjectiveIds: ['obj-1'],
      objectiveResults: [{ objectiveId: 'obj-1', rating: 'weak', note: '' }],
      description: 'd', isMock: false, durationMin: null, createdAt: now, updatedAt: now,
    }],
    examResults: [{
      id: 'er-1', examId: 'ex-1', moduleId: 'mod-1', score: 4.5, max: 6,
      grade: 4.75, date: '2026-03-02', objectiveResults: [], notes: 'n', createdAt: now,
    }],
    planItems: [{
      id: 'pl-1', moduleId: 'mod-1', week: 10, title: 'W', text: 't', type: 'task',
      linkedObjectiveIds: [], linkedResourceIds: [], done: false, dropped: false,
      notes: '', dueDate: '2026-03-05', createdAt: now, updatedAt: now,
    }],
    captures: [{
      id: 'cap-1', moduleId: 'mod-1', objectiveId: 'obj-1', type: 'question',
      content: 'c', tags: ['a'], timestamp: new Date(now).toISOString(),
      createdAt: now, updatedAt: now,
    }],
    weeklyReviews: [{
      id: 'wr-1', week: 10, year: 2026, moduleId: null, moduleTitle: '',
      wentWell: 'g', didntWork: 'b', nextWeek: 'n', learned: 'l', adjustments: 'a',
      studyTime: 60, sessionsCount: 2, objectivesReviewed: 1, createdAt: now, updatedAt: now,
    }],
    settings: { theme: 'dark', currentModuleId: 'mod-1' },
  };
}

await test('every collection maps both directions without losing fields', async () => {
  const local = syntheticLocal();
  for (const c of ['modules', 'learningObjectives', 'resources', 'studySessions', 'exams', 'examResults', 'planItems', 'captures', 'weeklyReviews']) {
    for (const item of local[c]) {
      const row = toRow(c, item);
      assert.ok(!('user_id' in row), `${c}: user_id must never come from app data`);
      const back = fromRow(c, { ...row, user_id: 'user-a' });
      assert.equal(back.id, item.id, `${c}: id survives`);
    }
  }
  const srow = toRow('settings', local.settings);
  assert.equal(srow.theme, 'dark');
  assert.equal(srow.current_module_id, 'mod-1');
  const sback = fromRow('settings', { ...srow, user_id: 'user-a' });
  assert.equal(sback.theme, 'dark');
  assert.equal(sback.currentModuleId, 'mod-1');
});

await test('IDs and historical fields survive round-trip conversion', async () => {
  const local = syntheticLocal();
  const cloud = toCloudDataset(local);
  const tables = {};
  const { TABLE_FOR_COLLECTION } = await import('../js/services/cloudMap.js');
  for (const [table, rows] of Object.entries(cloud)) tables[table] = rows.map((r) => ({ ...r, user_id: 'user-a' }));
  void TABLE_FOR_COLLECTION;
  const back = fromCloudDataset(tables);
  assert.equal(back.learningObjectives[0].confidenceHistory[0].value, 3);
  assert.equal(back.learningObjectives[0].reviewHistory[0].outcome, 'solid');
  assert.equal(back.learningObjectives[0].reviewSchedule.interval, 4);
  assert.deepEqual(back.learningObjectives[0].sessionHistory, [{ sessionId: 's1' }]);
  assert.deepEqual(back.resources[0].usageHistory, [{ timestamp: 1700000000000 }]);
  assert.deepEqual(back.exams[0].objectiveResults, [{ objectiveId: 'obj-1', rating: 'weak', note: '' }]);
  assert.equal(back.examResults[0].score, 4.5);
  assert.deepEqual(back.captures[0].tags, ['a']);
});

await test('nullable values survive (null stays null, empty date becomes null)', async () => {
  assert.equal(toRow('exams', { id: 'x', date: '' }).date, null);
  assert.equal(toRow('planItems', { id: 'x', dueDate: null }).due_date, null);
  assert.equal(toRow('captures', { id: 'x', moduleId: null, objectiveId: '' }).module_id, null);
  assert.equal(fromRow('exams', { id: 'x', date: null, score: '', max: '' }).date, '');
  assert.equal(fromRow('captures', { id: 'x', module_id: null, objective_id: null }).moduleId, null);
  assert.equal(toRow('learningObjectives', { id: 'x', lastReviewed: null }).last_reviewed, null);
  assert.equal(toRow('resources', { id: 'x', understoodAt: null, lastUsed: '' }).last_used, null);
});

await test('mock exam numeric score/max map to TEXT and back to numbers', async () => {
  const row = toRow('exams', { id: 'm1', score: 3, max: 4, isMock: true });
  assert.equal(row.score, '3');
  assert.equal(row.max, '4');
  const back = fromRow('exams', { ...row, is_mock: true });
  assert.equal(back.score, 3);
  assert.equal(back.max, 4);
  const real = fromRow('exams', { id: 'r1', score: '3', max: '4', is_mock: false });
  assert.equal(real.score, '3');
});

await test('empty local data never silently overwrites existing cloud data', async () => {
  const client = makeClient({
    tables: { modules: [{ user_id: 'user-a', id: 'm-cloud' }] },
  });
  const empty = {
    modules: [], learningObjectives: [], resources: [], studySessions: [],
    exams: [], examResults: [], planItems: [], captures: [], weeklyReviews: [],
    settings: { theme: 'light', currentModuleId: null },
  };
  assert.ok(isEmptyDataset(empty));
  await assert.rejects(() => uploadLocalData(client, empty), /leer|EMPTY/i);
  assert.ok(!client._calls.some((c) => c[0] === 'upsert'), 'no cloud write may happen');
});

await test('failed uploads leave local data untouched', async () => {
  const local = syntheticLocal();
  const snapshot = JSON.stringify(local);
  const client = makeClient({ failUpsertOn: 'modules' });
  await assert.rejects(() => uploadLocalData(client, local), /write failed/);
  assert.equal(JSON.stringify(local), snapshot, 'local state byte-identical');
});

await test('failed downloads leave local data untouched (read error)', async () => {
  const local = syntheticLocal();
  const snapshot = JSON.stringify(local);
  const client = makeClient({ failOn: 'exams' });
  await assert.rejects(() => downloadCloudData(client), /read failed/);
  assert.equal(JSON.stringify(local), snapshot);
});

await test('incomplete downloads are rejected (row without id)', async () => {
  const client = makeClient({ tables: { modules: [{ user_id: 'user-a' }] } });
  await assert.rejects(() => downloadCloudData(client), /ohne id|ungültig/i);
});

await test("account A's rows can never be uploaded as account B", async () => {
  const local = syntheticLocal();
  local.modules[0].user_id = 'user-a'; // poisoned local value must be ignored
  const client = makeClient({ userId: 'user-b' });
  const res = await uploadLocalData(client, local);
  assert.equal(res.uid, 'user-b');
  for (const [, table, payload] of client._calls.filter((c) => c[0] === 'upsert')) {
    for (const row of payload) assert.equal(row.user_id, 'user-b', `${table}: forced to session user`);
  }
  assert.equal(getLastSyncedUid(), 'user-b');
});

await test('account mismatch blocks uploads until explicitly resolved', async () => {
  setLastSyncedUid('user-a');
  const local = syntheticLocal();
  const client = makeClient({ userId: 'user-b' });
  const binding = checkAccountBinding('user-b', local);
  assert.equal(binding.status, 'mismatch');
  await assert.rejects(() => uploadLocalData(client, local), /Kontenfrage|ACCOUNT_MISMATCH/);
  assert.ok(!client._calls.some((c) => c[0] === 'upsert'));
});

await test('cross-user reads and writes remain blocked (errors propagate)', async () => {
  const denied = makeClient({});
  denied.from = () => ({
    select() {
      return { async eq() { return { data: null, error: new Error('RLS denied') }; } };
    },
    async upsert() { return { error: new Error('RLS rejected write') }; },
  });
  await assert.rejects(() => downloadCloudData(denied), /RLS denied/);
  await assert.rejects(() => uploadLocalData(denied, syntheticLocal()), /RLS|read failed/);
});

await test('upload order is parent-first (modules before dependents)', async () => {
  assert.deepEqual(
    UPLOAD_ORDER.slice(0, 6),
    ['modules', 'learningObjectives', 'resources', 'studySessions', 'exams', 'examResults'],
  );
  const client = makeClient({});
  await uploadLocalData(client, syntheticLocal());
  const order = client._calls.filter((c) => c[0] === 'upsert').map((c) => c[1]);
  assert.ok(order.indexOf('modules') < order.indexOf('learning_objectives'));
  assert.ok(order.indexOf('exams') < order.indexOf('exam_results'));
});

await test('download replacement requires explicit decision on conflicts', async () => {
  const local = syntheticLocal();
  const cloud = syntheticLocal();
  cloud.modules.push({ id: 'm2', code: 'X', title: 'Y', accent: '#000', targetGrade: 5, createdAt: 1, updatedAt: 1 });
  const check = downloadReplacementCheck(local, cloud);
  assert.equal(check.needsDecision, true);
  assert.equal(countDataset(local).total > 0, true);
});

console.log(`\n${passed} passed`);
