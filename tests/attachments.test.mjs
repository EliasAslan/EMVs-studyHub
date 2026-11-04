/**
 * Local attachment guardrails.
 *
 * IndexedDB itself is browser-only, so this suite anchors the pure parts:
 * validation, size formatting, and the state field that keeps metadata in the
 * normal backup while blobs stay on the device.
 */

import { ensureResourceFields, ensureCaptureFields, getSeedData } from '../js/services/store.js';
import { validateAttachmentFile, formatBytes } from '../js/services/attachments.js';

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

test('PDF files are accepted', () => {
  assert(validateAttachmentFile({ name: 'skript.pdf', size: 1024, type: 'application/pdf' }) === null);
});

test('images are accepted', () => {
  assert(validateAttachmentFile({ name: 'notizen.jpg', size: 1024, type: 'image/jpeg' }) === null);
});

test('other file types are rejected', () => {
  assert(/PDFs und Bilder/.test(validateAttachmentFile({ name: 'a.exe', size: 1024, type: 'application/octet-stream' })));
});

test('oversized files are rejected', () => {
  assert(/zu gross/.test(validateAttachmentFile({ name: 'big.pdf', size: 41 * 1024 * 1024, type: 'application/pdf' })));
});

test('empty selection is rejected', () => {
  assert(validateAttachmentFile(null));
});

test('byte formatting is compact and readable', () => {
  assert(formatBytes(512) === '512 B');
  assert(formatBytes(2048) === '2 KB');
  assert(formatBytes(2 * 1024 * 1024) === '2.0 MB');
});

test('resources get an attachments metadata array', () => {
  const res = { id: 'r1', name: 'Skript' };
  ensureResourceFields(res);
  assert(Array.isArray(res.attachments));
  assert(res.attachments.length === 0);
});

test('notes get tags, attachments and pinned defaults', () => {
  const note = { id: 'c1', content: 'Gedanke' };
  ensureCaptureFields(note);
  assert(Array.isArray(note.tags));
  assert(Array.isArray(note.attachments));
  assert(note.pinned === false);
});

test('the seed remains free of attachment blobs', () => {
  const seed = getSeedData();
  assert(seed.resources.length === 0);
  assert(!JSON.stringify(seed).includes('blob:'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('failed tests: ' + failures.join(', '));
  process.exit(1);
}
