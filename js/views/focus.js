/**
 * Focus room — the dedicated Pomodoro page.
 *
 * This is the calm, full-size surface. The floating widget takes over when the
 * user navigates away; the module Sessions tab keeps a compact status card.
 */

import { escapeHtml } from '../utils/helpers.js';
import { getPomodoro, subscribePomodoro } from '../services/pomodoroEngine.js';
import { STATUS } from '../services/pomodoro.js';
import { mountPomodoroPanel } from '../components/pomodoroPanel.js';
import { icon } from '../components/icons.js';
import { openModuleModal } from './settings.js';
import { startPomodoroFor, openSessionAfterTimer } from './module-sessions.js';

function reviewIntentMarkup(objective, module, timer) {
  if (!objective) return '';
  const title = objective.title || `Lernziel ${objective.number}`;
  const busy = timer?.status === STATUS.running || timer?.status === STATUS.paused;
  const pending = !!timer?.pendingLog;
  const hint = busy
    ? 'Ein Timer läuft bereits. Du kannst die Wiederholung danach starten.'
    : pending
      ? 'Logge zuerst die offene Sitzung. Danach ist die Wiederholung bereit.'
      : 'Starte eine Fokusrunde für dieses Lernziel. Danach entscheidest du über Pause und nächste Runde.';
  return `<div class="focus-intent">
    <div class="focus-intent-mark" aria-hidden="true">${icon('spark', 20)}</div>
    <div class="focus-intent-copy">
      <div class="pomo-phase">Wiederholung fällig</div>
      <div class="focus-intent-title">${escapeHtml(title)}</div>
      <p>${module ? `Modul ${escapeHtml(module.code)} · ` : ''}${hint}</p>
    </div>
    <div class="focus-intent-actions">
      <button type="button" class="pomo-btn primary" id="focus-review-start"${busy ? ' aria-disabled="true"' : ''}>
        ${icon('play', 17)}<span>Wiederholung starten</span>
      </button>
      <button type="button" class="pomo-btn ghost" id="focus-review-dismiss">Nicht jetzt</button>
    </div>
  </div>`;
}

export function renderFocus(state) {
  const moduleId = state.settings.currentModuleId || state.modules[0]?.id || null;
  const module = state.modules.find(m => m.id === moduleId) || null;
  const pendingId = state.settings.pendingReviewObjectiveId;
  const pendingObjective = pendingId
    ? state.learningObjectives.find(o => o.id === pendingId)
    : null;
  const pendingModule = pendingObjective
    ? state.modules.find(m => m.id === pendingObjective.moduleId) || module
    : module;

  const todayKey = new Date().toDateString();
  const todaySessions = state.studySessions.filter(s => {
    const d = new Date(s.startTime);
    return !Number.isNaN(d.getTime()) && d.toDateString() === todayKey;
  });
  const todayMinutes = todaySessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  const timer = getPomodoro();

  const el = document.createElement('div');
  el.className = 'focus-page';
  el.innerHTML = `
    <header class="focus-hero">
      <div class="eyebrow">Fokusraum</div>
      <h1 class="focus-title">Fokus<span class="focus-title-dot" aria-hidden="true">.</span></h1>
      <p class="page-lede">Eine Runde. Eine Pause. Du entscheidest.</p>
    </header>

    ${pendingObjective ? `<div id="focus-review-slot">${reviewIntentMarkup(pendingObjective, pendingModule, timer)}</div>` : ''}

    ${module || timer ? '<div id="focus-pomodoro"></div>' : `
      <div class="focus-empty">
        <div class="focus-empty-mark" aria-hidden="true">${icon('timer', 24)}</div>
        <h2>Noch kein Modul</h2>
        <p>Der Fokusraum braucht ein Modul, damit deine Sitzung am richtigen Ort landet.</p>
        <button type="button" class="pomo-btn primary" id="focus-create-module">Erstes Modul erstellen</button>
      </div>
    `}

    <footer class="focus-foot" aria-label="Heutiger Fokus">
      <div class="focus-stat">
        <span class="focus-stat-label">Heute</span>
        <span class="focus-stat-value">${todayMinutes} Min</span>
      </div>
      <div class="focus-stat">
        <span class="focus-stat-label">Sitzungen</span>
        <span class="focus-stat-value">${todaySessions.length}</span>
      </div>
      <div class="focus-stat">
        <span class="focus-stat-label">Modul</span>
        <span class="focus-stat-value">${module ? escapeHtml(module.code) : '—'}</span>
      </div>
    </footer>
  `;

  if (module || timer) {
    mountPomodoroPanel(el.querySelector('#focus-pomodoro'), {
      moduleId,
      variant: 'full',
      onStart: (minutes) => startPomodoroFor({ moduleId, minutes }),
      onLogRequest: openSessionAfterTimer,
    });
  }

  el.querySelector('#focus-create-module')?.addEventListener('click', () => openModuleModal());

  function startReview() {
    if (!pendingObjective) return;
    const current = getPomodoro();
    if (current?.status === STATUS.running || current?.status === STATUS.paused) {
      window.EMVS.toast?.show('Ein Timer läuft bereits');
      return;
    }
    const started = startPomodoroFor({
      moduleId: pendingObjective.moduleId || moduleId,
      linkedObjectiveIds: [pendingObjective.id],
      minutes: 25,
      reviewObjectiveId: pendingObjective.id,
    });
    if (started) window.EMVS.refresh?.();
  }

  function dismissReview() {
    const st = window.EMVS.getState();
    delete st.settings.pendingReviewObjectiveId;
    window.EMVS.save();
    window.EMVS.refresh?.();
  }

  function wireReviewActions() {
    el.querySelector('#focus-review-start')?.addEventListener('click', startReview);
    el.querySelector('#focus-review-dismiss')?.addEventListener('click', dismissReview);
  }

  if (pendingObjective) {
    wireReviewActions();
    const intentKey = (t) => `${t?.phase || ''}|${t?.status || ''}|${t?.pendingLog ? 'pending' : 'clear'}`;
    let lastIntentKey = intentKey(getPomodoro());
    setTimeout(() => {
      if (!el.isConnected) return;
      let active = true;
      const unsubscribe = subscribePomodoro(() => {
        if (!active) return;
        if (!el.isConnected) {
          active = false;
          unsubscribe();
          return;
        }
        const key = intentKey(getPomodoro());
        if (key === lastIntentKey) return;
        lastIntentKey = key;
        const slot = el.querySelector('#focus-review-slot');
        if (!slot) return;
        slot.innerHTML = reviewIntentMarkup(pendingObjective, pendingModule, getPomodoro());
        wireReviewActions();
      });
    }, 0);
  }

  return el;
}
