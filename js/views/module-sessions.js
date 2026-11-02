/**
 * Module Sessions View - Study session logging and history with a persistent
 * Pomodoro. The timer itself lives in services/pomodoroEngine.js; this view
 * only renders and controls it, so the floating widget and this page always
 * show the same state.
 */

import { escapeHtml } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, updateObjectiveHistory, recalculateObjectiveHistory } from '../services/store.js';
import {
  startPomodoro,
  completeStopPomodoro,
  cancelStopPomodoro,
  clearPendingLog,
} from '../services/pomodoroEngine.js';
import { POMODORO_DEFAULTS } from '../services/pomodoro.js';
import { mountPomodoroPanel } from '../components/pomodoroPanel.js';
import { openQuickCapture } from './captures.js';

export function renderModuleSessions(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return document.createElement('div');

  const sessions = state.studySessions
    .filter(s => s.moduleId === moduleId)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  const objectives = state.learningObjectives.filter(o => o.moduleId === moduleId);
  const resources = state.resources.filter(r => r.moduleId === moduleId);

  // Group by date
  const byDate = {};
  sessions.forEach(s => {
    const date = new Date(s.startTime).toLocaleDateString('de-CH');
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(s);
  });

  const pendingReviewId = state.settings.pendingReviewObjectiveId;
  const pendingReviewObj = pendingReviewId
    ? state.learningObjectives.find(o => o.id === pendingReviewId)
    : null;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Sitzungen · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Lernsitzungen</h1>
    <p class="page-lede">${sessions.length} Sitzungen protokolliert. Das Pomodoro läuft im Hintergrund — auch bei Seitenwechsel und Neuladen.</p>

    ${pendingReviewObj ? `
      <div class="focus-intent focus-intent--compact">
        <div>
          <div class="pomo-phase">Wiederholung fällig</div>
          <div class="focus-intent-title">${escapeHtml(pendingReviewObj.title || 'Lernziel ' + pendingReviewObj.number)}</div>
        </div>
        <button type="button" class="pomo-btn primary" id="open-review-focus">Im Fokusraum starten</button>
      </div>
    ` : ''}

    <div id="pomodoro-panel"></div>

    <div class="mt-3 timer-actions">
      <button class="btn primary" id="log-session">＋ Sitzung manuell protokollieren</button>
      <button class="btn" id="quick-capture" title="Frage, Fehler, Gedanke festhalten — Timer läuft weiter">⚡ Schnell erfassen</button>
    </div>

    ${Object.keys(byDate).length ? Object.entries(byDate).map(([date, daySessions]) => `
      <div class="card" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
          <h2 style="font-family: var(--serif); font-size: 18px;">${date === new Date().toLocaleDateString('de-CH') ? 'Heute' : date}</h2>
          <span style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">${daySessions.reduce((sum, s) => sum + s.duration, 0)} min</span>
        </div>
        ${daySessions.map(s => renderSessionItem(s, objectives, resources)).join('')}
      </div>
    `).join('') : `
      <div class="card empty-state">
        <div class="icon">⏱️</div>
        <h3>Noch keine Sitzungen</h3>
        <p>Logge deine erste Lernsitzung oder nutze das Pomodoro.</p>
      </div>
    `}
  `;

  // Compact Pomodoro status. The full focus room lives at #/fokus.
  mountPomodoroPanel(el.querySelector('#pomodoro-panel'), {
    moduleId,
    variant: 'compact',
    onStart: (minutes) => startPomodoroFor({ moduleId, minutes }),
    onLogRequest: openSessionAfterTimer,
    onOpenFocus: () => window.EMVS.navigate?.('focus'),
  });

  // Session item handlers
  el.querySelectorAll('.session-item').forEach(item => {
    const id = item.dataset.id;
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    item.querySelector('.edit-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      openSessionModal(session, moduleId);
    });

    item.querySelector('.delete-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Sitzung wirklich löschen?')) {
        state.studySessions = state.studySessions.filter(x => x.id !== id);
        // Recalculate objective history after deletion
        recalculateObjectiveHistory(state);
        window.EMVS.save();
        // Targeted: drop the row (and its day card when empty) instead of
        // wiping the view — the timer UI and its intervals keep running.
        const card = item.closest('.card');
        item.remove();
        if (card && !card.querySelector('.session-item')) card.remove();
        if (!el.querySelector('.session-item')) navigate('module-sessions');
      }
    });
  });

  // Review intent is started from the dedicated focus room, never automatically.
  el.querySelector('#open-review-focus')?.addEventListener('click', () => {
    window.EMVS.navigate?.('focus');
  });

  // Log session button
  el.querySelector('#log-session')?.addEventListener('click', () => openSessionModal(null, moduleId));

  // Fast capture: overlay-only, never touches the timer or the view.
  el.querySelector('#quick-capture')?.addEventListener('click', () => openQuickCapture({ moduleId }));

  return el;
}

/**
 * Start a Pomodoro from any session entry point. Kept as a wrapper so the
 * sidebar, palette and keyboard shortcut keep calling startTimer(moduleId, 25).
 */
export function startTimer(moduleId, plannedMinutes = POMODORO_DEFAULTS.workMinutes, options = {}) {
  return startPomodoroFor({ moduleId, minutes: plannedMinutes, ...options });
}

export function startPomodoroFor({
  moduleId,
  minutes = POMODORO_DEFAULTS.workMinutes,
  linkedObjectiveIds = [],
  linkedResourceIds = [],
  reviewObjectiveId = null,
} = {}) {
  const result = startPomodoro({
    moduleId,
    minutes,
    linkedObjectiveIds,
    linkedResourceIds,
    reviewObjectiveId,
  });
  if (result.ok) {
    if (reviewObjectiveId) {
      const st = window.EMVS.getState();
      if (st.settings.pendingReviewObjectiveId === reviewObjectiveId) {
        delete st.settings.pendingReviewObjectiveId;
        window.EMVS.save();
      }
    }
    window.EMVS.toast?.show(`Pomodoro gestartet: ${minutes} Min`);
    return true;
  }
  if (result.reason === 'pendingLog') {
    window.EMVS.toast?.show('Bitte zuerst die offene Sitzung loggen');
    if (result.pendingLog) openSessionAfterTimer(result.pendingLog);
    return false;
  }
  if (result.reason === 'running') {
    window.EMVS.toast?.show('Es läuft bereits eine Sitzung');
    window.EMVS.pomodoro?.show?.();
    return false;
  }
  return false;
}

/**
 * Open the log form for a completed or early-stopped Pomodoro round.
 * `snapshot` is either a pendingLog from the engine or the result of
 * beginStopPomodoro(). It never starts anything: saving finalizes the round,
 * canceling keeps it (or restores the pending session).
 */
export function openSessionAfterTimer(snapshot) {
  if (!snapshot) return false;
  if (window.EMVS.modal?.isOpen?.()) {
    window.EMVS.toast?.show('Schließe zuerst den offenen Dialog');
    return false;
  }

  const state = window.EMVS.getState();
  const moduleId = snapshot.moduleId || state.settings.currentModuleId;
  const objectives = state.learningObjectives.filter(o => o.moduleId === moduleId);
  const resources = state.resources.filter(r => r.moduleId === moduleId);
  const linkedObjectiveIds = new Set(snapshot.linkedObjectiveIds || []);
  const linkedResourceIds = new Set(snapshot.linkedResourceIds || []);
  const startValue = toLocalInput(snapshot.startTime);

  const durationLabel = `${snapshot.duration} ${snapshot.duration === 1 ? 'Minute' : 'Minuten'}`;
  const info = snapshot.completed
    ? `Pomodoro-Runde abgeschlossen nach ${durationLabel}. Wähle Lernziele und Material, füge optional eine Notiz hinzu.`
    : `Runde pausiert nach ${durationLabel}. Speichern beendet sie; Abbrechen ${snapshot.wasRunning ? 'setzt den Fokus fort' : 'lässt sie pausiert'}.`;

  openModal({
    title: `Sitzung speichern (${snapshot.duration} Min)`,
    body: `
      <div style="margin-bottom: 16px; padding: 12px; background: var(--bg); border-radius: 4px; font-size: 13px; color: var(--ink-2);">
        <strong>${info}</strong>
      </div>
      <form id="session-form">
        <input type="hidden" name="startTime" value="${startValue}">
        <input type="hidden" name="duration" value="${snapshot.duration}">
        <div class="field-row">
          <label>Notiz (optional)</label>
          <input type="text" name="note" value="" placeholder="Was hast du gelernt?">
        </div>
        <details class="session-more">
          <summary>Lernziele & Material verknüpfen</summary>
          <div class="field-row">
            <label>Lernziele</label>
            <select name="linkedObjectives" multiple style="min-height: 100px;">
              ${objectives.map(o => `<option value="${o.id}" ${linkedObjectiveIds.has(o.id) ? 'selected' : ''}>${o.number}: ${escapeHtml(o.title)}</option>`).join('')}
            </select>
            <small style="color: var(--ink-3);">Strg/Cmd + Klick für Mehrfachauswahl</small>
          </div>
          <div class="field-row">
            <label>Material</label>
            <select name="linkedResources" multiple style="min-height: 100px;">
              ${resources.map(r => `<option value="${r.id}" ${linkedResourceIds.has(r.id) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </div>
        </details>
      </form>
    `,
    footer: `
      <button class="btn${snapshot.endedEarly ? '' : ' danger'}" data-action="cancel">${snapshot.endedEarly ? 'Zurück zum Timer' : 'Verwerfen'}</button>
      <button class="btn primary" data-action="save">Sitzung speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) {
      if (snapshot.endedEarly) {
        cancelStopPomodoro();
        window.EMVS.toast?.show('Fokus bleibt erhalten');
      } else {
        clearPendingLog();
        window.EMVS.toast?.show('Sitzung verworfen');
      }
      return;
    }

    const session = {
      id: generateId(),
      moduleId,
      startTime: result.startTime,
      duration: parseInt(result.duration, 10) || snapshot.duration,
      linkedObjectiveIds: result.linkedObjectives
        ? (Array.isArray(result.linkedObjectives) ? result.linkedObjectives : [result.linkedObjectives])
        : [],
      linkedResourceIds: result.linkedResources
        ? (Array.isArray(result.linkedResources) ? result.linkedResources : [result.linkedResources])
        : [],
      note: result.note?.trim() || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    state.studySessions.push(session);
    updateObjectiveHistory(state, session);
    window.EMVS.save();

    if (snapshot.endedEarly) completeStopPomodoro();
    else clearPendingLog();

    if (snapshot.reviewObjectiveId) {
      state.settings.todayReviewOutcome = snapshot.reviewObjectiveId;
      delete state.settings.pendingReviewObjectiveId;
      window.EMVS.save();
    }

    window.EMVS.toast?.show(`Sitzung geloggt: ${session.duration} min`);

    // Stay where the user is: Today, the module page, the focus room, or the
    // Prüfungen page all have a session context to update.
    const view = window.EMVS.getCurrentView?.();
    if (view && window.EMVS.refresh) {
      window.EMVS.refresh('pomodoro-session-logged', { sessionId: session.id, outcome: snapshot.reviewObjectiveId || null });
    }
  });

  setTimeout(() => {
    const form = document.getElementById('session-form');
    form?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = {};
      for (const [key, value] of fd.entries()) {
        if (key === 'linkedObjectives' || key === 'linkedResources') {
          data[key] = data[key] ? [...data[key], value] : [value];
        } else {
          data[key] = value;
        }
      }
      closeModal(data);
    });

    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('session-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);

  return true;
}

function renderSessionItem(session, objectives, resources) {
  const objNames = session.linkedObjectiveIds?.map(id => {
    const o = objectives.find(x => x.id === id);
    return o ? `${o.number}` : '';
  }).filter(Boolean).join(', ') || '—';

  const resNames = session.linkedResourceIds?.map(id => {
    const r = resources.find(x => x.id === id);
    return r ? r.name.slice(0, 20) : '';
  }).filter(Boolean).join(', ') || '—';

  const startTime = new Date(session.startTime);
  const timeStr = startTime.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  const isTimerSession = session.note === 'Timer-Sitzung' || (session.note && session.note.startsWith('Timer'));

  return `
    <div class="session-item" data-id="${session.id}" style="display: grid; grid-template-columns: 60px 1fr auto; gap: 16px; align-items: start; padding: 12px 8px; border-radius: 4px; cursor: pointer; transition: background 0.12s; border-bottom: 1px solid var(--rule);">
      <div style="font-family: var(--mono); font-size: 12px; color: var(--ink-3); text-align: right; padding-top: 4px;">${timeStr}</div>
      <div style="min-width: 0;">
        <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
          <span style="font-weight: 500; color: var(--ink);">${escapeHtml(session.note || 'Allgemeines Lernen')}</span>
          ${isTimerSession ? '<span class="badge" style="background: var(--blue-soft); border-color: var(--blue); color: var(--blue); font-size: 10px;">Timer</span>' : ''}
        </div>
        <div style="font-size: 13px; color: var(--ink-2); display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px;">
          <span><strong>Dauer:</strong> ${session.duration} min</span>
          <span><strong>Lernziele:</strong> ${escapeHtml(objNames)}</span>
          <span><strong>Material:</strong> ${escapeHtml(resNames)}</span>
        </div>
      </div>
      <div style="display: flex; gap: 4px;">
        <button class="edit-btn" style="padding: 4px 8px; font-size: 11px; color: var(--ink-3);" title="Bearbeiten">✎</button>
        <button class="delete-btn" style="padding: 4px 8px; font-size: 11px; color: var(--red);" title="Löschen">✕</button>
      </div>
    </div>
  `;
}

export function openSessionModal(session = null, moduleId = null, preset = {}) {
  const state = window.EMVS.getState();
  const modId = moduleId || state.settings.currentModuleId;
  const objectives = state.learningObjectives.filter(o => o.moduleId === modId);
  const resources = state.resources.filter(r => r.moduleId === modId);

  const isNew = !session;
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 30 * 60000); // 30 min ago

  const s = session || {
    id: generateId(),
    moduleId: modId,
    startTime: defaultStart.toISOString(),
    duration: 30,
    linkedObjectiveIds: [],
    linkedResourceIds: [],
    note: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Preset for callers like Today ("Start Session" on a focused objective):
  // pre-selects objectives/resources and suggests a duration.
  // Optional onSave callback: if provided, called with (session, isNew) instead of navigating.
  if (isNew && preset) {
    if (Array.isArray(preset.linkedObjectiveIds)) s.linkedObjectiveIds = [...preset.linkedObjectiveIds];
    if (Array.isArray(preset.linkedResourceIds)) s.linkedResourceIds = [...preset.linkedResourceIds];
    if (typeof preset.duration === 'number' && preset.duration > 0) s.duration = preset.duration;
    if (typeof preset.note === 'string') s.note = preset.note;
  }

  const onSave = typeof preset.onSave === 'function' ? preset.onSave : null;

  openModal({
    title: isNew ? 'Sitzung protokollieren' : 'Sitzung bearbeiten',
    body: `
      <form id="session-form">
        <div class="field-row">
          <label>Startzeit</label>
          <input type="datetime-local" name="startTime" value="${toLocalInput(s.startTime)}" required>
        </div>
        <div class="field-row">
          <label>Dauer (Minuten)</label>
          <input type="number" name="duration" value="${s.duration}" min="1" max="480" required>
        </div>
        <div class="field-row">
          <label>Notiz</label>
          <input type="text" name="note" value="${escapeHtml(s.note || '')}" placeholder="Was hast du gelernt?">
        </div>
        <div class="field-row">
          <label>Verknüpfte Lernziele</label>
          <select name="linkedObjectives" multiple style="min-height: 100px;">
            ${objectives.map(o => `<option value="${o.id}" ${s.linkedObjectiveIds?.includes(o.id) ? 'selected' : ''}>${o.number}: ${escapeHtml(o.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>Verknüpfte Material</label>
          <select name="linkedResources" multiple style="min-height: 100px;">
            ${resources.map(r => `<option value="${r.id}" ${s.linkedResourceIds?.includes(r.id) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
          </select>
        </div>
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;

    s.startTime = result.startTime;
    s.duration = parseInt(result.duration, 10) || 30;
    s.note = result.note?.trim() || '';
    s.linkedObjectiveIds = result.linkedObjectives ? (Array.isArray(result.linkedObjectives) ? result.linkedObjectives : [result.linkedObjectives]) : [];
    s.linkedResourceIds = result.linkedResources ? (Array.isArray(result.linkedResources) ? result.linkedResources : [result.linkedResources]) : [];
    s.updatedAt = Date.now();

    if (isNew) {
      s.moduleId = modId;
      state.studySessions.push(s);
      updateObjectiveHistory(state, s);
    } else {
      // For edits, recalculate to handle removed objectives or duration changes
      recalculateObjectiveHistory(state);
    }

    window.EMVS.save();

    if (onSave) {
      onSave(s, isNew);
    } else if (window.EMVS.refresh) {
      window.EMVS.refresh('session-logged', { sessionId: s.id });
    } else {
      navigate('module-sessions');
    }
  });

  setTimeout(() => {
    const form = document.getElementById('session-form');
    form?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = {};
      for (const [key, value] of fd.entries()) {
        if (key === 'linkedObjectives' || key === 'linkedResources') {
          data[key] = data[key] ? [...data[key], value] : [value];
        } else {
          data[key] = value;
        }
      }
      closeModal(data);
    });

    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('session-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}

/** datetime-local wants local wall-clock text, not a UTC ISO string. */
function toLocalInput(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function navigate(view) {
  window.EMVS.navigate?.(view);
}
