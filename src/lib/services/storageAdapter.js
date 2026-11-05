/**
 * Storage abstraction. The contract is unchanged from the vanilla app:
 * - getItem returns null only when the key is missing
 * - read/parse failures throw StorageError
 * - writes return false instead of throwing
 */

export class StorageError extends Error {
  constructor(key, code, cause) {
    super(`Storage read("${key}") failed (${code})`);
    this.name = 'StorageError';
    this.key = key;
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export const localStorageAdapter = {
  getItem(key) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      throw new StorageError(key, 'READ_FAILED', e);
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
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
  },
};

export let activeAdapter = localStorageAdapter;

export function setAdapter(adapter) {
  activeAdapter = adapter;
}
