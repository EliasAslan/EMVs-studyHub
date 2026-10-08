/**
 * Weekly Review View — 5 minutes, exactly three questions, evidence beside them.
 *
 * 1. What went well?
 * 2. What didn't?
 * 3. What changes next week?
 *
 * Each review is stored against its week (and optionally a module) and shown
 * alongside that week's actual activity: time studied, sessions, objectives
 * touched, objectives reviewed, exam/mock results. Reflection from evidence,
 * not generic journaling. (Legacy `learned`/`adjustments` fields stay in
 * storage untouched but are no longer asked.)
 */

import { escapeHtml, formatDate, getWeekDateRange, getCurrentWeekNumber, getWeekActivity, hasWeeklyReview } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId } from '../services/store.js';
import { navigate } from './router.js';

const QUESTIONS = [
  { key: 'wentWell', label: 'Was lief gut?', placeholder: 'Erfolge, Durchbrüche, gelungene Sitzungen …' },
  { key: 'didntWork', label: 'Was lief nicht?', placeholder: 'Blockaden, unverstandene Themen, Zeitmangel …' },
  { key: 'nextWeek', label: 'Was ändert sich nächste Woche?', placeholder: 'Eine konkrete Änderung, nicht fünf …' },
];

export function renderWeeklyReview(state) {
  const reviews = [...state.weeklyReviews]
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.week || 0) - (a.week || 0));

  const currentWeek = getCurrentWeekNumber();
  const currentYear = new Date().getFullYear();
  const currentModuleId = state.settings.currentModuleId;
  const due = !hasWeeklyReview(state, currentWeek, currentYear, currentModuleId);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Wochenreviews</div>
    <h1 class="page-title">Wöchentliche Reflexion</h1>
    <p class="page-lede">Fünf Minuten, drei Fragen — daneben die Fakten der Woche. Reflexion aus Evidenz, kein Tagebuch.</p>

    ${due ? `
      <div class="card" style="border-color: var(--accent); margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="font-family: var(--serif); font-size: 20px;">Wochenreview fällig — KW ${currentWeek}</div>
            <div class="muted" style="font-size: 13px; margin-top: 4px;">Noch kein Review für diese Woche. Drei Fragen, fünf Minuten.</div>
          </div>
          <button class="btn primary" id="add-review-due">Jetzt reviewen · 5 Min</button>
        </div>
      </div>
    ` : ''}

    <div class="mb-3">
      <button class="btn ${due ? '' : 'primary'}" id="add-review">＋ ${due ? 'Wochenreview schreiben' : `Neues Review (KW ${currentWeek}/${currentYear})`}</button>
    </div>

    ${reviews.length ? `
      <div class="reviews-list">
        ${reviews.map(r => renderReviewItem(state, r)).join('')}
      </div>
    ` : `
      <div class="card empty-state">
        <div class="icon">📅</div>
        <h3>Noch keine Reviews</h3>
        <p>Starte dein erstes Wochenreview — drei Fragen, fünf Minuten.</p>
      </div>
    `}
  `;

  el.querySelectorAll('.review-item').forEach(item => {
    const id = item.dataset.id;
    const review = reviews.find(r => r.id === id);
    if (!review) return;

    item.querySelector('.edit-review-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      openReviewModal(review);
    });

    item.querySelector('.delete-review-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Review löschen?')) {
        state.weeklyReviews = state.weeklyReviews.filter(x => x.id !== id);
        window.EMVS.save();
        navigate('weekly-review');
      }
    });
  });

  el.querySelector('#add-review-due')?.addEventListener('click', () =>
    openReviewModal(null, { week: currentWeek, year: currentYear, moduleId: currentModuleId }));
  el.querySelector('#add-review')?.addEventListener('click', () => openReviewModal(null));

  return el;
}

function moduleOf(state, moduleId) {
  return state.modules.find(m => m.id === moduleId);
}

function renderEvidenceFacts(state, week, year, moduleId) {
  const a = getWeekActivity(state, week, year, moduleId);
  const mod = moduleId ? moduleOf(state, moduleId) : null;
  const facts = [
    `⏱ ${a.studyTime} Min`,
    `📝 ${a.sessionCount} ${a.sessionCount === 1 ? 'Sitzung' : 'Sitzungen'}`,
    `🎯 ${a.touched.length} ${a.touched.length === 1 ? 'Ziel' : 'Ziele'} berührt`,
    `👁 ${a.reviewed.length} reviewt`,
  ];
  if (a.exams.length) {
    const parts = a.exams.map(e =>
      `${e.isMock ? 'Mock' : 'Prüfung'} „${e.name}“${e.grade !== null ? `: ${e.grade.toFixed(2)}` : ''}`);
    facts.push(`🧪 ${parts.join(' · ')}`);
  }
  return `
    <div class="review-facts">
      <div class="review-facts-scope">${mod ? `Modul ${escapeHtml(mod.code)} · ` : 'Alle Module · '}KW ${week}/${year}</div>
      <div class="review-facts-row">${facts.map(f => `<span>${escapeHtml(f)}</span>`).join('')}</div>
      ${a.touched.length ? `<div class="review-facts-objs">Berührt: ${a.touched.map(o => `LZ ${o.number}`).join(', ')}</div>` : ''}
      ${a.reviewed.length ? `<div class="review-facts-objs">Reviewt: ${a.reviewed.map(o => `LZ ${o.number}`).join(', ')}</div>` : ''}
    </div>`;
}

function renderReviewItem(state, review) {
  const { start, end } = getWeekDateRange(review.week, review.year);
  const dateRange = `${formatDate(start.toISOString().slice(0, 10))} – ${formatDate(end.toISOString().slice(0, 10))}`;
  const isCurrent = review.week === getCurrentWeekNumber() && review.year === new Date().getFullYear();
  const mod = review.moduleId ? moduleOf(state, review.moduleId) : null;
  const scopeId = review.moduleId || null;

  return `
    <div class="review-item" data-id="${review.id}" style="border: 1px solid var(--rule); border-radius: 8px; padding: 20px; margin-bottom: 16px; background: var(--paper); ${isCurrent ? 'border-color: var(--accent);' : ''}">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; flex-wrap: wrap; gap: 8px;">
        <div>
          <div style="font-family: var(--serif); font-size: 22px; color: var(--ink);">KW ${review.week} / ${review.year}</div>
          <div style="font-family: var(--mono); font-size: 12px; color: var(--ink-3);">${dateRange}${mod ? ` · Modul ${escapeHtml(mod.code)}` : ''}</div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${isCurrent ? '<span class="badge" style="background: var(--accent-soft); border-color: var(--accent); color: var(--accent-ink);">Aktuelle Woche</span>' : ''}
          <button class="edit-review-btn" style="padding: 4px 8px; font-size: 11px; color: var(--ink-3);" title="Bearbeiten">✎</button>
          <button class="delete-review-btn" style="padding: 4px 8px; font-size: 11px; color: var(--red);" title="Löschen">✕</button>
        </div>
      </div>

      ${renderEvidenceFacts(state, review.week, review.year, scopeId)}

      <div style="display: grid; gap: 12px; font-size: 14px; line-height: 1.6; margin-top: 16px;">
        ${QUESTIONS.map(q => review[q.key] ? `
          <div>
            <div style="font-family: var(--mono); font-size: 10px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">${q.label}</div>
            <div style="white-space: pre-wrap; color: var(--ink);">${escapeHtml(review[q.key])}</div>
          </div>
        ` : '').join('')}
      </div>
    </div>
  `;
}

export function openReviewModal(review = null, preset = {}) {
  const state = window.EMVS.getState();
  const modules = state.modules;
  const currentWeek = getCurrentWeekNumber();
  const currentYear = new Date().getFullYear();

  // Creating for a week/module that already has a review edits it instead —
  // one review per week, no duplicates.
  let r = review;
  if (!r && (preset.week || preset.moduleId)) {
    const w = preset.week ?? currentWeek;
    const y = preset.year ?? currentYear;
    r = state.weeklyReviews.find(x =>
      x.week === w && x.year === y &&
      (preset.moduleId ? (x.moduleId === preset.moduleId || !x.moduleId) : true)) || null;
  }
  const isNew = !r;
  r = r || {
    id: generateId(),
    week: preset.week ?? currentWeek,
    year: preset.year ?? currentYear,
    moduleId: preset.moduleId || state.settings.currentModuleId || null,
    moduleTitle: '',
    wentWell: '',
    didntWork: '',
    learned: '',
    nextWeek: '',
    adjustments: '',
    studyTime: 0,
    sessionsCount: 0,
    objectivesReviewed: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  openModal({
    title: isNew ? `Wochenreview KW ${r.week}/${r.year} · 5 Minuten` : `Wochenreview KW ${r.week}/${r.year} bearbeiten`,
    body: `
      <form id="review-form">
        <div class="field-row">
          <label>Woche / Jahr</label>
          <div style="display: flex; gap: 12px;">
            <input type="number" name="week" value="${r.week}" min="1" max="53" required style="width: 100%;">
            <input type="number" name="year" value="${r.year}" min="2020" max="2030" required style="width: 100%;">
          </div>
        </div>
        <div class="field-row">
          <label>Modul (leer = alle Module)</label>
          <select name="moduleId">
            <option value="">Alle Module</option>
            ${modules.map(m => `<option value="${m.id}" ${r.moduleId === m.id ? 'selected' : ''}>Modul ${escapeHtml(m.code)}: ${escapeHtml(m.title)}</option>`).join('')}
          </select>
        </div>

        <hr class="rule" style="margin: 20px 0;">
        <div class="section-label">Fakten dieser Woche</div>
        <div id="review-evidence"></div>

        <hr class="rule" style="margin: 20px 0;">
        <div class="section-label">Drei Fragen · ca. 5 Minuten</div>

        ${QUESTIONS.map(q => `
          <div class="field-row">
            <label>${q.label}</label>
            <textarea name="${q.key}" rows="3" placeholder="${q.placeholder}">${escapeHtml(r[q.key] || '')}</textarea>
          </div>
        `).join('')}
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;

    r.week = parseInt(result.week) || currentWeek;
    r.year = parseInt(result.year) || currentYear;
    r.moduleId = result.moduleId || null;
    r.moduleTitle = result.moduleId ? modules.find(m => m.id === result.moduleId)?.title || '' : '';
    for (const q of QUESTIONS) r[q.key] = result[q.key]?.trim() || '';
    // Legacy fields stay in storage untouched — no longer asked.
    const a = getWeekActivity(state, r.week, r.year, r.moduleId || null);
    r.studyTime = a.studyTime;
    r.sessionsCount = a.sessionCount;
    r.objectivesReviewed = a.reviewed.length;
    r.updatedAt = Date.now();

    if (isNew) state.weeklyReviews.push(r);

    window.EMVS.save();
    navigate('weekly-review');
  });

  const paintEvidence = () => {
    const host = document.getElementById('review-evidence');
    if (!host) return;
    const form = document.getElementById('review-form');
    const fd = form ? new FormData(form) : null;
    const w = parseInt(fd?.get('week')) || r.week;
    const y = parseInt(fd?.get('year')) || r.year;
    const mid = fd?.get('moduleId') || null;
    const st = window.EMVS.getState();
    host.innerHTML = renderEvidenceFacts(st, w, y, mid);
  };

  setTimeout(() => {
    paintEvidence();
    const form = document.getElementById('review-form');
    form?.addEventListener('submit', evt => {
      evt.preventDefault();
      const fd = new FormData(form);
      closeModal(Object.fromEntries(fd));
    });
    form?.addEventListener('change', paintEvidence);

    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('review-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}
