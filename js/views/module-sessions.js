/**
 * Module Sessions View - Study session logging and history with persistent timer
 */

import { escapeHtml, escapeAttr, formatDateTime } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, saveTimerState, loadTimerState, clearTimerState, updateObjectiveHistory, recalculateObjectiveHistory } from '../services/store.js';
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
  
  // Check for running / paused timer (same module only)
  const timerState = loadTimerState();
  const isTimerRunning = !!(timerState && timerState.moduleId === moduleId && timerState.running);
  const isTimerPaused = !!(timerState && timerState.moduleId === moduleId && !timerState.running && (timerState.pausedTime || 0) > 0);
  const timerElapsed = isTimerRunning
    ? Math.floor(((timerState.pausedTime || 0) + Date.now() - timerState.startTime) / 1000)
    : (isTimerPaused ? Math.floor((timerState.pausedTime || 0) / 1000) : 0);
  
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Sitzungen · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Lernsitzungen</h1>
    <p class="page-lede">${sessions.length} Sitzungen protokolliert. Timer läuft im Hintergrund, auch bei Seitenneuladen.</p>
    
    ${renderTimerUI(isTimerRunning, timerElapsed, isTimerPaused, timerState?.plannedMinutes)}
    
    <div class="mt-3 timer-actions">
      <button class="btn primary" id="log-session">＋ Sitzung manuell protokollieren</button>
      <button class="btn" id="quick-capture" title="Frage, Fehler, Gedanke festhalten — Timer läuft weiter">⚡ Erfassen</button>
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
        <p>Logge deine erste Lernsitzung oder nutze den Timer.</p>
      </div>
    `}
  `;
  
  // Timer event handlers
  setupTimerHandlers(el, moduleId, state);
  
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
  
  // Log session button
  el.querySelector('#log-session')?.addEventListener('click', () => openSessionModal(null, moduleId));

  // Fast capture: overlay-only, never touches the timer or the view.
  el.querySelector('#quick-capture')?.addEventListener('click', () => openQuickCapture({ moduleId }));
  
  return el;
}

function renderTimerUI(isRunning, elapsedSeconds, isPaused = false, plannedMinutes = null) {
  const elapsed = (isRunning || isPaused) ? elapsedSeconds : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  
  if (isRunning) {
    return `
      <div class="card" style="margin-bottom: 16px; border-color: var(--accent); background: var(--accent-soft);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="font-family: var(--mono); font-size: 32px; color: var(--accent); font-variant-numeric: tabular-nums;" id="timer-display">${timeStr}</span>
            <span style="color: var(--ink-2); font-size: 14px;">Timer läuft…${plannedMinutes ? ` (geplant: ${plannedMinutes} Min)` : ''}</span>
          </div>
          <div class="timer-actions">
            <button class="btn solid-accent" id="timer-pause">⏸ Pausieren</button>
            <button class="btn solid-red" id="timer-stop">⏹ Stoppen & loggen</button>
          </div>
        </div>
      </div>
    `;
  }

  if (isPaused) {
    return `
      <div class="card" style="margin-bottom: 16px; border-color: var(--blue); background: var(--blue-soft);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="font-family: var(--mono); font-size: 32px; color: var(--blue); font-variant-numeric: tabular-nums;" id="timer-display">${timeStr}</span>
            <span style="color: var(--ink-2); font-size: 14px;">Timer pausiert${plannedMinutes ? ` (geplant: ${plannedMinutes} Min)` : ''}</span>
          </div>
          <div class="timer-actions">
            <button class="btn primary" id="timer-resume">▶ Fortsetzen</button>
            <button class="btn solid-red" id="timer-stop">⏹ Stoppen & loggen</button>
            <button class="btn" id="timer-discard">Verwerfen</button>
          </div>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="card" style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="font-family: var(--mono); font-size: 32px; color: var(--ink-3); font-variant-numeric: tabular-nums;">00:00</span>
          <span style="color: var(--ink-2); font-size: 14px;">Bereit</span>
        </div>
        <div class="timer-actions">
          <button class="btn primary" id="timer-start-15">▶ 15 Min</button>
          <button class="btn primary" id="timer-start-25">▶ 25 Min</button>
          <button class="btn" id="timer-start-45">▶ 45 Min</button>
          <button class="btn" id="timer-start-custom">▶ Benutzerdefiniert</button>
        </div>
      </div>
    </div>
  `;
}

function setupTimerHandlers(el, moduleId, state) {
  // Start timer buttons
  el.querySelector('#timer-start-15')?.addEventListener('click', () => startTimer(moduleId, 15));
  el.querySelector('#timer-start-25')?.addEventListener('click', () => startTimer(moduleId, 25));
  el.querySelector('#timer-start-45')?.addEventListener('click', () => startTimer(moduleId, 45));
  el.querySelector('#timer-start-custom')?.addEventListener('click', () => startCustomTimer(moduleId));
  
  // Running / paused timer controls
  el.querySelector('#timer-pause')?.addEventListener('click', () => pauseTimer(moduleId));
  el.querySelector('#timer-resume')?.addEventListener('click', () => resumeTimer(moduleId));
  el.querySelector('#timer-stop')?.addEventListener('click', () => stopTimer(moduleId, state));
  el.querySelector('#timer-discard')?.addEventListener('click', () => {
    if (confirm('Pausierten Timer verwerfen?')) {
      clearTimerState();
      stopTimerDisplayUpdate();
      navigate('module-sessions');
    }
  });
  
  // Update display if timer is running
  const timerState = loadTimerState();
  if (timerState && timerState.moduleId === moduleId && timerState.running) {
    startTimerDisplayUpdate(moduleId);
  }
}

let timerDisplayInterval = null;

export function startTimer(moduleId, plannedMinutes) {
  const now = Date.now();
  const timerState = {
    moduleId,
    plannedMinutes,
    startTime: now,
    pausedTime: 0,
    running: true
  };
  
  saveTimerState(timerState);
  startTimerDisplayUpdate(moduleId);
  
  // Re-render to show running timer UI
  navigate('module-sessions');
  
  window.EMVS.toast.show(`Timer gestartet: ${plannedMinutes} Min`);
}

function startCustomTimer(moduleId) {
  const minutes = prompt('Dauer in Minuten:', '30');
  const m = parseInt(minutes);
  if (m && m > 0 && m <= 480) {
    startTimer(moduleId, m);
  }
}

function pauseTimer(moduleId) {
  const timerState = loadTimerState();
  if (!timerState || !timerState.running) return;
  
  timerState.running = false;
  timerState.pausedTime += Date.now() - timerState.startTime;
  saveTimerState(timerState);
  
  stopTimerDisplayUpdate();
  navigate('module-sessions');
  window.EMVS.toast.show('Timer pausiert');
}

function resumeTimer(moduleId) {
  const timerState = loadTimerState();
  if (!timerState || timerState.running) return;
  
  timerState.running = true;
  timerState.startTime = Date.now();
  saveTimerState(timerState);
  
  startTimerDisplayUpdate(moduleId);
  navigate('module-sessions');
  window.EMVS.toast.show('Timer fortgesetzt');
}

function stopTimer(moduleId, state) {
  const timerState = loadTimerState();
  if (!timerState) return;
  
  const elapsedMs = timerState.running 
    ? (timerState.pausedTime + Date.now() - timerState.startTime)
    : timerState.pausedTime;
  
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  
  // Clear timer state
  clearTimerState();
  stopTimerDisplayUpdate();
  
  // Open session modal with pre-filled duration
  openSessionAfterTimer(moduleId, elapsedMinutes, timerState.plannedMinutes, state);
}

function openSessionAfterTimer(moduleId, actualMinutes, plannedMinutes, state) {
  const objectives = state.learningObjectives.filter(o => o.moduleId === moduleId);
  const resources = state.resources.filter(r => r.moduleId === moduleId);
  
  const now = new Date();
  const startTime = new Date(now.getTime() - actualMinutes * 60000);
  
  const session = {
    id: generateId(),
    moduleId,
    startTime: startTime.toISOString(),
    duration: actualMinutes,
    linkedObjectiveIds: [],
    linkedResourceIds: [],
    note: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  openModal({
    title: `Sitzung loggen (${actualMinutes} Min)`,
    body: `
      <div style="margin-bottom: 16px; padding: 12px; background: var(--bg); border-radius: 4px; font-size: 13px; color: var(--ink-2);">
        <strong>Timer gestoppt nach ${actualMinutes} Minuten</strong> (geplant: ${plannedMinutes} Min).
        Wähle Lernziele und Ressourcen, füge optional eine Notiz hinzu.
      </div>
      <form id="session-form">
        <div class="field-row">
          <label>Startzeit</label>
          <input type="datetime-local" name="startTime" value="${session.startTime.slice(0, 16)}" required>
        </div>
        <div class="field-row">
          <label>Dauer (Minuten)</label>
          <input type="number" name="duration" value="${actualMinutes}" min="1" max="480" required>
        </div>
        <div class="field-row">
          <label>Notiz</label>
          <input type="text" name="note" value="" placeholder="Was hast du gelernt? (optional)">
        </div>
        <div class="field-row">
          <label>Verknüpfte Lernziele</label>
          <select name="linkedObjectives" multiple style="min-height: 100px;">
            ${objectives.map(o => `<option value="${o.id}">${o.number}: ${escapeHtml(o.title)}</option>`).join('')}
          </select>
          <small style="color: var(--ink-3);">Strg/Cmd + Klick für Mehrfachauswahl</small>
        </div>
        <div class="field-row">
          <label>Verknüpfte Ressourcen</label>
          <select name="linkedResources" multiple style="min-height: 100px;">
            ${resources.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
          </select>
        </div>
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Verwerfen</button>
      <button class="btn primary" data-action="save">Sitzung speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) {
      window.EMVS.toast.show('Timer-Sitzung verworfen');
      navigate('module-sessions');
      return;
    }
    
    session.startTime = result.startTime;
    session.duration = parseInt(result.duration) || actualMinutes;
    session.note = result.note?.trim() || '';
    session.linkedObjectiveIds = result.linkedObjectives ? (Array.isArray(result.linkedObjectives) ? result.linkedObjectives : [result.linkedObjectives]) : [];
    session.linkedResourceIds = result.linkedResources ? (Array.isArray(result.linkedResources) ? result.linkedResources : [result.linkedResources]) : [];
    session.updatedAt = Date.now();
    
    state.studySessions.push(session);
    
    // Update objective history
    updateObjectiveHistory(state, session);
    
    window.EMVS.save();
    window.EMVS.toast.show(`Sitzung geloggt: ${session.duration} min`);
    navigate('module-sessions');
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

function startTimerDisplayUpdate(moduleId) {
  stopTimerDisplayUpdate(); // Clear any existing
  
  timerDisplayInterval = setInterval(() => {
    const timerState = loadTimerState();
    if (!timerState || timerState.moduleId !== moduleId || !timerState.running) {
      stopTimerDisplayUpdate();
      navigate('module-sessions');
      return;
    }
    
    const elapsedMs = timerState.pausedTime + Date.now() - timerState.startTime;
    const elapsed = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    const display = document.getElementById('timer-display');
    if (display) display.textContent = timeStr;
  }, 1000);
}

function stopTimerDisplayUpdate() {
  if (timerDisplayInterval) {
    clearInterval(timerDisplayInterval);
    timerDisplayInterval = null;
  }
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
  const dateStr = startTime.toLocaleDateString('de-CH');
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
          <span><strong>Ressourcen:</strong> ${escapeHtml(resNames)}</span>
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
  if (isNew && preset) {
    if (Array.isArray(preset.linkedObjectiveIds)) s.linkedObjectiveIds = [...preset.linkedObjectiveIds];
    if (Array.isArray(preset.linkedResourceIds)) s.linkedResourceIds = [...preset.linkedResourceIds];
    if (typeof preset.duration === 'number' && preset.duration > 0) s.duration = preset.duration;
    if (typeof preset.note === 'string') s.note = preset.note;
  }
  
  openModal({
    title: isNew ? 'Sitzung protokollieren' : 'Sitzung bearbeiten',
    body: `
      <form id="session-form">
        <div class="field-row">
          <label>Startzeit</label>
          <input type="datetime-local" name="startTime" value="${s.startTime.slice(0, 16)}" required>
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
          <label>Verknüpfte Ressourcen</label>
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
    
    const oldSession = isNew ? null : state.studySessions.find(x => x.id === s.id);
    const oldObjectiveIds = oldSession?.linkedObjectiveIds || [];
    const oldDuration = oldSession?.duration || 0;
    
    s.startTime = result.startTime;
    s.duration = parseInt(result.duration) || 30;
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
    navigate('module-sessions');
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

// Make navigate available
export function stopSessionsTimerDisplay() {
  stopTimerDisplayUpdate();
}

function navigate(view) {
  window.EMVS.navigate?.(view);
}