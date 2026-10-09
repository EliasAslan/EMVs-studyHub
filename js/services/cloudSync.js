/**
 * Explicit, safe Supabase data sync (Phase 5.3).
 *
 * Rules (from task + PHASE_3_FINAL_PLAN.md §§4-5):
 * - localStorage stays the default datastore; this module never touches it
 *   directly except for the separate account-association key.
 * - No automatic sync: only uploadLocalData() / downloadCloudData() / fetch
 *   helpers below, all called from explicit UI actions.
 * - user_id comes exclusively from the authenticated session; imported or
 *   locally stored user_id values are never trusted (supabaseData.js already
 *   overwrites them; mapping additionally strips them).
 * - Upload order is parent-first; no cloud deletes ever; local state is never
 *   mutated here (callers decide after success).
 */

import { listUserRows, upsertUserRows } from './supabaseData.js';
import {
  UPLOAD_ORDER,
  TABLE_FOR_COLLECTION,
  toCloudDataset,
  fromCloudDataset,
  isEmptyDataset,
  countDataset,
} from './cloudMap.js';

export const CLOUD_UID_KEY = 'emvs_cloud_uid_v1';
export const EXPECTED_TABLES = Object.freeze(Object.values(TABLE_FOR_COLLECTION));

function readUidKey() {
  try {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) return null;
    return globalThis.localStorage.getItem(CLOUD_UID_KEY);
  } catch {
    return null;
  }
}

function writeUidKey(uid) {
  try {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) return false;
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

/**
 * Account association check, separate from the dataset.
 * - first: no association recorded yet (safe to proceed with confirmations).
 * - ok: signed-in user matches the recorded association.
 * - mismatch: a different account is signed in while local data exists.
 *   Cloud WRITES are blocked until the user explicitly resolves it.
 */
export function checkAccountBinding(currentUid, localState) {
  const lastUid = getLastSyncedUid();
  if (!lastUid) return { status: 'first', lastUid: null, currentUid };
  if (lastUid === currentUid) return { status: 'ok', lastUid, currentUid };
  const localEmpty = isEmptyDataset(localState);
  return {
    status: localEmpty ? 'switch-empty' : 'mismatch',
    lastUid,
    currentUid,
  };
}

export function describeConflict(localState, cloudState) {
  const localEmpty = isEmptyDataset(localState);
  const cloudEmpty = isEmptyDataset(cloudState);
  return {
    localEmpty,
    cloudEmpty,
    bothNonEmpty: !localEmpty && !cloudEmpty,
    localCounts: countDataset(localState),
    cloudCounts: countDataset(cloudState),
  };
}

/** Fetch every allowlisted table; throws on the first failure (no partial use). */
export async function fetchCloudDataset(client) {
  const tables = {};
  for (const table of EXPECTED_TABLES) {
    tables[table] = await listUserRows(client, table);
  }
  validateCloudDatasetShape(tables);
  return tables;
}

export function validateCloudDatasetShape(tables) {
  if (!tables || typeof tables !== 'object') throw new Error('Cloud-Daten sind ungültig (kein Datensatz).');
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

/**
 * Upload local data to the signed-in user's cloud tables.
 * Never mutates localState; never deletes cloud rows.
 * Options: { forceEmptyUpload?: boolean } — without the flag, an empty local
 * dataset never touches the cloud when the cloud is non-empty.
 */
export async function uploadLocalData(client, localState, opts = {}) {
  const uid = await getSessionUserId(client);
  const binding = checkAccountBinding(uid, localState);
  if (binding.status === 'mismatch') {
    const err = new Error(
      'Dieses Gerät hält lokale Daten einer anderen Anmeldung. ' +
      'Bitte zuerst die Kontenfrage klären (Backup anbieten), dann erneut versuchen.',
    );
    err.code = 'ACCOUNT_MISMATCH';
    err.binding = binding;
    throw err;
  }

  const cloudTables = await fetchCloudDataset(client);
  const cloudState = fromCloudDataset(cloudTables);
  const conflict = describeConflict(localState, cloudState);

  if (conflict.localEmpty && !conflict.cloudEmpty && !opts.forceEmptyUpload) {
    const err = new Error('Lokale Daten sind leer — Cloud-Daten werden nicht überschrieben. Leerer Upload blockiert.');
    err.code = 'EMPTY_LOCAL_OVERWRITE_BLOCKED';
    err.conflict = conflict;
    throw err;
  }

  const dataset = toCloudDataset(localState);
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

  // Verified read-back before anything local may change.
  const verifyTables = await fetchCloudDataset(client);
  const verifyState = fromCloudDataset(verifyTables);
  for (const collection of UPLOAD_ORDER.filter((c) => c !== 'settings')) {
    const localIds = new Set((localState?.[collection] || []).map((x) => x.id));
    const cloudIds = new Set((verifyState?.[collection] || []).map((x) => x.id));
    for (const id of localIds) {
      if (!cloudIds.has(id)) {
        const err = new Error(`Verifikation fehlgeschlagen: ${collection}/${id} fehlt in der Cloud. Lokale Daten bleiben unverändert.`);
        err.code = 'VERIFY_FAILED';
        err.ledger = ledger;
        throw err;
      }
    }
  }

  setLastSyncedUid(uid);
  return { uid, ledger, conflict };
}

/**
 * Download the complete cloud dataset and convert it to app shape.
 * Pure fetch + validate + convert: never touches local state or storage.
 * Throws on any request failure or incomplete result.
 */
export async function downloadCloudData(client) {
  await getSessionUserId(client);
  const tables = await fetchCloudDataset(client);
  const state = fromCloudDataset(tables);
  const conflict = { cloudCounts: countDataset(state) };
  return { state, tables, conflict };
}

/**
 * Decide whether replacing local state with cloudState needs an explicit
 * user decision. Returns { needsDecision, reason }.
 */
export function downloadReplacementCheck(localState, cloudState) {
  const c = describeConflict(localState, cloudState);
  if (c.cloudEmpty && !c.localEmpty) {
    return { needsDecision: true, reason: 'cloud-empty', conflict: c };
  }
  if (c.bothNonEmpty) {
    return { needsDecision: true, reason: 'both-nonempty', conflict: c };
  }
  return { needsDecision: false, reason: 'safe', conflict: c };
}
