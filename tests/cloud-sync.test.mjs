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
  commitDownloadReplacement,
  checkAccountBinding,
  getLastSyncedUid,
  setLastSyncedUid,
  clearLastSyncedUid,
  recordsEqual,
  normalizeVerifyTimestamps,
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

function makeClient({ userId = 'user-a', tables = {}, failOn = null, failUpsertOn = null, corrupt = null } = {}) {
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
          if (corrupt && corrupt.table === table) {
            const target = store[table].find((r) => table === 'user_settings' || r.id === corrupt.id);
            if (target) Object.assign(target, corrupt.patch);
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

await test('failed local persistence restores the previous in-memory state', async () => {
  const previous = syntheticLocal();
  let current = previous;
  let latchCleared = false;
  let renders = 0;
  const deps = {
    getState: () => current,
    setState: (s) => { current = s; },
    save: () => false, // quota / blocked persistence
    clearStorageError: () => { latchCleared = true; },
    renderSidebar: () => { renders += 1; },
    navigate: () => { throw new Error('must not navigate on failure'); },
  };
  const cloud = syntheticLocal();
  cloud.modules[0] = { ...cloud.modules[0], title: 'CLOUD' };
  let err = null;
  try {
    commitDownloadReplacement(deps, cloud);
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'commit must throw when persistence fails');
  assert.equal(err.code, 'PERSIST_FAILED');
  assert.equal(current, previous, 'previous in-memory state restored');
  assert.equal(current.modules[0].title, 'M', 'previous values intact');
  assert.equal(latchCleared, true, 'latch cleared only at the confirmed commit point');
  assert.ok(renders >= 1, 'UI repainted with restored state');
});

await test('successful download commit keeps cloud state', async () => {
  const previous = syntheticLocal();
  let current = previous;
  let latchCleared = false;
  let navigated = null;
  const cloud = syntheticLocal();
  const res = commitDownloadReplacement({
    getState: () => current,
    setState: (s) => { current = s; },
    save: () => true,
    clearStorageError: () => { latchCleared = true; },
    renderSidebar: () => {},
    navigate: (v) => { navigated = v; },
  }, cloud);
  assert.deepEqual(res, { replaced: true });
  assert.equal(current, cloud, 'cloud state active after verified save');
  assert.equal(latchCleared, true);
  assert.equal(navigated, 'today');
});

await test('upload fails when a cloud row ID exists but a field value differs', async () => {
  const client = makeClient({
    corrupt: { table: 'modules', id: 'mod-1', patch: { title: 'TAMPERED' } },
  });
  let err = null;
  try {
    await uploadLocalData(client, syntheticLocal());
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'verification must fail on value mismatch');
  assert.equal(err.code, 'VERIFY_FAILED');
  assert.ok(Array.isArray(err.mismatches) && err.mismatches.length > 0);
  assert.equal(getLastSyncedUid(), null, 'account-sync ledger must not update');
});

await test('upload verifies the user_settings row too', async () => {
  const client = makeClient({
    corrupt: { table: 'user_settings', patch: { theme: 'light' } },
  });
  // Local settings theme is 'dark'; tampered read-back says 'light'.
  let err = null;
  try {
    await uploadLocalData(client, syntheticLocal());
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'settings mismatch must fail verification');
  assert.equal(err.code, 'VERIFY_FAILED');
  assert.ok(err.mismatches.some((m) => m.table === 'user_settings'));
  assert.equal(getLastSyncedUid(), null, 'account-sync ledger must not update');
});

await test('recordsEqual ignores object key order but preserves array order', async () => {
  // Semantically identical nested objects with different key order must pass.
  const a = fromRow('learningObjectives', toRow('learningObjectives', {
    id: 'demo-obj1-mv1ff5nk', moduleId: 'mod-1', number: 1, title: 'T',
    reviewHistory: [{ timestamp: 1700000000000, outcome: 'solid' }],
    reviewSchedule: { interval: 4, nextReview: 1700000000001, reviewCount: 1 },
  }));
  const b = fromRow('learningObjectives', toRow('learningObjectives', {
    id: 'demo-obj1-mv1ff5nk', moduleId: 'mod-1', number: 1, title: 'T',
    reviewHistory: [{ outcome: 'solid', timestamp: 1700000000000 }],
    reviewSchedule: { reviewCount: 1, nextReview: 1700000000001, interval: 4 },
  }));
  assert.notEqual(JSON.stringify(a), JSON.stringify(b), 'old JSON.stringify check would flag this');
  assert.ok(recordsEqual(a, b), 'structurally identical records must compare equal');
  // Array order is significant.
  const c = { ...b, reviewHistory: [...b.reviewHistory] };
  assert.ok(!recordsEqual({ v: [1, 2] }, { v: [2, 1] }), 'array reorder must compare unequal');
  void c;
  // Genuinely different values still fail.
  assert.ok(!recordsEqual(a, { ...b, title: 'OTHER' }), 'different scalar must compare unequal');
  assert.ok(!recordsEqual({ v: 1 }, { v: '1' }), '1 vs "1" must compare unequal');
  assert.ok(!recordsEqual({ v: null }, { v: '' }), 'null vs "" must compare unequal');
  assert.ok(!recordsEqual({ v: [1] }, { v: [1, 2] }), 'different array length must compare unequal');
});

await test('upload passes when Postgres JSONB reorders nested object keys', async () => {
  // Simulate PostgreSQL JSONB key normalization: recursively reverse object
  // key order on every read-back row. Nested history/schedule objects come
  // back semantically identical but with different key order.
  function reverseKeysDeep(v) {
    if (Array.isArray(v)) return v.map(reverseKeysDeep);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).reverse()) out[k] = reverseKeysDeep(v[k]);
      return out;
    }
    return v;
  }
  const base = makeClient({});
  const origFrom = base.from.bind(base);
  base.from = (table) => {
    const q = origFrom(table);
    return {
      select() {
        return {
          async eq(col, val) {
            const res = await q.select().eq(col, val);
            if (res.error || !Array.isArray(res.data)) return res;
            return { data: res.data.map(reverseKeysDeep), error: null };
          },
        };
      },
      upsert: q.upsert.bind(q),
    };
  };
  const res = await uploadLocalData(base, syntheticLocal());
  assert.ok(res.uid === 'user-a', 'upload succeeds despite key reordering');
  assert.equal(getLastSyncedUid(), 'user-a');
});

// ---------------------------------------------------------------------------
// Faithful PostgreSQL read-back simulation for the production VERIFY_FAILED:
// jsonb columns come back with normalized key order (length-then-bytewise),
// timestamptz columns come back as ISO text with numeric offset and zero
// fractional seconds dropped ("...+00:00" instead of "...T....000Z").
// ---------------------------------------------------------------------------

const PG_JSONB_COLUMNS = [
  'confidence_history', 'session_history', 'review_history', 'review_schedule',
  'usage_history', 'understood_history', 'objective_results',
];
const PG_TS_COLUMNS = ['start_time', 'timestamp'];

function pgJsonbNormalize(v) {
  if (Array.isArray(v)) return v.map(pgJsonbNormalize);
  if (v && typeof v === 'object') {
    const out = {};
    const keys = Object.keys(v).sort(
      (x, y) => (x.length - y.length) || (x < y ? -1 : x > y ? 1 : 0),
    );
    for (const k of keys) out[k] = pgJsonbNormalize(v[k]);
    return out;
  }
  return v;
}

function pgTimestamptzText(iso) {
  const d = new Date(iso);
  const base = d.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
  const ms = d.getUTCMilliseconds();
  return ms ? `${base}.${String(ms).padStart(3, '0')}+00:00` : `${base}+00:00`;
}

function pgReadBackRow(row) {
  const out = { ...row };
  for (const c of PG_JSONB_COLUMNS) {
    if (out[c] !== undefined) out[c] = pgJsonbNormalize(out[c]);
  }
  for (const c of PG_TS_COLUMNS) {
    if (typeof out[c] === 'string' && out[c] !== '') {
      const t = Date.parse(out[c]);
      if (Number.isFinite(t)) out[c] = pgTimestamptzText(out[c]);
    }
  }
  return out;
}

function pgSimulatingClient() {
  const base = makeClient({});
  const origFrom = base.from.bind(base);
  base.from = (table) => {
    const q = origFrom(table);
    return {
      select() {
        return {
          async eq(col, val) {
            const res = await q.select().eq(col, val);
            if (res.error || !Array.isArray(res.data)) return res;
            return { data: res.data.map(pgReadBackRow), error: null };
          },
        };
      },
      upsert: q.upsert.bind(q),
    };
  };
  return base;
}

await test('normalizeVerifyTimestamps equates timestamptz text variants only', async () => {
  const z = { id: 's', startTime: '2023-11-14T22:13:20.000Z' };
  const pg = { id: 's', startTime: '2023-11-14T22:13:20+00:00' };
  assert.ok(
    recordsEqual(normalizeVerifyTimestamps('studySessions', z), normalizeVerifyTimestamps('studySessions', pg)),
    'same instant in Z vs +00:00 text must compare equal',
  );
  assert.equal(
    normalizeVerifyTimestamps('studySessions', { id: 's', startTime: '2023-11-14T22:13:20.123+00:00' }).startTime,
    '2023-11-14T22:13:20.123Z',
    'fractional seconds preserved in canonical form',
  );
  const shifted = { id: 's', startTime: '2023-11-14T23:13:20+00:00' };
  assert.ok(
    !recordsEqual(normalizeVerifyTimestamps('studySessions', z), normalizeVerifyTimestamps('studySessions', shifted)),
    'a genuinely different instant must still mismatch',
  );
  const garbage = { id: 's', startTime: 'not-a-date' };
  assert.equal(normalizeVerifyTimestamps('studySessions', garbage).startTime, 'not-a-date', 'unparseable left as-is');
  assert.ok(
    !recordsEqual(normalizeVerifyTimestamps('studySessions', z), normalizeVerifyTimestamps('studySessions', garbage)),
    'garbage timestamp still mismatches',
  );
  const mod = { id: 'm', code: 'X' };
  assert.ok(normalizeVerifyTimestamps('modules', mod) === mod, 'other collections pass through untouched');
  assert.ok(normalizeVerifyTimestamps('studySessions', null) === null, 'null passes through');
  const frozen = Object.freeze({ ...z });
  normalizeVerifyTimestamps('studySessions', frozen);
  assert.equal(frozen.startTime, z.startTime, 'input records are never mutated');
  assert.ok(
    recordsEqual(
      normalizeVerifyTimestamps('captures', { id: 'c', timestamp: '2023-11-14T22:13:20.000Z' }),
      normalizeVerifyTimestamps('captures', { id: 'c', timestamp: '2023-11-14T22:13:20+00:00' }),
    ),
    'captures.timestamp is covered too',
  );
});

await test('upload passes under faithful Postgres read-back (jsonb reorder + timestamptz reformat)', async () => {
  // Reproduces the production VERIFY_FAILED shape (demo seed: objectives +
  // sessions + exam differ textually after a PG round-trip) and proves the
  // fixed verification accepts it.
  const client = pgSimulatingClient();
  const local = syntheticLocal();
  const snapshot = JSON.stringify(local);
  const res = await uploadLocalData(client, local);
  assert.ok(res.uid === 'user-a', 'upload succeeds despite PG serialization');
  assert.equal(getLastSyncedUid(), 'user-a');
  assert.equal(JSON.stringify(local), snapshot, 'local state byte-identical');
  // Prove the simulation is non-trivial: textual read-back differs from sent,
  // so the old JSON.stringify check would still fail here.
  const sentSession = client._calls.find((c) => c[0] === 'upsert' && c[1] === 'study_sessions')[2][0];
  assert.notEqual(pgReadBackRow(sentSession).start_time, sentSession.start_time, 'timestamptz text differs after PG round-trip');
  const sentObj = client._calls.find((c) => c[0] === 'upsert' && c[1] === 'learning_objectives')[2][0];
  assert.notEqual(JSON.stringify(pgReadBackRow(sentObj)), JSON.stringify(sentObj), 'jsonb key order differs after PG round-trip');
});

await test('upload still fails when a timestamp genuinely differs', async () => {
  const shifted = new Date(1700000000000 + 3600000).toISOString();
  const client = makeClient({
    corrupt: { table: 'study_sessions', id: 'ses-1', patch: { start_time: shifted } },
  });
  let err = null;
  try {
    await uploadLocalData(client, syntheticLocal());
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'shifted timestamp must fail verification (no over-normalization)');
  assert.equal(err.code, 'VERIFY_FAILED');
  assert.ok(err.mismatches.some((m) => m.table === 'study_sessions' && m.id === 'ses-1'));
  assert.equal(getLastSyncedUid(), null, 'account-sync ledger must not update');
});

console.log(`\n${passed} passed`);
