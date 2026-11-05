import { describe, expect, it } from 'vitest';
import {
  validateAttachmentFile,
  attachmentIdsToPrune,
  formatBytes,
  ATTACHMENT_MAX_BYTES,
} from '../src/lib/services/attachments.js';

describe('attachments', () => {
  it('accepts PDFs and images under 40 MB', () => {
    expect(validateAttachmentFile({ size: 1024, type: 'application/pdf' })).toBeNull();
    expect(validateAttachmentFile({ size: 1024, type: 'image/jpeg' })).toBeNull();
    expect(validateAttachmentFile({ size: ATTACHMENT_MAX_BYTES, type: 'image/png' })).toBeNull();
  });

  it('rejects other types and oversized files', () => {
    expect(validateAttachmentFile(null)).toMatch(/Keine Datei/);
    expect(validateAttachmentFile({ size: 10, type: 'text/plain' })).toMatch(/PDFs und Bilder/);
    expect(validateAttachmentFile({ size: ATTACHMENT_MAX_BYTES + 1, type: 'application/pdf' })).toMatch(/zu gross/);
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(null)).toBe('0 B');
  });

  it('prunes only records whose owner no longer exists', () => {
    const records = [
      { id: 'a', ownerId: 'note-1' },
      { id: 'b', ownerId: 'note-2' },
      { id: 'c', ownerId: null },
      { id: 'd', ownerId: 'module-1' },
    ];
    expect(attachmentIdsToPrune(records, ['note-1', 'module-1'])).toEqual(['b']);
    expect(attachmentIdsToPrune(records, new Set(['note-1', 'note-2', 'module-1']))).toEqual([]);
    expect(attachmentIdsToPrune([], ['x'])).toEqual([]);
  });
});
