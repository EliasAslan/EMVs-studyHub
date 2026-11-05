import { beforeEach, describe, expect, it } from 'vitest';
import { setAdapter } from '../src/lib/services/storageAdapter.js';
import * as store from '../src/lib/services/store.js';
import { normalizeState, defaultState, STUDIED_ID } from '../src/lib/data/entities.js';

function memoryAdapter() {
  const data = new Map();
  return {
    getItem(key) {
      if (!data.has(key)) return null;
      return JSON.parse(data.get(key));
    },
    setItem(key, value) {
      data.set(key, JSON.stringify(value));
      return true;
    },
    removeItem(key) {
      data.delete(key);
      return true;
    },
    raw(key) {
      return data.get(key) ?? null;
    },
  };
}

let adapter;

beforeEach(() => {
  adapter = memoryAdapter();
  setAdapter(adapter);
  store.clearStorageError();
});

describe('store persistence', () => {
  it('returns default state when nothing is stored', () => {
    const state = store.load();
    expect(state.programs.map((p) => p.id)).toEqual(['program-emvs', 'program-bm']);
    expect(state.checklistItems.some((c) => c.id === STUDIED_ID)).toBe(true);
    expect(state.modules).toEqual([]);
  });

  it('saves and loads normalized state', () => {
    const state = defaultState();
    state.modules.push({ id: 'm1', programId: 'program-emvs', code: 'M294', title: 'DB' });
    expect(store.save(state)).toBe(true);
    const loaded = store.load();
    expect(loaded.modules[0].code).toBe('M294');
    expect(loaded.modules[0].createdAt).toBeTypeOf('number');
  });

  it('latches saves off after a read failure', () => {
    setAdapter({
      getItem() {
        throw new Error('boom');
      },
      setItem() {
        throw new Error('should not write');
      },
      removeItem() {},
    });
    const state = store.load();
    expect(state.modules).toEqual([]);
    expect(store.getStorageError()).toBeTruthy();
    expect(store.save(defaultState())).toBe(false);
  });

  it('clears all data and timer keys', () => {
    store.save(defaultState());
    store.saveTimerState({ phase: 'work' });
    store.clearAll();
    expect(adapter.raw(store.STORAGE_KEY)).toBeNull();
    expect(adapter.raw(store.TIMER_KEY)).toBeNull();
  });
});

describe('entities and cascades', () => {
  it('adds, updates and deletes with a tombstone', () => {
    const state = defaultState();
    const hw = store.addEntity(state, 'homework', { title: 'Auftrag', dueDate: '2026-11-04', done: false });
    expect(state.homework).toHaveLength(1);
    store.updateEntity(state, 'homework', hw.id, { done: true });
    expect(state.homework[0].done).toBe(true);
    const deleted = store.deleteWithTombstone(state, 'homework', hw.id);
    expect(deleted.id).toBe(hw.id);
    expect(state.homework).toHaveLength(0);
    expect(state.tombstones).toContainEqual(expect.objectContaining({ collection: 'homework', id: hw.id }));
  });

  it('cascades module deletion to children and clears topic links', () => {
    const state = defaultState();
    store.addEntity(state, 'modules', { id: 'm1', programId: 'program-emvs', code: 'M1', title: 'Modul' });
    store.addEntity(state, 'topics', { id: 't1', moduleId: 'm1', name: 'Thema' });
    store.addEntity(state, 'notes', { id: 'n1', moduleId: 'm1', topicId: 't1', title: 'Notiz', body: '' });
    store.addEntity(state, 'homework', { id: 'h1', moduleId: 'm1', title: 'HW', dueDate: null });
    store.addEntity(state, 'exams', { id: 'e1', moduleId: 'm1', title: 'Ex', date: '2026-11-10', topicIds: ['t1'] });
    store.addEntity(state, 'links', { id: 'l1', moduleId: 'm1', label: 'L', url: 'https://example.com' });
    store.addEntity(state, 'lessons', { id: 'le1', dayOfWeek: 1, moduleId: 'm1', start: '08:00', end: '09:00' });

    store.deleteWithTombstone(state, 'modules', 'm1');
    expect(state.modules).toHaveLength(0);
    expect(state.topics).toHaveLength(0);
    expect(state.notes).toHaveLength(0);
    expect(state.homework).toHaveLength(0);
    expect(state.exams).toHaveLength(0);
    expect(state.links).toHaveLength(0);
    expect(state.lessons).toHaveLength(0);
    expect(state.tombstones.map((t) => t.collection).sort()).toEqual(
      ['exams', 'homework', 'lessons', 'links', 'modules', 'notes', 'topics'].sort(),
    );
  });

  it('clears topic references when a topic is deleted', () => {
    const state = defaultState();
    store.addEntity(state, 'modules', { id: 'm1', programId: 'program-emvs', code: 'M1', title: 'Modul' });
    store.addEntity(state, 'topics', { id: 't1', moduleId: 'm1', name: 'Thema' });
    store.addEntity(state, 'notes', { id: 'n1', moduleId: 'm1', topicId: 't1', title: 'Notiz', body: '' });
    store.addEntity(state, 'homework', { id: 'h1', moduleId: 'm1', topicId: 't1', title: 'HW', dueDate: null });
    store.addEntity(state, 'exams', { id: 'e1', moduleId: 'm1', title: 'Ex', date: '', topicIds: ['t1'] });
    store.deleteWithTombstone(state, 'topics', 't1');
    expect(state.notes[0].topicId).toBeNull();
    expect(state.homework[0].topicId).toBeNull();
    expect(state.exams[0].topicIds).toEqual([]);
  });

  it('restores a deleted entity and removes its tombstone', () => {
    const state = defaultState();
    const hw = store.addEntity(state, 'homework', { title: 'Auftrag' });
    const snapshot = { ...hw };
    store.deleteWithTombstone(state, 'homework', hw.id);
    store.restoreEntity(state, 'homework', snapshot);
    expect(state.homework.map((h) => h.id)).toEqual([hw.id]);
    expect(state.tombstones).toHaveLength(0);
  });

  it('prunes tombstones older than 90 days', () => {
    const now = Date.now();
    const state = normalizeState({
      tombstones: [
        { collection: 'notes', id: 'old', deletedAt: now - 91 * 86400000 },
        { collection: 'notes', id: 'new', deletedAt: now - 2 * 86400000 },
      ],
    });
    expect(state.tombstones.map((t) => t.id)).toEqual(['new']);
  });
});

describe('checklist mutators', () => {
  it('toggles homework done and per-day custom checks', () => {
    const state = defaultState();
    store.addEntity(state, 'homework', { id: 'h1', title: 'HW', dueDate: '2026-11-04', done: false });
    store.setChecklistItem(state, { kind: 'homework', homeworkId: 'h1' }, true, '2026-11-04');
    expect(state.homework[0].done).toBe(true);
    expect(state.homework[0].doneAt).toBeTypeOf('number');

    const custom = store.addChecklistItem(state, 'Trinkflasche');
    store.setChecklistItem(state, { kind: 'custom', id: custom.id, checked: false }, true, '2026-11-04');
    expect(state.checklist).toEqual({ date: '2026-11-04', checked: { [custom.id]: true } });

    store.setChecklistItem(state, { kind: 'custom', id: custom.id, checked: true }, false, '2026-11-05');
    expect(state.checklist).toEqual({ date: '2026-11-05', checked: {} });
  });

  it('does not delete the studied item', () => {
    const state = defaultState();
    expect(store.deleteChecklistItem(state, STUDIED_ID)).toBe(false);
    expect(state.checklistItems.some((c) => c.id === STUDIED_ID)).toBe(true);
  });
});

describe('backup reminder', () => {
  it('counts changes and resets on export', () => {
    const state = defaultState();
    for (let i = 0; i < store.BACKUP_REMINDER_AFTER; i++) store.markChanged(state);
    expect(store.needsBackupReminder(state)).toBe(true);
    store.markExported(state);
    expect(store.needsBackupReminder(state)).toBe(false);
    expect(state.settings.lastExportAt).toBeTypeOf('number');
  });
});

describe('import and export', () => {
  it('round-trips a valid backup', () => {
    const state = defaultState();
    store.addEntity(state, 'modules', { id: 'm1', programId: 'program-emvs', code: 'M294', title: 'DB' });
    store.addEntity(state, 'notes', { id: 'n1', moduleId: 'm1', title: 'Notiz', body: 'Text' });
    const result = store.importData(store.serializeData(state));
    expect(result.success).toBe(true);
    expect(result.data.modules[0].title).toBe('DB');
    expect(result.data.notes[0].body).toBe('Text');
  });

  it('rejects invalid JSON and non-objects', () => {
    expect(store.importData('{').success).toBe(false);
    expect(store.importData('[]').success).toBe(false);
    expect(store.importData('null').success).toBe(false);
  });

  it('sanitizes ids, dates, grades and unknown fields', () => {
    const result = store.importData(
      JSON.stringify({
        programs: [{ id: 'program-emvs', name: 'EMVs', code: 'EMVs', accent: '#4f46e5' }],
        modules: [{ id: 'bad id<script>', programId: 'program-emvs', code: 'M1', title: 'Modul', evil: 'x' }],
        notes: [{ id: 'n1', moduleId: 'missing', title: 'N', body: 'B', type: 'hack' }],
        homework: [{ id: 'h1', title: 'H', dueDate: '2026-02-30', done: true, doneAt: 5 }],
        exams: [{ id: 'e1', title: 'E', date: '2026-11-04', grade: 9, gradeNote: 'x' }],
        links: [{ id: 'l1', label: 'L', url: 'javascript:alert(1)', kind: 'hack' }],
        checklistItems: [{ id: 'studied', text: 'x' }, { id: 'c1', text: 'Punkt' }],
      }),
    );
    expect(result.success).toBe(true);
    const data = result.data;
    expect(data.modules[0].id).toMatch(/^[A-Za-z0-9-]+$/);
    expect(data.modules[0].evil).toBeUndefined();
    expect(data.notes[0].moduleId).toBeNull();
    expect(data.notes[0].type).toBe('note');
    expect(data.homework[0].dueDate).toBeNull();
    expect(data.exams[0].grade).toBeNull();
    expect(data.links[0].kind).toBe('custom');
    expect(data.checklistItems.map((c) => c.id)).toEqual(['studied', 'c1']);
  });
});
