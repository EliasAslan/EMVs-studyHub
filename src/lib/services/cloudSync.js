/**
 * Supabase sync for the v3 schema.
 *
 * Local state is always the datastore. Sync is best-effort: merge the cloud
 * into the local state with last-write-wins, then upload the merged result.
 * Nothing here writes localStorage; the caller applies the merged state.
 */

import { listUserRows, upsertUserRows } from './supabaseData.js';
import {
  UPLOAD_ORDER,
  TABLE_FOR_COLLECTION,
  toCloudDataset,
  fromCloudDataset,
  fromRow,
  isEmptyDataset,
  countDataset,
} from './cloudMap.js';

export const CLOUD_UID_KEY = 'studyhub_cloud_uid_v1';
export const EXPECTED_TABLES = Object.freeze(Object.values(TABLE_FOR_COLLECTION));

const ENTITY_COLLECTIONS = UPLOAD_ORDER.filter((c) => c !== 'settings');
const CHILD_COLLECTIONS = Object.freeze(['topics', 'notes', 'homework', 'exams', 'links', 'lessons']);

export function recordsEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!recordsEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) if (!Object.hasOwn(b, k)) return false;
  for (const k of keysA) if (!recordsEqual(a[k], b[k])) return false;
  return true;
}

function readUidKey() {
  try {
    return globalThis.localStorage?.getItem(CLOUD_UID_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeUidKey(uid) {
  try {
    if (!globalThis.localStorage) return false;
    if (uid === null || uid === undefined) globalThis.localStorage.removeItem(CLOUD_UID_KEY);
    else globalThis.localStorage.setItem(CLOUD_UID_KEY, String(uid));
    return true;
  } catch {
    return false;
  }
}

export function getLastSyncedUid() {
  return readUidKey();
}

export function setLastSyncedUid(uid) {
  writeUidKey(uid);
}

export function clearLastSyncedUid() {
  writeUidKey(null);
}

export async function getSessionUserId(client) {
  if (!client?.auth?.getUser) throw new TypeError('A Supabase client is required.');
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error('Bitte melde dich zuerst bei Supabase an.');
  return uid;
}

export function checkAccountBinding(currentUid, localState) {
  const lastUid = getLastSyncedUid();
  if (!lastUid) return { status: 'first', lastUid: null, currentUid };
  if (lastUid === currentUid) return { status: 'ok', lastUid, currentUid };
  return {
    status: isEmptyDataset(localState) ? 'switch-empty' : 'mismatch',
    lastUid,
    currentUid,
  };
}

export function describeConflict(localState, cloudState) {
  return {
    localEmpty: isEmptyDataset(localState),
    cloudEmpty: isEmptyDataset(cloudState),
    bothNonEmpty: !isEmptyDataset(localState) && !isEmptyDataset(cloudState),
    localCounts: countDataset(localState),
    cloudCounts: countDataset(cloudState),
  };
}

export async function fetchCloudDataset(client) {
  const tables = {};
  for (const table of EXPECTED_TABLES) {
    tables[table] = await listUserRows(client, table);
  }
  validateCloudDatasetShape(tables);
  return tables;
}

export function validateCloudDatasetShape(tables) {
  if (!tables || typeof tables !== 'object') throw new Error('Cloud-Daten sind ungültig.');
  for (const table of EXPECTED_TABLES) {
    if (!Array.isArray(tables[table])) {
      throw new Error(`Cloud-Daten sind unvollständig (Tabelle fehlt: ${table}).`);
    }
    if (table === 'user_settings') continue;
    for (const row of tables[table]) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) {
        throw new Error(`Cloud-Daten sind ungültig (Tabelle ${table} enthält Zeile ohne id).`);
      }
    }
  }
  return true;
}

function itemTimestamp(item) {
  return typeof item?.updatedAt === 'number' ? item.updatedAt : 0;
}

function tombstoneKey(collection, id) {
  return `${collection}\u0000${id}`;
}

/**
 * Pure merge: cloud is source of truth, local is offline cache.
 * A live record newer than a tombstone revives it (undo/restore wins).
 */
export function mergeStates(localState = {}, cloudState = {}) {
  const localTombstones = new Map(
    (localState.tombstones || []).map((t) => [tombstoneKey(t.collection, t.id), t]),
  );
  const cloudTombstones = new Map(
    (cloudState.tombstones || []).map((t) => [tombstoneKey(t.collection, t.id), t]),
  );

  const merged = {};
  const mergedTombstones = [];
  let erasureCount = 0;

  for (const collection of ENTITY_COLLECTIONS) {
    const localItems = new Map((localState[collection] || []).map((item) => [item.id, item]));
    const cloudItems = new Map((cloudState[collection] || []).map((item) => [item.id, item]));
    const ids = new Set([...localItems.keys(), ...cloudItems.keys()]);
    // Tombstones outlive the records they delete, so carry them even when
    // neither side still has a live item for that id.
    for (const tombstone of [...(localState.tombstones || []), ...(cloudState.tombstones || [])]) {
      if (tombstone?.collection === collection && tombstone.id) ids.add(tombstone.id);
    }
    const rows = [];

    for (const id of ids) {
      const local = localItems.get(id);
      const cloud = cloudItems.get(id);
      const localTomb = localTombstones.get(tombstoneKey(collection, id));
      const cloudTomb = cloudTombstones.get(tombstoneKey(collection, id));
      const tombstone = localTomb || cloudTomb;

      if (tombstone) {
        const deletedAt = Math.max(localTomb?.deletedAt || 0, cloudTomb?.deletedAt || 0);
        const winner = itemTimestamp(local) >= itemTimestamp(cloud) ? local : cloud;
        if (winner && itemTimestamp(winner) > deletedAt) {
          rows.push(winner);
        } else {
          mergedTombstones.push({ collection, id, deletedAt });
          if (local && !localTomb) erasureCount += 1;
        }
        continue;
      }

      if (local && cloud) {
        const winner = itemTimestamp(local) >= itemTimestamp(cloud) ? local : cloud;
        rows.push(winner);
        if (winner === cloud && itemTimestamp(local) !== itemTimestamp(cloud)) erasureCount += 1;
      } else if (local) {
        rows.push(local);
      } else if (cloud) {
        rows.push(cloud);
      }
    }
    merged[collection] = rows;
  }

  // A deleted module takes its children with it (FK closure).
  const deletedModules = new Map(
    mergedTombstones
      .filter((t) => t.collection === 'modules')
      .map((t) => [t.id, t.deletedAt]),
  );
  if (deletedModules.size) {
    for (const collection of CHILD_COLLECTIONS) {
      merged[collection] = (merged[collection] || []).filter((item) => {
        if (!item.moduleId || !deletedModules.has(item.moduleId)) return true;
        const deletedAt = deletedModules.get(item.moduleId);
        if (!mergedTombstones.some((t) => t.collection === collection && t.id === item.id)) {
          mergedTombstones.push({ collection, id: item.id, deletedAt });
        }
        return false;
      });
    }
  }

  // A deleted topic only clears references; notes and homework survive.
  const deletedTopics = new Map(
    mergedTombstones
      .filter((t) => t.collection === 'topics')
      .map((t) => [t.id, t.deletedAt]),
  );
  if (deletedTopics.size) {
    for (const note of merged.notes || []) {
      if (note.topicId && deletedTopics.has(note.topicId)) {
        const deletedAt = deletedTopics.get(note.topicId) || 0;
        note.topicId = null;
        note.updatedAt = Math.max(itemTimestamp(note), deletedAt);
      }
    }
    for (const hw of merged.homework || []) {
      if (hw.topicId && deletedTopics.has(hw.topicId)) {
        const deletedAt = deletedTopics.get(hw.topicId) || 0;
        hw.topicId = null;
        hw.updatedAt = Math.max(itemTimestamp(hw), deletedAt);
      }
    }
    for (const exam of merged.exams || []) {
      if (Array.isArray(exam.topicIds) && exam.topicIds.some((id) => deletedTopics.has(id))) {
        exam.topicIds = exam.topicIds.filter((id) => !deletedTopics.has(id));
        exam.updatedAt = Math.max(itemTimestamp(exam), ...deletedTopics.values());
      }
    }
  }

  const localSettings = localState.settings || {};
  const cloudSettings = cloudState.settings || {};
  const settings =
    itemTimestamp(localSettings) >= itemTimestamp(cloudSettings) ? localSettings : cloudSettings;

  const mergedState = {
    ...merged,
    schemaVersion: localState.schemaVersion,
    checklist: localState.checklist || { date: null, checked: {} },
    settings,
    tombstones: mergedTombstones,
  };

  return { mergedState, erasureCount, needsBackupPrompt: erasureCount > 10 };
}

export async function syncState(client, localState) {
  const uid = await getSessionUserId(client);
  const binding = checkAccountBinding(uid, localState);
  if (binding.status === 'mismatch') {
    const err = new Error('Dieses Gerät gehört zu einem anderen Konto.');
    err.code = 'ACCOUNT_MISMATCH';
    err.binding = binding;
    throw err;
  }

  const cloudTables = await fetchCloudDataset(client);
  const cloudState = fromCloudDataset(cloudTables);
  const result = mergeStates(localState, cloudState);
  return { ...result, uid, cloudState };
}

export async function uploadMergedData(client, mergedState) {
  const uid = await getSessionUserId(client);
  const dataset = toCloudDataset(mergedState);
  const ledger = [];

  for (const collection of UPLOAD_ORDER) {
    const table = TABLE_FOR_COLLECTION[collection];
    const rows = dataset[table] || [];
    if (rows.length === 0) {
      ledger.push({ table, written: 0, skipped: true });
      continue;
    }
    const res = await upsertUserRows(client, table, rows);
    ledger.push({ table, written: res.written, skipped: false });
  }

  const verifyTables = await fetchCloudDataset(client);
  const mismatches = [];
  for (const collection of UPLOAD_ORDER) {
    const table = TABLE_FOR_COLLECTION[collection];
    const sentRows = dataset[table] || [];
    if (sentRows.length === 0) continue;
    const backRows = verifyTables[table] || [];
    if (collection === 'settings') {
      const expected = fromRow('settings', sentRows[0]);
      const actual = backRows[0] ? fromRow('settings', backRows[0]) : null;
      if (!actual || !recordsEqual(actual, expected)) {
        mismatches.push({ table, reason: actual ? 'value-mismatch' : 'missing' });
      }
      continue;
    }
    const byId = new Map(backRows.map((row) => [row?.id, row]));
    for (const sent of sentRows) {
      const back = byId.get(sent.id);
      if (!back) {
        mismatches.push({ table, id: sent.id, reason: 'missing' });
        continue;
      }
      const expected = fromRow(collection, sent);
      const actual = fromRow(collection, back);
      if (!recordsEqual(actual, expected)) {
        mismatches.push({ table, id: sent.id, reason: 'value-mismatch' });
      }
    }
  }

  if (mismatches.length) {
    const first = mismatches[0];
    const err = new Error(
      `Verifikation fehlgeschlagen (${mismatches.length} Datensätze, z. B. ${first.table}/${first.id || 'settings'}).`,
    );
    err.code = 'VERIFY_FAILED';
    err.ledger = ledger;
    err.mismatches = mismatches;
    throw err;
  }

  setLastSyncedUid(uid);
  return { uid, ledger };
}

/** Fetch + merge without uploading; used by "Cloud laden". */
export async function downloadCloudData(client, localState) {
  const result = await syncState(client, localState);
  return result;
}

/** Push local state (merged first, so nothing is lost) and return the merged state. */
export async function uploadLocalData(client, localState) {
  const result = await syncState(client, localState);
  await uploadMergedData(client, result.mergedState);
  return result;
}
