/**
 * Storage reliability tests (Phase 2.1).
 *
 * Dependency-free: plain Node assertions, no framework.
 * Run:  node tests/storage.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 *
 * Covers:
 *  - failed adapter writes propagate as `false` (never reported successful)
 *  - missing keys still follow the first-run path
 *  - invalid JSON / read failures yield safe blank data, never demo data,
 *    and never overwrite the stored value
 *  - pre-existing valid localStorage payloads remain compatible
 */

import * as store from '../js/services/store.js';
import {
  localStorageAdapter,
  setAdapter,
  StorageError,
} from '../js/services/storageAdapter.js';
import { STORAGE_KEY, TIMER_KEY } from '../js/services/store.js';

// ---------------------------------------------------------------------------
// Minimal runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || 'values differ'}\n  got:  ${a}\n  want: ${b}`);
}

// Mute expected error logging from the code under test; assertions carry
// the signal, not log output.
const origConsoleError = console.error;
console.error = () => {};

// ---------------------------------------------------------------------------
// Fake localStorage (string-backed, like the real one)
// ---------------------------------------------------------------------------

function makeFake(initialEntries = [], hooks = {}) {
  const map = new Map(initialEntries);
  const fake = {
    _map: map,
    getItem(key) {
      if (hooks.failGet) throw new Error(`denied read of ${key}`);
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (hooks.failSet) {
        const err = new Error('quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(key, String(value));
    },
    removeItem(key) {
      if (hooks.failRemove) throw new Error(`denied remove of ${key}`);
      map.delete(key);
    },
  };
  globalThis.localStorage = fake;
  setAdapter(localStorageAdapter);
  store.clearStorageError();
  return fake;
}

function restoreRealisticEnv() {
  makeFake();
}

// ---------------------------------------------------------------------------
// 1. Adapter contract
// ---------------------------------------------------------------------------

test('adapter: missing key reads as null (not an error)', () => {
  makeFake();
  assert(localStorageAdapter.getItem('nope') === null, 'expected null');
});

test('adapter: successful round-trip', () => {
  makeFake();
  assert(localStorageAdapter.setItem('k', { a: 1 }) === true, 'setItem true');
  assertEqual(localStorageAdapter.getItem('k'), { a: 1 }, 'round-trip');
});

test('adapter: quota failure reports false and does not throw', () => {
  makeFake([], { failSet: true });
  assert(localStorageAdapter.setItem('k', { a: 1 }) === false, 'setItem false');
});

test('adapter: access failure throws StorageError READ_FAILED', () => {
  makeFake([], { failGet: true });
  let err = null;
  try {
    localStorageAdapter.getItem('k');
  } catch (e) {
    err = e;
  }
  assert(err instanceof StorageError, 'expected StorageError');
  assert(err.code === 'READ_FAILED', `expected READ_FAILED, got ${err && err.code}`);
});

test('adapter: invalid JSON throws StorageError PARSE_FAILED', () => {
  const fake = makeFake();
  fake._map.set('k', '{invalid json');
  let err = null;
  try {
    localStorageAdapter.getItem('k');
  } catch (e) {
    err = e;
  }
  assert(err instanceof StorageError, 'expected StorageError');
  assert(err.code === 'PARSE_FAILED', `expected PARSE_FAILED, got ${err && err.code}`);
});

test('adapter: removeItem reports failure without throwing', () => {
  makeFake([], { failRemove: true });
  assert(localStorageAdapter.removeItem('k') === false, 'removeItem false');
});

// ---------------------------------------------------------------------------
// 2. Write failure propagation through store.js
// ---------------------------------------------------------------------------

test('save() returns true on success', () => {
  makeFake();
  assert(store.save(store.getSeedData()) === true, 'expected true');
});

test('save() returns false (not true, no throw) when the write fails', () => {
  makeFake([], { failSet: true });
  assert(store.save(store.getSeedData()) === false, 'expected false');
});

test('save() propagates failure from a custom adapter too', () => {
  makeFake();
  setAdapter({
    getItem: () => null,
    setItem: () => false,
    removeItem: () => true,
  });
  try {
    assert(store.save(store.getSeedData()) === false, 'expected false');
  } finally {
    setAdapter(localStorageAdapter);
  }
});

test('saveTimerState() round-trips on success', () => {
  makeFake();
  const timer = { moduleId: 'm1', plannedMinutes: 25, startTime: 1, pausedTime: 0, running: true };
  assert(store.saveTimerState(timer) === true, 'expected true');
  assertEqual(store.loadTimerState(), timer, 'timer round-trip');
});

test('saveTimerState() returns false when the write fails', () => {
  makeFake([], { failSet: true });
  assert(store.saveTimerState({ running: true }) === false, 'expected false');
});

test('loadTimerState() returns null on corrupt data without throwing or writing', () => {
  const fake = makeFake();
  fake._map.set(TIMER_KEY, '###corrupt###');
  const result = store.loadTimerState();
  assert(result === null, 'expected null');
  assert(fake._map.get(TIMER_KEY) === '###corrupt###', 'stored timer untouched');
});

// ---------------------------------------------------------------------------
// 3. Missing vs corrupt vs inaccessible data in load()
// ---------------------------------------------------------------------------

test('load(): missing key follows first-run path and writes nothing', () => {
  const fake = makeFake();
  const data = store.load();
  assert(Array.isArray(data.modules) && data.modules.length >= 1, 'demo seed expected');
  assert(data.settings && typeof data.settings === 'object', 'settings expected');
  assert(store.getStorageError() === null, 'no storage error expected');
  assert(fake._map.size === 0, 'load must not write to storage');
});

test('load(): valid stored data round-trips and stays compatible', () => {
  const fake = makeFake();
  // Payload shaped like a real pre-existing browser save (incl. history).
  const payload = store.getSeedData();
  payload.modules.push({
    id: 'mod-1', code: 'DB1', title: 'Datenbanken', accent: '#b45309',
    targetGrade: 5.0, createdAt: 1, updatedAt: 2,
  });
  payload.learningObjectives.push({
    id: 'obj-1', moduleId: 'mod-1', number: 1, title: 'Normalformen',
    description: '', status: 'in-progress', confidence: 3, notes: '',
    confidenceHistory: [{ value: 3, timestamp: 3 }],
    lastTouched: 3, lastReviewed: null, totalStudyTime: 25,
    reviewHistory: [], reviewSchedule: null, sessionHistory: [],
    createdAt: 1, updatedAt: 3,
  });
  payload.settings.currentModuleId = 'mod-1';
  assert(store.save(payload) === true, 'save expected true');
  const loaded = store.load();
  assertEqual(loaded.modules, payload.modules, 'modules preserved');
  assertEqual(loaded.learningObjectives, payload.learningObjectives, 'objectives preserved');
  assert(loaded.settings.currentModuleId === 'mod-1', 'settings preserved');
  assert(store.getStorageError() === null, 'no storage error expected');
  assert(fake._map.has(STORAGE_KEY), 'stored value retained');
});

test('load(): invalid JSON yields blank seed, keeps stored value, records error', () => {
  const fake = makeFake();
  const corrupt = '{invalid json,,,';
  fake._map.set(STORAGE_KEY, corrupt);
  const data = store.load();
  assert(Array.isArray(data.modules) && data.modules.length === 0, 'blank seed, not demo');
  assert(data.schemaVersion === 1, 'seed schema version');
  assert(fake._map.get(STORAGE_KEY) === corrupt, 'original stored value must survive');
  const err = store.getStorageError();
  assert(err instanceof StorageError, 'storage error recorded');
  assert(err.code === 'PARSE_FAILED', `expected PARSE_FAILED, got ${err && err.code}`);
});

test('load(): read failure yields blank seed, keeps storage, records error', () => {
  const fake = makeFake([[STORAGE_KEY, '{"modules":[]}']], { failGet: true });
  const data = store.load();
  assert(Array.isArray(data.modules) && data.modules.length === 0, 'blank seed, not demo');
  assert(fake._map.get(STORAGE_KEY) === '{"modules":[]}', 'storage untouched');
  const err = store.getStorageError();
  assert(err instanceof StorageError, 'storage error recorded');
  assert(err.code === 'READ_FAILED', `expected READ_FAILED, got ${err && err.code}`);
});

test('load(): error state clears after a later successful load', () => {
  const fake = makeFake();
  fake._map.set(STORAGE_KEY, 'broken{');
  store.load();
  assert(store.getStorageError() instanceof StorageError, 'error recorded');
  fake._map.set(STORAGE_KEY, JSON.stringify(store.getSeedData()));
  const data = store.load();
  assert(data.schemaVersion === 1, 'valid load works');
  assert(store.getStorageError() === null, 'error cleared after success');
});

test('load()/save() survive a missing localStorage implementation', () => {
  const real = globalThis.localStorage;
  globalThis.localStorage = undefined;
  try {
    const data = store.load();
    assert(Array.isArray(data.modules) && data.modules.length === 0, 'safe blank data');
    assert(store.getStorageError() instanceof StorageError, 'error recorded');
    assert(store.save(store.getSeedData()) === false, 'save reports false');
  } finally {
    globalThis.localStorage = real;
    setAdapter(localStorageAdapter);
    store.clearStorageError();
  }
});

// ---------------------------------------------------------------------------
// 4. Failed load latches saves off (Phase 2.2 regression coverage)
// ---------------------------------------------------------------------------

test('failed load blocks ordinary save: original value survives', () => {
  const fake = makeFake();
  // 1. Existing data is stored and loads fine.
  const original = store.getSeedData();
  original.modules.push({
    id: 'mod-keep', code: 'K1', title: 'Keep me', accent: '#b45309',
    targetGrade: 5.0, createdAt: 1, updatedAt: 1,
  });
  assert(store.save(original) === true, 'setup save works');
  const storedRaw = fake._map.get(STORAGE_KEY);
  // 2. Loading now fails (stored JSON became invalid).
  fake._map.set(STORAGE_KEY, storedRaw.slice(0, 10) + '~~~broken');
  const data = store.load();
  assert(data.modules.length === 0, 'safe blank data, not demo, not original');
  assert(store.getStorageError() instanceof StorageError, 'error recorded');
  // 3. A normal save through the store API must fail without writing.
  const attempt = store.getSeedData();
  attempt.modules.push({
    id: 'mod-new', code: 'N1', title: 'New', accent: '#b45309',
    targetGrade: 5.0, createdAt: 2, updatedAt: 2,
  });
  assert(store.save(attempt) === false, 'save refused while load failed');
  assert(store.saveTimerState({ running: true }) === false, 'timer save refused too');
  // 4. The original stored value is untouched.
  assert(fake._map.get(STORAGE_KEY) === storedRaw.slice(0, 10) + '~~~broken', 'stored value preserved');
});

test('failed read (not just corrupt JSON) also blocks saves', () => {
  const fake = makeFake([[STORAGE_KEY, JSON.stringify(store.getSeedData())]], { failGet: true });
  const data = store.load();
  assert(data.modules.length === 0, 'safe blank data');
  assert(store.save(store.getSeedData()) === false, 'save refused');
  assert(fake._map.get(STORAGE_KEY) === JSON.stringify(store.getSeedData()), 'storage untouched');
});

test('saves work again after a successful load, a first run, or a reset', () => {
  // After successful load.
  let fake = makeFake();
  assert(store.save(store.getSeedData()) === true, 'setup save works');
  store.load();
  assert(store.save(store.getSeedData()) === true, 'save works after successful load');
  // Legitimate first run (missing key): saves work, enabling normal setup.
  fake = makeFake();
  const first = store.load();
  assert(first.modules.length >= 1, 'first-run data');
  assert(store.save(first) === true, 'save works after first-run init');
  // Explicit reset after a failure unblocks saving.
  fake = makeFake();
  fake._map.set(STORAGE_KEY, 'broken{');
  store.load();
  assert(store.save(store.getSeedData()) === false, 'blocked while failed');
  store.clearAll();
  assert(store.save(store.getSeedData()) === true, 'reset unblocks saving');
});

// ---------------------------------------------------------------------------
// 5. Recovery contract for the storage-error banner (Phase 2.2.1)
// The banner is dismissed only when a recovery save returns true, i.e.
// exactly when these store-level sequences report success.
// ---------------------------------------------------------------------------

test('import-like recovery sequence re-enables saving', () => {
  const fake = makeFake();
  fake._map.set(STORAGE_KEY, 'broken{');
  store.load();
  assert(store.save(store.getSeedData()) === false, 'blocked while failed');
  // Mirrors importBackup: validated backup + explicit consent, then save.
  const parsed = store.importData(JSON.stringify(store.getSeedData()));
  assert(parsed.success === true, 'backup parses');
  store.clearStorageError();
  assert(store.save(parsed.data) === true, 'recovery save succeeds');
  assert(fake._map.has(STORAGE_KEY), 'recovered data persisted');
});

test('failed import changes nothing: latch and warning stay', () => {
  const fake = makeFake();
  fake._map.set(STORAGE_KEY, 'broken{');
  store.load();
  assert(store.getStorageError() instanceof StorageError, 'error recorded');
  // importData rejects garbage without touching storage or the latch.
  const parsed = store.importData('not json at all{{{');
  assert(parsed.success === false, 'import fails');
  assert(store.getStorageError() instanceof StorageError, 'latch intact');
  assert(store.save(store.getSeedData()) === false, 'save still refused');
  assert(fake._map.get(STORAGE_KEY) === 'broken{', 'stored value preserved');
});

restoreRealisticEnv();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.error = origConsoleError;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
