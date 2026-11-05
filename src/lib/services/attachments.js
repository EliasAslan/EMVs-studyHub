/**
 * Local file attachments (PDFs, photos) stored in IndexedDB.
 * Only metadata lives in state; the blob never leaves the device and is not
 * part of JSON backups or cloud sync.
 */

const DB_NAME = 'studyhub_attachments_v1';
const STORE = 'files';
const DB_VERSION = 1;
const MAX_BYTES = 40 * 1024 * 1024;

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
        store.createIndex('ownerId', 'ownerId', { unique: false });
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

/** Save one file locally. Returns the metadata object stored on the owner. */
export async function saveAttachment(file, { ownerId, id = newId(), createdAt = Date.now() } = {}) {
  const error = validateAttachmentFile(file);
  if (error) throw new Error(error);
  const db = await openDb();
  const record = {
    id,
    ownerId: ownerId || null,
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

export async function listAttachments(ownerId) {
  if (!ownerId) return [];
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  return requestAsPromise(tx.objectStore(STORE).index('ownerId').getAll(ownerId));
}

export async function listAllAttachments() {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  return requestAsPromise(tx.objectStore(STORE).getAll());
}

export async function deleteAttachment(id) {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await requestAsPromise(tx.objectStore(STORE).delete(id));
}

export async function deleteAttachmentsForOwner(ownerId) {
  if (!ownerId) return;
  const records = await listAttachments(ownerId);
  if (!records.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  await Promise.all(records.map((r) => requestAsPromise(store.delete(r.id))));
}

/** Pure: which stored records belong to a deleted owner? Null owners are kept. */
export function attachmentIdsToPrune(records, validIds) {
  const valid = validIds instanceof Set ? validIds : new Set(validIds || []);
  return (records || [])
    .filter((r) => r && r.ownerId && !valid.has(r.ownerId))
    .map((r) => r.id);
}

/** Delete blobs whose owner no longer exists (after a sync merge or cascade). */
export async function pruneOrphanedAttachments(validIds) {
  const records = await listAllAttachments();
  const ids = attachmentIdsToPrune(records, validIds);
  if (!ids.length) return 0;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  await Promise.all(ids.map((id) => requestAsPromise(store.delete(id))));
  return ids.length;
}

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

export const ATTACHMENT_MAX_BYTES = MAX_BYTES;
