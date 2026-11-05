import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mergeStates,
  syncState,
  uploadMergedData,
  checkAccountBinding,
  getLastSyncedUid,
  setLastSyncedUid,
  clearLastSyncedUid,
  CLOUD_UID_KEY,
  recordsEqual,
} from '../src/lib/services/cloudSync.js';
import { toCloudDataset, fromCloudDataset } from '../src/lib/services/cloudMap.js';
import { defaultState } from '../src/lib/data/entities.js';

const UID = '11111111-1111-4111-8111-111111111111';
const T1 = 1_700_000_000_000;
const T2 = T1 + 1_000;
const T3 = T1 + 2_000;

function module(overrides = {}) {
  return {
    id: 'm1',
    programId: 'program-emvs',
    code: 'M294',
    title: 'Datenbanken',
    accent: '#4f46e5',
    order: 0,
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function note(overrides = {}) {
  return {
    id: 'n1',
    moduleId: 'm1',
    topicId: null,
    title: 'SQL',
    body: '',
    type: 'note',
    attachments: [],
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function stateWith(overrides = {}) {
  return { ...defaultState(), ...overrides };
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function fakeClient({ user = UID, tables = {} } = {}) {
  const store = {};
  for (const [table, rows] of Object.entries(tables)) {
    store[table] = rows.map((row) => ({ user_id: UID, ...row }));
  }

  const keyFor = (table) => (table === 'user_settings' ? 'user_id' : 'id');

  return {
    auth: {
      async getUser() {
        return { data: { user: user ? { id: user } : null }, error: null };
      },
    },
    from(table) {
      return {
        select() {
          return {
            async eq(column, value) {
              const rows = (store[table] || []).filter((row) => row[column] === value);
              return { data: rows.map((row) => ({ ...row })), error: null };
            },
          };
        },
        async upsert(rows, options) {
          if (!store[table]) store[table] = [];
          const key = options?.onConflict === 'user_id' ? 'user_id' : keyFor(table);
          for (const row of rows) {
            const index = store[table].findIndex((existing) => existing[key] === row[key]);
            if (index >= 0) store[table][index] = { ...row };
            else store[table].push({ ...row });
          }
          return { error: null };
        },
      };
    },
    _store: store,
  };
}

describe('mergeStates', () => {
  it('keeps the newest version by updatedAt', () => {
    const local = stateWith({ notes: [note({ title: 'lokal', updatedAt: T2 })] });
    const cloud = stateWith({ notes: [note({ title: 'cloud', updatedAt: T1 })] });
    const { mergedState } = mergeStates(local, cloud);
    expect(mergedState.notes).toHaveLength(1);
    expect(mergedState.notes[0].title).toBe('lokal');
  });

  it('adds cloud-only records to an empty local device', () => {
    const local = stateWith();
    const cloud = stateWith({ notes: [note()] });
    const { mergedState } = mergeStates(local, cloud);
    expect(mergedState.notes.map((n) => n.id)).toEqual(['n1']);
    expect(local.notes).toHaveLength(0);
  });

  it('keeps local-only records', () => {
    const local = stateWith({ notes: [note()] });
    const cloud = stateWith();
    const { mergedState } = mergeStates(local, cloud);
    expect(mergedState.notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('lets a tombstone delete an older record', () => {
    const local = stateWith({ notes: [note({ updatedAt: T1 })] });
    const cloud = stateWith({ tombstones: [{ collection: 'notes', id: 'n1', deletedAt: T2 }] });
    const { mergedState, erasureCount } = mergeStates(local, cloud);
    expect(mergedState.notes).toEqual([]);
    expect(mergedState.tombstones).toEqual([{ collection: 'notes', id: 'n1', deletedAt: T2 }]);
    expect(erasureCount).toBe(1);
  });

  it('revives a record newer than its tombstone', () => {
    const local = stateWith({ notes: [note({ updatedAt: T3 })] });
    const cloud = stateWith({ tombstones: [{ collection: 'notes', id: 'n1', deletedAt: T2 }] });
    const { mergedState } = mergeStates(local, cloud);
    expect(mergedState.notes.map((n) => n.id)).toEqual(['n1']);
    expect(mergedState.tombstones).toEqual([]);
  });

  it('takes the newer of two tombstones', () => {
    const local = stateWith({ tombstones: [{ collection: 'notes', id: 'n1', deletedAt: T1 }] });
    const cloud = stateWith({ tombstones: [{ collection: 'notes', id: 'n1', deletedAt: T2 }] });
    const { mergedState } = mergeStates(local, cloud);
    expect(mergedState.tombstones).toEqual([{ collection: 'notes', id: 'n1', deletedAt: T2 }]);
  });

  it('cascades a deleted module to its children', () => {
    const local = stateWith({
      notes: [note()],
      homework: [{ id: 'h1', moduleId: 'm1', title: 'x', updatedAt: T1 }],
      links: [{ id: 'l1', moduleId: 'm1', label: 'x', url: 'https://x.ch', updatedAt: T1 }],
      lessons: [{ id: 'le1', moduleId: 'm1', dayOfWeek: 1, start: '08:00', end: '09:00', updatedAt: T1 }],
    });
    const cloud = stateWith({ tombstones: [{ collection: 'modules', id: 'm1', deletedAt: T2 }] });
    const { mergedState } = mergeStates(local, cloud);

    expect(mergedState.notes).toEqual([]);
    expect(mergedState.homework).toEqual([]);
    expect(mergedState.links).toEqual([]);
    expect(mergedState.lessons).toEqual([]);
    expect(mergedState.tombstones).toEqual(
      expect.arrayContaining([
        { collection: 'modules', id: 'm1', deletedAt: T2 },
        { collection: 'notes', id: 'n1', deletedAt: T2 },
        { collection: 'homework', id: 'h1', deletedAt: T2 },
        { collection: 'links', id: 'l1', deletedAt: T2 },
        { collection: 'lessons', id: 'le1', deletedAt: T2 },
      ]),
    );
  });

  it('keeps module-less records when a module is deleted', () => {
    const local = stateWith({ notes: [note({ moduleId: null })] });
    const cloud = stateWith({ tombstones: [{ collection: 'modules', id: 'm1', deletedAt: T2 }] });
    const { mergedState } = mergeStates(local, cloud);
    expect(mergedState.notes).toHaveLength(1);
  });

  it('clears deleted topic references but keeps the records', () => {
    const local = stateWith({
      notes: [note({ topicId: 't1', updatedAt: T1 })],
      homework: [{ id: 'h1', topicId: 't1', title: 'x', updatedAt: T1 }],
      exams: [{ id: 'e1', moduleId: 'm1', topicIds: ['t1', 't2'], title: 'x', updatedAt: T1 }],
    });
    const cloud = stateWith({ tombstones: [{ collection: 'topics', id: 't1', deletedAt: T2 }] });
    const { mergedState } = mergeStates(local, cloud);

    expect(mergedState.notes).toHaveLength(1);
    expect(mergedState.notes[0].topicId).toBeNull();
    expect(mergedState.notes[0].updatedAt).toBe(T2);
    expect(mergedState.homework[0].topicId).toBeNull();
    expect(mergedState.exams[0].topicIds).toEqual(['t2']);
    expect(mergedState.tombstones).toContainEqual({ collection: 'topics', id: 't1', deletedAt: T2 });
  });

  it('merges settings by updatedAt', () => {
    const local = stateWith({ settings: { ...defaultState().settings, theme: 'dark', updatedAt: T1 } });
    const cloud = stateWith({ settings: { ...defaultState().settings, theme: 'light', updatedAt: T2 } });
    expect(mergeStates(local, cloud).mergedState.settings.theme).toBe('light');

    const newerLocal = stateWith({ settings: { ...defaultState().settings, theme: 'dark', updatedAt: T3 } });
    expect(mergeStates(newerLocal, cloud).mergedState.settings.theme).toBe('dark');
  });

  it('keeps local-only checklist state', () => {
    const local = stateWith({ checklist: { date: '2026-11-05', checked: { studied: true } } });
    const { mergedState } = mergeStates(local, stateWith());
    expect(mergedState.checklist).toEqual({ date: '2026-11-05', checked: { studied: true } });
  });

  it('does not mutate the input state arrays', () => {
    const local = stateWith({ notes: [note()] });
    const cloud = stateWith({ tombstones: [{ collection: 'modules', id: 'm1', deletedAt: T2 }] });
    mergeStates(local, cloud);
    expect(local.notes).toHaveLength(1);
  });
});

describe('recordsEqual', () => {
  it('compares nested values', () => {
    expect(recordsEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(recordsEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(recordsEqual({ a: null }, { a: undefined })).toBe(false);
  });
});

describe('account binding', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
    clearLastSyncedUid();
  });

  afterEach(() => {
    clearLastSyncedUid();
    delete globalThis.localStorage;
  });

  it('treats a first sync as unbound', () => {
    expect(checkAccountBinding(UID, stateWith())).toMatchObject({ status: 'first', lastUid: null });
  });

  it('accepts the same account', () => {
    setLastSyncedUid(UID);
    expect(getLastSyncedUid()).toBe(UID);
    expect(checkAccountBinding(UID, stateWith()).status).toBe('ok');
  });

  it('blocks another account with local content', () => {
    setLastSyncedUid('other');
    expect(checkAccountBinding(UID, stateWith({ notes: [note()] })).status).toBe('mismatch');
  });

  it('allows another account on an empty device', () => {
    setLastSyncedUid('other');
    expect(checkAccountBinding(UID, stateWith()).status).toBe('switch-empty');
  });

  it('stores the binding under its own key', () => {
    setLastSyncedUid(UID);
    expect(globalThis.localStorage.getItem(CLOUD_UID_KEY)).toBe(UID);
    clearLastSyncedUid();
    expect(globalThis.localStorage.getItem(CLOUD_UID_KEY)).toBeNull();
  });
});

describe('syncState and upload', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
    clearLastSyncedUid();
  });

  afterEach(() => {
    clearLastSyncedUid();
    delete globalThis.localStorage;
  });

  it('fetches, merges and reports the cloud state', async () => {
    const cloud = stateWith({ notes: [note({ title: 'cloud' })] });
    const client = fakeClient({ tables: toCloudDataset(cloud) });
    const result = await syncState(client, stateWith({ notes: [note({ title: 'lokal', updatedAt: T2 })] }));

    expect(result.uid).toBe(UID);
    expect(result.mergedState.notes[0].title).toBe('lokal');
    expect(result.cloudState.notes[0].title).toBe('cloud');
  });

  it('refuses to sync into another account', async () => {
    setLastSyncedUid('other');
    const client = fakeClient();
    await expect(syncState(client, stateWith({ notes: [note()] }))).rejects.toMatchObject({
      code: 'ACCOUNT_MISMATCH',
    });
  });

  it('uploads rows parent-first and verifies the round-trip', async () => {
    const client = fakeClient();
    const merged = stateWith({
      modules: [module()],
      notes: [note()],
      checklistItems: [{ id: 'c1', text: 'x', kind: 'custom', order: 0, createdAt: T1, updatedAt: T1 }],
      settings: { ...defaultState().settings, theme: 'dark', updatedAt: T2 },
    });

    const result = await uploadMergedData(client, merged);
    expect(result.uid).toBe(UID);
    expect(result.ledger.find((l) => l.table === 'modules')).toMatchObject({ written: 1, skipped: false });
    expect(result.ledger.find((l) => l.table === 'user_settings')).toMatchObject({ written: 1 });

    expect(client._store.notes[0].title).toBe('SQL');
    expect(client._store.user_settings[0].theme).toBe('dark');
    expect(getLastSyncedUid()).toBe(UID);
  });

  it('uploads tombstones as minimal soft-deleted rows', async () => {
    const client = fakeClient();
    const merged = stateWith({ tombstones: [{ collection: 'notes', id: 'gone', deletedAt: T2 }] });

    await uploadMergedData(client, merged);
    expect(client._store.notes).toHaveLength(1);
    expect(client._store.notes[0]).toMatchObject({ id: 'gone', deleted_at: T2 });
  });

  it('fails verification when the cloud changes a row', async () => {
    const client = fakeClient();
    const originalUpsert = client.from;
    client.from = (table) => {
      const builder = originalUpsert(table);
      return {
        ...builder,
        async upsert(rows, options) {
          const tampered = rows.map((row) => (table === 'notes' ? { ...row, title: 'geändert' } : row));
          return builder.upsert(tampered, options);
        },
      };
    };

    await expect(
      uploadMergedData(client, stateWith({ notes: [note()] })),
    ).rejects.toMatchObject({ code: 'VERIFY_FAILED' });
  });

  it('round-trips a full dataset through a fake cloud', async () => {
    const cloud = fromCloudDataset(toCloudDataset(stateWith({ notes: [note()] })));
    expect(cloud.notes[0].title).toBe('SQL');
  });
});
