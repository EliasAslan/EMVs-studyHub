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
  const value = error?.code || error?.error?.code || error?.statusCode || error?.status;
  if (value !== undefined && value !== null && String(value)) return String(value).toUpperCase();
  return 'UNKNOWN';
}

function pickMessage(error) {
  if (typeof error === 'string') return error;
  return [
    error?.message,
    error?.error?.message,
    error?.error_description,
    error?.details,
    error?.hint,
  ].find((value) => typeof value === 'string' && value.trim()) || '';
}

export function translateSyncError(error) {
  const raw = pickMessage(error);
  const msg = raw.toLowerCase();
  const sourceCode = pickCode(error);
  const code = sourceCode === 'UNKNOWN' && /failed to fetch|networkerror|network request failed|offline|econn|enotfound|timeout/i.test(msg)
    ? 'NETWORK'
    : sourceCode;
  const technicalParts = [raw, error?.details, error?.hint].filter((value, i, all) =>
    typeof value === 'string' && value.trim() && all.indexOf(value) === i
  );
  const technical = technicalParts.length
    ? sanitizeTechnical(technicalParts.join(' · '))
    : 'Keine technischen Details verfügbar.';

  if (code === 'ACCOUNT_MISMATCH') {
    return {
      code,
      title: 'Ein anderes Study-Hub-Konto wurde verwendet.',
      action: 'Zum Schutz deiner Daten wurde der Sync gestoppt. Exportiere zuerst ein Backup und melde dich danach mit dem bisherigen Konto an.',
      technical,
    };
  }
  if (code === 'VERIFY_FAILED') {
    return {
      code,
      title: 'Die Cloud konnte die gespeicherten Daten nicht vollständig bestätigen.',
      action: 'Deine lokalen Daten bleiben erhalten. Prüfe die Details und versuche es erneut; wende dich bei wiederholtem Fehler an die Administration.',
      technical,
    };
  }
  if (code === 'PERSIST_FAILED' || /quota|storage full|storage quota|localstorage/i.test(msg)) {
    return {
      code,
      title: 'Der Browser konnte die heruntergeladenen Daten nicht lokal speichern.',
      action: 'Prüfe den verfügbaren Gerätespeicher, lade nicht benötigte Dateien herunter oder exportiere ein Backup und versuche es erneut.',
      technical,
    };
  }
  if (code === 'OFFLINE' || /failed to fetch|networkerror|network request failed|offline|econn|enotfound|timeout/i.test(msg)) {
    return {
      code: 'NETWORK',
      title: 'Keine Internetverbindung — Änderungen warten auf den Sync.',
      action: 'Study Hub speichert weiter auf diesem Gerät und synchronisiert automatisch, sobald die Verbindung zurück ist.',
      technical,
    };
  }
  if (/invalid.*domain|origin.*not.*allowed|trusted.*origin|cors/i.test(msg)) {
    return {
      code,
      title: 'Diese Website ist für Neon Auth noch nicht freigegeben.',
      action: 'Füge die genaue Website-Adresse inklusive https:// zu den erlaubten Neon Auth Domains hinzu.',
      technical,
    };
  }
  if (/bitte melde dich zuerst|not authenticated|no session|signed out|session.*(expired|invalid)|jwt.*expired/i.test(msg) || code === '401') {
    return {
      code,
      title: 'Deine Cloud-Anmeldung ist abgelaufen.',
      action: 'Melde dich erneut an. Deine lokalen Daten bleiben erhalten.',
      technical,
    };
  }
  if (/signup_not_allowed|sign.?up.*(disabled|not allowed)/i.test(msg)) {
    return {
      code,
      title: 'Die Kontoerstellung ist in Neon Auth deaktiviert.',
      action: 'Bitte wende dich an die Administration, damit die Registrierung freigeschaltet wird.',
      technical,
    };
  }
  if (/already.*(registered|exists)|user already/i.test(msg)) {
    return {
      code,
      title: 'Für diese E-Mail-Adresse gibt es bereits ein Konto.',
      action: 'Melde dich mit diesem Konto an oder setze das Passwort zurück.',
      technical,
    };
  }
  if (code === '429' || /rate limit|too many requests/i.test(msg)) {
    return {
      code,
      title: 'Zu viele Anfragen in kurzer Zeit.',
      action: 'Warte kurz und versuche es danach erneut.',
      technical,
    };
  }
  if (code === 'PGRST205' || code === '42P01' || /relation .* does not exist|table .* not found/i.test(msg)) {
    return {
      code,
      title: 'Eine benötigte Tabelle fehlt in der Neon-Datenbank.',
      action: 'Die Study-Hub-Datenbankmigration muss auf diesem Neon-Branch angewendet werden. Bitte wende dich an die Administration.',
      technical,
    };
  }
  if (code === 'PGRST204' || code === '42703' || /column .* does not exist|could not find .* column/i.test(msg)) {
    return {
      code,
      title: 'Die Neon-Datenbank hat ein älteres oder unvollständiges Schema.',
      action: 'Aktualisiere das Study-Hub-Datenbankschema und lade die App danach neu.',
      technical,
    };
  }
  if (code === '23503' || /foreign key constraint/i.test(msg)) {
    return {
      code,
      title: 'Ein Datensatz verweist auf ein nicht mehr vorhandenes Element.',
      action: 'Lade die Cloud-Daten neu. Wenn der Fehler bleibt, sichere die lokalen Daten und wende dich an die Administration.',
      technical,
    };
  }
  if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
    return {
      code,
      title: 'Ein Datensatz mit derselben Kennung ist bereits gespeichert.',
      action: 'Lade die Cloud-Daten neu. Deine lokalen Änderungen bleiben vorerst erhalten.',
      technical,
    };
  }
  if (/rls|row-level|policy|permission|denied|rejected|unauthorized|forbidden/i.test(msg) || code === '403') {
    return {
      code,
      title: 'Neon hat den Zugriff auf diese Daten abgelehnt.',
      action: 'Melde dich ab und wieder an. Wenn das nicht hilft, müssen die Neon-RLS-Regeln und Tabellenrechte geprüft werden.',
      technical,
    };
  }
  if (code === 'UNKNOWN' && !raw) {
    return {
      code,
      title: 'Die Synchronisation ist fehlgeschlagen.',
      action: 'Es wurden keine Fehlerdetails zurückgegeben. Versuche es erneut; wenn es bleibt, öffne die Details für die Administration.',
      technical,
    };
  }
  if (/5\d\d/.test(code)) {
    return {
      code,
      title: 'Der Neon-Dienst antwortet gerade nicht korrekt.',
      action: 'Deine lokalen Daten bleiben erhalten. Warte kurz und versuche es erneut.',
      technical,
    };
  }
  return {
    code,
    title: 'Die Synchronisation ist fehlgeschlagen.',
    action: raw
      ? `Grund: ${sanitizeTechnical(raw)}. Deine lokalen Daten bleiben erhalten; versuche es nach Möglichkeit erneut.`
      : 'Es wurden keine weiteren Fehlerdetails zurückgegeben. Deine lokalen Daten bleiben erhalten; versuche es erneut.',
    technical,
  };
}
