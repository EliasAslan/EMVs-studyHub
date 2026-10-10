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
  fromRow,
  isEmptyDataset,
  countDataset,
} from './cloudMap.js';

export const CLOUD_UID_KEY = 'emvs_cloud_uid_v1';
export const EXPECTED_TABLES = Object.freeze(Object.values(TABLE_FOR_COLLECTION));

/**
 * Structural equality for upload verification read-back.
 * PostgreSQL JSONB does not preserve object key order (it normalizes it),
 * so a semantically identical nested object (e.g. review_history entries
 * like { timestamp, outcome } or review_schedule) can read back with a
 * different key order than it was sent with. The previous
 * JSON.stringify(a) === JSON.stringify(b) check is order-sensitive and
 * therefore reports false VERIFY_FAILED mismatches.
 * recordsEqual() ignores object key order, preserves array order, and
 * distinguishes genuinely different values (strict primitive equality,
 * different key sets, different array lengths/order all compare unequal).
 * Plain JSON values only (no Date/Map/Set handling needed: fromRow()
 * output is JSON-compatible).
 */
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
  for (const k of keysA) {
    if (!Object.hasOwn(b, k)) return false;
  }
  for (const k of keysA) {
    if (!recordsEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Verification-only timestamp canonicalization (TIMESTAMPTZ text format).
 *
 * The app sends timestamps as Date.toISOString() ("...T22:13:20.000Z"), but
 * PostgreSQL timestamptz_out + PostgREST read the same instant back as
 * "...T22:13:20+00:00" (offset form, fractional seconds dropped when zero).
 * fromRow() passes these strings through verbatim, so even recordsEqual()
 * would flag them — correctly as strings, but wrongly as data: both denote
 * the identical instant. normalizeVerifyTimestamps() rewrites the known
 * TIMESTAMPTZ-backed fields to canonical toISOString() form on BOTH compared
 * sides before recordsEqual() runs.
 *
 * Narrowly scoped: verification path only (uploadLocalData read-back), only
 * the two timestamptz-backed fields (studySessions.startTime,
 * captures.timestamp — the schema's only TIMESTAMPTZ columns). DATE columns
 * (exams/exam_results/plan_items) round-trip textually identical and are
 * deliberately untouched. Unparseable values are left as-is and still compare
 * strictly, so genuine corruption is never masked. Inputs are never mutated.
 */
const VERIFY_TIMESTAMP_FIELDS = Object.freeze({
  studySessions: Object.freeze(['startTime']),
  captures: Object.freeze(['timestamp']),
});

export function normalizeVerifyTimestamps(collection, record) {
  const fields = VERIFY_TIMESTAMP_FIELDS[collection];
  if (!fields || !record || typeof record !== 'object' || Array.isArray(record)) return record;
  const out = { ...record };
  for (const f of fields) {
    const v = out[f];
    if (typeof v !== 'string' || v === '') continue;
    const t = Date.parse(v);
    if (Number.isFinite(t)) out[f] = new Date(t).toISOString();
  }
  return out;
}

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

  // Verified read-back before anything local may change: every uploaded
  // record's normalized field values (not just its id) must match the
  // cloud, settings included. Both sides run through fromRow() so
  // intentional mappings compare equal (exam_results.updatedAt derived
  // from created_at, mock score TEXT<->number, ''<->NULL nullables).
  // A mismatch or failed read prevents completion and never touches the
  // account-sync ledger. No cloud deletes, no ownership changes.
  const verifyTables = await fetchCloudDataset(client);
  const mismatches = [];
  for (const collection of UPLOAD_ORDER) {
    const table = TABLE_FOR_COLLECTION[collection];
    const sentRows = dataset[table] || [];
    if (sentRows.length === 0) continue;
    const backRows = verifyTables[table] || [];
    if (collection === 'settings') {
      const expected = normalizeVerifyTimestamps(collection, fromRow('settings', sentRows[0]));
      const actualRow = backRows[0];
      const actual = actualRow ? normalizeVerifyTimestamps(collection, fromRow('settings', actualRow)) : null;
      if (!actualRow || !recordsEqual(actual, expected)) {
        mismatches.push({ table, reason: actualRow ? 'value-mismatch' : 'missing' });
      }
      continue;
    }
    const byId = new Map(backRows.map((r) => [r?.id, r]));
    for (const sent of sentRows) {
      const back = byId.get(sent.id);
      if (!back) {
        mismatches.push({ table, id: sent.id, reason: 'missing' });
        continue;
      }
      const expected = normalizeVerifyTimestamps(collection, fromRow(collection, sent));
      const actual = normalizeVerifyTimestamps(collection, fromRow(collection, back));
      if (!recordsEqual(actual, expected)) {
        mismatches.push({ table, id: sent.id, reason: 'value-mismatch' });
      }
    }
  }
  if (mismatches.length > 0) {
    const first = mismatches[0];
    const err = new Error(`Verifikation fehlgeschlagen (${mismatches.length} Datensätze weichen ab, z.B. ${first.table}/${first.id || 'settings'}). Lokale Daten bleiben unverändert.`);
    err.code = 'VERIFY_FAILED';
    err.ledger = ledger;
    err.mismatches = mismatches;
    throw err;
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
 * Commit an already fetched and explicitly confirmed cloud dataset to the
 * local in-memory state with persistence verification.
 *
 * The caller must have offered a JSON backup and received explicit user
 * confirmation before invoking this. On success the cloud state becomes
 * active. When local persistence fails (save() false/throws), the previous
 * in-memory state is restored so the app never ends up with replaced
 * state while claiming local data is unchanged.
 *
 * The storage safety latch is cleared only here at the confirmed commit
 * point (explicit consent, mirroring backup import) — never earlier.
 *
 * deps: { getState, setState, save, clearStorageError?, renderSidebar?, navigate? }
 */
export function commitDownloadReplacement(deps, cloudState) {
  if (!deps?.getState || !deps?.setState || !deps?.save) {
    throw new TypeError('commitDownloadReplacement needs getState/setState/save.');
  }
  const previous = deps.getState();
  deps.clearStorageError?.();
  deps.setState(cloudState);
  let saved = false;
  try {
    saved = deps.save();
  } catch {
    saved = false;
  }
  if (!saved) {
    deps.setState(previous);
    deps.renderSidebar?.();
    const err = new Error('Lokales Speichern nach Download fehlgeschlagen. Vorheriger Stand wurde wiederhergestellt; lokale Daten unverändert.');
    err.code = 'PERSIST_FAILED';
    throw err;
  }
  deps.renderSidebar?.();
  deps.navigate?.('today');
  return { replaced: true };
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
