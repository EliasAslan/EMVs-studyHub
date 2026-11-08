/**
 * Explicit cloud field mapping for the v3 schema.
 *
 * Pure functions only: camelCase app state <-> snake_case Supabase rows.
 * No client, no network, no storage. user_id is never emitted by toRow and
 * always stripped by fromRow.
 */

import { normalizeRecurrence } from '../data/recurrence.js';

export const COLLECTIONS = Object.freeze([
  'programs',
  'modules',
  'topics',
  'notes',
  'homework',
  'exams',
  'links',
  'lessons',
  'checklistItems',
  'settings',
]);

/** Parent-first upload order (FK-safe). Settings last. */
export const UPLOAD_ORDER = COLLECTIONS;

export const TABLE_FOR_COLLECTION = Object.freeze({
  programs: 'programs',
  modules: 'modules',
  topics: 'topics',
  notes: 'notes',
  homework: 'homework',
  exams: 'exams',
  links: 'links',
  lessons: 'lessons',
  checklistItems: 'checklist_items',
  settings: 'user_settings',
});

export const COLLECTION_FOR_TABLE = Object.freeze(
  Object.fromEntries(Object.entries(TABLE_FOR_COLLECTION).map(([c, t]) => [t, c])),
);

const ENTITY_COLLECTIONS = COLLECTIONS.filter((c) => c !== 'settings');

function num(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function emptyToNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

function nullToEmpty(v) {
  return v === null || v === undefined ? '' : v;
}

/** Attachment metadata only; blobs never leave IndexedDB. */
function attachmentMeta(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    id: str(a.id),
    name: str(a.name),
    type: str(a.type),
    size: num(a.size),
    createdAt: num(a.createdAt),
  };
}

function attachments(a) {
  return arr(a).map(attachmentMeta).filter(Boolean);
}

// ---------------------------------------------------------------------------
// toRow: app item -> Supabase row (without user_id)
// ---------------------------------------------------------------------------

function programToRow(p) {
  return {
    id: str(p?.id),
    name: str(p?.name),
    code: str(p?.code),
    accent: str(p?.accent, '#4f46e5'),
    sort_order: num(p?.order),
    created_at: num(p?.createdAt),
    updated_at: num(p?.updatedAt),
    deleted_at: null,
  };
}

function moduleToRow(m) {
  return {
    id: str(m?.id),
    program_id: str(m?.programId),
    code: str(m?.code),
    title: str(m?.title),
    accent: str(m?.accent, '#4f46e5'),
    sort_order: num(m?.order),
    attachments: attachments(m?.attachments),
    overview_note_id: emptyToNull(m?.overviewNoteId),
    created_at: num(m?.createdAt),
    updated_at: num(m?.updatedAt),
    deleted_at: null,
  };
}

function topicToRow(t) {
  return {
    id: str(t?.id),
    module_id: str(t?.moduleId),
    name: str(t?.name),
    sort_order: num(t?.order),
    created_at: num(t?.createdAt),
    updated_at: num(t?.updatedAt),
    deleted_at: null,
  };
}

function noteToRow(n) {
  return {
    id: str(n?.id),
    module_id: emptyToNull(n?.moduleId),
    topic_id: emptyToNull(n?.topicId),
    title: str(n?.title),
    body: str(n?.body),
    type: str(n?.type, 'note'),
    attachments: attachments(n?.attachments),
    created_at: num(n?.createdAt),
    updated_at: num(n?.updatedAt),
    deleted_at: null,
  };
}

function recurrenceToRow(value) {
  const rule = normalizeRecurrence(value);
  if (!rule) return null;
  return {
    freq: rule.freq,
    interval: rule.interval,
    until: rule.until,
    seriesId: rule.seriesId,
  };
}

function homeworkToRow(h) {
  return {
    id: str(h?.id),
    module_id: emptyToNull(h?.moduleId),
    topic_id: emptyToNull(h?.topicId),
    title: str(h?.title),
    due_date: emptyToNull(h?.dueDate),
    done: !!h?.done,
    done_at: numOrNull(h?.doneAt),
    recurrence: recurrenceToRow(h?.recurrence),
    created_at: num(h?.createdAt),
    updated_at: num(h?.updatedAt),
    deleted_at: null,
  };
}

function examToRow(e) {
  return {
    id: str(e?.id),
    module_id: emptyToNull(e?.moduleId),
    topic_ids: arr(e?.topicIds),
    title: str(e?.title),
    date: emptyToNull(e?.date),
    notes: str(e?.notes),
    grade: numOrNull(e?.grade),
    grade_note: str(e?.gradeNote),
    created_at: num(e?.createdAt),
    updated_at: num(e?.updatedAt),
    deleted_at: null,
  };
}

function linkToRow(l) {
  return {
    id: str(l?.id),
    module_id: emptyToNull(l?.moduleId),
    label: str(l?.label),
    url: str(l?.url),
    kind: str(l?.kind, 'custom'),
    sort_order: num(l?.order),
    created_at: num(l?.createdAt),
    updated_at: num(l?.updatedAt),
    deleted_at: null,
  };
}

function lessonToRow(l) {
  return {
    id: str(l?.id),
    day_of_week: num(l?.dayOfWeek, 1),
    start_time: str(l?.start, '08:00'),
    end_time: str(l?.end, '09:00'),
    module_id: emptyToNull(l?.moduleId),
    label: str(l?.label),
    room: str(l?.room),
    created_at: num(l?.createdAt),
    updated_at: num(l?.updatedAt),
    deleted_at: null,
  };
}

function checklistItemToRow(c) {
  return {
    id: str(c?.id),
    text: str(c?.text),
    kind: str(c?.kind, 'custom'),
    sort_order: num(c?.order),
    created_at: num(c?.createdAt),
    updated_at: num(c?.updatedAt),
    deleted_at: null,
  };
}

function settingsToRow(s) {
  return {
    theme: s?.theme === 'dark' ? 'dark' : 'light',
    nav_collapsed: !!s?.navCollapsed,
    email: str(s?.email),
    email_reminders: !!s?.emailReminders,
    last_export_at: numOrNull(s?.lastExportAt),
    change_count: num(s?.changeCount),
    current_program_id: emptyToNull(s?.currentProgramId),
    updated_at: num(s?.updatedAt),
  };
}

const TO_ROW = {
  programs: programToRow,
  modules: moduleToRow,
  topics: topicToRow,
  notes: noteToRow,
  homework: homeworkToRow,
  exams: examToRow,
  links: linkToRow,
  lessons: lessonToRow,
  checklistItems: checklistItemToRow,
  settings: settingsToRow,
};

export function toRow(collection, item) {
  const fn = TO_ROW[collection];
  if (!fn) throw new TypeError(`Unknown collection: ${collection}`);
  const row = fn(item || {});
  if ('user_id' in row) delete row.user_id;
  return row;
}

/** Minimal FK-safe row for a tombstone. */
export function tombstoneToRow(collection, tombstone) {
  const id = str(tombstone?.id);
  const deletedAt = num(tombstone?.deletedAt, Date.now());
  const base = { id, created_at: deletedAt, updated_at: deletedAt, deleted_at: deletedAt };
  switch (collection) {
    case 'programs':
      return { ...base, name: '', code: '', accent: '#4f46e5', sort_order: 0 };
    case 'modules':
      return {
        ...base,
        program_id: str(tombstone?.programId),
        code: '',
        title: '',
        accent: '#4f46e5',
        sort_order: 0,
        attachments: [],
        overview_note_id: null,
      };
    case 'topics':
      return { ...base, module_id: str(tombstone?.moduleId), name: '', sort_order: 0 };
    case 'notes':
      return {
        ...base,
        module_id: null,
        topic_id: null,
        title: '',
        body: '',
        type: 'note',
        attachments: [],
      };
    case 'homework':
      return {
        ...base,
        module_id: null,
        topic_id: null,
        title: '',
        due_date: null,
        done: false,
        done_at: null,
        recurrence: null,
      };
    case 'exams':
      return {
        ...base,
        module_id: null,
        topic_ids: [],
        title: '',
        date: null,
        notes: '',
        grade: null,
        grade_note: '',
      };
    case 'links':
      return { ...base, module_id: null, label: '', url: '', kind: 'custom', sort_order: 0 };
    case 'lessons':
      return {
        ...base,
        day_of_week: 1,
        start_time: '08:00',
        end_time: '09:00',
        module_id: null,
        label: '',
        room: '',
      };
    case 'checklistItems':
      return { ...base, text: '', kind: 'custom', sort_order: 0 };
    default:
      throw new TypeError(`Unknown collection: ${collection}`);
  }
}

// ---------------------------------------------------------------------------
// fromRow: Supabase row -> app item (strips user_id, never trusts it)
// ---------------------------------------------------------------------------

function rowToProgram(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    name: str(r?.name),
    code: str(r?.code),
    accent: str(r?.accent, '#4f46e5'),
    order: num(r?.sort_order),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToModule(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    programId: str(r?.program_id),
    code: str(r?.code),
    title: str(r?.title),
    accent: str(r?.accent, '#4f46e5'),
    order: num(r?.sort_order),
    attachments: attachments(r?.attachments),
    overviewNoteId: r?.overview_note_id ?? null,
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToTopic(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    moduleId: str(r?.module_id),
    name: str(r?.name),
    order: num(r?.sort_order),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToNote(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    moduleId: r?.module_id ?? null,
    topicId: r?.topic_id ?? null,
    title: str(r?.title),
    body: str(r?.body),
    type: str(r?.type, 'note'),
    attachments: attachments(r?.attachments),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToHomework(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    moduleId: r?.module_id ?? null,
    topicId: r?.topic_id ?? null,
    title: str(r?.title),
    dueDate: r?.due_date ?? null,
    done: !!r?.done,
    doneAt: r?.done_at ?? null,
    recurrence: normalizeRecurrence(r?.recurrence, r?.id),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToExam(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    moduleId: r?.module_id ?? null,
    topicIds: arr(r?.topic_ids),
    title: str(r?.title),
    date: nullToEmpty(r?.date),
    notes: str(r?.notes),
    grade: numOrNull(r?.grade),
    gradeNote: str(r?.grade_note),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToLink(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    moduleId: r?.module_id ?? null,
    label: str(r?.label),
    url: str(r?.url),
    kind: str(r?.kind, 'custom'),
    order: num(r?.sort_order),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToLesson(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    dayOfWeek: num(r?.day_of_week, 1),
    start: str(r?.start_time, '08:00'),
    end: str(r?.end_time, '09:00'),
    moduleId: r?.module_id ?? null,
    label: str(r?.label),
    room: str(r?.room),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToChecklistItem(r) {
  if (r?.deleted_at != null) {
    return { _tombstone: true, id: str(r?.id), deletedAt: num(r?.deleted_at) };
  }
  return {
    id: str(r?.id),
    text: str(r?.text),
    kind: str(r?.kind, 'custom'),
    order: num(r?.sort_order),
    createdAt: num(r?.created_at),
    updatedAt: num(r?.updated_at),
  };
}

function rowToSettings(r) {
  if (!r) return { theme: 'light' };
  return {
    theme: r.theme === 'dark' ? 'dark' : 'light',
    navCollapsed: !!r.nav_collapsed,
    email: str(r.email),
    emailReminders: !!r.email_reminders,
    lastExportAt: r.last_export_at ?? null,
    changeCount: num(r.change_count),
    currentProgramId: r.current_program_id ?? null,
    updatedAt: num(r.updated_at),
  };
}

const FROM_ROW = {
  programs: rowToProgram,
  modules: rowToModule,
  topics: rowToTopic,
  notes: rowToNote,
  homework: rowToHomework,
  exams: rowToExam,
  links: rowToLink,
  lessons: rowToLesson,
  checklistItems: rowToChecklistItem,
  settings: rowToSettings,
};

export function fromRow(collection, row) {
  const fn = FROM_ROW[collection];
  if (!fn) throw new TypeError(`Unknown collection: ${collection}`);
  return fn(row || {});
}

// ---------------------------------------------------------------------------
// Dataset helpers
// ---------------------------------------------------------------------------

/** Build one upload payload; live rows win over stale tombstones. */
export function toCloudDataset(localState) {
  const out = {};
  for (const collection of UPLOAD_ORDER) {
    const table = TABLE_FOR_COLLECTION[collection];
    if (collection === 'settings') {
      out[table] = [toRow('settings', localState?.settings || {})];
      continue;
    }
    const items = Array.isArray(localState?.[collection]) ? localState[collection] : [];
    const rows = items.map((item) => toRow(collection, item));
    const liveIds = new Set(items.map((item) => item?.id));
    const tombstones = (localState?.tombstones || []).filter(
      (t) => t?.collection === collection && !liveIds.has(t.id),
    );
    for (const tombstone of tombstones) rows.push(tombstoneToRow(collection, tombstone));
    out[table] = rows;
  }
  return out;
}

export function fromCloudDataset(tables) {
  const state = {
    programs: [],
    modules: [],
    topics: [],
    notes: [],
    homework: [],
    exams: [],
    links: [],
    lessons: [],
    checklistItems: [],
    tombstones: [],
    settings: { theme: 'light' },
  };
  for (const collection of COLLECTIONS) {
    const table = TABLE_FOR_COLLECTION[collection];
    const rows = tables?.[table];
    if (!Array.isArray(rows)) continue;
    if (collection === 'settings') {
      if (rows[0]) state.settings = fromRow('settings', rows[0]);
      continue;
    }
    for (const row of rows) {
      const item = fromRow(collection, row);
      if (item && item._tombstone) {
        state.tombstones.push({ collection, id: item.id, deletedAt: item.deletedAt });
      } else {
        state[collection].push(item);
      }
    }
  }
  return state;
}

/** Collections that carry user content; defaults alone do not count. */
const CONTENT_COLLECTIONS = Object.freeze([
  'modules',
  'topics',
  'notes',
  'homework',
  'exams',
  'links',
  'lessons',
]);

/** True when the dataset has no user content (defaults ignored). */
export function isEmptyDataset(state) {
  if (!state) return true;
  return CONTENT_COLLECTIONS.every((c) => !Array.isArray(state[c]) || state[c].length === 0);
}

export function countDataset(state) {
  const counts = {};
  let total = 0;
  for (const c of ENTITY_COLLECTIONS) {
    const n = Array.isArray(state?.[c]) ? state[c].length : 0;
    counts[c] = n;
    total += n;
  }
  counts.total = total;
  return counts;
}
