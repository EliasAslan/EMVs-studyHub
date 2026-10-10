import assert from 'node:assert/strict';
import {
  SYNC_STATUS_KEY,
  getSyncStatus,
  recordSyncSuccess,
  recordSyncFailure,
  describeSyncStatus,
  translateSyncError,
  sanitizeTechnical,
} from '../js/services/syncStatus.js';

// Fake localStorage (string-backed, like the real one).
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};

let passed = 0;
async function test(name, fn) {
  globalThis.localStorage._m.clear();
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

await test('fresh status reports never synced', async () => {
  assert.deepEqual(getSyncStatus(), {
    lastUploadAt: null,
    lastDownloadAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
  });
  assert.deepEqual(describeSyncStatus(getSyncStatus()), ['Noch nie synchronisiert.']);
});

await test('successful upload records time and shows upload line', async () => {
  const before = Date.now();
  recordSyncSuccess('upload');
  const s = getSyncStatus();
  assert.ok(typeof s.lastUploadAt === 'number' && s.lastUploadAt >= before);
  assert.equal(s.lastDownloadAt, null);
  const lines = describeSyncStatus(s).join('\n');
  assert.match(lines, /Letzter Upload:/);
  assert.match(lines, /Noch nie heruntergeladen/);
});

await test('successful download records time and shows download line', async () => {
  recordSyncSuccess('download');
  const s = getSyncStatus();
  assert.ok(typeof s.lastDownloadAt === 'number');
  assert.match(describeSyncStatus(s).join('\n'), /Letzter Download:/);
});

await test('failure never fabricates a success timestamp', async () => {
  recordSyncFailure('VERIFY_FAILED');
  const s = getSyncStatus();
  assert.equal(s.lastUploadAt, null);
  assert.equal(s.lastDownloadAt, null);
  assert.equal(s.lastErrorCode, 'VERIFY_FAILED');
  assert.match(describeSyncStatus(s).join('\n'), /fehlgeschlagen \(VERIFY_FAILED\)/);
});

await test('failure older than a later success is not shown as current', async () => {
  recordSyncFailure('VERIFY_FAILED');
  const errAt = getSyncStatus().lastErrorAt;
  assert.ok(errAt);
  // Success afterwards must outweigh the earlier failure.
  recordSyncSuccess('upload');
  const lines = describeSyncStatus(getSyncStatus()).join('\n');
  assert.doesNotMatch(lines, /fehlgeschlagen/);
  assert.match(lines, /Letzter Upload:/);
});

await test('invalid direction is rejected', async () => {
  assert.throws(() => recordSyncSuccess('sync'), /direction/);
  assert.equal(getSyncStatus().lastUploadAt, null);
});

await test('corrupt status JSON degrades to never-synced without throwing', async () => {
  globalThis.localStorage._m.set(SYNC_STATUS_KEY, '{broken json');
  assert.deepEqual(describeSyncStatus(getSyncStatus()), ['Noch nie synchronisiert.']);
  // Recording still works after corruption.
  recordSyncSuccess('download');
  assert.ok(typeof getSyncStatus().lastDownloadAt === 'number');
});

await test('status uses its own key and never touches the dataset', async () => {
  globalThis.localStorage._m.set('emvs_data_v1', '{"modules":["keep"]}');
  recordSyncSuccess('upload');
  recordSyncFailure('UNKNOWN');
  assert.equal(globalThis.localStorage._m.get('emvs_data_v1'), '{"modules":["keep"]}');
});

await test('known error codes translate to German with next actions', async () => {
  const cases = [
    ['ACCOUNT_MISMATCH', /anderes konto/i, /backup/i],
    ['EMPTY_LOCAL_OVERWRITE_BLOCKED', /leer/i, /unverändert|herunterladen/i],
    ['VERIFY_FAILED', /prüfung/i, /erneut/i],
    ['PERSIST_FAILED', /speichern/i, /wiederhergestellt/i],
  ];
  for (const [code, titleRe, actionRe] of cases) {
    const t = translateSyncError(Object.assign(new Error('technical detail ' + code), { code }));
    assert.equal(t.code, code);
    assert.match(t.title, titleRe, `${code}: German title`);
    assert.match(t.action, actionRe, `${code}: next action`);
    assert.match(t.technical, new RegExp('technical detail ' + code), `${code}: detail preserved`);
  }
});

await test('sign-in, network, and RLS errors translate to German', async () => {
  assert.match(
    translateSyncError(new Error('Bitte melde dich zuerst bei Supabase an.')).title,
    /nicht angemeldet/i,
  );
  const net = translateSyncError(new TypeError('Failed to fetch'));
  assert.match(net.title, /keine verbindung/i);
  assert.match(net.action, /internetverbindung/i);
  const rls = translateSyncError(new Error('permission denied for table modules'));
  assert.match(rls.title, /abgelehnt/i);
  const unknown = translateSyncError(new Error('something completely new'));
  assert.match(unknown.title, /fehlgeschlagen/i);
  assert.match(unknown.technical, /something completely new/);
});

await test('error without code or message stays debuggable', async () => {
  const t = translateSyncError(undefined);
  assert.equal(t.code, 'UNKNOWN');
  assert.ok(t.title.length > 0 && t.action.length > 0);
  assert.equal(t.technical, 'Keine Details verfügbar.');
  assert.equal(translateSyncError(null).technical, 'Keine Details verfügbar.');
  assert.equal(translateSyncError(new Error('')).technical, 'Keine Details verfügbar.');
  assert.equal(translateSyncError('nur ein String').technical, 'nur ein String');
});

await test('secrets are sanitized from technical details', async () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const t = translateSyncError(new Error(`denied ${jwt} key sb_publishable_abc123XYZ`));
  assert.doesNotMatch(t.technical, /eyJhbGci/);
  assert.doesNotMatch(t.technical, /sb_publishable_abc123XYZ/);
  assert.match(t.technical, /\[entfernt\]/);
  assert.equal(sanitizeTechnical('plain message'), 'plain message');
});

console.log(`\n${passed} passed`);
