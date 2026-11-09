/**
 * Entity defaults and idempotent normalizers.
 * Pure and DOM-free so Node tests can import them.
 */

import { normalizeRecurrence } from './recurrence.js';

export const SCHEMA_VERSION = 1;

export const NOTE_TYPES = ['note', 'mistake', 'question', 'summary'];
export const LINK_KINDS = ['teams', 'onenote', 'website', 'youtube', 'custom'];
export const CHECKLIST_KINDS = ['custom', 'studied'];
export const STUDIED_ID = 'studied';

export const DEFAULT_PROGRAMS = [
  { id: 'program-emvs', name: 'EMVs', code: 'EMVs', accent: '#4f46e5', order: 0 },
  { id: 'program-bm', name: 'BM', code: 'BM', accent: '#0f766e', order: 1 },
];

export function defaultSettings() {
  return {
    theme: 'light',
    navCollapsed: false,
    email: '',
    emailReminders: false,
    remindersDay: 5,
    remindersContent: 'todo',
    lastExportAt: null,
    changeCount: 0,
    currentProgramId: 'program-emvs',
    updatedAt: 0,
  };
}

export function defaultState() {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    programs: DEFAULT_PROGRAMS.map((p) => ({ ...p, createdAt: now, updatedAt: now })),
    modules: [],
    topics: [],
    notes: [],
    homework: [],
    exams: [],
    links: [],
    lessons: [],
    checklistItems: [
      { id: STUDIED_ID, text: 'studiert heute', kind: 'studied', order: 0, createdAt: now, updatedAt: now },
    ],
    checklist: { date: null, checked: {} },
    tombstones: [],
    settings: defaultSettings(),
  };
}

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function bool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function ensureProgram(p, now = Date.now()) {
  if (!p) return p;
  p.name = str(p.name);
  p.code = str(p.code, p.name);
  p.accent = str(p.accent, '#4f46e5');
  p.order = num(p.order, 0);
  p.createdAt = num(p.createdAt, now);
  p.updatedAt = num(p.updatedAt, p.createdAt);
  return p;
}

export function ensureModule(m, now = Date.now()) {
  if (!m) return m;
  m.programId = m.programId || 'program-emvs';
  m.code = str(m.code);
  m.title = str(m.title);
  m.accent = str(m.accent, '#4f46e5');
  m.order = num(m.order, 0);
  m.attachments = arr(m.attachments);
  m.overviewNoteId =
    typeof m.overviewNoteId === 'string' && m.overviewNoteId ? m.overviewNoteId : null;
  m.createdAt = num(m.createdAt, now);
  m.updatedAt = num(m.updatedAt, m.createdAt);
  return m;
}

export function ensureTopic(t, now = Date.now()) {
  if (!t) return t;
  t.moduleId = t.moduleId || null;
  t.name = str(t.name);
  t.order = num(t.order, 0);
  t.createdAt = num(t.createdAt, now);
  t.updatedAt = num(t.updatedAt, t.createdAt);
  return t;
}

export function ensureNote(n, now = Date.now()) {
  if (!n) return n;
  n.moduleId = n.moduleId || null;
  n.topicId = n.topicId || null;
  n.title = str(n.title);
  n.body = str(n.body);
  n.type = NOTE_TYPES.includes(n.type) ? n.type : 'note';
  n.attachments = arr(n.attachments);
  n.createdAt = num(n.createdAt, now);
  n.updatedAt = num(n.updatedAt, n.createdAt);
  return n;
}

export function ensureHomework(h, now = Date.now()) {
  if (!h) return h;
  h.moduleId = h.moduleId || null;
  h.topicId = h.topicId || null;
  h.title = str(h.title);
  h.dueDate = str(h.dueDate) || null;
  h.done = bool(h.done);
  h.doneAt = h.done ? num(h.doneAt, now) : null;
  h.recurrence = normalizeRecurrence(h.recurrence, h.id);
  h.createdAt = num(h.createdAt, now);
  h.updatedAt = num(h.updatedAt, h.createdAt);
  return h;
}

export function ensureExam(e, now = Date.now()) {
  if (!e) return e;
  e.moduleId = e.moduleId || null;
  e.topicIds = arr(e.topicIds).filter((id) => typeof id === 'string');
  e.title = str(e.title);
  e.date = str(e.date);
  e.notes = str(e.notes);
  e.grade = typeof e.grade === 'number' && Number.isFinite(e.grade) ? e.grade : null;
  e.gradeNote = str(e.gradeNote);
  e.createdAt = num(e.createdAt, now);
  e.updatedAt = num(e.updatedAt, e.createdAt);
  return e;
}

export function ensureLink(l, now = Date.now()) {
  if (!l) return l;
  l.moduleId = l.moduleId || null;
  l.label = str(l.label);
  l.url = str(l.url);
  l.kind = LINK_KINDS.includes(l.kind) ? l.kind : 'custom';
  l.order = num(l.order, 0);
  l.createdAt = num(l.createdAt, now);
  l.updatedAt = num(l.updatedAt, l.createdAt);
  return l;
}

export function ensureLesson(l, now = Date.now()) {
  if (!l) return l;
  l.dayOfWeek = Math.min(7, Math.max(1, num(l.dayOfWeek, 1)));
  l.start = str(l.start, '08:00');
  l.end = str(l.end, '09:00');
  l.moduleId = l.moduleId || null;
  l.label = str(l.label);
  l.room = str(l.room);
  l.createdAt = num(l.createdAt, now);
  l.updatedAt = num(l.updatedAt, l.createdAt);
  return l;
}

export function ensureChecklistItem(c, now = Date.now()) {
  if (!c) return c;
  c.text = str(c.text);
  c.kind = CHECKLIST_KINDS.includes(c.kind) ? c.kind : 'custom';
  c.order = num(c.order, 0);
  c.createdAt = num(c.createdAt, now);
  c.updatedAt = num(c.updatedAt, c.createdAt);
  return c;
}

export function ensureSettings(s = {}) {
  return { ...defaultSettings(), ...(s && typeof s === 'object' ? s : {}) };
}

/** Normalize a whole state object in place and return it. Idempotent. */
export function normalizeState(input = {}) {
  const now = Date.now();
  const state = {
    ...defaultState(),
    ...input,
    programs: arr(input.programs),
    modules: arr(input.modules),
    topics: arr(input.topics),
    notes: arr(input.notes),
    homework: arr(input.homework),
    exams: arr(input.exams),
    links: arr(input.links),
    lessons: arr(input.lessons),
    checklistItems: arr(input.checklistItems),
    tombstones: arr(input.tombstones),
    settings: ensureSettings(input.settings),
  };

  if (!state.programs.length) {
    state.programs = DEFAULT_PROGRAMS.map((p) => ({ ...p, createdAt: now, updatedAt: now }));
  }
  if (!state.checklistItems.some((c) => c.id === STUDIED_ID)) {
    state.checklistItems.unshift({
      id: STUDIED_ID,
      text: 'studiert heute',
      kind: 'studied',
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  state.programs.forEach((p) => ensureProgram(p, now));
  state.modules.forEach((m) => ensureModule(m, now));
  state.topics.forEach((t) => ensureTopic(t, now));
  state.notes.forEach((n) => ensureNote(n, now));
  state.homework.forEach((h) => ensureHomework(h, now));
  state.exams.forEach((e) => ensureExam(e, now));
  state.links.forEach((l) => ensureLink(l, now));
  state.lessons.forEach((l) => ensureLesson(l, now));
  state.checklistItems.forEach((c) => ensureChecklistItem(c, now));

  const checklist = input.checklist && typeof input.checklist === 'object' ? input.checklist : {};
  state.checklist = {
    date: typeof checklist.date === 'string' ? checklist.date : null,
    checked: checklist.checked && typeof checklist.checked === 'object' ? { ...checklist.checked } : {},
  };

  // Drop overview references whose note was deleted or moved to another module.
  const notesById = new Map(state.notes.map((n) => [n.id, n]));
  for (const m of state.modules) {
    if (!m.overviewNoteId) continue;
    const note = notesById.get(m.overviewNoteId);
    if (!note || note.moduleId !== m.id) m.overviewNoteId = null;
  }

  const ninetyDays = 90 * 86400000;
  state.tombstones = state.tombstones.filter(
    (t) => t && typeof t.deletedAt === 'number' && now - t.deletedAt < ninetyDays,
  );

  return state;
}
