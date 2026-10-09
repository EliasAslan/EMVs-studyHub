/**
 * Storage Abstraction Layer
 * Separates data access from storage implementation.
 * Current backend: localStorage.
 * Designed so a future Supabase adapter can be dropped in
 * without changing store logic.
 */

/**
 * Error thrown when a storage read fails.
 * A missing key is NOT an error — getItem() returns null for those.
 * Throwing (instead of returning null) keeps corrupted or inaccessible
 * data distinguishable from a genuine first run.
 */
export class StorageError extends Error {
  /**
   * @param {string} key - Storage key that failed.
   * @param {string} code - 'READ_FAILED' (backend access failed) or
   *   'PARSE_FAILED' (stored value is not valid JSON).
   * @param {Error} [cause] - Underlying error.
   */
  constructor(key, code, cause) {
    super(`Storage read("${key}") failed (${code})`);
    this.name = 'StorageError';
    this.key = key;
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * LocalStorage adapter.
 * Serializes/deserializes via JSON so callers pass/receive objects.
 *
 * Contract:
 * - getItem() returns null ONLY when the key is genuinely missing
 *   (or holds JSON null). Read/access failures and invalid JSON throw
 *   StorageError so callers never mistake them for "no data".
 * - setItem()/removeItem() return booleans and never throw, so quota
 *   errors and access failures surface as `false`, never as crashes.
 */
export const localStorageAdapter = {
  getItem(key) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      console.error(`Storage getItem("${key}") failed:`, e);
      throw new StorageError(key, 'READ_FAILED', e);
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Storage getItem("${key}") found invalid JSON:`, e);
      throw new StorageError(key, 'PARSE_FAILED', e);
    }
  },

  setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Storage setItem("${key}") failed:`, e);
      return false;
    }
  },

  removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error(`Storage removeItem("${key}") failed:`, e);
      return false;
    }
  }
};

/**
 * Raw-string reader for migration from legacy keys.
 * Returns the unparsed string so legacy parsing stays intact.
 * Best-effort by design: legacy keys are optional, so access failures
 * yield null (treated as "no legacy data") instead of throwing.
 */
export function readLegacyStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.error(`Legacy storage read("${key}") failed:`, e);
    return null;
  }
}

/**
 * Default adapter used by the application.
 * Can be reassigned to switch backends (e.g., Supabase).
 */
export let activeAdapter = localStorageAdapter;

export function setAdapter(adapter) {
  activeAdapter = adapter;
}
