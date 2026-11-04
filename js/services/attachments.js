/**
 * Local file attachments (PDFs, photos) stored in IndexedDB.
 *
 * Only metadata lives in the study state (resource.attachments). The blob
 * stays in the browser's IndexedDB, so it never bloats localStorage and
 * never leaves the device. Deleting/replacing a resource deletes its blobs.
 */

const DB_NAME = 'emvs_attachments_v1';
const STORE = 'files';
const DB_VERSION = 1;
const MAX_BYTES = 40 * 1024 * 1024; // one file; IndexedDB quota is normally much larger

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Dieser Browser unterstützt keine lokalen Dateien (IndexedDB fehlt).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('resourceId', 'resourceId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Dateispeicher konnte nicht geöffnet werden.'));
  });
  return dbPromise;
}

function requestAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Dateispeicher-Fehler.'));
  });
}

function newId() {
  return `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function validateAttachmentFile(file) {
  if (!file) return 'Keine Datei ausgewählt.';
  if (file.size > MAX_BYTES) return 'Datei ist zu gross (max. 40 MB).';
  const ok = file.type === 'application/pdf' || file.type.startsWith('image/');
  if (!ok) return 'Nur PDFs und Bilder werden unterstützt.';
  return null;
}

/** Save one file locally. Returns the metadata object stored on the resource. */
export async function saveAttachment(file, { resourceId, id = newId(), createdAt = Date.now() } = {}) {
  const error = validateAttachmentFile(file);
  if (error) throw new Error(error);
  const db = await openDb();
  const record = {
    id,
    resourceId: resourceId || null,
    name: file.name || 'Datei',
    type: file.type || 'application/octet-stream',
    size: file.size || 0,
    blob: file,
    createdAt,
  };
  const tx = db.transaction(STORE, 'readwrite');
  await requestAsPromise(tx.objectStore(STORE).put(record));
  return { id, name: record.name, type: record.type, size: record.size, createdAt };
}

export async function getAttachment(id) {
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  return requestAsPromise(tx.objectStore(STORE).get(id));
}

export async function listAttachments(resourceId) {
  if (!resourceId) return [];
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const index = tx.objectStore(STORE).index('resourceId');
  return requestAsPromise(index.getAll(resourceId));
}

export async function deleteAttachment(id) {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await requestAsPromise(tx.objectStore(STORE).delete(id));
}

export async function deleteAttachmentsForResource(resourceId) {
  if (!resourceId) return;
  const records = await listAttachments(resourceId);
  if (!records.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  await Promise.all(records.map(r => requestAsPromise(store.delete(r.id))));
}

/** Remove every locally stored attachment (used by "reset all data"). */
export async function clearAllAttachments() {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await requestAsPromise(tx.objectStore(STORE).clear());
}

export function attachmentUrl(blob) {
  return URL.createObjectURL(blob);
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
