/**
 * PDF analysis background tasks — DOM-free state machine + orchestration.
 *
 * One task slot: while a task is active (extracting/analyzing/merging) no
 * second analysis may start; a finished, unreviewed result must be
 * committed or dismissed first. The task (file reference, meta, progress,
 * result draft) lives in this module, so it survives view navigation — the
 * floating panel merely renders it.
 *
 * Network/file access is injectable (deps.extractFn / deps.analyzeFn) so
 * plain Node tests can run the full workflow without Ollama or pdf.js.
 */

import { generateId, ensureObjectiveFields } from './store.js';
import { extractPdfText } from './pdfExtract.js';
import { extractObjectivesFromText } from './localAI.js';

export const ACTIVE_STATUSES = ['extracting', 'analyzing', 'merging'];
export const TERMINAL_STATUSES = ['done', 'error', 'cancelled'];

let task = null;
const listeners = new Set();

export function subscribeTask(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of [...listeners]) {
    try { fn(task); } catch {}
  }
}

/** Reset module state — primarily for tests. */
export function _resetTasksForTests() {
  task = null;
  listeners.clear();
}

export function getTask() {
  return task;
}

export function isTaskActive(t = task) {
  return !!t && ACTIVE_STATUSES.includes(t.status);
}

export function isTaskTerminal(t = task) {
  return !!t && TERMINAL_STATUSES.includes(t.status);
}

export function fileKeyOf(file) {
  if (!file || typeof file !== 'object') return '';
  return [file.name || '', file.size || 0, file.lastModified || 0].join('|');
}

/**
 * Start gate: null when a new analysis may start, otherwise the block
 * reason — 'active' (one already running) or 'unreviewed' (a finished
 * result is still waiting for review/commit).
 */
export function describeStartBlock(t = task) {
  if (isTaskActive(t)) return 'active';
  if (t && t.status === 'done' && !t.committed) return 'unreviewed';
  return null;
}

export function createTask({ file, code, title, ai }) {
  const now = Date.now();
  task = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: file?.name || 'PDF',
    fileKey: fileKeyOf(file),
    file,
    code: String(code || '').trim().toUpperCase(),
    title: String(title || '').trim(),
    ai: { ...(ai || {}) },
    status: 'extracting',
    statusText: 'Wird vorbereitet…',
    progress: null,
    error: null,
    result: null,
    committed: false,
    controller: null,
    _running: null,
    createdAt: now,
    updatedAt: now,
  };
  notify();
  return task;
}

function touch(t, patch) {
  Object.assign(t, patch, { updatedAt: Date.now() });
  notify();
}

function markError(t, code) {
  touch(t, { status: 'error', error: { code }, progress: null, statusText: '' });
  return t;
}

function markCancelled(t) {
  touch(t, { status: 'cancelled', progress: null, statusText: '' });
  return t;
}

/**
 * Run extraction + analysis for a task. Re-entrant safe: concurrent calls
 * for the same task share one promise (duplicate analyses impossible).
 */
export function runTask(t = task, deps = {}) {
  if (!t) return Promise.resolve(null);
  if (t._running) return t._running;
  const extractFn = deps.extractFn || extractPdfText;
  const analyzeFn = deps.analyzeFn || extractObjectivesFromText;

  t.controller = new AbortController();
  const { signal } = t.controller;

  t._running = (async () => {
    try {
    // Phase 1: text extraction (measurable page progress)
    touch(t, { status: 'extracting', statusText: 'Text wird extrahiert…', progress: null, error: null });
    let extracted;
    try {
      extracted = await extractFn(t.file, {
        signal,
        onProgress: ({ done, total }) => touch(t, {
          statusText: `Text wird extrahiert… Seite ${done}/${total}`,
          progress: { done, total },
        }),
      });
    } catch (e) {
      if (signal.aborted || e?.code === 'aborted') return markCancelled(t);
      return markError(t, e?.code || 'unknown');
    }
    if (signal.aborted) return markCancelled(t);

    // Phase 2+3: chunk analysis + merge (measurable chunk progress)
    const ai = t.ai || {};
    try {
      const result = await analyzeFn(extracted.text, {
        model: ai.model,
        baseUrl: ai.baseUrl,
        numCtx: ai.numCtx,
        moduleTitle: t.title,
        signal,
        onProgress: (p) => {
          if (p?.phase === 'chunks') {
            touch(t, {
              status: 'analyzing',
              statusText: `Lernziele werden extrahiert… Abschnitt ${Math.min(p.done + 1, p.total)}/${p.total}`,
              progress: { done: p.done, total: p.total },
            });
          } else {
            touch(t, {
              status: 'merging',
              statusText: 'Ergebnisse werden zusammengeführt…',
              progress: { done: 1, total: 1 },
            });
          }
        },
      });
      if (signal.aborted) return markCancelled(t);
      if (!result?.objectives?.length && !result?.resources?.length) {
        return markError(t, 'empty');
      }
      touch(t, {
        status: 'done',
        statusText: '',
        progress: { done: 1, total: 1 },
        result: {
          objectives: (result.objectives || []).map(o => ({ ...o })),
          resources: (result.resources || []).map(r => ({ ...r })),
        },
      });
      return t;
    } catch (e) {
      if (signal.aborted || e?.code === 'aborted') return markCancelled(t);
      return markError(t, e?.code || 'unknown');
    }
    } finally {
      // Always release the single-flight guard — including extract-phase
      // failures — so retry/cancel settle cleanly and a new run can start.
      t._running = null;
    }
  })();

  return t._running;
}

/** Abort a running task; runTask() settles it as 'cancelled'. */
export function cancelTask(t = task) {
  if (!t) return null;
  if (t.controller) {
    try { t.controller.abort(); } catch {}
  } else {
    // Cancelled before runTask() attached a controller.
    markCancelled(t);
  }
  return t;
}

/** Re-run a terminal task with the retained file reference. */
export function retryTask(t = task, deps = {}) {
  if (!t || isTaskActive(t)) return Promise.resolve(t);
  touch(t, { status: 'extracting', statusText: 'Wird vorbereitet…', progress: null, error: null, result: null });
  return runTask(t, deps);
}

export function dismissTask() {
  task = null;
  notify();
}

export function markCommitted(t = task) {
  if (t) {
    t.committed = true;
    notify();
  }
}

/** Replace the result draft (live-synced from the review modal). */
export function updateDraft(t = task, objectives, resources) {
  if (!t) return;
  t.result = {
    objectives: (objectives || []).map(o => ({ ...o })),
    resources: (resources || []).map(r => ({ ...r })),
  };
  touch(t, {});
}

/**
 * Pure commit builder: draft + meta → store-ready entities.
 * idFn injectable for deterministic tests; defaults to generateId.
 */
export function buildModuleEntities(meta, draft, opts = {}) {
  const now = opts.now ?? Date.now();
  const newId = opts.idFn || generateId;
  const moduleId = newId();
  const module = {
    id: moduleId,
    code: String(meta?.code || '').trim().toUpperCase(),
    title: String(meta?.title || '').trim(),
    accent: '#b45309',
    targetGrade: 5.0,
    createdAt: now,
    updatedAt: now,
  };
  const objectives = (draft?.objectives || [])
    .filter(o => o && String(o.title || '').trim().length >= 3)
    .map((o, i) => ensureObjectiveFields({
      id: newId(),
      moduleId,
      number: i + 1,
      title: String(o.title).trim(),
      description: String(o.description || '').trim(),
      status: 'todo',
      confidence: 0,
      notes: '',
      confidenceHistory: [],
      reviewHistory: [],
      lastTouched: now,
      lastReviewed: null,
      totalStudyTime: 0,
      reviewSchedule: null,
      sessionHistory: [],
      createdAt: now,
      updatedAt: now,
    }));
  const resources = (draft?.resources || [])
    .filter(r => r && String(r.name || '').trim().length >= 3)
    .map((r) => ({
      id: newId(),
      moduleId,
      name: String(r.name).trim(),
      type: 'Other',
      focus: '70',
      status: 'todo',
      url: '',
      linkedObjectiveIds: [],
      notes: String(r.note || '').trim() || 'Aus PDF importiert',
      createdAt: now,
      updatedAt: now,
    }));
  return { module, objectives, resources };
}
