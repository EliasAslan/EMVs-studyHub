/**
 * Module Home View - Dashboard for a single module
 */

import { escapeHtml, formatDate, getExamGrade, calculateProjection, getWeakestObjective, getNextExam, getModuleStats } from '../utils/helpers.js';
import { navigate } from './router.js';
import { loadTimerState } from '../services/store.js';
import { renderToday } from './today.js';

export function renderModuleHome(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return renderToday(state);
  
  const exam = getNextExam(state, moduleId);
  const cd = exam ? countdownParts(exam.date) : null;
  const weak = getWeakestObjective(state, moduleId);
  const stats = getModuleStats(state, moduleId);
  const projection = calculateProjection(state, moduleId, m.targetGrade);
  
  // Check for running timer
  const timerState = loadTimerState();
  const isTimerRunning = timerState && timerState.moduleId === moduleId && timerState.running;
  const timerElapsed = isTimerRunning ? Math.floor((Date.now() - timerState.startTime) / 1000) : 0;
  const timerPaused = timerState && timerState.moduleId === moduleId && !timerState.running && timerState.pausedTime > 0;
  
  const el = document.createElement('div');
  const links = [
    { num: '01', label: 'Modul-Heft', target: `https://www.unormal.org/bfo/current/Inf1-Md${m.code}/` },
    { num: '02', label: 'Lernziele', view: 'module-objectives' },
    { num: '03', label: 'Ressourcen', view: 'module-resources' },
    { num: '04', label: 'Sitzungen', view: 'module-sessions' },
    { num: '05', label: 'Prüfungen', view: 'module-exams' },
    { num: '06', label: 'Plan', view: 'module-plan' },
  ];
  
  el.innerHTML = `
    <div class="eyebrow">Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">${escapeHtml(m.title)}</h1>
    
    <hr class="rule">
    
    <div class="section-label">Nächster Schritt</div>

    <hr class="rule">
    
    <div class="section-label">Nächster Schritt</div>
    ${weak ? `
      <div class="up-next" style="padding: 20px 0 20px 20px; border-left: 2px solid var(--accent); margin-bottom: 8px;">
        <div class="up-next-text">${escapeHtml(weak.title)}</div>
        <div class="up-next-meta">Lernziel ${weak.number} · Confidence ${weak.confidence} / 5</div>
      </div>
    ` : `
      <div class="up-next" style="padding: 20px 0 20px 20px; border-left: 2px solid var(--accent); margin-bottom: 8px;">
        <div class="up-next-text">Alle Lernziele gemeistert.</div>
        <div class="up-next-meta">Zeit für eine Mock-Prüfung.</div>
      </div>
    `}
    
    <hr class="rule">
    
    <div class="section-label">Fortschritt</div>
    <div class="stat-list">
      <div class="stat-row">
        <span class="stat-label">Lernziele gemeistert</span>
        <span class="stat-value">${stats.objectivesDone} <span class="muted">/ ${stats.objectivesTotal}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Ressourcen abgeschlossen</span>
        <span class="stat-value">${stats.resourcesDone} <span class="muted">/ ${stats.resourcesTotal}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Gesamte Lernzeit</span>
        <span class="stat-value">${stats.totalStudyTime} <span class="muted">Minuten</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Diese Woche</span>
        <span class="stat-value">${stats.sessionsThisWeek} <span class="muted">Minuten</span></span>
      </div>
    </div>
    
    ${projection ? `
      <hr class="rule">
      <div class="section-label">Prognose</div>
      <div class="projection" style="padding: 24px 0; font-size: 15px; color: var(--ink-2); line-height: 1.55; max-width: 60ch;">
        ${renderProjectionText(projection, m.targetGrade)}
      </div>
    ` : ''}
    
    <hr class="rule">
    
    <div class="section-label">Schnellzugriff</div>
    <div class="link-list">
      ${links.map(l => `
        <div class="link-row" role="link" tabindex="0" ${l.target ? `data-target="${escapeHtml(l.target)}"` : `data-view="${l.view}"`} style="display: grid; grid-template-columns: 28px 1fr auto; align-items: baseline; gap: 12px; padding: 12px 8px; border-radius: 4px; cursor: pointer; transition: background 0.15s;">
          <span class="link-num" style="font-family: var(--mono); font-size: 11px; color: var(--ink-3);">${l.num}</span>
          <span class="link-label" style="font-size: 14.5px; color: var(--ink);">${escapeHtml(l.label)}</span>
          <span class="link-hint" style="font-family: var(--mono); font-size: 11px; color: var(--ink-3);">${l.target ? '↗' : '→'}</span>
        </div>
      `).join('')}
    </div>
  `;
  
  // Countdown timer
  if (cd && !cd.past) {
    if (homeCountdownInterval) clearInterval(homeCountdownInterval);
    homeCountdownInterval = setInterval(() => {
      const target = new Date(exam.date + 'T08:00:00');
      const diff = target - new Date();
      const el2 = document.getElementById('countdown');
      if (!el2) { clearInterval(homeCountdownInterval); homeCountdownInterval = null; return; }
      if (diff <= 0) { el2.innerHTML = '0<small></small>'; clearInterval(homeCountdownInterval); homeCountdownInterval = null; return; }
      const d = Math.floor(diff / 86400000);
      el2.innerHTML = `${d}<small>${d === 1 ? 'Tag' : 'Tage'}</small>`;
    }, 60000);
  }
  
  // Link clicks (+ keyboard: Enter/Space activates focused row)
  el.querySelectorAll('.link-row').forEach(c => {
    const activate = () => {
      if (c.dataset.view) navigate(c.dataset.view);
      else if (c.dataset.target && c.dataset.target !== '#') window.open(c.dataset.target, '_blank', 'noopener');
    };
    c.addEventListener('click', activate);
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  // Timer card link (anchor) — prevent default jump and navigate in-app
  el.querySelectorAll('[data-view]').forEach(a => {
    if (a.classList.contains('link-row')) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.view);
    });
  });
  
  // Start timer display update if timer is running for this module
  if (isTimerRunning) {
    startHomeTimerDisplay(moduleId);
  }
  
  return el;
}

function renderProjectionText(projection, target) {
  const n = projection.needed;
  if (!projection.reachable || n > 6) {
    return `Für Zielnote <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${target.toFixed(2)}</span> müsstest du in den verbleibenden <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${projection.remainingWeight}%</span> eine <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${n.toFixed(2)}</span> erreichen — nicht erreichbar.`;
  }
  if (n < 1) {
    return `Zielnote <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${target.toFixed(2)}</span> ist gesichert.`;
  }
  return `Für Zielnote <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${target.toFixed(2)}</span> brauchst du mindestens <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${n.toFixed(2)}</span> in den verbleibenden <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${projection.remainingWeight}%</span>.`;
}

function renderTimerStatus(isRunning, elapsedSeconds, isPaused, plannedMinutes) {
  const elapsed = isRunning || isPaused ? elapsedSeconds : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  
  if (isRunning) {
    return `
      <div class="card" style="margin-bottom: 16px; border-color: var(--accent); background: var(--accent-soft);" id="timer-status-card">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="font-family: var(--mono); font-size: 28px; color: var(--accent); font-variant-numeric: tabular-nums;" id="home-timer-display">${timeStr}</span>
            <span style="color: var(--ink-2); font-size: 14px;">Timer läuft ${plannedMinutes ? `· geplant: ${plannedMinutes} Min` : ''}</span>
          </div>
          <a href="#" data-view="module-sessions" class="btn solid-accent" style="text-decoration: none;">Zu Sitzungen →</a>
        </div>
      </div>
    `;
  }
  
  if (isPaused) {
    return `
      <div class="card" style="margin-bottom: 16px; border-color: var(--blue); background: var(--blue-soft);" id="timer-status-card">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="font-family: var(--mono); font-size: 28px; color: var(--blue); font-variant-numeric: tabular-nums;" id="home-timer-display">${timeStr}</span>
            <span style="color: var(--ink-2); font-size: 14px;">Timer pausiert ${plannedMinutes ? `· geplant: ${plannedMinutes} Min` : ''}</span>
          </div>
          <a href="#" data-view="module-sessions" class="btn solid-blue" style="text-decoration: none;">Fortsetzen →</a>
        </div>
      </div>
    `;
  }
  
  return '';
}

// Timer display update for home view
let homeTimerInterval = null;
let homeCountdownInterval = null;

export function startHomeTimerDisplay(moduleId) {
  stopHomeTimerDisplay();
  
  homeTimerInterval = setInterval(() => {
    const timerState = loadTimerState();
    if (!timerState || timerState.moduleId !== moduleId || !timerState.running) {
      stopHomeTimerDisplay();
      // Re-render to update UI
      navigate('module-home');
      return;
    }
    
    const elapsedMs = timerState.pausedTime + Date.now() - timerState.startTime;
    const elapsed = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    const display = document.getElementById('home-timer-display');
    if (display) display.textContent = timeStr;
  }, 1000);
}

export function stopHomeTimerDisplay() {
  if (homeTimerInterval) {
    clearInterval(homeTimerInterval);
    homeTimerInterval = null;
  }
  if (homeCountdownInterval) {
    clearInterval(homeCountdownInterval);
    homeCountdownInterval = null;
  }
}