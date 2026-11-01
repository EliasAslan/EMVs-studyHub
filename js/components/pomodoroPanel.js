/**
 * Pomodoro panel — the full focus-room surface and a compact Sessions card.
 *
 * The engine owns the timer. This component only renders and wires actions, so
 * the dedicated #/fokus page, the module Sessions tab and the floating widget
 * can never disagree about the current phase.
 */

import {
  getPomodoro,
  subscribePomodoro,
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

const STANDARD_MINUTES = [15, 25, 45];
const DEFAULT_MINUTES = POMODORO_DEFAULTS.workMinutes;

function toast(message) {
  try { window.EMVS?.toast?.show?.(message); } catch {}
}

function contextInfo(state, options) {
  const st = window.EMVS?.getState?.() || {};
  const moduleId = state?.context?.moduleId || state?.moduleId || options.moduleId
    || st.settings?.currentModuleId;
  const module = (st.modules || []).find(m => m.id === moduleId);
  const reviewId = state?.context?.reviewObjectiveId;
  const linkedId = (state?.context?.linkedObjectiveIds || [])[0];
  const objectiveId = reviewId || linkedId;
  const objective = (st.learningObjectives || []).find(o => o.id === objectiveId);
  return {
    moduleCode: module?.code || '',
    moduleTitle: module?.title || '',
    objectiveTitle: objective?.title || '',
    isReview: !!reviewId,
  };
}

function contextChip(state, options) {
  const c = contextInfo(state, options);
  if (!c.moduleCode && !c.objectiveTitle) return '';
  const bits = [];
  if (c.moduleCode) bits.push(`<span class="pomo-context-module">Modul ${escapeHtml(c.moduleCode)}</span>`);
  if (c.objectiveTitle) {
    bits.push(`<span class="pomo-context-objective">${c.isReview ? 'Review · ' : ''}${escapeHtml(c.objectiveTitle)}</span>`);
  }
  return `<div class="pomo-context">${bits.join('<span class="pomo-context-sep" aria-hidden="true">·</span>')}</div>`;
}

function roundDots(state) {
  const completed = Math.max(0, Math.round(Number(state?.completedRounds) || 0));
  const cycle = completed % POMODORO_DEFAULTS.roundsBeforeLongBreak;
  const working = state?.phase === PHASE.work && state?.status !== STATUS.workDone;
  // While the next round is running, the first dot of the new cycle is active.
  // Once the round is done, show the full cycle that was just completed.
  const filled = working ? cycle : (completed > 0 && cycle === 0 ? POMODORO_DEFAULTS.roundsBeforeLongBreak : cycle);
  const active = working ? cycle : -1;
  const dots = Array.from({ length: POMODORO_DEFAULTS.roundsBeforeLongBreak }, (_, i) => {
    const cls = `pomo-dot${i < filled ? ' is-filled' : ''}${i === active ? ' is-active' : ''}`;
    return `<span class="${cls}" aria-hidden="true"></span>`;
  }).join('');
  return `<div class="pomo-rounds" aria-label="${completed} abgeschlossene ${completed === 1 ? 'Runde' : 'Runden'}">
    <span class="pomo-dots">${dots}</span>
    <span class="pomo-rounds-label">${completed} ${completed === 1 ? 'Runde' : 'Runden'}</span>
  </div>`;
}

function actionButton({ action, label, iconName, variant = 'secondary', attrs = '' }) {
  return `<button type="button" class="pomo-btn ${variant}" ${action} ${attrs}>
    ${iconName ? icon(iconName, 17) : ''}<span>${label}</span>
  </button>`;
}

function breakCards(state) {
  const recommended = recommendedBreakType(state);
  return `<div class="pomo-break-grid" role="group" aria-label="Pause wählen">
    <button type="button" class="pomo-break-card${recommended === 'short' ? ' is-recommended' : ''}" data-pomo-break="short">
      <span class="pomo-break-icon" aria-hidden="true">${icon('coffee', 19)}</span>
      <span class="pomo-break-copy">
        <span class="pomo-break-title">Kurze Pause${recommended === 'short' ? ' <span class="pomo-rec">Empfohlen</span>' : ''}</span>
        <span class="pomo-break-meta">${POMODORO_DEFAULTS.shortBreakMinutes} Min</span>
      </span>
    </button>
    <button type="button" class="pomo-break-card${recommended === 'long' ? ' is-recommended' : ''}" data-pomo-break="long">
      <span class="pomo-break-icon" aria-hidden="true">${icon('leaf', 19)}</span>
      <span class="pomo-break-copy">
        <span class="pomo-break-title">Lange Pause${recommended === 'long' ? ' <span class="pomo-rec">Empfohlen</span>' : ''}</span>
        <span class="pomo-break-meta">${POMODORO_DEFAULTS.longBreakMinutes} Min</span>
      </span>
    </button>
  </div>`;
}

function pendingNote(state) {
  const pending = state?.pendingLog;
  if (!pending) return '';
  return `<div class="pomo-note">
    <span>Sitzung über <strong>${pending.duration} Min</strong> wartet auf dich.</span>
    ${actionButton({ action: 'data-pomo-log', label: 'Jetzt loggen', iconName: 'log', variant: 'ghost' })}
  </div>`;
}

function liveText(state) {
  if (!state) return 'Pomodoro bereit.';
  if (state.status === STATUS.workDone) {
    return state.pendingLog
      ? 'Fokus beendet. Sitzung loggen oder Pause wählen.'
      : 'Fokus beendet. Pause wählen oder nächste Runde starten.';
  }
  if (state.status === STATUS.breakDone) return 'Pause vorbei. Nächste Runde starten oder weitere Pause wählen.';
  if (state.status === STATUS.paused) return `${phaseLabel(state)} pausiert.`;
  return `${phaseLabel(state)} läuft.`;
}

function idleMarkup(local, options) {
  const custom = !STANDARD_MINUTES.includes(local.selectedMinutes);
  const chips = STANDARD_MINUTES.map(m => `
    <button type="button" class="pomo-chip${local.selectedMinutes === m ? ' is-active' : ''}"
      data-pomo-minutes="${m}" aria-pressed="${local.selectedMinutes === m}">${m} Min</button>`).join('');
  return `<section class="pomo-panel pomo-panel--idle" aria-label="Pomodoro-Timer" data-phase="work" data-status="idle">
    <div class="pomo-panel-head">
      <div class="pomo-panel-heading">
        <div class="pomo-phase">Bereit</div>
        ${contextChip(null, options)}
      </div>
      <div class="pomo-rounds"><span class="pomo-rounds-label">${local.selectedMinutes === DEFAULT_MINUTES ? `${DEFAULT_MINUTES} Min Standard` : `${local.selectedMinutes} Min gewählt`}</span></div>
    </div>
    <div class="pomo-panel-body">
      ${ring(0, { size: 248, stroke: 6, time: `${local.selectedMinutes}:00`, label: 'Fokus' })}
      <div class="pomo-duration" role="group" aria-label="Dauer wählen">
        ${chips}
        <button type="button" class="pomo-chip${custom ? ' is-active' : ''}" data-pomo-custom
          aria-pressed="${custom}">Eigene${custom ? ` · ${local.selectedMinutes} Min` : ''}</button>
      </div>
      ${actionButton({ action: 'data-pomo-start', label: 'Fokus starten', iconName: 'play', variant: 'primary' })}
      <p class="pomo-hint">Du startest selbst. Nach der Runde entscheidest du, ob du loggst und welche Pause passt.</p>
    </div>
  </section>`;
}

function fullMarkup(state, local, options) {
  if (!state) return idleMarkup(local, options);

  const paused = state.status === STATUS.paused;
  const pending = state.pendingLog;
  const phase = phaseLabel(state);
  const round = roundLabel(state);
  let actions = '';
  let extra = '';

  if (state.phase === PHASE.work && state.status !== STATUS.workDone) {
    actions = `<div class="pomo-action-row">
      ${actionButton({ action: 'data-pomo-toggle', label: paused ? 'Fortsetzen' : 'Pausieren', iconName: paused ? 'play' : 'pause', variant: 'primary' })}
      ${actionButton({ action: 'data-pomo-stop', label: 'Beenden & loggen', iconName: 'stop', variant: 'secondary' })}
    </div>
    <p class="pomo-hint">Beim Beenden bleibt die Runde pausiert, bis du sie speicherst oder verwirfst.</p>`;
  } else if (state.phase === PHASE.work && state.status === STATUS.workDone) {
    actions = `<div class="pomo-action-row">
      ${pending ? actionButton({ action: 'data-pomo-log', label: `Sitzung loggen (${pending.duration} Min)`, iconName: 'log', variant: 'primary' }) : ''}
      ${actionButton({ action: 'data-pomo-next', label: 'Nächste Runde', iconName: 'arrowRight', variant: 'secondary', attrs: pending ? 'aria-disabled="true"' : '' })}
    </div>
    <p class="pomo-hint">${pending ? 'Erst die Sitzung loggen, dann die nächste Runde starten.' : 'Wähle eine Pause oder starte direkt die nächste Runde.'}</p>
    ${breakCards(state)}`;
  } else if (state.status === STATUS.breakDone) {
    actions = `<div class="pomo-action-row">
      ${actionButton({ action: 'data-pomo-next', label: 'Nächste Runde', iconName: 'play', variant: 'primary', attrs: pending ? 'aria-disabled="true"' : '' })}
      ${pending ? actionButton({ action: 'data-pomo-log', label: 'Sitzung loggen', iconName: 'log', variant: 'secondary' }) : ''}
    </div>
    <p class="pomo-hint">${pending ? 'Die Sitzung wartet noch auf dich.' : 'Oder gönn dir noch eine Pause.'}</p>
    ${breakCards(state)}`;
  } else {
    actions = `<div class="pomo-action-row">
      ${actionButton({ action: 'data-pomo-toggle', label: paused ? 'Fortsetzen' : 'Pausieren', iconName: paused ? 'play' : 'pause', variant: 'primary' })}
      ${actionButton({ action: 'data-pomo-skip', label: 'Pause beenden', iconName: 'check', variant: 'secondary' })}
    </div>
    <p class="pomo-hint">Die nächste Runde startest du selbst.</p>`;
    extra = pending ? pendingNote(state) : '';
  }

  return `<section class="pomo-panel pomo-panel--active" aria-label="Pomodoro-Timer" data-phase="${state.phase}" data-status="${state.status}">
    <div class="pomo-panel-head">
      <div class="pomo-panel-heading">
        <div class="pomo-phase">${phase}${round ? ` · ${round}` : ''}</div>
        ${contextChip(state, options)}
      </div>
      ${roundDots(state)}
    </div>
    <div class="pomo-panel-body">
      ${ring(progressPct(state), { size: 248, stroke: 6, time: formatClock(remainingMs(state)), label: phase })}
      ${extra}
      ${actions}
    </div>
    <span class="sr-only" role="status" aria-live="polite">${liveText(state)}</span>
  </section>`;
}

function compactMarkup(state, local, options) {
  if (!state) {
    return `<div class="pomo-compact pomo-compact--idle">
      <div class="pomo-compact-head">
        <div>
          <div class="pomo-phase">Fokusraum</div>
          <div class="pomo-compact-title">Bereit für eine Runde</div>
        </div>
        <span class="pomo-compact-mark" aria-hidden="true">${icon('timer', 20)}</span>
      </div>
      <p class="pomo-hint">${DEFAULT_MINUTES} Min Fokus. Danach entscheidest du selbst.</p>
      <div class="pomo-action-row">
        ${actionButton({ action: 'data-pomo-start', label: `Fokus starten · ${local.selectedMinutes} Min`, iconName: 'play', variant: 'primary' })}
        ${actionButton({ action: 'data-pomo-open-focus', label: 'Fokusraum öffnen', iconName: 'arrowRight', variant: 'secondary' })}
      </div>
      <span class="sr-only" role="status" aria-live="polite">Pomodoro bereit.</span>
    </div>`;
  }

  const paused = state.status === STATUS.paused;
  const pending = state.pendingLog;
  const phase = phaseLabel(state);
  const round = roundLabel(state);
  let actions = '';

  if (state.phase === PHASE.work && state.status !== STATUS.workDone) {
    actions = `${actionButton({ action: 'data-pomo-toggle', label: paused ? 'Fortsetzen' : 'Pausieren', iconName: paused ? 'play' : 'pause', variant: 'primary' })}
      ${actionButton({ action: 'data-pomo-open-focus', label: 'Öffnen', iconName: 'expand', variant: 'secondary' })}`;
  } else if (state.phase === PHASE.work && state.status === STATUS.workDone) {
    actions = `${pending ? actionButton({ action: 'data-pomo-log', label: `Loggen (${pending.duration} Min)`, iconName: 'log', variant: 'primary' }) : ''}
      ${actionButton({ action: 'data-pomo-open-focus', label: 'Pause wählen', iconName: 'arrowRight', variant: pending ? 'secondary' : 'primary' })}`;
  } else if (state.status === STATUS.breakDone) {
    actions = `${actionButton({ action: 'data-pomo-next', label: 'Nächste Runde', iconName: 'play', variant: 'primary', attrs: pending ? 'aria-disabled="true"' : '' })}
      ${actionButton({ action: 'data-pomo-open-focus', label: 'Öffnen', iconName: 'expand', variant: 'secondary' })}`;
  } else {
    actions = `${actionButton({ action: 'data-pomo-toggle', label: paused ? 'Fortsetzen' : 'Pausieren', iconName: paused ? 'play' : 'pause', variant: 'primary' })}
      ${actionButton({ action: 'data-pomo-open-focus', label: 'Öffnen', iconName: 'expand', variant: 'secondary' })}`;
  }

  return `<div class="pomo-compact" data-phase="${state.phase}" data-status="${state.status}">
    <div class="pomo-compact-head">
      <div>
        <div class="pomo-phase">${phase}${round ? ` · ${round}` : ''}</div>
        ${contextChip(state, options)}
      </div>
      <div class="pomo-compact-time" role="timer" aria-live="off" data-pomo-time>${formatClock(remainingMs(state))}</div>
    </div>
    <div class="pomo-bar" aria-hidden="true"><i data-pomo-bar style="width:${progressPct(state).toFixed(2)}%"></i></div>
    ${pendingNote(state)}
    <div class="pomo-action-row">${actions}</div>
    <span class="sr-only" role="status" aria-live="polite">${liveText(state)}</span>
  </div>`;
}

function updateLive(container, state) {
  if (!container) return;
  const time = state ? formatClock(remainingMs(state)) : null;
  container.querySelectorAll('[data-pomo-time]').forEach(el => {
    if (time) el.textContent = time;
  });
  if (state) {
    const progress = progressPct(state);
    container.querySelectorAll('[data-pomo-ring]').forEach(el => {
      el.setAttribute('stroke-dashoffset', String(100 - progress));
    });
    container.querySelectorAll('[data-pomo-bar]').forEach(el => {
      el.style.width = `${progress.toFixed(2)}%`;
    });
  }
}

function wire(container, state, local, options, rerender) {
  container.querySelectorAll('[data-pomo-minutes]').forEach(btn => {
    btn.addEventListener('click', () => {
      local.selectedMinutes = parseInt(btn.dataset.pomoMinutes, 10) || DEFAULT_MINUTES;
      rerender();
    });
  });

  container.querySelector('[data-pomo-custom]')?.addEventListener('click', () => {
    const raw = window.prompt('Dauer in Minuten:', String(local.selectedMinutes || 30));
    if (raw === null) return;
    const minutes = parseInt(raw, 10);
    if (!minutes || minutes < 1 || minutes > 480) {
      toast('Bitte 1 bis 480 Minuten eingeben');
      return;
    }
    local.selectedMinutes = minutes;
    rerender();
  });

  container.querySelector('[data-pomo-start]')?.addEventListener('click', () => {
    options.onStart?.(local.selectedMinutes);
  });

  container.querySelector('[data-pomo-open-focus]')?.addEventListener('click', () => {
    options.onOpenFocus?.();
  });

  container.querySelector('[data-pomo-toggle]')?.addEventListener('click', () => {
    const st = getPomodoro();
    if (st?.status === STATUS.paused) resumePomodoro();
    else pausePomodoro();
  });

  container.querySelector('[data-pomo-stop]')?.addEventListener('click', () => {
    const snapshot = beginStopPomodoro();
    if (!snapshot) return;
    const opened = options.onLogRequest?.(snapshot);
    if (opened !== true) cancelStopPomodoro();
  });

  container.querySelectorAll('[data-pomo-log]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pending = getPendingLog();
      if (pending) options.onLogRequest?.(pending);
    });
  });

  container.querySelectorAll('[data-pomo-break]').forEach(btn => {
    btn.addEventListener('click', () => chooseBreak(btn.dataset.pomoBreak));
  });

  container.querySelector('[data-pomo-skip]')?.addEventListener('click', () => skipBreak());

  container.querySelector('[data-pomo-next]')?.addEventListener('click', () => {
    const result = startNextRound();
    if (!result.ok && result.reason === 'pendingLog') {
      toast('Bitte zuerst die Sitzung loggen');
      if (result.pendingLog) options.onLogRequest?.(result.pendingLog);
    }
  });
}

/**
 * Mount a panel into a container. Returns a cleanup function; the component
 * also self-cleans when the view is replaced.
 */
export function mountPomodoroPanel(container, options = {}) {
  if (!container) return () => {};
  const local = { selectedMinutes: options.defaultMinutes || DEFAULT_MINUTES };
  let cleanup = () => {};

  const renderNow = () => {
    const state = getPomodoro();
    const key = [
      options.variant || 'full',
      state?.phase || 'idle',
      state?.status || 'idle',
      state?.completedRounds || 0,
      state?.pendingLog ? 'pending' : 'clear',
      local.selectedMinutes,
    ].join('|');
    if (container.dataset.pomoKey === key) {
      updateLive(container, state);
      return;
    }
    container.dataset.pomoKey = key;
    container.innerHTML = (options.variant === 'compact')
      ? compactMarkup(state, local, options)
      : fullMarkup(state, local, options);
    wire(container, state, local, options, renderNow);
  };

  renderNow();

  const timer = setTimeout(() => {
    if (!container.isConnected) return;
    let active = true;
    const unsubscribe = subscribePomodoro(() => {
      if (!active) return;
      if (!container.isConnected) {
        active = false;
        unsubscribe();
        return;
      }
      renderNow();
    });
    cleanup = () => {
      active = false;
      unsubscribe();
    };
  }, 0);

  return () => {
    clearTimeout(timer);
    cleanup();
  };
}
