/**
 * Browser-only desktop widget snapshot helpers.
 * Follows the backup.js convention: builds the snapshot, creates a Blob,
 * and triggers a download. No persistence, no automatic saving, no store
 * or cloud sync changes.
 */

import { buildSnapshot, snapshotToJson, snapshotToText } from '../data/widgetSnapshot.js';
import { getState } from '../stores/app.js';

export function widgetSnapshotFilename(suffix = 'json', now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `study-hub-widget-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${suffix}`;
}

export function downloadWidgetSnapshotJson() {
  const snapshot = buildSnapshot(getState());
  const json = snapshotToJson(snapshot);
  const blob = new Blob([json], { type: 'application/json; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = widgetSnapshotFilename('json');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return snapshot;
}

export function downloadWidgetSnapshotText() {
  const snapshot = buildSnapshot(getState());
  const text = snapshotToText(snapshot);
  const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = widgetSnapshotFilename('txt');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return snapshot;
}
