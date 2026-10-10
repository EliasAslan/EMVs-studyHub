/**
 * Cloud sync UX helpers (Phase 6).
 *
 * Pure status persistence + error translation. No Supabase client, no
 * network, no dataset access. localStorage stays the primary datastore;
 * this module only reads/writes its own separate status key.
 *
 * Status is recorded ONLY after an operation actually succeeded
 * (recordSyncSuccess) or actually failed (recordSyncFailure) — never
 * beforehand. Nothing here implies automatic synchronization.
 */

export const SYNC_STATUS_KEY = 'emvs_cloud_sync_status_v1';

function blankStatus() {
  return {
    lastUploadAt: null,
    lastDownloadAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
  };
}

function readStatus() {
  try {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) return blankStatus();
    const raw = globalThis.localStorage.getItem(SYNC_STATUS_KEY);
    if (raw === null) return blankStatus();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return blankStatus();
    return {
      lastUploadAt: typeof parsed.lastUploadAt === 'number' ? parsed.lastUploadAt : null,
      lastDownloadAt: typeof parsed.lastDownloadAt === 'number' ? parsed.lastDownloadAt : null,
      lastErrorAt: typeof parsed.lastErrorAt === 'number' ? parsed.lastErrorAt : null,
      lastErrorCode: typeof parsed.lastErrorCode === 'string' ? parsed.lastErrorCode : null,
    };
  } catch {
    // Corrupt or unreadable status never breaks sync; report "never synced".
    return blankStatus();
  }
}

function writeStatus(status) {
  try {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) return false;
    globalThis.localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
    return true;
  } catch {
    return false;
  }
}

export function getSyncStatus() {
  return readStatus();
}

/**
 * Record a verified successful sync. Call only AFTER the operation has
 * actually succeeded (upload: read-back verified; download: local save
 * confirmed). Direction is 'upload' or 'download'.
 */
export function recordSyncSuccess(direction) {
  if (direction !== 'upload' && direction !== 'download') {
    throw new TypeError("direction must be 'upload' or 'download'");
  }
  const status = readStatus();
  const now = Date.now();
  if (direction === 'upload') status.lastUploadAt = now;
  else status.lastDownloadAt = now;
  writeStatus(status);
  return status;
}

/** Record a failed sync attempt. Never touches success timestamps. */
export function recordSyncFailure(code) {
  const status = readStatus();
  status.lastErrorAt = Date.now();
  status.lastErrorCode = typeof code === 'string' && code ? code : 'UNKNOWN';
  writeStatus(status);
  return status;
}

function formatDateTime(at) {
  try {
    return new Date(at).toLocaleString('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(at).toLocaleString();
  }
}

/**
 * German human-readable sync history lines for the settings UI.
 * Distinguishes upload success, download success, and failure; reports
 * "never synced" when nothing completed yet.
 */
export function describeSyncStatus(status) {
  const s = status && typeof status === 'object' ? status : blankStatus();
  const lines = [];
  if (s.lastUploadAt) lines.push(`Letzter Upload: ${formatDateTime(s.lastUploadAt)}`);
  else lines.push('Noch nie hochgeladen.');
  if (s.lastDownloadAt) lines.push(`Letzter Download: ${formatDateTime(s.lastDownloadAt)}`);
  else lines.push('Noch nie heruntergeladen.');
  if (!s.lastUploadAt && !s.lastDownloadAt && !s.lastErrorAt) {
    return ['Noch nie synchronisiert.'];
  }
  const lastSuccess = Math.max(s.lastUploadAt || 0, s.lastDownloadAt || 0);
  if (s.lastErrorAt && s.lastErrorAt > lastSuccess) {
    lines.push(`Letzter Versuch fehlgeschlagen (${s.lastErrorCode || 'UNKNOWN'}).`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

/**
 * Remove anything secret-looking from a technical message before display:
 * JWTs, Supabase publishable/secret keys, bearer tokens. Passwords never
 * appear in sync errors, but the patterns below cover token-shaped text.
 */
export function sanitizeTechnical(message) {
  let out = typeof message === 'string' ? message : String(message ?? '');
  out = out.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[entfernt]');
  out = out.replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, '[entfernt]');
  out = out.replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, '$1[entfernt]');
  out = out.replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9._-]+/gi, '$1[entfernt]');
  return out;
}

function pickCode(error) {
  if (error && typeof error.code === 'string' && error.code) return error.code;
  return 'UNKNOWN';
}

/**
 * Translate an expected sync error into a clear German message with a
 * next action, keeping the sanitized technical detail for debugging.
 * Returns { code, title, action, technical }.
 */
export function translateSyncError(error) {
  const code = pickCode(error);
  const raw = error?.message || String(error ?? '');
  const technical = sanitizeTechnical(raw) || 'Keine Details verfügbar.';
  const msg = raw.toLowerCase();

  if (code === 'ACCOUNT_MISMATCH') {
    return {
      code,
      title: 'Anderes Konto angemeldet — Upload blockiert.',
      action: 'Exportiere zuerst ein JSON-Backup deiner lokalen Daten. Entscheide dich dann bewusst: Cloud-Daten herunterladen oder lokal bleiben.',
      technical,
    };
  }
  if (code === 'EMPTY_LOCAL_OVERWRITE_BLOCKED') {
    return {
      code,
      title: 'Lokale Daten sind leer — nichts hochgeladen.',
      action: 'Die Cloud bleibt unverändert. Lege zuerst lokal Daten an oder lade Cloud-Daten herunter.',
      technical,
    };
  }
  if (code === 'VERIFY_FAILED') {
    return {
      code,
      title: 'Prüfung nach dem Upload fehlgeschlagen.',
      action: 'Versuche den Upload erneut. Deine lokalen Daten sind unverändert; in der Cloud wurde nichts gelöscht.',
      technical,
    };
  }
  if (code === 'PERSIST_FAILED') {
    return {
      code,
      title: 'Speichern nach dem Download fehlgeschlagen.',
      action: 'Prüfe den Browser-Speicher (privater Modus? voll?) und versuche es erneut. Der vorherige Stand wurde wiederhergestellt.',
      technical,
    };
  }
  if (/bitte melde dich zuerst bei supabase an|not authenticated|no session|signed out|sign in/i.test(raw)) {
    return {
      code,
      title: 'Nicht angemeldet.',
      action: 'Melde dich zuerst mit E-Mail und Passwort an und versuche es dann erneut.',
      technical,
    };
  }
  if (/failed to fetch|networkerror|network request failed|offline|econn|enotfound|timeout/i.test(msg)) {
    return {
      code,
      title: 'Keine Verbindung zur Cloud.',
      action: 'Prüfe deine Internetverbindung und versuche es erneut. Lokale Daten bleiben unverändert.',
      technical,
    };
  }
  if (/rls|row-level|policy|permission|denied|rejected|unauthorized|forbidden|jwt|expired/i.test(msg)) {
    return {
      code,
      title: 'Die Cloud hat die Anfrage abgelehnt.',
      action: 'Melde dich ab und wieder an. Besteht das Problem, wende dich mit der Detailmeldung an den Support.',
      technical,
    };
  }
  return {
    code,
    title: 'Synchronisation fehlgeschlagen.',
    action: 'Versuche es erneut. Bei Wiederholung exportiere zuerst ein JSON-Backup. Lokale Daten bleiben unverändert.',
    technical,
  };
}
