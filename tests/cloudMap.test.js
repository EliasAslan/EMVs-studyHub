import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS,
  TABLE_FOR_COLLECTION,
  toRow,
  fromRow,
  tombstoneToRow,
  toCloudDataset,
  fromCloudDataset,
  isEmptyDataset,
  countDataset,
} from '../src/lib/services/cloudMap.js';
import { defaultState, STUDIED_ID } from '../src/lib/data/entities.js';

const NOW = 1793857245944;

function note(overrides = {}) {
  return {
    id: 'n1',
    moduleId: 'm1',
    topicId: 't1',
    title: 'SQL Joins',
    body: 'INNER JOIN',
    type: 'note',
    attachments: [
      { id: 'a1', name: 'sheet.pdf', type: 'application/pdf', size: 1024, createdAt: NOW, blob: 'nope' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('cloudMap row round-trips', () => {
  it('never emits user_id and never reads it back', () => {
    for (const collection of COLLECTIONS) {
      const row = toRow(collection, { id: 'x', user_id: 'evil' });
      expect(row).not.toHaveProperty('user_id');
      const back = fromRow(collection, { ...row, user_id: 'someone-else' });
      expect(back).not.toHaveProperty('user_id');
    }
  });

  it('round-trips a note without attachments blobs', () => {
    const row = toRow('notes', note());
    expect(row.module_id).toBe('m1');
    expect(row.topic_id).toBe('t1');
    expect(row.attachments).toEqual([
      { id: 'a1', name: 'sheet.pdf', type: 'application/pdf', size: 1024, createdAt: NOW },
    ]);
    expect(JSON.stringify(row)).not.toContain('nope');

    const back = fromRow('notes', row);
    expect(back).toMatchObject({
      id: 'n1',
      moduleId: 'm1',
      topicId: 't1',
      title: 'SQL Joins',
      body: 'INNER JOIN',
      type: 'note',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('maps optional module/topic references to null', () => {
    const row = toRow('notes', note({ moduleId: '', topicId: null }));
    expect(row.module_id).toBeNull();
    expect(row.topic_id).toBeNull();
    expect(fromRow('notes', row).moduleId).toBeNull();
  });

  it('maps homework booleans, dates and doneAt', () => {
    const row = toRow('homework', {
      id: 'h1',
      title: 'Aufgabe',
      dueDate: '2026-11-05',
      done: true,
      doneAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(row.due_date).toBe('2026-11-05');
    expect(row.done).toBe(true);
    expect(row.done_at).toBe(NOW);
    expect(fromRow('homework', row)).toMatchObject({
      dueDate: '2026-11-05',
      done: true,
      doneAt: NOW,
    });
  });

  it('maps exam topic ids and Swiss grades', () => {
    const row = toRow('exams', {
      id: 'e1',
      moduleId: 'm1',
      topicIds: ['t1', 't2'],
      title: 'Prüfung',
      date: '2026-11-20',
      notes: '',
      grade: 5.5,
      gradeNote: 'gut',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(row.topic_ids).toEqual(['t1', 't2']);
    expect(row.grade).toBe(5.5);
    expect(fromRow('exams', row)).toMatchObject({
      topicIds: ['t1', 't2'],
      grade: 5.5,
      gradeNote: 'gut',
    });
  });

  it('maps lesson start_time/end_time', () => {
    const row = toRow('lessons', {
      id: 'l1',
      dayOfWeek: 2,
      start: '08:15',
      end: '09:45',
      moduleId: 'm1',
      label: 'DB',
      room: 'A1',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(row.start_time).toBe('08:15');
    expect(row.end_time).toBe('09:45');
    expect(row).not.toHaveProperty('start');
    expect(fromRow('lessons', row)).toMatchObject({
      dayOfWeek: 2,
      start: '08:15',
      end: '09:45',
    });
  });

  it('maps settings with a stable updatedAt', () => {
    const row = toRow('settings', {
      theme: 'dark',
      navCollapsed: true,
      email: 'a@b.ch',
      emailReminders: true,
      lastExportAt: NOW,
      changeCount: 3,
      currentProgramId: 'program-bm',
      updatedAt: NOW,
    });
    expect(row.theme).toBe('dark');
    expect(row.updated_at).toBe(NOW);
    expect(fromRow('settings', row)).toMatchObject({
      theme: 'dark',
      navCollapsed: true,
      email: 'a@b.ch',
      emailReminders: true,
      lastExportAt: NOW,
      changeCount: 3,
      currentProgramId: 'program-bm',
      updatedAt: NOW,
    });
  });

  it('marks every entity row with deleted_at and maps tombstones', () => {
    for (const collection of COLLECTIONS) {
      if (collection === 'settings') continue;
      const row = toRow(collection, { id: 'x' });
      expect(row.deleted_at).toBeNull();
      const tomb = fromRow(collection, tombstoneToRow(collection, { id: 'x', deletedAt: NOW }));
      expect(tomb).toEqual({ _tombstone: true, id: 'x', deletedAt: NOW });
    }
  });
});

describe('cloudMap datasets', () => {
  it('uploads live rows plus tombstones without live counterparts', () => {
    const state = defaultState();
    state.modules.push({ id: 'm1', programId: 'program-emvs', code: 'M294', title: 'DB' });
    state.tombstones.push(
      { collection: 'modules', id: 'm1', deletedAt: NOW },
      { collection: 'notes', id: 'gone', deletedAt: NOW },
    );

    const dataset = toCloudDataset(state);
    expect(dataset.modules).toHaveLength(1);
    expect(dataset.modules[0].deleted_at).toBeNull();
    expect(dataset.notes).toHaveLength(1);
    expect(dataset.notes[0].deleted_at).toBe(NOW);
    expect(dataset.user_settings).toHaveLength(1);
  });

  it('splits tombstones back out of a cloud dataset', () => {
    const dataset = toCloudDataset(defaultState());
    dataset.notes.push(tombstoneToRow('notes', { id: 'gone', deletedAt: NOW }));
    const state = fromCloudDataset(dataset);
    expect(state.notes).toEqual([]);
    expect(state.tombstones).toEqual([{ collection: 'notes', id: 'gone', deletedAt: NOW }]);
  });

  it('treats defaults as an empty dataset', () => {
    const state = defaultState();
    expect(isEmptyDataset(state)).toBe(true);
    expect(state.programs.length).toBeGreaterThan(0);
    expect(state.checklistItems.some((c) => c.id === STUDIED_ID)).toBe(true);

    state.notes.push(note());
    expect(isEmptyDataset(state)).toBe(false);
  });

  it('counts entity collections only', () => {
    const state = defaultState();
    state.notes.push(note());
    state.homework.push({ id: 'h1' });
    const counts = countDataset(state);
    expect(counts.notes).toBe(1);
    expect(counts.homework).toBe(1);
    expect(counts.programs).toBe(2);
    expect(counts.checklistItems).toBe(1);
    expect(counts.total).toBe(5);
    expect(counts.settings).toBeUndefined();
  });

  it('maps every collection to an allowlisted table', () => {
    expect(Object.keys(TABLE_FOR_COLLECTION).sort()).toEqual([...COLLECTIONS].sort());
  });
});
