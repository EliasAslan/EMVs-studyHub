/**
 * Browser-only desktop widget snapshot helpers.
 * Follows the backup.js convention: builds the snapshot, creates a Blob,
 * and triggers a download. When the File System Access API is available it can
 * also write the snapshot straight into a user-chosen file location via
 * `saveWidgetSnapshot`, which backs the automatic snapshot saving for desktop
 * widgets (M2). No store or cloud sync changes here.
 */

import { buildSnapshot, snapshotToJson, snapshotToText, widgetSnapshotFilename } from '../data/widgetSnapshot.js';
import { getState } from '../stores/app.js';

export { widgetSnapshotFilename };

function triggerDownload(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadWidgetSnapshotJson() {
  const snapshot = buildSnapshot(getState());
  const content = snapshotToJson(snapshot);
  triggerDownload(content, widgetSnapshotFilename('json'), 'application/json');
  return snapshot;
}

export function downloadWidgetSnapshotText() {
  const snapshot = buildSnapshot(getState());
  const content = snapshotToText(snapshot);
  triggerDownload(content, widgetSnapshotFilename('txt'), 'text/plain');
  return snapshot;
}

/**
 * Write the current widget snapshot to a file the user picks via the File
 * System Access API (Chrome/Edge on Windows). Keeps the handle so later
 * auto-saves can overwrite the same file without re-prompting.
 *
 * @param {{suffix?: string, now?: Date}} [opts]
 * @returns {Promise<{snapshot: object, fileName: string, via: string}>}
 */
export async function saveWidgetSnapshot({ suffix = 'txt', now = new Date() } = {}) {
  const snapshot = buildSnapshot(getState());
  const content = suffix === 'json' ? snapshotToJson(snapshot) : snapshotToText(snapshot);
  const fileName = widgetSnapshotFilename(suffix, now);
  const mimeType = suffix === 'json' ? 'application/json' : 'text/plain';

  const picker =
    typeof window !== 'undefined'
      ? typeof window.showSaveFilePicker === 'function'
        ? window.showSaveFilePicker.bind(window)
        : null
      : null;

  if (picker) {
    const handle = await picker({
      suggestedName: fileName,
      types: [
        {
          description: suffix === 'json' ? 'JSON' : 'Textdatei',
          accept: { [mimeType]: [suffix === 'json' ? '.json' : '.txt'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return { snapshot, fileName, via: 'file-system' };
  }

  // Fallback for browsers without the File System Access API: trigger a
  // download instead (used by the manual export buttons as well).
  triggerDownload(content, fileName, mimeType);
  return { snapshot, fileName, via: 'download' };
}

/* ------------------------------------------------------------------ */
/* Automatic snapshot saving (M2)                                       */
/* ------------------------------------------------------------------ */

const AUTO_SAVE_DELAY_MS = 2000;
const AUTO_SAVE_INTERVAL_MS = 24 * 60 * 60 * 1000; // day shift refresh
let autoSaveTimer = null;
let autoSaveInterval = null;
let autoSaveRunning = false;
let lastWidgetSignature = null;

/** Start the daily re-save loop (day-shifted deadlines, midnight rollover). */
export function startWidgetAutoSave() {
  if (autoSaveInterval) return;
  autoSaveInterval = setInterval(() => {
    void saveWidgetSnapshotNow();
  }, AUTO_SAVE_INTERVAL_MS);
}

/** Stop all automatic snapshot saving. */
export function stopWidgetAutoSave() {
  clearInterval(autoSaveInterval);
  clearTimeout(autoSaveTimer);
  autoSaveInterval = null;
}

/**
 * Debounce the automatic snapshot save. Call whenever a snapshot-relevant
 * slice of the app state changed (see the `widgetSnapshotSignature` derived).
 * No-op while automatic saving is disabled in the settings.
 */
export function scheduleWidgetAutoSave(signature) {
  clearTimeout(autoSaveTimer);
  const state = getState();
  if (!state.settings || !state.settings.widgetAutoSave) {
    lastWidgetSignature = null;
    return;
  }
  if (signature === lastWidgetSignature) return;
  lastWidgetSignature = signature;
  autoSaveTimer = setTimeout(() => {
    void saveWidgetSnapshotNow();
  }, AUTO_SAVE_DELAY_MS);
}

async function saveWidgetSnapshotNow() {
  const state = getState();
  if (!state.settings || !state.settings.widgetAutoSave) return;
  if (autoSaveRunning) return;
  autoSaveRunning = true;
  try {
    await saveWidgetSnapshot({ suffix: 'txt' });
  } catch (e) {
    // Silent fallback: the manual export in Settings stays the escape hatch.
    console.error('Widget snapshot auto-save failed:', e);
  } finally {
    autoSaveRunning = false;
  }
}
