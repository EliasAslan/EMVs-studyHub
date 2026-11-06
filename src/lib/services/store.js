/**
 * Study Hub data store — persistence, tombstones and import/export.
 * Framework-free and DOM-free so Node tests can import it.
 */

import { activeAdapter, StorageError } from './storageAdapter.js';
import {
  SCHEMA_VERSION,
  NOTE_TYPES,
  LINK_KINDS,
  STUDIED_ID,
  defaultState,
  normalizeState,
} from '../data/entities.js';
import { isValidDateKey } from '../data/dates.js';

export const STORAGE_KEY = 'studyhub_v1';
export const TIMER_KEY = 'studyhub_timer_v1';
export const POMODORO_PREFS_KEY = 'studyhub_pomodoro_prefs_v1';
export const POMODORO_HISTORY_KEY = 'studyhub_pomodoro_history_v1';

let lastStorageError = null;

export function getStorageError() {
  return lastStorageError;
}

export function clearStorageError() {
  lastStorageError = null;
}

export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function getSeedData() {
  return defaultState();
}

/** Load state. A failed read never overwrites stored data and latches saves off. */
export function load() {
  let raw;
  try {
    raw = activeAdapter.getItem(STORAGE_KEY);
  } catch (e) {
    lastStorageError = e instanceof StorageError ? e : new StorageError(STORAGE_KEY, 'READ_FAILED', e);
    console.error('Failed to read stored data:', lastStorageError);
    return defaultState();
  }
  clearStorageError();

  if (raw === null) return defaultState();

  try {
    return normalizeState(raw);
  } catch (e) {
    lastStorageError = new StorageError(STORAGE_KEY, 'PARSE_FAILED', e);
    console.error('Failed to load data:', e);
    return defaultState();
  }
}

/** Returns true only when the write actually succeeded. Refused while latched. */
export function save(data) {
  if (lastStorageError) return false;
  try {
    return activeAdapter.setItem(STORAGE_KEY, data);
  } catch (e) {
    console.error('Failed to save data:', e);
    return false;
  }
}

export function clearAll() {
  clearStorageError();
  activeAdapter.removeItem(STORAGE_KEY);
  activeAdapter.removeItem(TIMER_KEY);
  return defaultState();
}

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export function touch(entity, now = Date.now()) {
  if (entity) entity.updatedAt = now;
  return entity;
}

export function addEntity(state, collection, data, now = Date.now()) {
  const entity = {
    id: data.id || generateId(),
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  if (!state[collection]) state[collection] = [];
  state[collection].push(entity);
  return entity;
}

export function updateEntity(state, collection, id, patch, now = Date.now()) {
  const entity = (state[collection] || []).find((e) => e.id === id);
  if (!entity) return null;
  Object.assign(entity, patch, { updatedAt: now });
  return entity;
}

function tombstone(state, collection, id, now) {
  if (!Array.isArray(state.tombstones)) state.tombstones = [];
  state.tombstones.push({ collection, id, deletedAt: now });
}

/**
 * Delete an entity and add a tombstone. Deleting a module cascades to every
 * child record. Returns the deleted entity, or null.
 */
export function deleteWithTombstone(state, collection, id, now = Date.now()) {
  const arr = state[collection];
  if (!Array.isArray(arr)) return null;
  const idx = arr.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const [deleted] = arr.splice(idx, 1);
  tombstone(state, collection, id, now);

  if (collection === 'modules') {
    const children = ['topics', 'notes', 'homework', 'exams', 'links', 'lessons'];
    for (const coll of children) {
      const list = state[coll];
      if (!Array.isArray(list)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].moduleId === id) {
          tombstone(state, coll, list[i].id, now);
          list.splice(i, 1);
        }
      }
    }
  }

  if (collection === 'topics') {
    for (const n of state.notes || []) if (n.topicId === id) n.topicId = null;
    for (const h of state.homework || []) if (h.topicId === id) h.topicId = null;
    for (const e of state.exams || []) {
      if (Array.isArray(e.topicIds)) e.topicIds = e.topicIds.filter((t) => t !== id);
    }
  }

  return deleted;
}

/** Re-insert a deleted entity and clear its tombstone (undo). */
export function restoreEntity(state, collection, entity, now = Date.now()) {
  if (!entity) return null;
  if (!Array.isArray(state[collection])) state[collection] = [];
  const copy = { ...entity, updatedAt: now };
  state[collection].push(copy);
  state.tombstones = (state.tombstones || []).filter(
    (t) => !(t.collection === collection && t.id === entity.id),
  );
  return copy;
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

function ensureChecklistDay(state, today) {
  if (!state.checklist || state.checklist.date !== today) {
    state.checklist = { date: today, checked: {} };
  }
  if (!state.checklist.checked) state.checklist.checked = {};
  return state.checklist;
}

/**
 * Toggle a checklist item. Homework items flip `done`; custom/studied items
 * store a per-day check. A new day starts with an empty check set.
 */
export function setChecklistItem(state, item, checked, today, now = Date.now()) {
  if (!item) return state;
  if (item.kind === 'homework' && item.homeworkId) {
    const hw = (state.homework || []).find((h) => h.id === item.homeworkId);
    if (hw) {
      hw.done = !!checked;
      hw.doneAt = checked ? now : null;
      hw.updatedAt = now;
    }
    return state;
  }
  const box = ensureChecklistDay(state, today);
  if (checked) box.checked[item.id] = true;
  else delete box.checked[item.id];
  return state;
}

export function addChecklistItem(state, text, now = Date.now()) {
  const value = String(text || '').trim();
  if (!value) return null;
  const order = Math.max(0, ...(state.checklistItems || []).map((c) => c.order || 0)) + 1;
  return addEntity(state, 'checklistItems', { text: value, kind: 'custom', order }, now);
}

export function deleteChecklistItem(state, id, now = Date.now()) {
  if (id === STUDIED_ID) return false;
  return !!deleteWithTombstone(state, 'checklistItems', id, now);
}

/* ------------------------------------------------------------------ */
/* Backup reminder                                                     */
/* ------------------------------------------------------------------ */

export function markChanged(state, now = Date.now()) {
  state.settings = state.settings || {};
  state.settings.changeCount = (state.settings.changeCount || 0) + 1;
  state.settings.lastChangeAt = now;
  return state.settings.changeCount;
}

export function markExported(state, now = Date.now()) {
  state.settings = state.settings || {};
  state.settings.lastExportAt = now;
  state.settings.changeCount = 0;
  return state;
}

export const BACKUP_REMINDER_AFTER = 25;

export function needsBackupReminder(state) {
  return (state.settings?.changeCount || 0) >= BACKUP_REMINDER_AFTER;
}

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */

export function serializeData(state) {
  return JSON.stringify(state, null, 2);
}

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function cleanId(id, fallback) {
  return typeof id === 'string' && ID_RE.test(id) ? id : fallback;
}

function cleanText(value, max = 20000) {
  return String(value ?? '').slice(0, max);
}

function cleanDate(value) {
  return typeof value === 'string' && isValidDateKey(value) ? value : null;
}

function cleanTimestamp(value, fallback = Date.now()) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Parse and sanitize an exported JSON backup. Returns
 * `{success:true,data}` or `{success:false,error}`. Unknown fields are dropped.
 */
export function importData(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { success: false, error: 'Datei ist kein gültiges JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { success: false, error: 'Backup hat ein unbekanntes Format.' };
  }

  try {
    const now = Date.now();
    const state = defaultState();
    state.schemaVersion = SCHEMA_VERSION;

    const programs = Array.isArray(parsed.programs) ? parsed.programs : [];
    state.programs = programs.length
      ? programs.map((p, i) => ({
          id: cleanId(p?.id, `program-import-${i}`),
          name: cleanText(p?.name, 80),
          code: cleanText(p?.code, 20),
          accent: /^#[0-9a-fA-F]{6}$/.test(p?.accent) ? p.accent : '#4f46e5',
          order: Number.isFinite(p?.order) ? p.order : i,
          createdAt: cleanTimestamp(p?.createdAt, now),
          updatedAt: cleanTimestamp(p?.updatedAt, now),
        }))
      : defaultState().programs;

    const programIds = new Set(state.programs.map((p) => p.id));
    const moduleIds = new Set();

    state.modules = (Array.isArray(parsed.modules) ? parsed.modules : []).map((m, i) => {
      const id = cleanId(m?.id, `module-import-${i}`);
      moduleIds.add(id);
      return {
        id,
        programId: programIds.has(m?.programId) ? m.programId : state.programs[0]?.id || 'program-emvs',
        code: cleanText(m?.code, 20),
        title: cleanText(m?.title, 120),
        accent: /^#[0-9a-fA-F]{6}$/.test(m?.accent) ? m.accent : '#4f46e5',
        order: Number.isFinite(m?.order) ? m.order : i,
        attachments: Array.isArray(m?.attachments) ? m.attachments : [],
        createdAt: cleanTimestamp(m?.createdAt, now),
        updatedAt: cleanTimestamp(m?.updatedAt, now),
      };
    });

    const topicIds = new Set();
    state.topics = (Array.isArray(parsed.topics) ? parsed.topics : [])
      .filter((t) => moduleIds.has(t?.moduleId))
      .map((t, i) => {
        const id = cleanId(t?.id, `topic-import-${i}`);
        topicIds.add(id);
        return {
          id,
          moduleId: t.moduleId,
          name: cleanText(t?.name, 80),
          order: Number.isFinite(t?.order) ? t.order : i,
          createdAt: cleanTimestamp(t?.createdAt, now),
          updatedAt: cleanTimestamp(t?.updatedAt, now),
        };
      });

    state.notes = (Array.isArray(parsed.notes) ? parsed.notes : []).map((n, i) => ({
      id: cleanId(n?.id, `note-import-${i}`),
      moduleId: moduleIds.has(n?.moduleId) ? n.moduleId : null,
      topicId: topicIds.has(n?.topicId) ? n.topicId : null,
      title: cleanText(n?.title, 200),
      body: cleanText(n?.body, 50000),
      type: NOTE_TYPES.includes(n?.type) ? n.type : 'note',
      attachments: Array.isArray(n?.attachments) ? n.attachments : [],
      createdAt: cleanTimestamp(n?.createdAt, now),
      updatedAt: cleanTimestamp(n?.updatedAt, now),
    }));

    state.homework = (Array.isArray(parsed.homework) ? parsed.homework : []).map((h, i) => ({
      id: cleanId(h?.id, `hw-import-${i}`),
      moduleId: moduleIds.has(h?.moduleId) ? h.moduleId : null,
      topicId: topicIds.has(h?.topicId) ? h.topicId : null,
      title: cleanText(h?.title, 200),
      dueDate: cleanDate(h?.dueDate),
      done: !!h?.done,
      doneAt: h?.done ? cleanTimestamp(h?.doneAt, now) : null,
      createdAt: cleanTimestamp(h?.createdAt, now),
      updatedAt: cleanTimestamp(h?.updatedAt, now),
    }));

    state.exams = (Array.isArray(parsed.exams) ? parsed.exams : []).map((e, i) => {
      const grade = typeof e?.grade === 'number' && e.grade >= 1 && e.grade <= 6 ? e.grade : null;
      return {
        id: cleanId(e?.id, `exam-import-${i}`),
        moduleId: moduleIds.has(e?.moduleId) ? e.moduleId : null,
        topicIds: Array.isArray(e?.topicIds) ? e.topicIds.filter((t) => topicIds.has(t)) : [],
        title: cleanText(e?.title, 200),
        date: cleanDate(e?.date) || '',
        notes: cleanText(e?.notes, 20000),
        grade,
        gradeNote: cleanText(e?.gradeNote, 2000),
        createdAt: cleanTimestamp(e?.createdAt, now),
        updatedAt: cleanTimestamp(e?.updatedAt, now),
      };
    });

    state.links = (Array.isArray(parsed.links) ? parsed.links : []).map((l, i) => ({
      id: cleanId(l?.id, `link-import-${i}`),
      moduleId: moduleIds.has(l?.moduleId) ? l.moduleId : null,
      label: cleanText(l?.label, 120),
      url: cleanText(l?.url, 1000),
      kind: LINK_KINDS.includes(l?.kind) ? l.kind : 'custom',
      order: Number.isFinite(l?.order) ? l.order : i,
      createdAt: cleanTimestamp(l?.createdAt, now),
      updatedAt: cleanTimestamp(l?.updatedAt, now),
    }));

    state.lessons = (Array.isArray(parsed.lessons) ? parsed.lessons : []).map((l, i) => ({
      id: cleanId(l?.id, `lesson-import-${i}`),
      dayOfWeek: Math.min(7, Math.max(1, Number(l?.dayOfWeek) || 1)),
      start: /^\d{2}:\d{2}$/.test(l?.start) ? l.start : '08:00',
      end: /^\d{2}:\d{2}$/.test(l?.end) ? l.end : '09:00',
      moduleId: moduleIds.has(l?.moduleId) ? l.moduleId : null,
      label: cleanText(l?.label, 120),
      room: cleanText(l?.room, 60),
      createdAt: cleanTimestamp(l?.createdAt, now),
      updatedAt: cleanTimestamp(l?.updatedAt, now),
    }));

    state.checklistItems = (Array.isArray(parsed.checklistItems) ? parsed.checklistItems : [])
      .filter((c) => c?.id !== STUDIED_ID)
      .map((c, i) => ({
        id: cleanId(c?.id, `check-import-${i}`),
        text: cleanText(c?.text, 160),
        kind: 'custom',
        order: Number.isFinite(c?.order) ? c.order : i,
        createdAt: cleanTimestamp(c?.createdAt, now),
        updatedAt: cleanTimestamp(c?.updatedAt, now),
      }));

    state.tombstones = (Array.isArray(parsed.tombstones) ? parsed.tombstones : []).filter(
      (t) => t && typeof t.collection === 'string' && typeof t.id === 'string',
    );

    state.settings = {
      ...defaultState().settings,
      ...(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}),
    };

    return { success: true, data: normalizeState(state) };
  } catch (e) {
    return { success: false, error: `Backup konnte nicht gelesen werden: ${e.message}` };
  }
}

/* ------------------------------------------------------------------ */
/* Timer / Pomodoro preferences                                        */
/* ------------------------------------------------------------------ */

export function saveTimerState(timerState) {
  if (lastStorageError) return false;
  try {
    return activeAdapter.setItem(TIMER_KEY, timerState);
  } catch (e) {
    console.error('Failed to save timer state:', e);
    return false;
  }
}

export function loadTimerState() {
  try {
    return activeAdapter.getItem(TIMER_KEY);
  } catch (e) {
    console.error('Failed to load timer state:', e);
    return null;
  }
}

export function clearTimerState() {
  activeAdapter.removeItem(TIMER_KEY);
}

export const DEFAULT_POMODORO_PREFS = Object.freeze({
  sound: true,
  notificationsAsked: false,
  breakActivities: true,
  showStatistics: true,
});

export function loadPomodoroPrefs() {
  try {
    const raw = activeAdapter.getItem(POMODORO_PREFS_KEY);
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_POMODORO_PREFS };
    return { ...DEFAULT_POMODORO_PREFS, ...raw };
  } catch {
    return { ...DEFAULT_POMODORO_PREFS };
  }
}

export function savePomodoroPrefs(prefs) {
  try {
    return activeAdapter.setItem(POMODORO_PREFS_KEY, prefs);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Pomodoro session history load                                     */
/* ------------------------------------------------------------------ */

export function loadPomodoroHistoryState() {
  try {
    let raw = activeAdapter.getItem(POMODORO_HISTORY_KEY);
    // Older builds double-encoded the payload; accept and repair it.
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        return defaultPomodoroHistory();
      }
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sessions)) return defaultPomodoroHistory();
    return {
      sessions: raw.sessions.slice(0, MAX_SESSION_HISTORY),
      lastSessionId: raw.lastSessionId ?? raw.sessions[0]?.id ?? null,
    };
  } catch {
    return defaultPomodoroHistory();
  }
}

export function savePomodoroHistoryState(state) {
  try {
    const sessions = (state?.sessions || []).slice(0, MAX_SESSION_HISTORY);
    return activeAdapter.setItem(POMODORO_HISTORY_KEY, {
      sessions,
      lastSessionId: state?.lastSessionId ?? sessions[0]?.id ?? null,
    });
  } catch {
    return false;
  }
}

export function clearPomodoroHistory() {
  try {
    return activeAdapter.removeItem(POMODORO_HISTORY_KEY);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Pomodoro session history (IndexedDB-backed)                        */
/* ------------------------------------------------------------------ */

export const MAX_SESSION_HISTORY = 50;

export function defaultPomodoroHistory() {
  return {
    sessions: [],
    lastSessionId: null,
  };
}

export function addPomodoroSession(state, session) {
  const sessions = [...(state?.sessions || [])];
  sessions.unshift(session); // newest first
  if (sessions.length > MAX_SESSION_HISTORY) {
    sessions.length = MAX_SESSION_HISTORY;
  }
  return {
    ...state,
    sessions,
    lastSessionId: session.id,
  };
}

export function getTodaySessions(state) {
  const sessions = state?.sessions || [];
  const today = new Date().toDateString();
  return sessions.filter((s) => new Date(s.startedAt).toDateString() === today);
}

export function getLastWeekSessions(state) {
  const sessions = state?.sessions || [];
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => Number(s.startedAt) >= weekAgo);
}

/** Aggregate completed rounds, focus time and breaks for a session list. */
export function summarizeSessions(sessions = []) {
  const work = sessions.filter((s) => s.phase === 'work' && s.status === 'workDone');
  const breaks = sessions.filter((s) => s.phase !== 'work' && s.status === 'breakDone');
  const focusMinutes = work.reduce((sum, s) => sum + (Number(s.durationMs) || 0), 0) / 60_000;
  return {
    workRounds: work.length,
    focusMinutes: Math.round(focusMinutes),
    breaks: breaks.length,
    averageDuration: work.length > 0 ? Math.round(focusMinutes / work.length) : 0,
  };
}

export function getSessionStats(state) {
  const sessions = state?.sessions || [];
  const summary = summarizeSessions(sessions);
  return {
    total: sessions.length,
    completedWorkMinutes: summary.focusMinutes,
    completedBreaks: summary.breaks,
    averageDuration: summary.averageDuration,
    completedWorkRounds: summary.workRounds,
  };
}
