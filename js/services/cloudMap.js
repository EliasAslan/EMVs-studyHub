/**
 * Explicit cloud field mapping (Phase 5.3).
 *
 * Pure functions only: camelCase app state <-> snake_case Supabase rows.
 * No Supabase client, no network, no storage access here.
 *
 * Authoritative schema: PHASE_4_SETUP.sql.
 * - Composite PKs (user_id, id); user_id is NEVER read from app data.
 *   toRow() never emits user_id; fromRow() always strips it.
 * - IDs preserved byte-for-byte; history JSON / arrays passed verbatim.
 */

export const COLLECTIONS = Object.freeze([
  'modules',
  'learningObjectives',
  'resources',
  'studySessions',
  'exams',
  'examResults',
  'planItems',
  'captures',
  'weeklyReviews',
  'settings',
]);

/** Parent-first upload order (FK-safe). settings last (no FK). */
export const UPLOAD_ORDER = Object.freeze([
  'modules',
  'learningObjectives',
  'resources',
  'studySessions',
  'exams',
  'examResults',
  'planItems',
  'captures',
  'weeklyReviews',
  'settings',
]);

export const TABLE_FOR_COLLECTION = Object.freeze({
  modules: 'modules',
  learningObjectives: 'learning_objectives',
  resources: 'resources',
  studySessions: 'study_sessions',
  exams: 'exams',
  examResults: 'exam_results',
  planItems: 'plan_items',
  captures: 'captures',
  weeklyReviews: 'weekly_reviews',
  settings: 'user_settings',
});

export const COLLECTION_FOR_TABLE = Object.freeze(
  Object.fromEntries(
    Object.entries(TABLE_FOR_COLLECTION).map(([c, t]) => [t, c])),
);

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

// ---------------------------------------------------------------------------
// toRow: app item -> Supabase row (without user_id)
// ---------------------------------------------------------------------------

function modulesToRow(m) {
  return {
    id: str(m?.id),
    code: str(m?.code),
    title: str(m?.title),
    accent: typeof m?.accent === 'string' ? m.accent : '#b45309',
    target_grade: typeof m?.targetGrade === 'number' ? m.targetGrade : 5.0,
    created_at: num(m?.createdAt, Date.now()),
    updated_at: num(m?.updatedAt, Date.now()),
  };
}

function objectivesToRow(o) {
  return {
    id: str(o?.id),
    module_id: str(o?.moduleId),
    number: num(o?.number),
    title: str(o?.title),
    description: str(o?.description),
    status: str(o?.status, 'todo'),
    confidence: num(o?.confidence),
    notes: str(o?.notes),
    confidence_history: arr(o?.confidenceHistory),
    session_history: arr(o?.sessionHistory),
    review_history: arr(o?.reviewHistory),
    last_touched: num(o?.lastTouched, Date.now()),
    last_reviewed: numOrNull(o?.lastReviewed),
    total_study_time: num(o?.totalStudyTime),
    review_schedule: o?.reviewSchedule ?? null,
    created_at: num(o?.createdAt, Date.now()),
    updated_at: num(o?.updatedAt, Date.now()),
  };
}

function resourcesToRow(r) {
  return {
    id: str(r?.id),
    module_id: str(r?.moduleId),
    name: str(r?.name),
    type: str(r?.type, 'Video'),
    focus: typeof r?.focus === 'string' ? r.focus : '70',
    status: str(r?.status, 'todo'),
    url: str(r?.url),
    linked_objective_ids: arr(r?.linkedObjectiveIds),
    notes: str(r?.notes),
    usage_history: arr(r?.usageHistory),
    understood: !!r?.understood,
    understood_at: numOrNull(r?.understoodAt),
    understood_history: arr(r?.understoodHistory),
    last_used: numOrNull(r?.lastUsed),
    created_at: num(r?.createdAt, Date.now()),
    updated_at: num(r?.updatedAt, Date.now()),
  };
}

function sessionsToRow(s) {
  return {
    id: str(s?.id),
    module_id: str(s?.moduleId),
    start_time: str(s?.startTime),
    duration: num(s?.duration, 30),
    linked_objective_ids: arr(s?.linkedObjectiveIds),
    linked_resource_ids: arr(s?.linkedResourceIds),
    note: str(s?.note),
    created_at: num(s?.createdAt, Date.now()),
    updated_at: num(s?.updatedAt, Date.now()),
  };
}

function examScoreToText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string') return v;
  return '';
}

function examsToRow(e) {
  return {
    id: str(e?.id),
    module_id: str(e?.moduleId),
    name: str(e?.name),
    date: emptyToNull(e?.date),
    weight: num(e?.weight),
    score: examScoreToText(e?.score),
    max: examScoreToText(e?.max),
    linked_objective_ids: arr(e?.linkedObjectiveIds),
    objective_results: arr(e?.objectiveResults),
    description: str(e?.description),
    is_mock: !!e?.isMock,
    duration_min: numOrNull(e?.durationMin),
    created_at: num(e?.createdAt, Date.now()),
    updated_at: num(e?.updatedAt, Date.now()),
  };
}

function examResultsToRow(r) {
  return {
    id: str(r?.id),
    exam_id: str(r?.examId),
    module_id: str(r?.moduleId),
    score: numOrNull(r?.score),
    max: numOrNull(r?.max),
    grade: numOrNull(r?.grade),
    date: emptyToNull(r?.date),
    objective_results: arr(r?.objectiveResults),
    notes: str(r?.notes),
    created_at: num(r?.createdAt, Date.now()),
    // NOTE: exam_results has no updated_at column; app updatedAt is dropped.
  };
}

function planItemsToRow(p) {
  return {
    id: str(p?.id),
    module_id: str(p?.moduleId),
    week: num(p?.week, 1),
    title: str(p?.title),
    text: str(p?.text),
    type: str(p?.type, 'task'),
    linked_objective_ids: arr(p?.linkedObjectiveIds),
    linked_resource_ids: arr(p?.linkedResourceIds),
    done: !!p?.done,
    dropped: !!p?.dropped,
    notes: str(p?.notes),
    due_date: emptyToNull(p?.dueDate),
    created_at: num(p?.createdAt, Date.now()),
    updated_at: num(p?.updatedAt, Date.now()),
  };
}

function capturesToRow(c) {
  return {
    id: str(c?.id),
    module_id: emptyToNull(c?.moduleId),
    objective_id: emptyToNull(c?.objectiveId),
    type: str(c?.type, 'thought'),
    content: str(c?.content),
    tags: arr(c?.tags),
    timestamp: str(c?.timestamp),
    created_at: num(c?.createdAt, Date.now()),
    updated_at: num(c?.updatedAt, Date.now()),
  };
}

function reviewsToRow(r) {
  return {
    id: str(r?.id),
    week: num(r?.week, 1),
    year: num(r?.year, new Date().getFullYear()),
    module_id: emptyToNull(r?.moduleId),
    module_title: str(r?.moduleTitle),
    went_well: str(r?.wentWell),
    didnt_work: str(r?.didntWork),
    next_week: str(r?.nextWeek),
    learned: str(r?.learned),
    adjustments: str(r?.adjustments),
    study_time: num(r?.studyTime),
    sessions_count: num(r?.sessionsCount),
    objectives_reviewed: num(r?.objectivesReviewed),
    created_at: num(r?.createdAt, Date.now()),
    updated_at: num(r?.updatedAt, Date.now()),
  };
}

function settingsToRow(s) {
  return {
    theme: s?.theme === 'dark' ? 'dark' : 'light',
    current_module_id: emptyToNull(s?.currentModuleId),
    updated_at: num(s?.updatedAt, Date.now()),
  };
}

const TO_ROW = {
  modules: modulesToRow,
  learningObjectives: objectivesToRow,
  resources: resourcesToRow,
  studySessions: sessionsToRow,
  exams: examsToRow,
  examResults: examResultsToRow,
  planItems: planItemsToRow,
  captures: capturesToRow,
  weeklyReviews: reviewsToRow,
  settings: settingsToRow,
};

export function toRow(collection, item) {
  const fn = TO_ROW[collection];
  if (!fn) throw new TypeError(`Unknown collection: ${collection}`);
  const row = fn(item || {});
  // user_id is session-derived only; never accept it from app data.
  if ('user_id' in row) delete row.user_id;
  return row;
}

// ---------------------------------------------------------------------------
// fromRow: Supabase row -> app item (strips user_id, never trusts it)
// ---------------------------------------------------------------------------

function rowToModule(r) {
  return {
    id: str(r?.id),
    code: str(r?.code),
    title: str(r?.title),
    accent: typeof r?.accent === 'string' ? r.accent : '#b45309',
    targetGrade: typeof r?.target_grade === 'number' ? r.target_grade : 5.0,
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function rowToObjective(r) {
  return {
    id: str(r?.id),
    moduleId: str(r?.module_id),
    number: num(r?.number),
    title: str(r?.title),
    description: str(r?.description),
    status: str(r?.status, 'todo'),
    confidence: num(r?.confidence),
    notes: str(r?.notes),
    confidenceHistory: arr(r?.confidence_history),
    sessionHistory: arr(r?.session_history),
    reviewHistory: arr(r?.review_history),
    lastTouched: num(r?.last_touched, 0),
    lastReviewed: r?.last_reviewed ?? null,
    totalStudyTime: num(r?.total_study_time),
    reviewSchedule: r?.review_schedule ?? null,
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function rowToResource(r) {
  return {
    id: str(r?.id),
    moduleId: str(r?.module_id),
    name: str(r?.name),
    type: str(r?.type, 'Video'),
    focus: typeof r?.focus === 'string' ? r.focus : '70',
    status: str(r?.status, 'todo'),
    url: str(r?.url),
    linkedObjectiveIds: arr(r?.linked_objective_ids),
    notes: str(r?.notes),
    usageHistory: arr(r?.usage_history),
    understood: !!r?.understood,
    understoodAt: r?.understood_at ?? null,
    understoodHistory: arr(r?.understood_history),
    lastUsed: r?.last_used ?? null,
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function rowToSession(r) {
  return {
    id: str(r?.id),
    moduleId: str(r?.module_id),
    startTime: str(r?.start_time),
    duration: num(r?.duration, 0),
    linkedObjectiveIds: arr(r?.linked_objective_ids),
    linkedResourceIds: arr(r?.linked_resource_ids),
    note: str(r?.note),
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function examTextToScore(text, isMock) {
  if (text === null || text === undefined || text === '') return '';
  if (!isMock) return String(text);
  // M3: mock numeric score/max round-trip restores numbers.
  const n = Number(text);
  return text !== '' && Number.isFinite(n) && String(text).trim() !== '' ? n : String(text);
}

function rowToExam(r) {
  const isMock = !!r?.is_mock;
  return {
    id: str(r?.id),
    moduleId: str(r?.module_id),
    name: str(r?.name),
    date: nullToEmpty(r?.date),
    weight: num(r?.weight),
    score: examTextToScore(r?.score, isMock),
    max: examTextToScore(r?.max, isMock),
    linkedObjectiveIds: arr(r?.linked_objective_ids),
    objectiveResults: arr(r?.objective_results),
    description: str(r?.description),
    isMock,
    durationMin: r?.duration_min ?? null,
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function rowToExamResult(r) {
  return {
    id: str(r?.id),
    examId: str(r?.exam_id),
    moduleId: str(r?.module_id),
    score: r?.score ?? null,
    max: r?.max ?? null,
    grade: r?.grade ?? null,
    date: r?.date ?? null,
    objectiveResults: arr(r?.objective_results),
    notes: str(r?.notes),
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.created_at, 0),
  };
}

function rowToPlanItem(r) {
  return {
    id: str(r?.id),
    moduleId: str(r?.module_id),
    week: num(r?.week, 1),
    title: str(r?.title),
    text: str(r?.text),
    type: str(r?.type, 'task'),
    linkedObjectiveIds: arr(r?.linked_objective_ids),
    linkedResourceIds: arr(r?.linked_resource_ids),
    done: !!r?.done,
    dropped: !!r?.dropped,
    notes: str(r?.notes),
    dueDate: r?.due_date ?? null,
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function rowToCapture(r) {
  return {
    id: str(r?.id),
    moduleId: r?.module_id ?? null,
    objectiveId: r?.objective_id ?? null,
    type: str(r?.type, 'thought'),
    content: str(r?.content),
    tags: arr(r?.tags),
    timestamp: str(r?.timestamp),
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function rowToReview(r) {
  return {
    id: str(r?.id),
    week: num(r?.week, 1),
    year: num(r?.year, new Date().getFullYear()),
    moduleId: r?.module_id ?? null,
    moduleTitle: str(r?.module_title),
    wentWell: str(r?.went_well),
    didntWork: str(r?.didnt_work),
    nextWeek: str(r?.next_week),
    learned: str(r?.learned),
    adjustments: str(r?.adjustments),
    studyTime: num(r?.study_time),
    sessionsCount: num(r?.sessions_count),
    objectivesReviewed: num(r?.objectives_reviewed),
    createdAt: num(r?.created_at, 0),
    updatedAt: num(r?.updated_at, 0),
  };
}

function rowToSettings(r) {
  if (!r) return { theme: 'light', currentModuleId: null };
  return {
    theme: r.theme === 'dark' ? 'dark' : 'light',
    currentModuleId: r.current_module_id ?? null,
    updatedAt: num(r.updated_at, 0),
  };
}

const FROM_ROW = {
  modules: rowToModule,
  learningObjectives: rowToObjective,
  resources: rowToResource,
  studySessions: rowToSession,
  exams: rowToExam,
  examResults: rowToExamResult,
  planItems: rowToPlanItem,
  captures: rowToCapture,
  weeklyReviews: rowToReview,
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

export function toCloudDataset(localState) {
  const out = {};
  for (const collection of UPLOAD_ORDER) {
    const table = TABLE_FOR_COLLECTION[collection];
    if (collection === 'settings') {
      const settings = localState?.settings || { theme: 'light', currentModuleId: null };
      out[table] = [toRow('settings', settings)];
    } else {
      const items = Array.isArray(localState?.[collection]) ? localState[collection] : [];
      out[table] = items.map((item) => toRow(collection, item));
    }
  }
  return out;
}

export function fromCloudDataset(tables) {
  const state = {
    modules: [],
    learningObjectives: [],
    resources: [],
    studySessions: [],
    exams: [],
    examResults: [],
    planItems: [],
    captures: [],
    weeklyReviews: [],
    settings: { theme: 'light', currentModuleId: null },
  };
  for (const collection of COLLECTIONS) {
    const table = TABLE_FOR_COLLECTION[collection];
    const rows = tables?.[table];
    if (!Array.isArray(rows)) continue;
    if (collection === 'settings') {
      if (rows[0]) state.settings = fromRow('settings', rows[0]);
    } else {
      state[collection] = rows.map((row) => fromRow(collection, row));
    }
  }
  return state;
}

/** True when every collection array is empty (settings ignored). */
export function isEmptyDataset(state) {
  if (!state) return true;
  return COLLECTIONS.filter((c) => c !== 'settings')
    .every((c) => !Array.isArray(state[c]) || state[c].length === 0);
}

export function countDataset(state) {
  const counts = {};
  let total = 0;
  for (const c of COLLECTIONS.filter((x) => x !== 'settings')) {
    const n = Array.isArray(state?.[c]) ? state[c].length : 0;
    counts[c] = n;
    total += n;
  }
  counts.total = total;
  return counts;
}
