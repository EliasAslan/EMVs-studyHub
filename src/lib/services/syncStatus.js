/**
 * Cloud sync UX helpers: status persistence + error translation.
 * No client, no network. Only its own status key is read/written.
 */

export const SYNC_STATUS_KEY = 'studyhub_sync_status_v1';

function blankStatus() {
  return { lastUploadAt: null, lastDownloadAt: null, lastErrorAt: null, lastErrorCode: null };
}

function readStatus() {
  try {
    const raw = globalThis.localStorage?.getItem(SYNC_STATUS_KEY);
    if (raw === null || raw === undefined) return blankStatus();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return blankStatus();
    return {
      lastUploadAt: typeof parsed.lastUploadAt === 'number' ? parsed.lastUploadAt : null,
      lastDownloadAt: typeof parsed.lastDownloadAt === 'number' ? parsed.lastDownloadAt : null,
      lastErrorAt: typeof parsed.lastErrorAt === 'number' ? parsed.lastErrorAt : null,
      lastErrorCode: typeof parsed.lastErrorCode === 'string' ? parsed.lastErrorCode : null,
    };
  } catch {
    return blankStatus();
  }
}

function writeStatus(status) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
    return true;
  } catch {
    return false;
  }
}

export function getSyncStatus() {
  return readStatus();
}

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

export function describeSyncStatus(status) {
  const s = status && typeof status === 'object' ? status : blankStatus();
  if (!s.lastUploadAt && !s.lastDownloadAt && !s.lastErrorAt) return ['Noch nie synchronisiert.'];
  const lines = [];
  lines.push(s.lastUploadAt ? `Letzter Upload: ${formatDateTime(s.lastUploadAt)}` : 'Noch nie hochgeladen.');
  lines.push(
    s.lastDownloadAt ? `Letzter Download: ${formatDateTime(s.lastDownloadAt)}` : 'Noch nie heruntergeladen.',
  );
  const lastSuccess = Math.max(s.lastUploadAt || 0, s.lastDownloadAt || 0);
  if (s.lastErrorAt && s.lastErrorAt > lastSuccess) {
    lines.push(`Letzter Versuch fehlgeschlagen (${s.lastErrorCode || 'UNKNOWN'}).`);
  }
  return lines;
}

export function formatLastSynced(status) {
  const s = status && typeof status === 'object' ? status : blankStatus();
  const last = Math.max(s.lastUploadAt || 0, s.lastDownloadAt || 0);
  if (!last) return 'Nie';
  try {
    return new Date(last).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date(last).toLocaleTimeString();
  }
}

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

export function translateSyncError(error) {
  const code = pickCode(error);
  const raw =
    typeof error === 'string' ? error : error && typeof error.message === 'string' ? error.message : '';
  const technical = raw ? sanitizeTechnical(raw) : 'Keine Details verfügbar.';
  const msg = raw.toLowerCase();

  if (code === 'ACCOUNT_MISMATCH') {
    return {
      code,
      title: 'Anderes Konto angemeldet — Sync blockiert.',
      action: 'Exportiere zuerst ein JSON-Backup. Entscheide dich dann bewusst für dieses Konto.',
      technical,
    };
  }
  if (code === 'VERIFY_FAILED') {
    return {
      code,
      title: 'Prüfung nach dem Upload fehlgeschlagen.',
      action: 'Versuche es erneut. Lokale Daten bleiben unverändert.',
      technical,
    };
  }
  if (code === 'PERSIST_FAILED') {
    return {
      code,
      title: 'Speichern nach dem Download fehlgeschlagen.',
      action: 'Prüfe den Browser-Speicher und versuche es erneut.',
      technical,
    };
  }
  if (/bitte melde dich zuerst|not authenticated|no session|signed out|sign in/i.test(raw)) {
    return {
      code,
      title: 'Nicht angemeldet.',
      action: 'Melde dich zuerst mit E-Mail und Passwort an.',
      technical,
    };
  }
  if (/failed to fetch|networkerror|network request failed|offline|econn|enotfound|timeout/i.test(msg)) {
    return {
      code,
      title: 'Keine Verbindung zur Cloud.',
      action: 'Prüfe deine Internetverbindung. Lokale Daten bleiben unverändert.',
      technical,
    };
  }
  if (/rls|row-level|policy|permission|denied|rejected|unauthorized|forbidden|jwt|expired/i.test(msg)) {
    return {
      code,
      title: 'Die Cloud hat die Anfrage abgelehnt.',
      action: 'Melde dich ab und wieder an. Besteht das Problem, prüfe die Supabase-Regeln.',
      technical,
    };
  }
  return {
    code,
    title: 'Synchronisation fehlgeschlagen.',
    action: 'Versuche es erneut. Lokale Daten bleiben unverändert.',
    technical,
  };
}
