/**
 * Overview View - All modules at a glance
 */

import { escapeHtml, formatDate, daysUntil, getNextExam, getExamGrade, getWeakestObjective, getModuleStats } from '../utils/helpers.js';
import { navigate } from './router.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId } from '../services/store.js';

export function renderOverview(state) {
  const el = document.createElement('div');
  
  if (!state.modules.length) {
    el.innerHTML = `
      <div class="eyebrow">Übersicht</div>
      <h1 class="page-title">Dein Studium,<br><em>auf einen Blick.</em></h1>
      <p class="page-lede">Noch keine Module angelegt. Erstelle dein erstes Modul.</p>
      <div class="mt-3">
        <button class="btn primary" id="create-first-module">＋ Erstes Modul erstellen</button>
      </div>
    `;
    el.querySelector('#create-first-module').addEventListener('click', () => openModuleModal());
    return el;
  }
  
  const items = state.modules.map(m => {
    const exam = getNextExam(state, m.id);
    const cd = exam ? daysUntil(exam.date) : null;
    const weak = getWeakestObjective(state, m.id);
    const nextText = weak ? weak.title : 'Alle Lernziele gemeistert';
    const stats = getModuleStats(state, m.id);
    
    return `
      <div class="card card-hover ov-item" data-module="${m.id}" role="link" tabindex="0" style="margin-bottom: 16px;">
        <div class="ov-head">
          <span class="ov-code">Modul ${escapeHtml(m.code)}</span>
          <span class="ov-countdown">${cd !== null ? `${cd} Tage bis Prüfung` : 'Keine Prüfung eingetragen'}</span>
        </div>
        <div class="ov-title">${escapeHtml(m.title)}</div>
        <div class="ov-next">
          <span class="ov-next-label">Nächstes Ziel</span>${escapeHtml(nextText.slice(0, 100))}${nextText.length > 100 ? '…' : ''}
        </div>
        <div class="stat-list mt-2">
          <div class="stat-row">
            <span class="stat-label">Lernziele</span>
            <span class="stat-value">${stats.objectivesDone} <span class="muted">/ ${stats.objectivesTotal}</span></span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Ressourcen</span>
            <span class="stat-value">${stats.resourcesDone} <span class="muted">/ ${stats.resourcesTotal}</span></span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Sitzungen diese Woche</span>
            <span class="stat-value">${stats.sessionsThisWeek} min</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  el.innerHTML = `
    <div class="eyebrow">Übersicht</div>
    <h1 class="page-title">Dein Studium,<br><em>auf einen Blick.</em></h1>
    <p class="page-lede">${state.modules.length} Modul${state.modules.length !== 1 ? 'e' : ''}. Ein Klick öffnet das Modul.</p>
    <div class="ov-list">${items}</div>
  `;
  
  el.querySelectorAll('.ov-item').forEach(r => {
    const open = () => {
      const st = window.EMVS.getState();
      st.settings.currentModuleId = r.dataset.module;
      window.EMVS.save();
      window.EMVS.renderSidebar();
      navigate('module-home');
    };
    r.addEventListener('click', open);
    r.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
  
  return el;
}

function openModuleModal() {
  const state = window.EMVS.getState();
  const m = {
    id: generateId(),
    code: '',
    title: '',
    accent: '#b45309',
    targetGrade: 5.0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  openModal({
    title: 'Neues Modul',
    body: `
      <form id="module-form">
        <div class="field-row">
          <label>Code (z.B. 162)</label>
          <input type="text" name="code" required style="max-width: 120px; text-transform: uppercase;">
        </div>
        <div class="field-row">
          <label>Titel</label>
          <input type="text" name="title" required style="max-width: 400px;">
        </div>
        <div class="field-row">
          <label>Zielnote</label>
          <input type="number" name="targetGrade" value="5.0" step="0.1" min="1" max="6" style="max-width: 120px;">
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
    m.code = String(result.code || '').trim().toUpperCase();
    m.title = String(result.title || '').trim();
    m.targetGrade = parseFloat(result.targetGrade) || 5.0;
    m.updatedAt = Date.now();
    if (!m.code || !m.title) return;
    state.modules.push(m);
    state.settings.currentModuleId = m.id;
    window.EMVS.save();
    window.EMVS.renderSidebar();
    navigate('module-home');
  }).catch(() => {});

  setTimeout(() => {
    const form = document.getElementById('module-form');
    form?.addEventListener('submit', evt => {
      evt.preventDefault();
      closeModal(Object.fromEntries(new FormData(form)));
    });
    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => form?.requestSubmit());
    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}