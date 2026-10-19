/**
 * EMVS Data Store - Core persistence and data model
 * Local-first, no backend required
 * Stable IDs for all entities to survive editing, export/import, reordering
 */

export const STORAGE_KEY = 'emvs_data_v1';
export const TIMER_KEY = 'emvs_timer_v1';
const MIGRATION_KEY = 'emvs_schema_version';
const CURRENT_SCHEMA_VERSION = 1;

import { activeAdapter, readLegacyStorage, StorageError } from './storageAdapter.js';
import { RESOURCE_TYPES, CAPTURE_TYPES, PLAN_ITEM_TYPES } from '../utils/helpers.js';

/**
 * Last storage read failure observed by load().
 * Null means the most recent load saw no read failure.
 * Lets the UI distinguish "no data yet" (null + first-run data) from
 * "data exists but is unreadable" (non-null + blank safe data) without
 * risking the stored value: load() never writes.
 */
let lastStorageError = null;

export function getStorageError() {
  return lastStorageError;
}

export function clearStorageError() {
  lastStorageError = null;
}

/**
 * Generate a stable, unique ID
 * Uses timestamp + random for collision resistance
 */
export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Deep clone an object
 */
export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Default/seed data structure
 */
export function getSeedData() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    modules: [],
    learningObjectives: [],
    resources: [],
    studySessions: [],
    exams: [],
    examResults: [],
    planItems: [],
    captures: [],
    weeklyReviews: [],
    tombstones: [],
    settings: {
      theme: 'light',
      currentModuleId: null,
    }
  };
}

/**
 * ISO week without importing utils (store stays dependency-free).
 */
function getIsoWeekFallback(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - fday + 3);
  return 1 + Math.round((d - first) / 6048e5);
}

/**
 * Load data from localStorage with migration support.
 *
 * Three outcomes, kept strictly apart:
 * - key missing → existing first-run path (legacy migration or demo seed).
 * - key present and valid → normalized data.
 * - read access failure or invalid JSON → blank seed WITHOUT demo data,
 *   recorded via getStorageError(). The stored value is never written,
 *   so corrupt data survives for inspection/recovery instead of being
 *   replaced by demo content.
 */
export function load() {
  let raw;
  try {
    raw = activeAdapter.getItem(STORAGE_KEY);
  } catch (e) {
    lastStorageError = e instanceof StorageError
      ? e
      : new StorageError(STORAGE_KEY, 'READ_FAILED', e);
    console.error('Failed to read stored data:', lastStorageError);
    return getSeedData();
  }
  clearStorageError();
  try {
    if (raw === null) {
      // True first run: honour legacy data if present, else demo seed.
      const migrated = migrateFromLegacy({});
      const hasContent = migrated.modules.length || migrated.learningObjectives.length ||
        migrated.studySessions.length || migrated.exams.length;
      if (hasContent) {
        migrated.learningObjectives.forEach(ensureObjectiveFields);
        migrated.exams.forEach(ensureExamFields);
        migrated.resources.forEach(ensureResourceFields);
        migrated.planItems.forEach(ensurePlanItemFields);
        return migrated;
      }
      // First run with empty storage → guided first-run (blank seed, no demo data)
      return getSeedData();
    }
    
    // raw is already parsed by the adapter
    const parsed = raw;
    
    // Migration logic here if schema version changes
    const version = parsed.schemaVersion || 0;
    if (version < CURRENT_SCHEMA_VERSION) {
      return migrate(parsed, version);
    }
    
    // Ensure all arrays exist (backwards compatibility)
    const normalized = {
      ...getSeedData(),
      ...parsed,
      modules: parsed.modules || [],
      learningObjectives: parsed.learningObjectives || [],
      resources: parsed.resources || [],
      studySessions: parsed.studySessions || [],
      exams: parsed.exams || [],
      examResults: parsed.examResults || [],
      planItems: parsed.planItems || [],
      captures: parsed.captures || [],
      weeklyReviews: parsed.weeklyReviews || [],
      tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
      settings: { ...getSeedData().settings, ...parsed.settings }
    };
    // Prune tombstones older than 90 days (90 * 24 * 60 * 60 * 1000 = 7,776,000,000 ms)
    const now = Date.now();
    const ninetyDaysMs = 90 * 86400000;
    normalized.tombstones = normalized.tombstones.filter(t => now - t.deletedAt < ninetyDaysMs);
    // History-first: every objective carries review/session/confidence history.
    normalized.learningObjectives.forEach(ensureObjectiveFields);
    // Diagnosis: every exam carries per-objective results.
    normalized.exams.forEach(ensureExamFields);
    // Library: every resource tracks use (used) separately from understanding.
    normalized.resources.forEach(ensureResourceFields);
    // Adaptive plan: items carry notes + dropped state.
    normalized.planItems.forEach(ensurePlanItemFields);
    return normalized;
  } catch (e) {
    console.error('Failed to load data:', e);
    return getSeedData();
  }
}

/**
 * Save data to localStorage.
 * Returns the adapter result verbatim: true only when the write
 * actually succeeded, false on quota errors or access failures.
 * Never reports success when the underlying write failed.
 *
 * Safety latch: while a storage read failure is recorded (see load()),
 * saves are refused with `false` and nothing is written, so ordinary
 * app saves cannot overwrite data that failed to load. The latch clears
 * on the next successful load, on an explicit reset (clearAll), or when
 * the user knowingly replaces storage (backup import clears it first).
 */
export function save(data) {
  if (lastStorageError) return false;
  try {
    return activeAdapter.setItem(STORAGE_KEY, data);
  } catch (e) {
    console.error('Failed to save data:', e);
    return false;
  }
}

/**
 * Migration function for schema upgrades
 */
function migrate(data, fromVersion) {
  let migrated = { ...data, schemaVersion: CURRENT_SCHEMA_VERSION };
  
  // Migration from v0 (old EMVS/StudyForge format) to v1
  if (fromVersion === 0 || !data.schemaVersion) {
    migrated = migrateFromLegacy(migrated);
  }
  
  return migrated;
}

/**
 * Migrate from legacy EMVS/StudyForge format
 */
function migrateFromLegacy(data) {
  const legacyKey = 'emvs_hub_v4_editorial';
  const legacyKey2 = 'sf_tracker_v5';
  
  // Try to load legacy data
  let legacy = null;
  try {
    const raw1 = readLegacyStorage(legacyKey);
    const raw2 = readLegacyStorage(legacyKey2);
    const raw = raw1 || raw2;
    if (raw) legacy = JSON.parse(raw);
  } catch {}
  
  if (!legacy) return { ...getSeedData(), schemaVersion: CURRENT_SCHEMA_VERSION };
  
  const migrated = getSeedData();
  migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
  
  // Migrate modules
  if (legacy.modules) {
    migrated.modules = legacy.modules.map(m => ({
      id: m.id,
      code: m.code || '',
      title: m.title || '',
      accent: m.accent || '#b45309',
      targetGrade: typeof m.target === 'number' ? m.target : 5.0,
      createdAt: m.createdAt || Date.now(),
      updatedAt: Date.now()
    }));
    
    if (migrated.modules.length > 0) {
      migrated.settings.currentModuleId = migrated.modules[0].id;
    }
  }
  
  // Migrate handlungsziele -> learningObjectives
  if (legacy.handlungsziele) {
    migrated.learningObjectives = legacy.handlungsziele.map(h => ensureObjectiveFields({
      id: h.id,
      moduleId: h.moduleId,
      number: h.num || 0,
      title: h.title || '',
      description: '',
      status: h.status || 'todo', // todo, in-progress, done
      confidence: typeof h.confidence === 'number' ? h.confidence : 0, // 0-5
      notes: h.notes || '',
      // History fields
      confidenceHistory: [],
      lastTouched: h.updatedAt || Date.now(),
      lastReviewed: null,
      totalStudyTime: 0, // minutes
      reviewHistory: [],
      reviewSchedule: null, // { interval: days, nextReview: date, reviewCount }
      sessionHistory: [],
      createdAt: h.createdAt || Date.now(),
      updatedAt: Date.now()
    }));
  }
  
  // Migrate resources
  if (legacy.resources) {
    migrated.resources = legacy.resources.map(r => ensureResourceFields({
      id: r.id,
      moduleId: r.moduleId,
      name: r.name || '',
      type: r.type || 'Other', // Video, Exercise, Dataset, Project, Cheat Sheet, Article, Book, Other
      focus: r.focus || '70', // '70' or '30' or custom
      status: r.status || 'todo', // todo, in-progress, done (workflow; independent of understood)
      url: r.url || '',
      linkedObjectiveIds: [], // New field - will be populated manually
      notes: r.notes || '',
      createdAt: r.createdAt || Date.now(),
      updatedAt: Date.now()
    }));
  }
  
  // Migrate exams
  if (legacy.exams) {
    migrated.exams = legacy.exams.map(e => ensureExamFields({
      id: e.id,
      moduleId: e.moduleId,
      name: e.name || '',
      date: e.date || '',
      weight: typeof e.weight === 'number' ? e.weight : 0,
      // New fields
      linkedObjectiveIds: [],
      description: '',
      createdAt: e.createdAt || Date.now(),
      updatedAt: Date.now()
    }));
    
    // Migrate exam scores -> examResults
    legacy.exams.forEach(e => {
      if (e.score !== '' && e.max !== '' && e.score !== null && e.max !== null) {
        const score = parseFloat(e.score);
        const max = parseFloat(e.max);
        if (!isNaN(score) && !isNaN(max) && max > 0) {
          migrated.examResults.push({
            id: generateId(),
            examId: e.id,
            moduleId: e.moduleId,
            score,
            max,
            grade: 1 + 5 * (score / max),
            date: e.date || new Date().toISOString().slice(0, 10),
            objectiveResults: [], // Per-objective breakdown (new)
            notes: '',
            createdAt: Date.now()
          });
        }
      }
    });
  }
  
  // Migrate studyPlan -> planItems
  if (legacy.studyPlan) {
    Object.entries(legacy.studyPlan).forEach(([moduleId, weeks]) => {
      Object.entries(weeks).forEach(([weekKey, weekData]) => {
        const weekNum = parseInt(weekKey.replace('w', '')) || 1;
        weekData.items?.forEach(item => {
          migrated.planItems.push(ensurePlanItemFields({
            id: item.id || generateId(),
            moduleId,
            week: weekNum,
            title: weekData.title || `Week ${weekNum}`,
            text: item.text || '',
            type: 'task', // task, milestone, review
            linkedObjectiveIds: [],
            linkedResourceIds: [],
            done: item.done || false,
            dueDate: null,
            createdAt: item.createdAt || Date.now(),
            updatedAt: Date.now()
          }));
        });
      });
    });
  }
  
  // Migrate sessions -> studySessions
  if (legacy.sessions) {
    migrated.studySessions = legacy.sessions.map(s => ({
      id: s.id,
      moduleId: s.mod || s.moduleId,
      startTime: s.date ? new Date(s.date + 'T' + (s.time || '08:00')).toISOString() : new Date().toISOString(),
      duration: typeof s.min === 'number' ? s.min : 30, // minutes
      linkedObjectiveIds: s.topic ? findObjectiveIdsByTopic(migrated.learningObjectives, s.topic) : [],
      linkedResourceIds: [],
      note: s.note || '',
      createdAt: s.createdAt || Date.now(),
      updatedAt: Date.now()
    }));
  }
  
  // Initialize empty arrays for new entities
  migrated.captures = [];
  migrated.weeklyReviews = [];
  
  return migrated;
}

/**
 * Spaced resurfacing — "things marked done first are often forgotten first".
 *
 * Deterministic progression in days. The interval for the NEXT review is
 * derived from the objective's own review history: the more reviews already
 * completed, the longer the next gap. A shaky/failed review steps one rung
 * back down the ladder instead of advancing.
 *
 *   review #1 (mark understood) → review in 1 day
 *   review #2 → in 4 days → #3 in 10 → #4 in 21 → #5 in 45 → #6+ in 90
 */
export const REVIEW_INTERVALS = [1, 4, 10, 21, 45, 90];
export const DAY_MS = 86400000;

export function reviewIntervalFor(completedReviews) {
  const idx = Math.max(0, Math.min(completedReviews, REVIEW_INTERVALS.length - 1));
  return REVIEW_INTERVALS[idx];
}

/**
 * Push entry to array, keeping at most `max` entries (drop oldest).
 * Only trims when length exceeds max — no-op for typical sizes.
 */
export function pushCapped(arr, entry, max = 100) {
  arr.push(entry);
  if (arr.length > max) {
    // drop oldest entries
    const excess = arr.length - max;
    arr.splice(0, excess);
  }
}

/**
 * Delete an entity by adding a tombstone and removing it from the collection.
 * @param {Object} state - The app state
 * @param {string} collection - Collection name (e.g., 'modules', 'learningObjectives')
 * @param {string} id - Entity ID to delete
 * @returns {boolean} True if entity was found and deleted
 */
export function deleteWithTombstone(state, collection, id) {
  const arr = state[collection];
  if (!Array.isArray(arr)) return false;
  const idx = arr.findIndex(e => e.id === id);
  if (idx === -1) return false;
  const deleted = arr[idx];
  const now = Date.now();
  // Add tombstone
  if (!Array.isArray(state.tombstones)) state.tombstones = [];
  pushCapped(state.tombstones, { collection, id, deletedAt: now });
  // Remove entity
  arr.splice(idx, 1);
  // Run cleanup for cross-references
  if (collection === 'modules') {
    // Tombstone all children of this module
    const childCollections = [
      'learningObjectives', 'resources', 'studySessions', 'exams',
      'planItems', 'captures', 'weeklyReviews'
    ];
    for (const childColl of childCollections) {
      const children = state[childColl];
      if (Array.isArray(children)) {
        for (let i = children.length - 1; i >= 0; i--) {
          if (children[i].moduleId === id) {
            pushCapped(state.tombstones, { collection: childColl, id: children[i].id, deletedAt: now });
            children.splice(i, 1);
          }
        }
      }
    }
  }
  return true;
}

/**
 * Ensure every history/review field exists on an objective.
 * Safe to call repeatedly (load, import, recalculate).
 */
export function ensureObjectiveFields(obj) {
  const now = Date.now();
  if (!obj) return obj;
  if (!Array.isArray(obj.confidenceHistory)) obj.confidenceHistory = [];
  if (!Array.isArray(obj.sessionHistory)) obj.sessionHistory = [];
  if (!Array.isArray(obj.reviewHistory)) obj.reviewHistory = [];
  if (typeof obj.totalStudyTime !== 'number') obj.totalStudyTime = 0;
  if (!('lastTouched' in obj) || typeof obj.lastTouched !== 'number') {
    obj.lastTouched = obj.updatedAt || obj.createdAt || now;
  }
  if (!('lastReviewed' in obj)) obj.lastReviewed = null;
  if (!('reviewSchedule' in obj)) obj.reviewSchedule = null;
  if (obj.reviewSchedule && typeof obj.reviewSchedule.nextReview !== 'number') {
    obj.reviewSchedule = null;
  }
  // Legacy data: a reviewSchedule without history — keep the schedule,
  // seed reviewCount from the interval position so progression continues.
  if (obj.reviewSchedule && typeof obj.reviewSchedule.reviewCount !== 'number') {
    const pos = REVIEW_INTERVALS.indexOf(obj.reviewSchedule.interval);
    obj.reviewSchedule.reviewCount = pos >= 0 ? Math.max(0, pos) : 0;
  }
  return obj;
}

/**
 * Schedule the NEXT review for an objective, advancing along REVIEW_INTERVALS
 * based on how many reviews are already in reviewHistory.
 * Returns the new reviewSchedule.
 */
export function scheduleNextReview(obj, now = Date.now()) {
  ensureObjectiveFields(obj);
  const completed = obj.reviewHistory.length;
  const interval = reviewIntervalFor(completed);
  obj.reviewSchedule = {
    interval,
    nextReview: now + interval * DAY_MS,
    reviewCount: completed,
  };
  obj.updatedAt = now;
  return obj.reviewSchedule;
}

/**
 * Record a completed review. `outcome` is 'solid' | 'shaky' | 'lost'.
 * The new gap is fully determined by reviewHistory: solid advances one rung
 * up REVIEW_INTERVALS, shaky repeats the current rung, lost steps one rung back.
 */
export function recordReview(obj, outcome = 'solid', note = '') {
  const now = Date.now();
  ensureObjectiveFields(obj);
  const before = obj.reviewHistory.length;
  const promised = obj.reviewSchedule?.interval ?? reviewIntervalFor(before);
  let interval;
  if (outcome === 'lost') interval = reviewIntervalFor(Math.max(0, before - 1));
  else if (outcome === 'shaky') interval = promised;
  else interval = reviewIntervalFor(before);
  const entry = {
    timestamp: now,
    outcome,
    interval,
    promisedInterval: promised,
    nextReview: now + interval * DAY_MS,
  };
  if (note) entry.note = note;
  pushCapped(obj.reviewHistory, entry);
  obj.lastReviewed = now;
  obj.lastTouched = now;
  obj.updatedAt = now;
  obj.reviewSchedule = {
    interval,
    nextReview: entry.nextReview,
    reviewCount: obj.reviewHistory.length,
  };
  return entry;
}

/**
 * Mark an objective as understood/done WITHOUT retiring it.
 * It stays visible and gets its first (or next) scheduled resurfacing.
 * If it already has a schedule, keep it — done means "resting until review".
 * Does NOT modify confidence or confidenceHistory — human judgment is preserved.
 */
export function markUnderstood(obj, now = Date.now()) {
  ensureObjectiveFields(obj);
  if (obj.status !== 'done') {
    obj.status = 'done';
  }
  if (!obj.reviewSchedule?.nextReview) {
    scheduleNextReview(obj, now);
  }
  obj.lastTouched = now;
  obj.updatedAt = now;
  return obj.reviewSchedule;
}

/**
 * Reopen a resting objective back into active work. History and schedule
 * are kept — reopening does not erase when it was last understood.
 */
export function reopenObjective(obj) {
  ensureObjectiveFields(obj);
  obj.status = 'in-progress';
  obj.updatedAt = Date.now();
  return obj;
}

export function isObjectiveDue(obj, now = Date.now()) {
  return !!(obj?.reviewSchedule?.nextReview && obj.reviewSchedule.nextReview <= now);
}

/**
 * All objectives whose nextReview is due, oldest first.
 * Includes status === 'done': understood objectives resurface here instead
 * of disappearing.
 */
export function getDueObjectives(state, moduleId = null, now = Date.now()) {
  return state.learningObjectives
    .filter(o => (moduleId ? o.moduleId === moduleId : true) && isObjectiveDue(o, now))
    .sort((a, b) => (a.reviewSchedule.nextReview - b.reviewSchedule.nextReview));
}
/**
 * Library model — used ≠ understood.
 *
 * "Used" means the material was opened/worked with (a session linked it, or
 * the user marked it as used). It says nothing about comprehension.
 * "Understood" is an explicit, separate user judgment and is NEVER set
 * automatically by usage.
 */
export function ensureResourceFields(res) {
  if (!res) return res;
  if (!Array.isArray(res.linkedObjectiveIds)) res.linkedObjectiveIds = [];
  if (!Array.isArray(res.usageHistory)) res.usageHistory = [];
  if (!Array.isArray(res.understoodHistory)) res.understoodHistory = [];
  if (typeof res.understood !== 'boolean') res.understood = false;
  if (!('understoodAt' in res)) res.understoodAt = null;
  if (!('lastUsed' in res)) res.lastUsed = null;
  if (typeof res.notes !== 'string') res.notes = '';
  if (typeof res.url !== 'string') res.url = '';
  return res;
}

/**
 * Record that a resource was used (watched, read, opened) outside of or in
 * addition to a logged session. Never touches `understood`.
 * Returns the new usage entry.
 */
export function markResourceUsed(res, opts = {}) {
  const now = Date.now();
  ensureResourceFields(res);
  const entry = { timestamp: now };
  if (opts.sessionId) entry.sessionId = opts.sessionId;
  if (opts.note) entry.note = opts.note;
  pushCapped(res.usageHistory, entry);
  res.lastUsed = now;
  res.updatedAt = now;
  return entry;
}

/**
 * Explicit understanding judgment. `understood=true` marks the material as
 * grasped; `false` takes it back. Always recorded in understoodHistory.
 * Usage never calls this implicitly.
 */
export function setResourceUnderstood(res, understood) {
  const now = Date.now();
  ensureResourceFields(res);
  const value = !!understood;
  if (res.understood !== value) {
    res.understood = value;
    res.understoodAt = value ? now : res.understoodAt;
    pushCapped(res.understoodHistory, { timestamp: now, value });
    res.updatedAt = now;
  }
  return res.understood;
}
/**
 * Adaptive plan — weeks are suggestions, not a cage.
 *
 * A plan item carries notes (e.g. "Couldn't do this because X.") and can be
 * explicitly deprioritized (`dropped`) instead of lingering as silent debt.
 * Done means recorded progress, never cancelled text (no strikethrough).
 */
export function ensurePlanItemFields(item) {
  if (!item) return item;
  if (!Array.isArray(item.linkedObjectiveIds)) item.linkedObjectiveIds = [];
  if (!Array.isArray(item.linkedResourceIds)) item.linkedResourceIds = [];
  if (typeof item.done !== 'boolean') item.done = false;
  if (typeof item.dropped !== 'boolean') item.dropped = false;
  if (typeof item.notes !== 'string') item.notes = '';
  if (typeof item.text !== 'string') item.text = '';
  if (typeof item.week !== 'number') item.week = parseInt(item.week) || 1;
  if (!('dueDate' in item)) item.dueDate = null;
  if (typeof item.year !== 'number') item.year = new Date().getFullYear();
  return item;
}
/**
 * Exam diagnosis — an exam covers objectives, and per covered objective the
 * user records how they performed: weak | okay | strong.
 *
 * The breakdown (not the grade alone) feeds the Weak Spots system: a bad
 * exam tells WHERE the user is weak instead of just producing a bad number.
 */
export const EXAM_RATINGS = ['weak', 'okay', 'strong'];

export function ensureExamFields(exam) {
  if (!exam) return exam;
  if (!Array.isArray(exam.linkedObjectiveIds)) exam.linkedObjectiveIds = [];
  if (!Array.isArray(exam.objectiveResults)) exam.objectiveResults = [];
  if (!('score' in exam)) exam.score = '';
  if (!('max' in exam)) exam.max = '';
  if (typeof exam.weight !== 'number') exam.weight = 0;
  if (typeof exam.description !== 'string') exam.description = '';
  // Mock exams: zero-weight practice runs. They feed diagnosis like real
  // exams but never touch grade projection (see calculateProjection).
  if (!('isMock' in exam)) exam.isMock = false;
  return syncExamObjectives(exam);
}

/**
 * Keep objectiveResults aligned with linkedObjectiveIds: add blank entries
 * for newly covered objectives, drop entries for uncovered ones.
 * A blank (rating null) entry means "covered, not yet assessed".
 */
export function syncExamObjectives(exam) {
  if (!exam) return exam;
  if (!Array.isArray(exam.linkedObjectiveIds)) exam.linkedObjectiveIds = [];
  if (!Array.isArray(exam.objectiveResults)) exam.objectiveResults = [];
  const linked = new Set(exam.linkedObjectiveIds);
  exam.objectiveResults = exam.objectiveResults.filter(r => linked.has(r.objectiveId));
  for (const oid of exam.linkedObjectiveIds) {
    if (!exam.objectiveResults.some(r => r.objectiveId === oid)) {
      exam.objectiveResults.push({ objectiveId: oid, rating: null, note: '' });
    }
  }
  return exam;
}

export function getObjectiveRating(exam, objectiveId) {
  return exam?.objectiveResults?.find(r => r.objectiveId === objectiveId) || null;
}

/**
 * Record per-objective performance. Rating is 'weak' | 'okay' | 'strong' |
 * null (not assessed). Never touches the grade — diagnosis and grading
 * stay independent.
 */
export function setObjectiveRating(exam, objectiveId, rating, note = undefined) {
  if (!exam) return null;
  ensureExamFields(exam);
  if (!exam.linkedObjectiveIds.includes(objectiveId)) {
    exam.linkedObjectiveIds.push(objectiveId);
  }
  let entry = exam.objectiveResults.find(r => r.objectiveId === objectiveId);
  if (!entry) {
    entry = { objectiveId, rating: null, note: '' };
    exam.objectiveResults.push(entry);
  }
  if (rating === null || EXAM_RATINGS.includes(rating)) entry.rating = rating;
  if (typeof note === 'string') entry.note = note;
  exam.updatedAt = Date.now();
  return entry;
}
/**
 * Helper to find objective IDs by topic name (for session migration)
 */
function findObjectiveIdsByTopic(objectives, topic) {
  const matches = objectives.filter(o => 
    o.title.toLowerCase().includes(topic.toLowerCase()) ||
    topic.toLowerCase().includes(o.title.toLowerCase())
  );
  return matches.map(o => o.id);
}

/**
 * Export data as JSON file
 */
export function exportData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `emvs-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import data from JSON file
 * Returns { success: boolean, data: object, error?: string }
 * Sanitizer: validates and clamps every field to prevent injection.
 */
export function importData(jsonString) {
  try {
    const imported = JSON.parse(jsonString);
    
    // Validate required structure
    const requiredArrays = [
      'modules', 'learningObjectives', 'resources', 
      'studySessions', 'exams', 'examResults',
      'planItems', 'captures', 'weeklyReviews'
    ];
    
    for (const key of requiredArrays) {
      if (!Array.isArray(imported[key])) {
        throw new Error(`Missing or invalid ${key} array`);
      }
    }
    
    // Ensure schema version
    imported.schemaVersion = imported.schemaVersion || CURRENT_SCHEMA_VERSION;
    imported.settings = imported.settings || getSeedData().settings;
    
    // Sanitizer configuration
    const ID_REGEX = /^[A-Za-z0-9-]{1,64}$/;
    const ACCENT_REGEX = /^#[0-9a-fA-F]{6}$/;
    const OBJECTIVE_STATUSES = new Set(['todo', 'in-progress', 'done']);
    const RESOURCE_STATUSES = new Set(['todo', 'in-progress', 'done']);
    const HISTORY_MAX = 100;
    
    function sanitizeId(id, collection, index) {
      if (!id) return generateId();
      if (typeof id !== 'string' || !ID_REGEX.test(id)) {
        throw new Error(`Ungültige ID in ${collection}[${index}]: muss 1-64 alphanumerische Zeichen oder Bindestriche sein`);
      }
      return id;
    }
    
    function sanitizeEnum(value, allowed, collection, index, field, fallback) {
      if (value === undefined || value === null) return fallback;
      if (allowed.has(value)) return value;
      throw new Error(`Ungültiger ${field} in ${collection}[${index}]: ${value}`);
    }
    
    function sanitizeNumber(value, min, max, collection, index, field, fallback) {
      if (value === undefined || value === null) return fallback;
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, n));
    }
    
    function sanitizeHistory(arr, collection, index) {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(e => e && typeof e.timestamp === 'number' && Number.isFinite(e.timestamp))
        .slice(-HISTORY_MAX);
    }
    
    function sanitizeAccent(value) {
      if (typeof value === 'string' && ACCENT_REGEX.test(value)) return value;
      return '#b45309';
    }
    
    // Module IDs for referential integrity check
    const validModuleIds = new Set();
    
    // Sanitize modules
    imported.modules = imported.modules.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`modules[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'modules', idx);
      validModuleIds.add(id);
      return {
        ...item,
        id,
        code: String(item.code || '').slice(0, 20),
        title: String(item.title || '').slice(0, 100),
        accent: sanitizeAccent(item.accent),
        targetGrade: sanitizeNumber(item.targetGrade, 1, 6, 'modules', idx, 'targetGrade', 5.0),
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Sanitize learningObjectives
    imported.learningObjectives = imported.learningObjectives.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`learningObjectives[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'learningObjectives', idx);
      // Drop if moduleId doesn't resolve
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`learningObjectives[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        number: sanitizeNumber(item.number, 1, 999, 'learningObjectives', idx, 'number', idx + 1),
        title: String(item.title || '').slice(0, 200),
        description: String(item.description || '').slice(0, 5000),
        status: sanitizeEnum(item.status, OBJECTIVE_STATUSES, 'learningObjectives', idx, 'status', 'todo'),
        confidence: sanitizeNumber(item.confidence, 0, 5, 'learningObjectives', idx, 'confidence', 0),
        notes: String(item.notes || '').slice(0, 5000),
        confidenceHistory: sanitizeHistory(item.confidenceHistory, 'learningObjectives', idx),
        sessionHistory: sanitizeHistory(item.sessionHistory, 'learningObjectives', idx),
        reviewHistory: sanitizeHistory(item.reviewHistory, 'learningObjectives', idx),
        reviewSchedule: item.reviewSchedule && typeof item.reviewSchedule === 'object' ? {
          interval: sanitizeNumber(item.reviewSchedule.interval, 1, 90, 'learningObjectives', idx, 'reviewSchedule.interval', 1),
          nextReview: typeof item.reviewSchedule.nextReview === 'number' && Number.isFinite(item.reviewSchedule.nextReview) ? item.reviewSchedule.nextReview : Date.now(),
          reviewCount: sanitizeNumber(item.reviewSchedule.reviewCount, 0, 999, 'learningObjectives', idx, 'reviewSchedule.reviewCount', 0),
        } : null,
        lastTouched: typeof item.lastTouched === 'number' && Number.isFinite(item.lastTouched) ? item.lastTouched : Date.now(),
        lastReviewed: typeof item.lastReviewed === 'number' && Number.isFinite(item.lastReviewed) ? item.lastReviewed : null,
        totalStudyTime: sanitizeNumber(item.totalStudyTime, 0, 999999, 'learningObjectives', idx, 'totalStudyTime', 0),
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Sanitize resources
    imported.resources = imported.resources.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`resources[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'resources', idx);
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`resources[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        name: String(item.name || '').slice(0, 200),
        type: sanitizeEnum(item.type, new Set(RESOURCE_TYPES), 'resources', idx, 'type', 'Other'),
        focus: String(item.focus || '').slice(0, 50),
        status: sanitizeEnum(item.status, RESOURCE_STATUSES, 'resources', idx, 'status', 'todo'),
        url: String(item.url || '').slice(0, 500),
        linkedObjectiveIds: Array.isArray(item.linkedObjectiveIds) ? item.linkedObjectiveIds.filter(id => typeof id === 'string') : [],
        notes: String(item.notes || '').slice(0, 5000),
        usageHistory: sanitizeHistory(item.usageHistory, 'resources', idx),
        understood: Boolean(item.understood),
        understoodAt: typeof item.understoodAt === 'number' && Number.isFinite(item.understoodAt) ? item.understoodAt : null,
        understoodHistory: sanitizeHistory(item.understoodHistory, 'resources', idx),
        lastUsed: typeof item.lastUsed === 'number' && Number.isFinite(item.lastUsed) ? item.lastUsed : null,
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Sanitize studySessions
    imported.studySessions = imported.studySessions.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`studySessions[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'studySessions', idx);
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`studySessions[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        startTime: typeof item.startTime === 'string' ? item.startTime : new Date().toISOString(),
        duration: sanitizeNumber(item.duration, 1, 480, 'studySessions', idx, 'duration', 25),
        linkedObjectiveIds: Array.isArray(item.linkedObjectiveIds) ? item.linkedObjectiveIds.filter(id => typeof id === 'string') : [],
        linkedResourceIds: Array.isArray(item.linkedResourceIds) ? item.linkedResourceIds.filter(id => typeof id === 'string') : [],
        note: String(item.note || '').slice(0, 5000),
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Sanitize exams
    imported.exams = imported.exams.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`exams[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'exams', idx);
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`exams[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        name: String(item.name || '').slice(0, 200),
        date: typeof item.date === 'string' ? item.date : '',
        weight: sanitizeNumber(item.weight, 0, 100, 'exams', idx, 'weight', 0),
        score: String(item.score || '').slice(0, 20),
        max: String(item.max || '').slice(0, 20),
        linkedObjectiveIds: Array.isArray(item.linkedObjectiveIds) ? item.linkedObjectiveIds.filter(id => typeof id === 'string') : [],
        objectiveResults: Array.isArray(item.objectiveResults) ? item.objectiveResults
          .filter(r => r && typeof r === 'object' && typeof r.objectiveId === 'string')
          .map(r => ({
            objectiveId: r.objectiveId,
            rating: sanitizeEnum(r.rating, new Set(EXAM_RATINGS), 'exams.objectiveResults', idx, 'rating', null),
            note: String(r.note || '').slice(0, 5000),
          })) : [],
        isMock: Boolean(item.isMock),
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Sanitize examResults
    imported.examResults = imported.examResults.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`examResults[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'examResults', idx);
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`examResults[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        examId: String(item.examId || ''),
        objectiveId: String(item.objectiveId || ''),
        rating: sanitizeEnum(item.rating, new Set(EXAM_RATINGS), 'examResults', idx, 'rating', null),
        note: String(item.note || '').slice(0, 5000),
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        // examResults uses createdAt only in cloud schema
      };
    });
    
    // Sanitize planItems
    imported.planItems = imported.planItems.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`planItems[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'planItems', idx);
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`planItems[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        week: sanitizeNumber(item.week, 1, 53, 'planItems', idx, 'week', 1),
        year: typeof item.year === 'number' && Number.isFinite(item.year) ? item.year : new Date().getFullYear(),
        title: String(item.title || '').slice(0, 200),
        text: String(item.text || '').slice(0, 5000),
        type: sanitizeEnum(item.type, new Set(PLAN_ITEM_TYPES), 'planItems', idx, 'type', 'task'),
        linkedObjectiveIds: Array.isArray(item.linkedObjectiveIds) ? item.linkedObjectiveIds.filter(id => typeof id === 'string') : [],
        linkedResourceIds: Array.isArray(item.linkedResourceIds) ? item.linkedResourceIds.filter(id => typeof id === 'string') : [],
        done: Boolean(item.done),
        dropped: Boolean(item.dropped),
        notes: String(item.notes || '').slice(0, 5000),
        dueDate: typeof item.dueDate === 'string' ? item.dueDate : null,
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Sanitize captures
    imported.captures = imported.captures.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`captures[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'captures', idx);
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`captures[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        objectiveId: item.objectiveId || null,
        content: String(item.content || '').slice(0, 5000),
        type: sanitizeEnum(item.type, new Set(CAPTURE_TYPES), 'captures', idx, 'type', 'thought'),
        timestamp: typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) ? item.timestamp : Date.now(),
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Sanitize weeklyReviews
    imported.weeklyReviews = imported.weeklyReviews.map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`weeklyReviews[${idx}]: erwartet Objekt`);
      }
      const id = sanitizeId(item.id, 'weeklyReviews', idx);
      if (!validModuleIds.has(item.moduleId)) {
        throw new Error(`weeklyReviews[${idx}]: unbekanntes moduleId ${item.moduleId}`);
      }
      return {
        ...item,
        id,
        moduleId: item.moduleId,
        week: sanitizeNumber(item.week, 1, 53, 'weeklyReviews', idx, 'week', 1),
        year: typeof item.year === 'number' && Number.isFinite(item.year) ? item.year : new Date().getFullYear(),
        answers: item.answers && typeof item.answers === 'object' ? {
          timeSpent: String(item.answers.timeSpent || '').slice(0, 5000),
          progress: String(item.answers.progress || '').slice(0, 5000),
          blockers: String(item.answers.blockers || '').slice(0, 5000),
        } : { timeSpent: '', progress: '', blockers: '' },
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };
    });
    
    // Re-run field normalization after sanitization
    imported.learningObjectives.forEach(ensureObjectiveFields);
    imported.exams.forEach(ensureExamFields);
    imported.resources.forEach(ensureResourceFields);
    imported.planItems.forEach(ensurePlanItemFields);
    
    return { success: true, data: imported };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Clear all data (reset to seed).
 * Explicit, confirmation-gated reset: discarding storage is the user's
 * stated intent here, so any recorded read failure is cleared and saving
 * works again immediately.
 */
export function clearAll() {
  clearStorageError();
  activeAdapter.removeItem(STORAGE_KEY);
  activeAdapter.removeItem(TIMER_KEY);
  return getSeedData();
}

/**
 * Timer persistence - survives page refresh.
 * Returns true only when the write actually succeeded.
 * Refused (false, no write) while a storage read failure is recorded.
 */
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
    const raw = activeAdapter.getItem(TIMER_KEY);
    return raw === null ? null : raw;
  } catch (e) {
    // Corrupt or inaccessible timer state is ephemeral: report no timer
    // rather than crashing. The stored value is left untouched.
    console.error('Failed to load timer state:', e);
    return null;
  }
}

export function clearTimerState() {
  activeAdapter.removeItem(TIMER_KEY);
}

/**
 * Remove all references to a deleted objective from linked entities.
 * Called on explicit objective delete (user-confirmed): resources, sessions,
 * exams (links + per-objective diagnosis entries, re-synced), plan items keep
 * their text but lose the link, captures keep their text but lose the link.
 * Returns the state for chaining. Never deletes the entities themselves.
 */
export function unlinkObjectiveEverywhere(state, objectiveId) {
  if (!state || !objectiveId) return state;
  const strip = (arr) => Array.isArray(arr) && arr.includes(objectiveId)
    ? arr.filter(x => x !== objectiveId)
    : arr;
  for (const res of state.resources || []) {
    if (Array.isArray(res?.linkedObjectiveIds) && res.linkedObjectiveIds.includes(objectiveId)) {
      res.linkedObjectiveIds = strip(res.linkedObjectiveIds);
      res.updatedAt = Date.now();
    }
  }
  for (const s of state.studySessions || []) {
    if (Array.isArray(s?.linkedObjectiveIds) && s.linkedObjectiveIds.includes(objectiveId)) {
      s.linkedObjectiveIds = strip(s.linkedObjectiveIds);
      s.updatedAt = Date.now();
    }
  }
  for (const exam of state.exams || []) {
    if (!exam) continue;
    let touched = false;
    if (Array.isArray(exam.linkedObjectiveIds) && exam.linkedObjectiveIds.includes(objectiveId)) {
      exam.linkedObjectiveIds = strip(exam.linkedObjectiveIds);
      touched = true;
    }
    if (Array.isArray(exam.objectiveResults) && exam.objectiveResults.some(r => r && r.objectiveId === objectiveId)) {
      exam.objectiveResults = exam.objectiveResults.filter(r => r && r.objectiveId !== objectiveId);
      touched = true;
    }
    if (touched) {
      syncExamObjectives(exam);
      exam.updatedAt = Date.now();
    }
  }
  for (const p of state.planItems || []) {
    if (Array.isArray(p?.linkedObjectiveIds) && p.linkedObjectiveIds.includes(objectiveId)) {
      p.linkedObjectiveIds = strip(p.linkedObjectiveIds);
      p.updatedAt = Date.now();
    }
  }
  for (const c of state.captures || []) {
    if (c && c.objectiveId === objectiveId) {
      c.objectiveId = null;
      c.updatedAt = Date.now();
    }
  }
  return state;
}

/**
 * Remove all references to a deleted resource from linked entities.
 * Sessions and plan items keep their own content, only the link is dropped.
 * Returns the state for chaining.
 */
export function unlinkResourceEverywhere(state, resourceId) {
  if (!state || !resourceId) return state;
  for (const s of state.studySessions || []) {
    if (Array.isArray(s?.linkedResourceIds) && s.linkedResourceIds.includes(resourceId)) {
      s.linkedResourceIds = s.linkedResourceIds.filter(x => x !== resourceId);
      s.updatedAt = Date.now();
    }
  }
  for (const p of state.planItems || []) {
    if (Array.isArray(p?.linkedResourceIds) && p.linkedResourceIds.includes(resourceId)) {
      p.linkedResourceIds = p.linkedResourceIds.filter(x => x !== resourceId);
      p.updatedAt = Date.now();
    }
  }
  return state;
}

/**
 * Update objective history when a session is logged
 * Called after a session is created/updated
 */
export function updateObjectiveHistory(state, session) {
  const { linkedObjectiveIds = [], duration, startTime } = session;
  const now = Date.now();
  // "Last touched" is a fact about the session date, not about when the user
  // happened to log/edit it: backdated sessions must not mark everything as
  // touched right now, or staleness signals (rhythm, weak spots) corrupt.
  const sessionTs = new Date(startTime).getTime();
  const touchedAt = Number.isFinite(sessionTs) ? sessionTs : now;
  const mins = typeof duration === 'number' && Number.isFinite(duration) ? duration : 0;
  
  linkedObjectiveIds.forEach(objId => {
    const obj = state.learningObjectives.find(o => o.id === objId);
    if (!obj) return;
    ensureObjectiveFields(obj);
    
    // Update total study time
    obj.totalStudyTime = (obj.totalStudyTime || 0) + mins;
    
    // Update last touched (never backwards: keep the latest known session date)
    obj.lastTouched = Math.max(obj.lastTouched || 0, touchedAt);
    
    // Add to session history (keep last 20)
    obj.sessionHistory = obj.sessionHistory || [];
    obj.sessionHistory.unshift({
      sessionId: session.id,
      date: startTime,
      duration,
      note: session.note || ''
    });
    if (obj.sessionHistory.length > 20) obj.sessionHistory.pop();
    
    obj.updatedAt = now;
  });
  
  return state;
}

/**
 * Recalculate all objective history from sessions
 * Useful after import or data repair
 */
export function recalculateObjectiveHistory(state) {
  state.learningObjectives.forEach(obj => {
    ensureObjectiveFields(obj);
    const keptReviewed = obj.lastReviewed;
    obj.totalStudyTime = 0;
    obj.lastTouched = obj.createdAt || Date.now();
    obj.sessionHistory = [];
    obj.lastReviewed = keptReviewed || null;
  });
  
  // Sort sessions chronologically
  const sessions = [...state.studySessions].sort((a, b) => 
    new Date(a.startTime) - new Date(b.startTime)
  );
  
  // Replay all sessions
  sessions.forEach(session => {
    updateObjectiveHistory(state, session);
  });
  
  return state;
}