/**
 * Reactive app store. Views mutate through the exported mutators; nothing
 * writes localStorage directly. Persistence is debounced, then sync is told.
 */

import { writable, derived, get } from 'svelte/store';
import * as store from '../services/store.js';
import { deleteAttachmentsForOwner, clearAllAttachments } from '../services/attachments.js';
import { pickStartHere, openHomework as openHomeworkList, doneHomework as doneHomeworkList } from '../data/startHere.js';
import { checklistForDay } from '../data/checklist.js';
import { upcomingDeadlines } from '../data/deadlines.js';
import { todayKey } from '../data/dates.js';
import { normalizeRecurrence, nextInstanceToAdd } from '../data/recurrence.js';
import { rewriteWikiTargets, norm as normNote } from '../data/wikiLinks.js';

let saveTimer = null;
let syncHandler = null;
let saveHandler = null;

export function setSyncHandler(fn) {
  syncHandler = fn;
}
export function setSaveHandler(fn) {
  saveHandler = fn;
}

const initial = store.load();
export const appState = writable(initial);
export const storageError = writable(store.getStorageError());
export function getStore() {
  return store;
}

/** Read the current app state once (non-reactive). */
export function getState() {
  return get(appState);
}

/** Force the debounced save to run now (page hide, manual save). */
export function flush() {
  persist(get(appState), true);
}

function persist(state, immediate = false) {
  clearTimeout(saveTimer);
  const run = () => {
    const ok = store.save(state);
    if (!ok) storageError.set(store.getStorageError());
    if (ok && saveHandler) {
      try {
        saveHandler(state);
      } catch (e) {
        console.error('Save handler failed:', e);
      }
    }
  };
  if (immediate) run();
  else saveTimer = setTimeout(run, 250);
}

/** Apply a mutator, bump the change counter, notify UI + sync. */
function commit(mutator, { immediate = false, mark = true } = {}) {
  const state = get(appState);
  const result = mutator(state);
  if (mark) store.markChanged(state);
  appState.set({ ...state });
  persist(state, immediate);
  if (syncHandler && mark) {
    try {
      syncHandler(state);
    } catch (e) {
      console.error('Sync handler failed:', e);
    }
  }
  return result;
}

/** Replace state from sync/import without counting as a user change. */
export function replaceState(next, { saveNow = true } = {}) {
  appState.set({ ...next });
  if (saveNow) persist(next, true);
}

/* ------------------------------------------------------------------ */
/* Programs / modules / topics                                         */
/* ------------------------------------------------------------------ */

export function createModule(data) {
  return commit((s) =>
    store.addEntity(s, 'modules', {
      programId: data.programId || s.settings.currentProgramId || s.programs[0]?.id,
      code: String(data.code || '').trim(),
      title: String(data.title || '').trim(),
      accent: data.accent || '#4f46e5',
      order: (s.modules || []).length,
      attachments: [],
      overviewNoteId: null,
    }),
  );
}

export function updateModule(id, patch) {
  return commit((s) => store.updateEntity(s, 'modules', id, patch));
}

export function updateProgram(id, patch) {
  return commit((s) => store.updateEntity(s, 'programs', id, patch));
}

export function deleteModule(id) {
  const state = get(appState);
  const noteIds = (state.notes || []).filter((n) => n.moduleId === id).map((n) => n.id);
  deleteAttachmentsForOwner(id).catch(() => {});
  noteIds.forEach((noteId) => deleteAttachmentsForOwner(noteId).catch(() => {}));
  return commit((s) => store.deleteWithTombstone(s, 'modules', id), { immediate: true });
}

/** Create (or return) the module's single overview note. */
export function createOverviewNote(moduleId) {
  return commit((s) => {
    const mod = (s.modules || []).find((m) => m.id === moduleId);
    if (!mod) return null;
    const existing = (s.notes || []).find((n) => n.id === mod.overviewNoteId);
    if (existing) return existing;
    const note = store.addEntity(s, 'notes', {
      moduleId,
      topicId: null,
      title: `${mod.code || mod.title || 'Modul'} Überblick`,
      body: '',
      type: 'summary',
      attachments: [],
    });
    mod.overviewNoteId = note.id;
    mod.updatedAt = Date.now();
    return note;
  });
}

export function createTopic(moduleId, name) {
  const value = String(name || '').trim();
  if (!value) return null;
  return commit((s) =>
    store.addEntity(s, 'topics', {
      moduleId,
      name: value,
      order: (s.topics || []).filter((t) => t.moduleId === moduleId).length,
    }),
  );
}

export function deleteTopic(id) {
  return commit((s) => store.deleteWithTombstone(s, 'topics', id));
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export function createNote(data = {}) {
  return commit((s) =>
    store.addEntity(s, 'notes', {
      moduleId: data.moduleId || null,
      topicId: data.topicId || null,
      title: String(data.title || '').trim(),
      body: String(data.body || ''),
      type: data.type || 'note',
      attachments: [],
    }),
  );
}

export function updateNote(id, patch) {
  return commit((s) => store.updateEntity(s, 'notes', id, patch));
}

export function deleteNote(id) {
  deleteAttachmentsForOwner(id).catch(() => {});
  return commit((s) => store.deleteWithTombstone(s, 'notes', id), { immediate: true });
}

/**
 * Rename a note and rewrite every [[Old]] / [[Old|alias]] reference.
 * One commit; returns {note, updatedLinks:[{id, before, after}]}.
 */
export function renameNote(id, newTitle) {
  const title = String(newTitle || '').trim();
  return commit((s) => {
    const note = (s.notes || []).find((n) => n.id === id);
    if (!note || !title) return { note: note || null, updatedLinks: [] };
    const oldTitle = note.title;
    if (!oldTitle || normNote(oldTitle) === normNote(title)) return { note, updatedLinks: [] };
    const updatedLinks = [];
    for (const n of s.notes || []) {
      const before = n.body || '';
      const after = rewriteWikiTargets(before, oldTitle, title);
      if (after !== before) {
        updatedLinks.push({ id: n.id, before, after });
        n.body = after;
        n.updatedAt = Date.now();
      }
    }
    note.title = title;
    note.updatedAt = Date.now();
    return { note, updatedLinks };
  });
}

/**
 * Apply body patches in one commit. Accepts a Map, a plain object
 * {id: body}, or an array [{id, body}]. Used to link unlinked
 * mentions and to undo rename rewrites.
 */
export function applyNoteBodies(patch) {
  let entries;
  if (patch instanceof Map) entries = [...patch.entries()];
  else if (Array.isArray(patch)) entries = patch.map((p) => [p.id, p.body ?? p.after]);
  else if (patch && typeof patch === 'object') entries = Object.entries(patch);
  else return null;
  const wanted = new Map(entries.map(([k, v]) => [k, String(v ?? '')]));
  return commit((s) => {
    const touched = [];
    for (const n of s.notes || []) {
      if (!wanted.has(n.id)) continue;
      n.body = wanted.get(n.id);
      n.updatedAt = Date.now();
      touched.push(n);
    }
    return touched;
  });
}

/* ------------------------------------------------------------------ */
/* Homework                                                            */
/* ------------------------------------------------------------------ */

/** Materialize at most one next instance for a completed recurring item. */
function scheduleNextOccurrence(state, hw) {
  const next = nextInstanceToAdd(state, hw);
  return next ? store.addEntity(state, 'homework', next) : null;
}

export function createHomework(data = {}) {
  return commit((s) => {
    const entity = store.addEntity(s, 'homework', {
      moduleId: data.moduleId || null,
      topicId: data.topicId || null,
      title: String(data.title || '').trim(),
      dueDate: data.dueDate || null,
      done: false,
      doneAt: null,
      recurrence: null,
    });
    entity.recurrence = normalizeRecurrence(data.recurrence, entity.id);
    return entity;
  });
}

export function updateHomework(id, patch) {
  return commit((s) => {
    const before = (s.homework || []).find((h) => h.id === id);
    const wasDone = !!before?.done;
    const entity = store.updateEntity(s, 'homework', id, patch);
    if (!entity) return null;
    if ('recurrence' in patch) {
      entity.recurrence = normalizeRecurrence(patch.recurrence, entity.id);
    }
    if (typeof patch.done === 'boolean') {
      entity.doneAt = patch.done ? Date.now() : null;
      if (patch.done && !wasDone && entity.recurrence) scheduleNextOccurrence(s, entity);
    }
    return entity;
  });
}

export function toggleHomework(id) {
  return commit((s) => {
    const hw = (s.homework || []).find((h) => h.id === id);
    if (!hw) return null;
    const wasDone = !!hw.done;
    hw.done = !hw.done;
    hw.doneAt = hw.done ? Date.now() : null;
    hw.updatedAt = Date.now();
    if (hw.done && !wasDone && hw.recurrence) scheduleNextOccurrence(s, hw);
    return hw;
  });
}

export function deleteHomework(id) {
  return commit((s) => store.deleteWithTombstone(s, 'homework', id));
}

/** Undo a delete by re-inserting the entity and clearing its tombstone. */
export function restoreEntity(collection, entity) {
  if (!collection || !entity) return null;
  return commit((s) => store.restoreEntity(s, collection, entity));
}

/**
 * Capture a module plus every child record before deleting it, so a cascade
 * delete can be undone. Attachment files are not included (they are removed
 * from the device by `deleteModule`).
 */
export function snapshotModule(id) {
  const state = get(appState);
  const mod = (state.modules || []).find((m) => m.id === id);
  if (!mod) return null;
  const collections = ['topics', 'notes', 'homework', 'exams', 'links', 'lessons'];
  return {
    module: { ...mod },
    children: Object.fromEntries(
      collections.map((coll) => [
        coll,
        (state[coll] || []).filter((entity) => entity.moduleId === id).map((entity) => ({ ...entity })),
      ]),
    ),
  };
}

/** Restore a snapshot taken by `snapshotModule` (undo a module delete). */
export function restoreModuleSnapshot(snapshot) {
  if (!snapshot?.module) return null;
  const restored = restoreEntity('modules', snapshot.module);
  for (const [coll, entities] of Object.entries(snapshot.children || {})) {
    for (const entity of entities) restoreEntity(coll, entity);
  }
  return restored;
}

/* ------------------------------------------------------------------ */
/* Exams                                                               */
/* ------------------------------------------------------------------ */

export function createExam(data = {}) {
  return commit((s) =>
    store.addEntity(s, 'exams', {
      moduleId: data.moduleId || null,
      topicIds: Array.isArray(data.topicIds) ? data.topicIds : [],
      title: String(data.title || '').trim(),
      date: data.date || '',
      notes: String(data.notes || ''),
      grade: null,
      gradeNote: '',
    }),
  );
}

export function updateExam(id, patch) {
  return commit((s) => store.updateEntity(s, 'exams', id, patch));
}

export function deleteExam(id) {
  return commit((s) => store.deleteWithTombstone(s, 'exams', id));
}

/* ------------------------------------------------------------------ */
/* Links / lessons                                                     */
/* ------------------------------------------------------------------ */

export function createLink(data = {}) {
  return commit((s) =>
    store.addEntity(s, 'links', {
      moduleId: data.moduleId || null,
      label: String(data.label || '').trim(),
      url: String(data.url || '').trim(),
      kind: data.kind || 'custom',
      order: (s.links || []).filter((l) => (l.moduleId || null) === (data.moduleId || null)).length,
    }),
  );
}

export function updateLink(id, patch) {
  return commit((s) => store.updateEntity(s, 'links', id, patch));
}

export function deleteLink(id) {
  return commit((s) => store.deleteWithTombstone(s, 'links', id));
}

export function createLesson(data = {}) {
  return commit((s) =>
    store.addEntity(s, 'lessons', {
      dayOfWeek: Number(data.dayOfWeek) || 1,
      start: data.start || '08:00',
      end: data.end || '09:00',
      moduleId: data.moduleId || null,
      label: String(data.label || '').trim(),
      room: String(data.room || '').trim(),
    }),
  );
}

export function updateLesson(id, patch) {
  return commit((s) => store.updateEntity(s, 'lessons', id, patch));
}

export function deleteLesson(id) {
  return commit((s) => store.deleteWithTombstone(s, 'lessons', id));
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

export function toggleChecklistItem(item) {
  const today = todayKey();
  return commit((s) => store.setChecklistItem(s, item, !item.checked, today));
}

export function addChecklistItem(text) {
  return commit((s) => store.addChecklistItem(s, text));
}

export function deleteChecklistItem(id) {
  return commit((s) => store.deleteChecklistItem(s, id));
}

/* ------------------------------------------------------------------ */
/* Settings / backup                                                   */
/* ------------------------------------------------------------------ */

export function updateSettings(patch) {
  const result = commit((s) => {
    s.settings = { ...s.settings, ...patch, updatedAt: Date.now() };
    return s.settings;
  });
  if ('theme' in patch) applyTheme(patch.theme);
  return result;
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const resolved =
    theme === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme === 'dark'
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) =>
    meta.setAttribute('content', resolved === 'dark' ? '#0e0f12' : '#f5f5f7'),
  );
}

export function exportBackup() {
  const state = get(appState);
  store.markExported(state);
  appState.set({ ...state });
  persist(state, true);
  return store.serializeData(state);
}

export function importBackup(jsonString) {
  const result = store.importData(jsonString);
  if (!result.success) return result;
  replaceState(result.data);
  applyTheme(result.data.settings.theme);
  return result;
}

export async function resetAll() {
  clearAllAttachments().catch(() => {});
  const fresh = store.clearAll();
  replaceState(fresh);
  applyTheme(fresh.settings.theme);
  return fresh;
}

/* ------------------------------------------------------------------ */
/* Derived selectors                                                     */
/* ------------------------------------------------------------------ */

export const startHere = derived(appState, ($s) => pickStartHere($s));
export const todayChecklist = derived(appState, ($s) => checklistForDay($s));
export const deadlines = derived(appState, ($s) => upcomingDeadlines($s));
export const openHomework = derived(appState, ($s) => openHomeworkList($s));
export const doneHomework = derived(appState, ($s) => doneHomeworkList($s));
export const recentNotes = derived(appState, ($s) =>
  [...($s.notes || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5),
);
export const modulesByProgram = derived(appState, ($s) => {
  const map = new Map();
  for (const p of $s.programs || []) map.set(p.id, []);
  for (const m of $s.modules || []) {
    if (!map.has(m.programId)) map.set(m.programId, []);
    map.get(m.programId).push(m);
  }
  for (const list of map.values()) list.sort((a, b) => (a.order || 0) - (b.order || 0));
  return map;
});
export const backupReminder = derived(appState, ($s) => store.needsBackupReminder($s));

export function moduleById(state, id) {
  return (state.modules || []).find((m) => m.id === id) || null;
}

export function programById(state, id) {
  return (state.programs || []).find((p) => p.id === id) || null;
}

export function moduleTitle(state, id) {
  const m = moduleById(state, id);
  return m ? m.title || m.code : '';
}

export function moduleCounts(state, moduleId) {
  return {
    homework: (state.homework || []).filter((h) => h.moduleId === moduleId && !h.done).length,
    notes: (state.notes || []).filter((n) => n.moduleId === moduleId).length,
    exams: (state.exams || []).filter((e) => e.moduleId === moduleId).length,
  };
}