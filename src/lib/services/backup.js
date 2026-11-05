/**
 * Browser-only backup helpers. Kept out of the store so the store stays
 * DOM-free for Node tests.
 */

import { exportBackup } from '../stores/app.js';

export function backupFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `study-hub-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export async function downloadBackup() {
  const json = exportBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
