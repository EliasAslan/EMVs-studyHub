/**
 * Exams Global View - All exams across all modules.
 * Grades are data (neutral ink); the diagnostic breakdown carries the meaning.
 */

import { escapeHtml, formatDate, getExamGrade, calculateProjection } from '../utils/helpers.js';
import { EXAM_RATING_LABELS } from '../utils/helpers.js';

export function renderExamsGlobal(state) {
  const all = [];
  state.modules.forEach(m => {
    state.exams.filter(e => e.moduleId === m.id).forEach(e => all.push({ ...e, module: m }));
  });
  all.sort((a, b) => (a.date || 'z').localeCompare(b.date || 'z'));

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Alle Module</div>
    <h1 class="page-title">Alle Prüfungen</h1>
    <p class="page-lede">${all.length} Einträge, chronologisch sortiert. Die Note ist eine Zahl — die Aufschlüsselung sagt, wo du stehst.</p>
    <div class="exam-list">
      ${all.length ? all.map(e => {
        const grade = getExamGrade(e);
        const breakdown = breakdownChips(state, e);
        return `
          <div class="exam-item" style="display: grid; grid-template-columns: 1fr auto; gap: 20px; padding: 22px 8px; border-radius: 4px; align-items: baseline; transition: background 0.15s; border: 1px solid var(--rule); margin-bottom: 12px;">
            <div class="exam-main">
              <div class="exam-name" style="font-family: var(--serif); font-size: 22px; line-height: 1.2;">${escapeHtml(e.name)}${e.isMock ? ' <span class="badge">Mock · 0 %</span>' : ''}</div>
              <div class="exam-meta" style="display: flex; gap: 20px; align-items: baseline; font-family: var(--mono); font-size: 12px; color: var(--ink-3); flex-wrap: wrap; margin-top: 8px;">
                <span style="color:${e.module.accent}; font-weight:500;">Modul ${escapeHtml(e.module.code)}</span>
                <span>${e.date ? formatDate(e.date) : '—'}</span>
                <span>${e.weight}%</span>
                ${e.score !== '' && e.max !== '' && e.score !== undefined ? `<span>${escapeHtml(String(e.score))} / ${escapeHtml(String(e.max))}</span>` : `<span>noch offen</span>`}
              </div>
              ${breakdown ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${breakdown}</div>` : ''}
            </div>
            <div class="exam-grade" style="font-family: var(--serif); font-size: 40px; line-height: 1; color: var(--ink); font-variant-numeric: lining-nums; letter-spacing: -0.02em; text-align: right;">${grade === null ? '—' : grade.toFixed(2)}</div>
          </div>
        `;
      }).join('') : `
        <div class="card empty-state"><div class="icon">📝</div><h3>Noch keine Prüfungen</h3><p>Lege sie in den Modulen an.</p></div>
      `}
    </div>
  `;

  return el;
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
  if (counts.weak) chips.push(`<span class="badge rate-weak active">${counts.weak}× ${EXAM_RATING_LABELS.weak.toLowerCase()}</span>`);
  if (counts.okay) chips.push(`<span class="badge rate-okay active">${counts.okay}× ${EXAM_RATING_LABELS.okay.toLowerCase()}</span>`);
  if (counts.strong) chips.push(`<span class="badge rate-strong active">${counts.strong}× ${EXAM_RATING_LABELS.strong.toLowerCase()}</span>`);
  if (counts.open) chips.push(`<span class="badge">${counts.open}× offen</span>`);
  if (!chips.length) chips.push(`<span class="badge">${covered} Ziele abgedeckt</span>`);
  return chips.join('');
}
