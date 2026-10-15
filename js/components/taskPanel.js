/**
 * Floating PDF task panel — draggable, minimizable, non-blocking.
 *
 * Mounted on document.body (NOT inside #view-root), so it survives router
 * navigation. Renders the singleton from services/pdfTasks.js and offers:
 * live status + measurable progress while running, retry on errors,
 * "results review" when done, cancel/dismiss controls.
 *
 * The review modal lives in views/pdf-import.js (import cycle avoidance):
 * that view registers its opener via setReviewOpener().
 */

import {
  getTask,
  isTaskActive,
  subscribeTask,
  cancelTask,
  retryTask,
  dismissTask,
  runTask,
} from '../services/pdfTasks.js';
import { describePdfError } from '../services/pdfExtract.js';
import { describeLocalAIError } from '../services/localAI.js';
import { escapeHtml } from '../utils/helpers.js';

let panelEl = null;
let minimized = false;
let pos = null; // {x, y} fixed offset from bottom-right anchor; null = default
let dragState = null;
let reviewOpener = null;

export function setReviewOpener(fn) {
  reviewOpener = typeof fn === 'function' ? fn : null;
}

export function initTaskPanel() {
  if (panelEl || typeof document === 'undefined') return;
  panelEl = document.createElement('section');
  panelEl.id = 'task-panel';
  panelEl.className = 'task-panel';
  panelEl.setAttribute('hidden', '');
  panelEl.setAttribute('aria-label', 'PDF-Analyse');
  document.body.appendChild(panelEl);
  subscribeTask(() => render());
  render();
}

function taskErrorText(task) {
  const code = task?.error?.code;
  if (!code) return 'Unbekannter Fehler.';
  if (code === 'empty') {
    return 'Keine Lernziele gefunden. Das PDF enthält evtl. zu wenig Fliesstext — Titel ggf. manuell anlegen.';
  }
  // pdf.js codes first, then Ollama codes; both fall back to generic text.
  const pdfText = describePdfError(code);
  if (code.startsWith('pdf') || code === 'pdfjs-load') return pdfText;
  return describeLocalAIError(code);
}

function progressPercent(task) {
  const p = task?.progress;
  if (!p || !(p.total > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100)));
}

function statusDotClass(task) {
  if (!task) return '';
  if (isTaskActive(task)) return 'run';
  if (task.status === 'done') return 'ok';
  if (task.status === 'error' || task.status === 'cancelled') return 'fail';
  return '';
}

function render() {
  if (!panelEl) return;
  const task = getTask();
  if (!task) {
    panelEl.setAttribute('hidden', '');
    panelEl.innerHTML = '';
    return;
  }
  panelEl.removeAttribute('hidden');
  panelEl.classList.toggle('min', minimized);
  applyPos();

  // Preserve keyboard focus across progress re-renders (same control key).
  const focusedKey = panelEl.contains(document.activeElement)
    ? document.activeElement.getAttribute?.('data-tp')
    : null;

  const pct = progressPercent(task);
  const active = isTaskActive(task);
  const nObj = task.result?.objectives?.length || 0;
  const nRes = task.result?.resources?.length || 0;

  let bodyHtml = '';
  if (active) {
    bodyHtml = `
      <div class="task-progress" role="progressbar" aria-label="Analysefortschritt"
        ${pct === null ? '' : `aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"`}>
        <div class="task-progress-fill" style="width: ${pct === null ? '100%' : pct + '%'}${pct === null ? '; animation: task-slide 1.2s ease-in-out infinite' : ''}"></div>
      </div>
      <p class="task-status" role="status" aria-live="polite">${escapeHtml(task.statusText || 'Analyse läuft…')}</p>
      <div class="task-actions">
        <button class="btn" data-tp="cancel">Abbrechen</button>
      </div>`;
  } else if (task.status === 'done') {
    bodyHtml = `
      <p class="task-status" role="status">Fertig — ${nObj} Lernziel${nObj !== 1 ? 'e' : ''}${nRes ? `, ${nRes} Ressource${nRes !== 1 ? 'n' : ''}` : ''} bereit zur Prüfung.</p>
      <div class="task-actions">
        <button class="btn primary" data-tp="review">Ergebnisse prüfen</button>
        <button class="btn" data-tp="dismiss">Verwerfen</button>
      </div>`;
  } else if (task.status === 'error') {
    bodyHtml = `
      <p class="task-status task-error" role="alert">${escapeHtml(taskErrorText(task))}</p>
      <div class="task-actions">
        <button class="btn primary" data-tp="retry">Erneut versuchen</button>
        <button class="btn" data-tp="dismiss">Schliessen</button>
      </div>`;
  } else if (task.status === 'cancelled') {
    bodyHtml = `
      <p class="task-status" role="status">Analyse abgebrochen — nichts wurde übernommen.</p>
      <div class="task-actions">
        <button class="btn primary" data-tp="retry">Erneut versuchen</button>
        <button class="btn" data-tp="dismiss">Schliessen</button>
      </div>`;
  }

  panelEl.innerHTML = `
    <div class="task-head" data-tp="handle">
      <span class="task-dot ${statusDotClass(task)}" aria-hidden="true"></span>
      <div class="task-titles">
        <strong class="task-title" id="task-panel-title" tabindex="-1">PDF-Analyse</strong>
        <span class="task-sub">${escapeHtml(task.fileName || '')}${task.code ? ` · Modul ${escapeHtml(task.code)}` : ''}</span>
      </div>
      <button class="task-min" data-tp="min" aria-expanded="${minimized ? 'false' : 'true'}"
        aria-label="${minimized ? 'Aufgabenpanel erweitern' : 'Aufgabenpanel minimieren'}">${minimized ? '▴' : '▾'}</button>
    </div>
    <div class="task-body">${bodyHtml}</div>`;

  wire();
  if (focusedKey) {
    panelEl.querySelector(`[data-tp="${focusedKey}"]`)?.focus({ preventScroll: true });
  }
}

function wire() {
  if (!panelEl) return;
  panelEl.querySelector('[data-tp="min"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    minimized = !minimized;
    render();
  });
  panelEl.querySelector('[data-tp="cancel"]')?.addEventListener('click', () => {
    cancelTask();
    window.EMVS?.toast?.show('Analyse abgebrochen');
  });
  panelEl.querySelector('[data-tp="retry"]')?.addEventListener('click', () => {
    const t = getTask();
    if (t) retryTask(t).catch(() => {});
  });
  panelEl.querySelector('[data-tp="dismiss"]')?.addEventListener('click', () => {
    dismissTask();
  });
  panelEl.querySelector('[data-tp="review"]')?.addEventListener('click', () => {
    const t = getTask();
    if (t && reviewOpener) reviewOpener(t);
  });
  const handle = panelEl.querySelector('[data-tp="handle"]');
  handle?.addEventListener('pointerdown', onDragStart);
}

/** Bring the panel to attention (used when a start is blocked). */
export function focusTaskPanel() {
  if (!panelEl || !getTask()) return;
  minimized = false;
  render();
  panelEl.classList.remove('flash');
  // Force reflow so the animation retriggers on repeated calls.
  void panelEl.offsetWidth;
  panelEl.classList.add('flash');
  document.getElementById('task-panel-title')?.focus({ preventScroll: true });
}

function onDragStart(e) {
  if (!panelEl) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('button')) return;
  // On small screens the panel is a docked bottom sheet — no dragging.
  if (window.matchMedia?.('(max-width: 780px)').matches) return;
  const rect = panelEl.getBoundingClientRect();
  dragState = {
    pointerId: e.pointerId,
    dx: e.clientX - rect.left,
    dy: e.clientY - rect.top,
  };
  try { panelEl.setPointerCapture?.(e.pointerId); } catch {}
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
  window.addEventListener('pointercancel', onDragEnd, { once: true });
  e.preventDefault();
}

function onDragMove(e) {
  if (!dragState || !panelEl || e.pointerId !== dragState.pointerId) return;
  const margin = 8;
  const w = panelEl.offsetWidth;
  const h = panelEl.offsetHeight;
  const maxX = Math.max(margin, window.innerWidth - w - margin);
  const maxY = Math.max(margin, window.innerHeight - h - margin);
  const left = Math.min(Math.max(e.clientX - dragState.dx, margin), maxX);
  const top = Math.min(Math.max(e.clientY - dragState.dy, margin), maxY);
  // Store as right/bottom offsets so resize/orientation stays sane.
  pos = {
    right: Math.max(margin, window.innerWidth - left - w),
    bottom: Math.max(margin, window.innerHeight - top - h),
  };
  applyPos();
}

function onDragEnd() {
  dragState = null;
  window.removeEventListener('pointermove', onDragMove);
}

function applyPos() {
  if (!panelEl) return;
  if (!pos) {
    panelEl.style.right = '';
    panelEl.style.bottom = '';
    panelEl.style.left = '';
    panelEl.style.top = '';
    return;
  }
  panelEl.style.right = `${pos.right}px`;
  panelEl.style.bottom = `${pos.bottom}px`;
  panelEl.style.left = 'auto';
  panelEl.style.top = 'auto';
}

// Re-export for views that drive the workflow without importing the service.
export { runTask, getTask };
