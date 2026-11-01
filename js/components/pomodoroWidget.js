/**
 * Floating Pomodoro widget.
 *
 * The timer has three deliberate display levels:
 *   card  — the full popup
 *   bubble— a compact circular timer
 *   edge  — a slim edge tab for when the user wants it out of the way
 *
 * It never auto-advances. When a phase ends it shows the choices (log the
 * session, start a break, begin the next round) and waits.
 */

import {
  initPomodoro,
  subscribePomodoro,
  getPomodoro,
  getPomodoroPrefs,
  updatePomodoroPrefs,
  pausePomodoro,
  resumePomodoro,
  chooseBreak,
  skipBreak,
  startNextRound,
  beginStopPomodoro,
  cancelStopPomodoro,
  getPendingLog,
} from '../services/pomodoroEngine.js';
import {
  POMODORO_DEFAULTS,
  PHASE,
  STATUS,
  formatClock,
  remainingMs,
  progressPct,
  phaseLabel,
  roundLabel,
  recommendedBreakType,
} from '../services/pomodoro.js';
import { escapeHtml } from '../utils/helpers.js';
import { icon, ring } from './icons.js';

let host = null;
let unsubscribe = null;
let lastRenderKey = '';
let drag = null;
let callbacks = { onLogRequest: null };
let justDragged = false;
let lastStatus = '';
let pulseTimer = null;

const MARGIN = 12;

function toast(message) {
  try { window.EMVS?.toast?.show?.(message); } catch {}
}

function timeText(state) {
  return formatClock(remainingMs(state));
}

function liveText(state) {
  if (!state) return '';
  if (state.status === STATUS.workDone) {
    return state.pendingLog
      ? 'Fokus beendet. Sitzung loggen oder Pause wählen.'
      : 'Fokus beendet. Pause wählen oder nächste Runde starten.';
  }
  if (state.status === STATUS.breakDone) return 'Pause vorbei. Nächste Runde starten oder weitere Pause wählen.';
  if (state.status === STATUS.paused) return `${phaseLabel(state)} pausiert.`;
  return `${phaseLabel(state)} läuft.`;
}

function contextInfo(state) {
  const st = window.EMVS?.getState?.() || {};
  const moduleId = state?.context?.moduleId || state?.moduleId || st.settings?.currentModuleId;
  const module = (st.modules || []).find(m => m.id === moduleId);
  const reviewId = state?.context?.reviewObjectiveId;
  const linkedId = (state?.context?.linkedObjectiveIds || [])[0];
  const objective = (st.learningObjectives || []).find(o => o.id === (reviewId || linkedId));
  return {
    moduleCode: module?.code || '',
    objectiveTitle: objective?.title || '',
    isReview: !!reviewId,
  };
}

function contextChip(state) {
  const c = contextInfo(state);
  if (!c.moduleCode && !c.objectiveTitle) return '';
  const bits = [];
  if (c.moduleCode) bits.push(`<span class="pomo-context-module">${escapeHtml(c.moduleCode)}</span>`);
  if (c.objectiveTitle) {
    bits.push(`<span class="pomo-context-objective">${c.isReview ? 'Review · ' : ''}${escapeHtml(c.objectiveTitle)}</span>`);
  }
  return `<div class="pomo-context">${bits.join('<span class="pomo-context-sep" aria-hidden="true">·</span>')}</div>`;
}

function roundDots(state) {
  const completed = Math.max(0, Math.round(Number(state?.completedRounds) || 0));
  const cycle = completed % POMODORO_DEFAULTS.roundsBeforeLongBreak;
  const working = state?.phase === PHASE.work && state?.status !== STATUS.workDone;
  const filled = working ? cycle : (completed > 0 && cycle === 0 ? POMODORO_DEFAULTS.roundsBeforeLongBreak : cycle);
  const active = working ? cycle : -1;
  return `<span class="pomo-dots" aria-hidden="true">${Array.from({ length: POMODORO_DEFAULTS.roundsBeforeLongBreak }, (_, i) =>
    `<span class="pomo-dot${i < filled ? ' is-filled' : ''}${i === active ? ' is-active' : ''}"></span>`).join('')}</span>`;
}

function button({ action, label, iconName, variant = 'secondary', attrs = '' }) {
  return `<button type="button" class="pomo-btn ${variant}" ${action} ${attrs}>
    ${iconName ? icon(iconName, 16) : ''}<span>${label}</span>
  </button>`;
}

function breakCards(state) {
  const recommended = recommendedBreakType(state);
  return `<div class="pomo-break-grid pomo-break-grid--widget" role="group" aria-label="Pause wählen">
    <button type="button" class="pomo-break-card" data-pomo-break="short">
      <span class="pomo-break-icon" aria-hidden="true">${icon('coffee', 17)}</span>
      <span class="pomo-break-copy">
        <span class="pomo-break-title">Kurz${recommended === 'short' ? ' <span class="pomo-rec">Empfohlen</span>' : ''}</span>
        <span class="pomo-break-meta">${POMODORO_DEFAULTS.shortBreakMinutes} Min</span>
      </span>
    </button>
    <button type="button" class="pomo-break-card" data-pomo-break="long">
      <span class="pomo-break-icon" aria-hidden="true">${icon('leaf', 17)}</span>
      <span class="pomo-break-copy">
        <span class="pomo-break-title">Lang${recommended === 'long' ? ' <span class="pomo-rec">Empfohlen</span>' : ''}</span>
        <span class="pomo-break-meta">${POMODORO_DEFAULTS.longBreakMinutes} Min</span>
      </span>
    </button>
  </div>`;
}

function cardMarkup(state) {
  const paused = state.status === STATUS.paused;
  const pending = state.pendingLog;
  const phase = phaseLabel(state);
  const round = roundLabel(state);
  let actions = '';

  if (state.phase === PHASE.work && state.status !== STATUS.workDone) {
    actions = `<div class="pomo-action-row">
      ${button({ action: 'data-pomo-toggle', label: paused ? 'Fortsetzen' : 'Pausieren', iconName: paused ? 'play' : 'pause', variant: 'primary' })}
      ${button({ action: 'data-pomo-stop', label: 'Beenden', iconName: 'stop', variant: 'secondary' })}
    </div>`;
  } else if (state.phase === PHASE.work && state.status === STATUS.workDone) {
    actions = `${pending ? `<div class="pomo-action-row">
      ${button({ action: 'data-pomo-log', label: `Loggen (${pending.duration} Min)`, iconName: 'log', variant: 'primary' })}
    </div>` : ''}
    ${breakCards(state)}
    <div class="pomo-action-row">
      ${button({ action: 'data-pomo-next', label: 'Nächste Runde', iconName: 'arrowRight', variant: 'secondary', attrs: pending ? 'aria-disabled="true"' : '' })}
    </div>
    ${pending ? '<p class="pomo-hint">Erst loggen, dann weiter.</p>' : ''}`;
  } else if (state.status === STATUS.breakDone) {
    actions = `<div class="pomo-action-row">
      ${button({ action: 'data-pomo-next', label: 'Nächste Runde', iconName: 'play', variant: 'primary', attrs: pending ? 'aria-disabled="true"' : '' })}
      ${pending ? button({ action: 'data-pomo-log', label: 'Loggen', iconName: 'log', variant: 'secondary' }) : ''}
    </div>
    ${breakCards(state)}`;
  } else {
    actions = `<div class="pomo-action-row">
      ${button({ action: 'data-pomo-toggle', label: paused ? 'Fortsetzen' : 'Pausieren', iconName: paused ? 'play' : 'pause', variant: 'primary' })}
      ${button({ action: 'data-pomo-skip', label: 'Pause beenden', iconName: 'check', variant: 'secondary' })}
    </div>
    ${pending ? `<div class="pomo-action-row">${button({ action: 'data-pomo-log', label: `Loggen (${pending.duration} Min)`, iconName: 'log', variant: 'ghost' })}</div>` : ''}`;
  }

  return `<div class="pomo-card" data-phase="${state.phase}" data-status="${state.status}">
    <div class="pomo-head" data-pomo-drag>
      <span class="pomo-grip" aria-hidden="true">${icon('grip', 16)}</span>
      <span class="pomo-phase">${phase}${round ? ` · ${round}` : ''}</span>
      <div class="pomo-head-actions">
        <button type="button" class="pomo-icon" data-pomo-min aria-label="Pomodoro minimieren" title="Minimieren">${icon('chevronDown', 16)}</button>
        <button type="button" class="pomo-icon" data-pomo-hide aria-label="Pomodoro ausblenden" title="Ausblenden">${icon('eyeOff', 16)}</button>
      </div>
    </div>
    <div class="pomo-main">
      ${ring(progressPct(state), { size: 104, stroke: 4, className: 'pomo-ring--widget', time: timeText(state), label: phase })}
      <div class="pomo-meta">
        ${contextChip(state)}
        <div class="pomo-meta-row">${roundDots(state)}<span class="pomo-meta-count">${state.completedRounds} ${state.completedRounds === 1 ? 'Runde' : 'Runden'}</span></div>
        <div class="pomo-bar" aria-hidden="true"><i data-pomo-bar style="width:${progressPct(state).toFixed(2)}%"></i></div>
      </div>
    </div>
    ${actions}
    <div class="pomo-card-foot">
      <button type="button" class="pomo-card-link" data-pomo-open-focus>
        ${icon('expand', 13)}<span>Fokusraum öffnen</span>
      </button>
    </div>
    <span class="sr-only" role="status" aria-live="polite">${liveText(state)}</span>
  </div>`;
}

function bubbleMarkup(state) {
  const label = state.status === STATUS.workDone
    ? 'Fertig'
    : state.status === STATUS.breakDone
      ? 'Pause'
      : (state.phase === PHASE.work ? 'Fokus' : 'Pause');
  return `<button type="button" class="pomo-bubble" data-pomo-bubble title="Pomodoro vergrößern" aria-label="Pomodoro ${phaseLabel(state)} — ${timeText(state)} — vergrößern" aria-expanded="false">
    ${ring(progressPct(state), { size: 76, stroke: 3, className: 'pomo-ring--bubble', time: timeText(state), label })}
    <span class="pomo-bubble-expand" aria-hidden="true">${icon('expand', 11)}</span>
    <span class="sr-only" role="status" aria-live="polite">${liveText(state)}</span>
  </button>`;
}

function edgeMarkup(state) {
  return `<button type="button" class="pomo-edge" data-pomo-edge title="Pomodoro öffnen" aria-label="Pomodoro ${phaseLabel(state)} — ${timeText(state)} — öffnen">
    <span class="pomo-edge-fill" data-pomo-edge-fill style="height:${progressPct(state).toFixed(2)}%"></span>
    <span class="pomo-edge-inner">
      <span class="pomo-edge-time" data-pomo-time>${timeText(state)}</span>
      <span class="pomo-edge-icon" aria-hidden="true">${icon('chevronUp', 12)}</span>
    </span>
    <span class="sr-only" role="status" aria-live="polite">${liveText(state)}</span>
  </button>`;
}

function applyPosition() {
  const prefs = getPomodoroPrefs();
  if (prefs.hidden) {
    host.classList.remove('is-positioned');
    host.style.left = '';
    host.style.top = '';
    host.style.right = '';
    host.style.bottom = '';
    return;
  }
  if (Number.isFinite(prefs.left) && Number.isFinite(prefs.top)) {
    host.classList.add('is-positioned');
    host.style.left = `${prefs.left}px`;
    host.style.top = `${prefs.top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  } else {
    host.classList.remove('is-positioned');
    host.style.left = '';
    host.style.top = '';
    host.style.right = '';
    host.style.bottom = '';
  }
}

function clampPosition() {
  if (!host || host.hidden || host.dataset.view === 'edge') return;
  if (!host.classList.contains('is-positioned')) return;
  const rect = host.getBoundingClientRect();
  const maxLeft = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const maxTop = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
  const left = Math.min(Math.max(MARGIN, rect.left), maxLeft);
  const top = Math.min(Math.max(MARGIN, rect.top), maxTop);
  if (Math.round(left) !== Math.round(rect.left)) host.style.left = `${left}px`;
  if (Math.round(top) !== Math.round(rect.top)) host.style.top = `${top}px`;
}

function snapToEdge() {
  const prefs = getPomodoroPrefs();
  if (prefs.hidden) return;
  const rect = host.getBoundingClientRect();
  const left = rect.left + rect.width / 2 < window.innerWidth / 2
    ? MARGIN
    : Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const top = Math.min(Math.max(MARGIN, rect.top), Math.max(MARGIN, window.innerHeight - rect.height - MARGIN));
  host.classList.add('is-positioned');
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  updatePomodoroPrefs({ left: Math.round(left), top: Math.round(top) });
}

function updateRail(state) {
  document.querySelectorAll('[data-focus-rail-time]').forEach(el => {
    if (state) {
      el.hidden = false;
      el.textContent = timeText(state);
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  });
}

function updateLiveValues(state) {
  if (!host || !state) return;
  const time = timeText(state);
  host.querySelectorAll('[data-pomo-time]').forEach(el => { el.textContent = time; });
  const progress = progressPct(state);
  host.querySelectorAll('[data-pomo-ring]').forEach(el => {
    el.setAttribute('stroke-dashoffset', String(100 - progress));
  });
  host.querySelectorAll('[data-pomo-bar]').forEach(el => {
    el.style.width = `${progress.toFixed(2)}%`;
  });
  host.querySelectorAll('[data-pomo-edge-fill]').forEach(el => {
    el.style.height = `${progress.toFixed(2)}%`;
  });
  host.querySelectorAll('[data-pomo-bubble]').forEach(el => {
    el.setAttribute('aria-label', `Pomodoro ${phaseLabel(state)} — ${time} — vergrößern`);
  });
  host.querySelectorAll('[data-pomo-edge]').forEach(el => {
    el.setAttribute('aria-label', `Pomodoro ${phaseLabel(state)} — ${time} — öffnen`);
  });
  updateRail(state);
}

function renderWidget() {
  if (!host) return;
  const state = getPomodoro();
  const prefs = getPomodoroPrefs();
  updateRail(state);

  // The focus room already shows the full timer. The floating widget appears
  // as soon as the user navigates away from it.
  if (window.EMVS?.getCurrentView?.() === 'focus') {
    host.hidden = true;
    host.innerHTML = '';
    host.dataset.view = '';
    lastRenderKey = '';
    return;
  }

  if (!state) {
    host.hidden = true;
    host.innerHTML = '';
    host.removeAttribute('data-phase');
    host.removeAttribute('data-status');
    host.dataset.view = '';
    host.classList.remove('is-pulsing');
    clearTimeout(pulseTimer);
    lastRenderKey = '';
    lastStatus = '';
    return;
  }

  host.hidden = false;
  host.dataset.phase = state.phase;
  host.dataset.status = state.status;
  const view = prefs.hidden ? 'edge' : prefs.minimized ? 'bubble' : 'card';

  // A completed phase gets a short, phase-coloured pulse — noticeable but calm.
  if ((state.status === STATUS.workDone || state.status === STATUS.breakDone)
      && lastStatus && lastStatus !== state.status) {
    clearTimeout(pulseTimer);
    host.classList.remove('is-pulsing');
    void host.offsetWidth;
    host.classList.add('is-pulsing');
    pulseTimer = setTimeout(() => host.classList.remove('is-pulsing'), 2400);
  }
  lastStatus = state.status;
  host.dataset.view = view;
  host.setAttribute('aria-label', view === 'edge' ? 'Pomodoro-Randlasche' : view === 'bubble' ? 'Pomodoro-Timer' : 'Pomodoro');

  const key = [
    state.phase,
    state.status,
    state.completedRounds,
    state.pendingLog ? 'pending' : 'clear',
    view,
  ].join('|');

  if (key === lastRenderKey) {
    updateLiveValues(state);
    return;
  }
  lastRenderKey = key;
  host.innerHTML = view === 'edge'
    ? edgeMarkup(state)
    : view === 'bubble'
      ? bubbleMarkup(state)
      : cardMarkup(state);
  applyPosition();
  requestAnimationFrame(clampPosition);
}

function openLog(snapshot) {
  if (!snapshot) return false;
  if (typeof callbacks.onLogRequest !== 'function') {
    toast('Sitzung konnte nicht geöffnet werden');
    return false;
  }
  return callbacks.onLogRequest(snapshot);
}

function handleAction(action, value) {
  if (action === 'min') { updatePomodoroPrefs({ minimized: true, hidden: false }); return; }
  if (action === 'hide') { updatePomodoroPrefs({ minimized: false, hidden: true }); return; }
  if (action === 'expand' || action === 'edge') { updatePomodoroPrefs({ minimized: false, hidden: false }); return; }
  if (action === 'open-focus') {
    // The focus room renders the full panel; the widget hides itself there.
    try { window.EMVS?.navigate?.('focus'); } catch {}
    return;
  }
  if (action === 'toggle') {
    const state = getPomodoro();
    if (state?.status === STATUS.paused) resumePomodoro();
    else pausePomodoro();
    return;
  }
  if (action === 'stop') {
    const snapshot = beginStopPomodoro();
    if (snapshot) {
      const opened = openLog(snapshot);
      if (opened !== true) cancelStopPomodoro();
    }
    return;
  }
  if (action === 'log') {
    openLog(getPendingLog());
    return;
  }
  if (action === 'break') {
    chooseBreak(value);
    return;
  }
  if (action === 'skip') {
    skipBreak();
    return;
  }
  if (action === 'next') {
    const result = startNextRound();
    if (!result.ok && result.reason === 'pendingLog') {
      toast('Bitte zuerst die Sitzung loggen');
      openLog(result.pendingLog);
    }
  }
}

function onClick(event) {
  if (justDragged) { justDragged = false; return; }
  if (event.target.closest('[data-pomo-bubble]')) { handleAction('expand'); return; }
  if (event.target.closest('[data-pomo-edge]')) { handleAction('edge'); return; }
  // Pointer capture can retarget the click to the host instead of the child
  // button. Treat any click inside the compact states as "open".
  if (host.dataset.view === 'bubble') { handleAction('expand'); return; }
  // The edge host is 44px wide for touch; the visible tab is only 24px.
  if (host.dataset.view === 'edge') { handleAction('edge'); return; }
  const button = event.target.closest('[data-pomo-open-focus],[data-pomo-min],[data-pomo-hide],[data-pomo-toggle],[data-pomo-stop],[data-pomo-log],[data-pomo-break],[data-pomo-skip],[data-pomo-next]');
  if (!button) return;
  if (button.hasAttribute('data-pomo-open-focus')) handleAction('open-focus');
  else if (button.hasAttribute('data-pomo-min')) handleAction('min');
  else if (button.hasAttribute('data-pomo-hide')) handleAction('hide');
  else if (button.hasAttribute('data-pomo-toggle')) handleAction('toggle');
  else if (button.hasAttribute('data-pomo-stop')) handleAction('stop');
  else if (button.hasAttribute('data-pomo-log')) handleAction('log');
  else if (button.hasAttribute('data-pomo-break')) handleAction('break', button.getAttribute('data-pomo-break'));
  else if (button.hasAttribute('data-pomo-skip')) handleAction('skip');
  else if (button.hasAttribute('data-pomo-next')) handleAction('next');
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (host.dataset.view === 'edge') return;
  const bubble = event.target.closest('[data-pomo-bubble]');
  const handle = event.target.closest('[data-pomo-drag]');
  if (!bubble && !handle) return;
  if (!bubble && event.target.closest('button')) return;

  const rect = host.getBoundingClientRect();
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    moved: false,
    isBubble: !!bubble,
  };
  host.classList.add('dragging');
  try { host.setPointerCapture(event.pointerId); } catch {}
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
  if (!drag.moved) return;
  const rect = host.getBoundingClientRect();
  const maxLeft = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const maxTop = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
  const left = Math.min(Math.max(MARGIN, drag.left + dx), maxLeft);
  const top = Math.min(Math.max(MARGIN, drag.top + dy), maxTop);
  host.classList.add('is-positioned');
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  event.preventDefault();
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const moved = drag.moved;
  drag = null;
  host.classList.remove('dragging');
  try { host.releasePointerCapture(event.pointerId); } catch {}
  if (moved) {
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 250);
    snapToEdge();
  }
}

function onKeyDown(event) {
  if (event.key !== 'Escape') return;
  if (host.dataset.view === 'card') {
    updatePomodoroPrefs({ minimized: true, hidden: false });
  }
}

function ensureHost() {
  if (host) return host;
  host = document.createElement('aside');
  host.id = 'pomodoro-widget';
  host.className = 'pomodoro-widget';
  host.hidden = true;
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Pomodoro-Timer');
  host.addEventListener('click', onClick);
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerUp);
  host.addEventListener('keydown', onKeyDown);
  document.body.appendChild(host);
  window.addEventListener('resize', clampPosition);
  window.addEventListener('orientationchange', clampPosition);
  window.addEventListener('hashchange', renderWidget);
  // The router dispatches this after every render, including the initial one.
  document.addEventListener('emvs:navigated', renderWidget);
  return host;
}

export function initPomodoroWidget({ onLogRequest } = {}) {
  if (typeof document === 'undefined') return null;
  if (onLogRequest) callbacks.onLogRequest = onLogRequest;
  ensureHost();
  if (!unsubscribe) {
    initPomodoro();
    unsubscribe = subscribePomodoro(() => renderWidget());
  }
  renderWidget();
  return host;
}

/** Bring the popup back from the bubble or edge tab. */
export function showPomodoroWidget() {
  ensureHost();
  if (!getPomodoro()) {
    toast('Kein Pomodoro aktiv');
    return false;
  }
  updatePomodoroPrefs({ minimized: false, hidden: false });
  renderWidget();
  const focusTarget = host.querySelector('.pomo-btn.primary') || host.querySelector('button');
  focusTarget?.focus?.({ preventScroll: true });
  return true;
}

/** Collapse to the circular bubble. */
export function minimizePomodoroWidget() {
  if (!getPomodoro()) return false;
  updatePomodoroPrefs({ minimized: true, hidden: false });
  return true;
}

/** Hide to the slim edge tab. */
export function hidePomodoroWidget() {
  if (!getPomodoro()) return false;
  updatePomodoroPrefs({ minimized: false, hidden: true });
  return true;
}
