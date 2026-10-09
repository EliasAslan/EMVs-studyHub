/**
 * Storage Abstraction Layer
 * Separates data access from storage implementation.
 * Current backend: localStorage.
 * Designed so a future Supabase adapter can be dropped in
 * without changing store logic.
 */

/**
 * LocalStorage adapter.
 * Serializes/deserializes via JSON so callers pass/receive objects.
 */
export const localStorageAdapter = {
  getItem(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (e) {
      console.error(`Storage getItem("${key}") failed:`, e);
      return null;
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