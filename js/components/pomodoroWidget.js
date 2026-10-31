/**
 * Floating Pomodoro widget.
 *
 * A movable, minimizable popup that stays with the user across navigation.
 * It deliberately does not auto-advance: when a phase ends it shows the
 * choices (log the session, start a short break, start a long break, or
 * begin the next round) and waits.
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
  stopPomodoro,
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

let host = null;
let unsubscribe = null;
let lastRenderKey = '';
let drag = null;
let callbacks = { onLogRequest: null };
let justDragged = false;

const MARGIN = 8;

function toast(message) {
  try { window.EMVS?.toast?.show?.(message); } catch {}
}

function timeText(state) {
  return formatClock(remainingMs(state));
}

function liveText(state) {
  if (state.status === STATUS.workDone) return 'Fokus beendet. Sitzung loggen oder Pause wählen.';
  if (state.status === STATUS.breakDone) return 'Pause vorbei. Nächste Runde starten oder weitere Pause wählen.';
  if (state.status === STATUS.paused) return `${phaseLabel(state)} pausiert.`;
  return `${phaseLabel(state)} läuft.`;
}

function cardMarkup(state) {
  const paused = state.status === STATUS.paused;
  const pending = state.pendingLog;
  const recommended = recommendedBreakType(state);
  const phase = phaseLabel(state);
  const round = roundLabel(state);
  const progress = progressPct(state).toFixed(2);

  let body = '';
  if (state.phase === PHASE.work && state.status !== STATUS.workDone) {
    body = `
      <div class="pomo-actions">
        <button type="button" class="btn primary" data-pomo-toggle>${paused ? '▶ Fortsetzen' : '⏸ Pausieren'}</button>
        <button type="button" class="btn solid-red" data-pomo-stop>⏹ Stoppen &amp; loggen</button>
      </div>
      <p class="pomo-hint">Beim Stoppen wird die Sitzung geloggt.</p>`;
  } else if (state.phase === PHASE.work && state.status === STATUS.workDone) {
    body = `
      ${pending ? `<p class="pomo-note">Sitzung über ${pending.duration} Min wartet auf dich.</p>
        <div class="pomo-actions"><button type="button" class="btn primary" data-pomo-log>Jetzt loggen</button></div>` : ''}
      <div class="pomo-choice">
        <span class="pomo-choice-label">Welche Pause?</span>
        <div class="pomo-actions">
          <button type="button" class="btn" data-pomo-break="short">Kurze Pause · ${POMODORO_DEFAULTS.shortBreakMinutes} Min</button>
          <button type="button" class="btn" data-pomo-break="long">Lange Pause · ${POMODORO_DEFAULTS.longBreakMinutes} Min${recommended === 'long' ? ' <span class="pomo-rec">Empfohlen</span>' : ''}</button>
        </div>
      </div>
      <div class="pomo-actions">
        <button type="button" class="btn ghost" data-pomo-next ${pending ? 'disabled title="Zuerst die Sitzung loggen"' : ''}>Nächste Runde</button>
      </div>`;
  } else if (state.status === STATUS.breakDone) {
    body = `
      <div class="pomo-actions">
        <button type="button" class="btn primary" data-pomo-next ${pending ? 'disabled title="Zuerst die Sitzung loggen"' : ''}>▶ Nächste Runde</button>
      </div>
      <div class="pomo-choice">
        <span class="pomo-choice-label">Oder noch eine Pause?</span>
        <div class="pomo-actions">
          <button type="button" class="btn" data-pomo-break="short">Kurze Pause · ${POMODORO_DEFAULTS.shortBreakMinutes} Min</button>
          <button type="button" class="btn" data-pomo-break="long">Lange Pause · ${POMODORO_DEFAULTS.longBreakMinutes} Min${recommended === 'long' ? ' <span class="pomo-rec">Empfohlen</span>' : ''}</button>
        </div>
      </div>
      ${pending ? `<div class="pomo-actions"><button type="button" class="btn" data-pomo-log>Sitzung loggen (${pending.duration} Min)</button></div>` : ''}`;
  } else {
    body = `
      <div class="pomo-actions">
        <button type="button" class="btn primary" data-pomo-toggle>${paused ? '▶ Fortsetzen' : '⏸ Pausieren'}</button>
        <button type="button" class="btn" data-pomo-skip>Pause überspringen</button>
      </div>
      ${pending ? `<div class="pomo-actions" style="margin-top:8px;"><button type="button" class="btn" data-pomo-log>Sitzung loggen (${pending.duration} Min)</button></div>` : ''}`;
  }

  return `
    <div class="pomo-card">
      <div class="pomo-head" data-pomo-drag>
        <span class="pomo-phase">${phase}${round ? ` · ${round}` : ''}</span>
        <button type="button" class="pomo-icon" data-pomo-min aria-label="Pomodoro minimieren" title="Minimieren">–</button>
      </div>
      <div class="pomo-time" role="timer" aria-live="off" data-pomo-time>${timeText(state)}</div>
      <div class="pomo-bar" aria-hidden="true"><i data-pomo-bar style="width:${progress}%"></i></div>
      ${body}
      <span class="sr-only" role="status" aria-live="polite">${liveText(state)}</span>
    </div>`;
}

function bubbleMarkup(state) {
  const label = state.status === STATUS.workDone
    ? 'Fertig'
    : state.status === STATUS.breakDone
      ? 'Pause'
      : (state.phase === PHASE.work ? 'Fokus' : 'Pause');
  return `
    <button type="button" class="pomo-bubble" data-pomo-bubble aria-label="Pomodoro ${phaseLabel(state)} — ${timeText(state)} — vergrößern">
      <span class="pomo-bubble-time" data-pomo-time>${timeText(state)}</span>
      <span class="pomo-bubble-label">${label}</span>
      <span class="sr-only" role="status" aria-live="polite">${liveText(state)}</span>
    </button>`;
}

function applyPosition() {
  const prefs = getPomodoroPrefs();
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
  if (!host || host.hidden || !host.classList.contains('is-positioned')) return;
  const rect = host.getBoundingClientRect();
  const maxLeft = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const maxTop = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
  const left = Math.min(Math.max(MARGIN, rect.left), maxLeft);
  const top = Math.min(Math.max(MARGIN, rect.top), maxTop);
  if (Math.round(left) !== Math.round(rect.left)) host.style.left = `${left}px`;
  if (Math.round(top) !== Math.round(rect.top)) host.style.top = `${top}px`;
}

function updateLiveValues(state) {
  const time = host.querySelector('[data-pomo-time]');
  if (time) time.textContent = timeText(state);
  const bar = host.querySelector('[data-pomo-bar]');
  if (bar) bar.style.width = `${progressPct(state).toFixed(2)}%`;
  const bubble = host.querySelector('[data-pomo-bubble]');
  if (bubble) {
    bubble.setAttribute('aria-label', `Pomodoro ${phaseLabel(state)} — ${timeText(state)} — vergrößern`);
  }
}

function renderWidget() {
  if (!host) return;
  const state = getPomodoro();
  const prefs = getPomodoroPrefs();
  if (!state) {
    host.hidden = true;
    host.innerHTML = '';
    host.removeAttribute('data-phase');
    host.removeAttribute('data-status');
    lastRenderKey = '';
    return;
  }

  host.hidden = false;
  host.dataset.phase = state.phase;
  host.dataset.status = state.status;

  const key = [
    state.phase,
    state.status,
    state.completedRounds,
    state.pendingLog ? 'pending' : 'clear',
    prefs.minimized ? 'min' : 'full',
  ].join('|');

  if (key === lastRenderKey) {
    updateLiveValues(state);
    return;
  }
  lastRenderKey = key;
  host.innerHTML = prefs.minimized ? bubbleMarkup(state) : cardMarkup(state);
  applyPosition();
  requestAnimationFrame(clampPosition);
}

function openLog(snapshot) {
  if (!snapshot) return;
  if (typeof callbacks.onLogRequest !== 'function') {
    toast('Sitzung konnte nicht geöffnet werden');
    return;
  }
  callbacks.onLogRequest(snapshot);
}

function handleAction(action, value) {
  if (action === 'min') { updatePomodoroPrefs({ minimized: true }); return; }
  if (action === 'expand') { updatePomodoroPrefs({ minimized: false }); return; }
  if (action === 'toggle') {
    const state = getPomodoro();
    if (state?.status === STATUS.paused) resumePomodoro();
    else pausePomodoro();
    return;
  }
  if (action === 'stop') {
    const snapshot = stopPomodoro();
    if (snapshot) openLog(snapshot);
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
  const bubble = event.target.closest('[data-pomo-bubble]');
  if (bubble) { handleAction('expand'); return; }
  const button = event.target.closest('[data-pomo-min],[data-pomo-toggle],[data-pomo-stop],[data-pomo-log],[data-pomo-break],[data-pomo-skip],[data-pomo-next]');
  if (!button) return;
  if (button.hasAttribute('data-pomo-min')) handleAction('min');
  else if (button.hasAttribute('data-pomo-toggle')) handleAction('toggle');
  else if (button.hasAttribute('data-pomo-stop')) handleAction('stop');
  else if (button.hasAttribute('data-pomo-log')) handleAction('log');
  else if (button.hasAttribute('data-pomo-break')) handleAction('break', button.getAttribute('data-pomo-break'));
  else if (button.hasAttribute('data-pomo-skip')) handleAction('skip');
  else if (button.hasAttribute('data-pomo-next')) handleAction('next');
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
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
  if (!drag.moved && Math.hypot(dx, dy) > 10) drag.moved = true;
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
  const isBubble = drag.isBubble;
  drag = null;
  host.classList.remove('dragging');
  try { host.releasePointerCapture(event.pointerId); } catch {}
  if (moved) {
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    const rect = host.getBoundingClientRect();
    updatePomodoroPrefs({ left: Math.round(rect.left), top: Math.round(rect.top) });
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
  document.body.appendChild(host);
  window.addEventListener('resize', clampPosition);
  window.addEventListener('orientationchange', clampPosition);
  return host;
}

export function initPomodoroWidget({ onLogRequest } = {}) {
  if (typeof document === 'undefined') return null;
  if (onLogRequest) callbacks.onLogRequest = onLogRequest;
  ensureHost();
  if (!unsubscribe) {
    // The widget can be initialized before or after the engine; subscribe()
    // immediately delivers the current state either way.
    initPomodoro();
    unsubscribe = subscribePomodoro(() => renderWidget());
  }
  renderWidget();
  return host;
}

/** Bring the popup back from the minimized pill. */
export function showPomodoroWidget() {
  ensureHost();
  if (!getPomodoro()) {
    toast('Kein Pomodoro aktiv');
    return false;
  }
  if (getPomodoroPrefs().minimized) updatePomodoroPrefs({ minimized: false });
  renderWidget();
  const focusTarget = host.querySelector('button');
  focusTarget?.focus?.({ preventScroll: true });
  return true;
}
