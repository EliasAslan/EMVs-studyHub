/**
 * Prüfungen — one page for every exam surface:
 * Termine / Vorbereitung / Mock / Ergebnisse.
 * Grades are data (neutral ink); the diagnostic breakdown carries the meaning.
 */

import { escapeHtml, formatDate, getExamGrade, EXAM_RATING_LABELS } from '../utils/helpers.js';
import { navigate } from './router.js';
import { openExamModal, openExamDiagnosis } from './module-exams.js';
import { renderExamPrep, setExamPrepPreset } from './exam-prep.js';
import { renderMockExam } from './mock-exam.js';

const TABS = [
  { key: 'termine', label: 'Termine' },
  { key: 'vorbereitung', label: 'Vorbereitung' },
  { key: 'mock', label: 'Mock' },
  { key: 'ergebnisse', label: 'Ergebnisse' },
];

export function renderExamsGlobal(state, params = {}) {
  const tab = TABS.some(t => t.key === params.tab) ? params.tab : 'termine';

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Prüfungen · alle Module</div>
    <h1 class="page-title">Prüfungen</h1>
    <p class="page-lede">Termine, Vorbereitung, Mock und Ergebnisse an einem Ort.</p>
    <div class="subtabs" role="tablist" aria-label="Prüfungsbereiche">
      ${TABS.map(t => `<button class="subtab ${t.key === tab ? 'active' : ''}" role="tab" aria-selected="${t.key === tab}" data-exam-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="exam-tab-body"></div>
  `;

  const host = el.querySelector('#exam-tab-body');
  if (tab === 'vorbereitung') host.appendChild(renderExamPrep(state, { embedded: true }));
  else if (tab === 'mock') host.appendChild(renderMockExam(state));
  else if (tab === 'ergebnisse') host.appendChild(renderErgebnisse(state));
  else host.appendChild(renderTermine(state));

  el.querySelectorAll('[data-exam-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.examTab === tab) return;
      navigate('exams-global', { qs: `?tab=${btn.dataset.examTab}` });
    });
  });

  return el;
}

function allExams(state) {
  const all = [];
  state.modules.forEach(m => {
    state.exams.filter(e => e.moduleId === m.id).forEach(e => all.push({ ...e, module: m }));
  });
  return all;
}

function renderTermine(state) {
  const all = allExams(state).sort((a, b) => (a.date || 'z').localeCompare(b.date || 'z'));
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="section-head">
      <h2 class="section-label" style="margin: 0;">Termine · ${all.length}</h2>
      <button type="button" class="btn btn-sm" data-exam-new>＋ Prüfung</button>
    </div>
    ${all.length ? `<div class="exam-list">${all.map(e => examItemHtml(state, e, { actions: true })).join('')}</div>` : `
      <div class="card empty-state"><div class="icon">📝</div><h3>Noch keine Prüfungen</h3><p>Lege die nächste Prüfung an — mit Datum, Gewicht und den Lernzielen, die sie abdeckt.</p></div>`}
  `;
  wireExamActions(el);
  el.querySelector('[data-exam-new]')?.addEventListener('click', () => openNewExam(state));
  return el;
}

function renderErgebnisse(state) {
  const all = allExams(state)
    .filter(e => e.isMock || getExamGrade(e) !== null)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="section-head">
      <h2 class="section-label" style="margin: 0;">Ergebnisse · ${all.length}</h2>
    </div>
    ${all.length ? `<div class="exam-list">${all.map(e => examItemHtml(state, e, { actions: true, showGrade: true })).join('')}</div>` : `
      <div class="card empty-state"><div class="icon">📊</div><h3>Noch keine Ergebnisse</h3><p>Trage Punkte ein oder starte einen Mock — danach steht hier, wo du wirklich stehst.</p></div>`}
  `;
  wireExamActions(el);
  return el;
}

function examItemHtml(state, e, { actions = false, showGrade = true } = {}) {
  const grade = getExamGrade(e);
  const breakdown = breakdownChips(state, e);
  const result = e.score !== '' && e.max !== '' && e.score !== undefined
    ? `${escapeHtml(String(e.score))} / ${escapeHtml(String(e.max))}`
    : 'offen';
  return `
    <div class="exam-item exam-row" data-exam-id="${e.id}">
      <div class="exam-main">
        <div class="exam-name">${escapeHtml(e.name)}${e.isMock && !/mock/i.test(e.name) ? ' <span class="badge">Mock</span>' : ''}</div>
        <div class="exam-meta">
          <span class="exam-mod" style="color:${e.module.accent};">Modul ${escapeHtml(e.module.code)}</span>
          <span>${e.date ? formatDate(e.date) : 'ohne Datum'}</span>
          ${!e.isMock && e.weight ? `<span>${escapeHtml(String(e.weight))} %</span>` : ''}
          <span>${result}</span>
        </div>
        ${breakdown ? `<div class="exam-breakdown">${breakdown}</div>` : ''}
        ${actions ? `
        <div class="exam-actions">
          <button type="button" class="btn ghost btn-sm" data-exam-edit>Bearbeiten</button>
          <button type="button" class="btn ghost btn-sm" data-exam-diagnose>Diagnose</button>
          <button type="button" class="btn ghost btn-sm" data-exam-prep>Vorbereitung</button>
        </div>` : ''}
      </div>
      ${showGrade ? `<div class="exam-grade">${grade === null ? '—' : grade.toFixed(2)}</div>` : ''}
    </div>`;
}

function wireExamActions(root) {
  root.querySelectorAll('.exam-row').forEach(row => {
    const id = row.dataset.examId;
    row.querySelector('[data-exam-edit]')?.addEventListener('click', () => {
      const e = window.EMVS.getState().exams.find(x => x.id === id);
      if (e) openExamModal(e);
    });
    row.querySelector('[data-exam-diagnose]')?.addEventListener('click', () => openExamDiagnosis(id));
    row.querySelector('[data-exam-prep]')?.addEventListener('click', () => {
      const e = window.EMVS.getState().exams.find(x => x.id === id);
      if (!e) return;
      setExamPrepPreset({ moduleId: e.moduleId, examId: e.id });
      navigate('exams-global', { qs: '?tab=vorbereitung' });
    });
  });
}

function openNewExam(state) {
  const moduleId = state.settings.currentModuleId || state.modules[0]?.id;
  if (!moduleId) {
    window.EMVS.toast?.show('Lege zuerst ein Modul an');
    return;
  }
  openExamModal(null, moduleId);
}

function breakdownChips(state, exam) {
  const covered = (exam.linkedObjectiveIds || []).length;
  if (!covered) return '';
  const counts = { weak: 0, okay: 0, strong: 0, open: 0 };
  for (const oid of (exam.linkedObjectiveIds || [])) {
    const r = exam.objectiveResults?.find(x => x.objectiveId === oid)?.rating;
    if (r === 'weak' || r === 'okay' || r === 'strong') counts[r] += 1;
    else counts.open += 1;
  }
  const chips = [];
  if (counts.weak) chips.push(`<span class="badge rate-weak active">${counts.weak}× ${EXAM_RATING_LABELS.weak}</span>`);
  if (counts.okay) chips.push(`<span class="badge rate-okay active">${counts.okay}× ${EXAM_RATING_LABELS.okay}</span>`);
  if (counts.strong) chips.push(`<span class="badge rate-strong active">${counts.strong}× ${EXAM_RATING_LABELS.strong}</span>`);
  if (counts.open) chips.push(`<span class="badge">${counts.open}× offen</span>`);
  if (!chips.length) chips.push(`<span class="badge">${covered} Lernziele</span>`);
  return chips.join('');
}
