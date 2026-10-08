/**
 * Exam Preparation Output — useful the night before an exam.
 *
 * buildExamPrep() assembles a prioritized, print-friendly dossier for a
 * module (optionally scoped to one exam's linked objectives):
 *   1. weak objectives (weakness score, signals, exam rating)
 *   2. what needs reviewing (due/soon/never-reviewed)
 *   3. important mistakes, questions & captures
 *   4. relevant resources (open ones first)
 *   5. where study time went
 *   6. a compact one-page revision sheet
 *
 * Everything is ranked/capped — no database dumps. Rendered as a
 * print-friendly view (window.print) plus downloadable Markdown and
 * standalone HTML documents for reading outside the app.
 */

import {
  escapeHtml, formatDate, getExamGrade, getWeaknessBreakdown,
  rhythmOf, formatNextReview, resourcesForObjective, sessionsForObjective,
  capturesForObjective, isImportantCapture,
} from '../utils/helpers.js';
import { navigate } from './router.js';

// Pending preset when entering from an exam (consumed once on render).
let preset = null;
export function setExamPrepPreset(p) {
  preset = p || null;
}

const CAP_REVISION_LINES = 12;
const CAP_WEAK = 10;
const CAP_CAPTURES = 12;
const CAP_RESOURCES = 12;

/**
 * Pure builder — takes state + scope, returns the full dossier.
 * Weak-first ordering everywhere; caps keep it to one useful evening.
 */
export function buildExamPrep(state, { moduleId, examId = null } = {}) {
  const m = state.modules.find(x => x.id === moduleId) || null;
  const exam = examId ? state.exams.find(e => e.id === examId) || null : null;
  const generatedAt = new Date().toISOString();

  const allObjectives = state.learningObjectives.filter(o => o.moduleId === moduleId);
  const linkedIds = exam?.linkedObjectiveIds?.length
    ? exam.linkedObjectiveIds.filter(id => allObjectives.some(o => o.id === id))
    : null;
  const covered = linkedIds
    ? linkedIds.map(id => allObjectives.find(o => o.id === id)).filter(Boolean)
    : [...allObjectives].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  const ratingOf = (oid) => exam?.objectiveResults?.find(r => r.objectiveId === oid)?.rating || null;

  // 1. Weak objectives — weakness score desc, signals explain why.
  const weakObjectives = covered
    .map(o => ({ objective: o, breakdown: getWeaknessBreakdown(state, o), examRating: ratingOf(o.id) }))
    .filter(x => x.breakdown.score > 0)
    .sort((a, b) => b.breakdown.score - a.breakdown.score)
    .slice(0, CAP_WEAK);

  // 2. What needs reviewing — due first, then soon, then never reviewed.
  const rankReview = (o) => {
    const r = rhythmOf(o);
    if (r.key === 'due') return 0;
    if (r.key === 'soon') return 1;
    if (!o.lastReviewed) return 2;
    return 3;
  };
  const toReview = covered
    .filter(o => rankReview(o) < 3)
    .sort((a, b) => rankReview(a) - rankReview(b)
      || ((a.reviewSchedule?.nextReview ?? Infinity) - (b.reviewSchedule?.nextReview ?? Infinity)))
    .map(o => ({ objective: o, rhythm: rhythmOf(o), examRating: ratingOf(o.id) }));

  // 3. Important mistakes / questions / captures on covered objectives.
  const capPool = [];
  for (const o of covered) {
    for (const c of capturesForObjective(state, o)) {
      capPool.push({ capture: c, objective: o });
    }
  }
  const keyCaps = capPool
    .filter(({ capture }) => capture.type === 'mistake' || capture.type === 'question')
    .sort((a, b) => new Date(b.capture.timestamp) - new Date(a.capture.timestamp));
  const otherImportant = capPool
    .filter(({ capture }) => capture.type !== 'mistake' && capture.type !== 'question' && isImportantCapture(capture))
    .sort((a, b) => new Date(b.capture.timestamp) - new Date(a.capture.timestamp));
  const captures = [...keyCaps, ...otherImportant].slice(0, CAP_CAPTURES);

  // 4. Relevant resources — open (not understood) ones first.
  const seen = new Set();
  const resources = [];
  for (const o of covered) {
    for (const r of resourcesForObjective(state, o)) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        resources.push({ resource: r, objective: o });
      }
    }
  }
  resources.sort((a, b) => Number(a.resource.understood || false) - Number(b.resource.understood || false));
  const topResources = resources.slice(0, CAP_RESOURCES);

  // 5. Where study time went.
  const sessions = state.studySessions
    .filter(s => s.moduleId === moduleId)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  const totalMinutes = sessions.reduce((s, x) => s + (x.duration || 0), 0);
  const weekAgo = Date.now() - 7 * 86400000;
  const last7Minutes = sessions
    .filter(s => new Date(s.startTime).getTime() >= weekAgo)
    .reduce((s, x) => s + (x.duration || 0), 0);
  const byObjective = covered
    .map(o => ({ objective: o, minutes: o.totalStudyTime || 0 }))
    .filter(x => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  // 6. One-page revision sheet — weak-first, one compact line each.
  const sheetOrder = [
    ...weakObjectives.map(x => x.objective),
    ...covered.filter(o => !weakObjectives.some(x => x.objective.id === o.id)),
  ].slice(0, CAP_REVISION_LINES);
  const revisionSheet = sheetOrder.map(o => {
    const pitfall = capturesForObjective(state, o)
      .filter(c => c.type === 'mistake')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    return {
      objective: o,
      examRating: ratingOf(o.id),
      pitfall: pitfall ? String(pitfall.content || '').slice(0, 140) : null,
    };
  });

  return {
    module: m ? { id: m.id, code: m.code, title: m.title } : null,
    exam: exam ? {
      id: exam.id, name: exam.name, date: exam.date || null,
      grade: getExamGrade(exam), isMock: !!exam.isMock,
    } : null,
    generatedAt,
    coveredCount: covered.length,
    weakObjectives,
    toReview,
    captures,
    resources: topResources,
    timeSummary: {
      totalMinutes, sessionCount: sessions.length, last7Minutes,
      byObjective: byObjective.slice(0, 5),
    },
    revisionSheet,
  };
}

// ---------------------------------------------------------------------------
// View: setup → preview → print / download
// ---------------------------------------------------------------------------

export function renderExamPrep(state) {
  const p = preset;
  preset = null;
  const initialModule = p?.moduleId || state.settings.currentModuleId || state.modules[0]?.id || null;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow no-print">Prüfungsvorbereitung</div>
    <h1 class="page-title no-print">Prüfungsvorbereitung</h1>
    <p class="page-lede no-print">Für den Abend vorher: Schwächen zuerst, Fakten daneben, eine Seite zum Wiederholen. Als Ausdruck oder Datei mitnehmbar.</p>
    <div class="card no-print" style="margin-bottom:24px;">
      <div class="field-row">
        <label>Modul</label>
        <select id="prep-module">
          ${state.modules.map(m => `<option value="${m.id}" ${m.id === initialModule ? 'selected' : ''}>${escapeHtml(m.code)} — ${escapeHtml(m.title)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <label>Prüfung (optional — engt auf abgedeckte Lernziele ein)</label>
        <select id="prep-exam"></select>
      </div>
      <div class="timer-actions">
        <button class="btn primary" id="prep-generate">Vorbereitung erstellen</button>
      </div>
    </div>
    <div id="prep-output"></div>
  `;

  const modSel = el.querySelector('#prep-module');
  const examSel = el.querySelector('#prep-exam');
  const paintExams = (presetExam = p?.examId || null) => {
    const exams = state.exams
      .filter(e => e.moduleId === modSel.value)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    examSel.innerHTML = `<option value="">Alle Lernziele des Moduls</option>` + exams.map(e =>
      `<option value="${e.id}" ${e.id === presetExam ? 'selected' : ''}>${escapeHtml(e.name)}${e.date ? ` · ${escapeHtml(e.date)}` : ''}${e.isMock ? ' (Mock)' : ''}</option>`).join('');
  };
  modSel.addEventListener('change', () => paintExams());
  paintExams();

  const host = el.querySelector('#prep-output');
  const generate = () => {
    const prep = buildExamPrep(window.EMVS.getState(), {
      moduleId: modSel.value,
      examId: examSel.value || null,
    });
    host.innerHTML = '';
    host.appendChild(renderPreview(prep));
  };
  el.querySelector('#prep-generate')?.addEventListener('click', generate);
  if (initialModule) generate();

  return el;
}

function ratingChip(rating) {
  if (!rating) return '';
  const labels = { weak: 'schwach', okay: 'okay', strong: 'stark' };
  return ` <span class="badge rate-${rating} active">${labels[rating] || rating}</span>`;
}

function renderPreview(prep) {
  const el = document.createElement('div');
  const title = prep.exam
    ? `${prep.exam.name} · Modul ${prep.module?.code || '–'}`
    : `Modul ${prep.module?.code || '–'} — alle Lernziele`;
  const weakList = prep.weakObjectives;
  const reviewList = prep.toReview;

  el.innerHTML = `
    <div class="timer-actions no-print" style="margin-bottom:20px;">
      <button class="btn primary" id="prep-print">🖨 Drucken / PDF</button>
      <button class="btn" id="prep-md">↓ Markdown</button>
      <button class="btn" id="prep-html">↓ HTML-Datei</button>
    </div>

    <article class="print-sheet">
      <header class="print-head">
        <div class="print-eyebrow">Prüfungsvorbereitung · ${escapeHtml(new Date(prep.generatedAt).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' }))}</div>
        <h1>${escapeHtml(title)}</h1>
        ${prep.exam?.date ? `<p>Prüfungstermin: ${escapeHtml(formatDate(prep.exam.date))}${prep.exam.grade !== null ? ` · Stand: Note ${prep.exam.grade.toFixed(2)}` : ''}</p>` : ''}
        <p class="muted">${prep.coveredCount} Lernziele abgedeckt · ${prep.timeSummary.totalMinutes} Min Gesamtlernzeit</p>
      </header>

      <section>
        <h2>1 · Schwache Lernziele</h2>
        ${weakList.length ? `<ol>${weakList.map(({ objective: o, breakdown, examRating }) => `
          <li><strong>LZ ${o.number ?? '–'} — ${escapeHtml(o.title)}</strong> (Schwäche ${breakdown.score})${ratingChip(examRating)}
            <br><span class="muted">${breakdown.signals.map(s => escapeHtml(s.label)).join(' · ')}</span>
          </li>`).join('')}</ol>`
          : `<p>Keine Schwachstellen — Stand halten, nicht neu aufrollen.</p>`}
      </section>

      <section>
        <h2>2 · Was zu wiederholen ist</h2>
        ${reviewList.length ? `<ul>${reviewList.map(({ objective: o, rhythm, examRating }) => `
          <li><strong>LZ ${o.number ?? '–'} — ${escapeHtml(o.title)}</strong>${ratingChip(examRating)}
            <br><span class="muted">${escapeHtml(rhythm.label)} — ${escapeHtml(rhythm.detail)} · Confidence ${o.confidence ?? 0}/5</span>
          </li>`).join('')}</ul>`
          : `<p>Nichts überfällig — dem Rhythmus vertrauen.</p>`}
      </section>

      <section>
        <h2>3 · Fehler, Fragen & wichtige Notizen</h2>
        ${prep.captures.length ? `<ul>${prep.captures.map(({ capture: c, objective: o }) => `
          <li><strong>${escapeHtml(c.type === 'mistake' ? 'Fehler' : c.type === 'question' ? 'Frage' : 'Notiz')}</strong> (LZ ${o.number ?? '–'}): ${escapeHtml(String(c.content || '').slice(0, 220))}
          </li>`).join('')}</ul>`
          : `<p>Keine festgehaltenen Fehler oder Fragen zu diesen Zielen.</p>`}
      </section>

      <section>
        <h2>4 · Relevante Ressourcen</h2>
        ${prep.resources.length ? `<ul>${prep.resources.map(({ resource: r, objective: o }) => `
          <li>${escapeHtml(r.name)} <span class="muted">(${escapeHtml(r.type || 'Material')}${r.url ? ` · ${escapeHtml(r.url)}` : ''} · LZ ${o.number ?? '–'} · ${r.understood ? 'verstanden ✓' : 'offen'})</span>
          </li>`).join('')}</ul>`
          : `<p>Keine Ressourcen verknüpft.</p>`}
      </section>

      <section>
        <h2>5 · Wohin die Lernzeit ging</h2>
        <p>${prep.timeSummary.totalMinutes} Min in ${prep.timeSummary.sessionCount} ${prep.timeSummary.sessionCount === 1 ? 'Sitzung' : 'Sitzungen'} · davon ${prep.timeSummary.last7Minutes} Min in den letzten 7 Tagen.</p>
        ${prep.timeSummary.byObjective.length ? `<ul>${prep.timeSummary.byObjective.map(({ objective: o, minutes }) => `
          <li>LZ ${o.number ?? '–'} — ${escapeHtml(o.title.length > 70 ? o.title.slice(0, 70) + '…' : o.title)}: <strong>${minutes} Min</strong></li>`).join('')}</ul>` : ''}
      </section>

      <section class="print-sheet-page">
        <h2>6 · Spickzettel — eine Seite</h2>
        <ol class="print-compact">
          ${prep.revisionSheet.map(({ objective: o, examRating, pitfall }) => `
            <li><strong>LZ ${o.number ?? '–'} — ${escapeHtml(o.title)}</strong>${ratingChip(examRating)} <span class="muted">(C${o.confidence ?? 0}/5 · Review: ${escapeHtml(formatNextReview(o))})</span>
            ${pitfall ? `<br>⚠ ${escapeHtml(pitfall)}` : ''}</li>`).join('') || '<li>Keine Lernziele.</li>'}
        </ol>
      </section>
    </article>`;

  el.querySelector('#prep-print')?.addEventListener('click', () => window.print());
  el.querySelector('#prep-md')?.addEventListener('click', () => {
    downloadFile(prepFilename(prep, 'md'), examPrepToMarkdown(prep), 'text/markdown;charset=utf-8');
  });
  el.querySelector('#prep-html')?.addEventListener('click', () => {
    downloadFile(prepFilename(prep, 'html'), examPrepToHtmlDoc(prep), 'text/html;charset=utf-8');
  });
  return el;
}

function prepFilename(prep, ext) {
  const code = (prep.module?.code || 'modul').replace(/[^\wäöüÄÖÜß-]+/gi, '-');
  const date = new Date(prep.generatedAt).toISOString().slice(0, 10);
  return `pruefungsvorbereitung-${code}-${date}.${ext}`;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Exportable documents (readable outside the app)
// ---------------------------------------------------------------------------

const RATING_LABELS = { weak: 'schwach', okay: 'okay', strong: 'stark' };

export function examPrepToMarkdown(prep) {
  const L = [];
  const scope = prep.exam ? prep.exam.name : `Modul ${prep.module?.code || ''} — alle Lernziele`;
  L.push(`# Prüfungsvorbereitung — ${scope}`);
  L.push(`_Stand: ${new Date(prep.generatedAt).toLocaleDateString('de-CH')} · ${prep.coveredCount} Lernziele · ${prep.timeSummary.totalMinutes} Min Gesamtlernzeit_`);
  if (prep.exam?.date) L.push(`Prüfungstermin: ${prep.exam.date}${prep.exam.grade !== null ? ` · Note ${prep.exam.grade.toFixed(2)}` : ''}`);
  L.push('');
  L.push('## 1 · Schwache Lernziele');
  if (!prep.weakObjectives.length) L.push('Keine Schwachstellen — Stand halten.');
  for (const { objective: o, breakdown, examRating } of prep.weakObjectives) {
    L.push(`- **LZ ${o.number ?? '–'} — ${o.title}** (Schwäche ${breakdown.score})${examRating ? ` [${RATING_LABELS[examRating]}]` : ''}`);
    L.push(`  - ${breakdown.signals.map(s => s.label).join(' · ')}`);
  }
  L.push('');
  L.push('## 2 · Was zu wiederholen ist');
  if (!prep.toReview.length) L.push('Nichts überfällig — dem Rhythmus vertrauen.');
  for (const { objective: o, rhythm, examRating } of prep.toReview) {
    L.push(`- **LZ ${o.number ?? '–'} — ${o.title}**${examRating ? ` [${RATING_LABELS[examRating]}]` : ''} — ${rhythm.label}: ${rhythm.detail} · Confidence ${o.confidence ?? 0}/5`);
  }
  L.push('');
  L.push('## 3 · Fehler, Fragen & wichtige Notizen');
  if (!prep.captures.length) L.push('Keine festgehaltenen Fehler oder Fragen zu diesen Zielen.');
  for (const { capture: c, objective: o } of prep.captures) {
    const kind = c.type === 'mistake' ? 'Fehler' : c.type === 'question' ? 'Frage' : 'Notiz';
    L.push(`- **${kind}** (LZ ${o.number ?? '–'}): ${String(c.content || '').slice(0, 220)}`);
  }
  L.push('');
  L.push('## 4 · Relevante Ressourcen');
  if (!prep.resources.length) L.push('Keine Ressourcen verknüpft.');
  for (const { resource: r, objective: o } of prep.resources) {
    L.push(`- ${r.name} (${r.type || 'Material'}${r.url ? ` · ${r.url}` : ''} · LZ ${o.number ?? '–'} · ${r.understood ? 'verstanden ✓' : 'offen'})`);
  }
  L.push('');
  L.push('## 5 · Wohin die Lernzeit ging');
  L.push(`${prep.timeSummary.totalMinutes} Min in ${prep.timeSummary.sessionCount} Sitzungen · davon ${prep.timeSummary.last7Minutes} Min in den letzten 7 Tagen.`);
  for (const { objective: o, minutes } of prep.timeSummary.byObjective) {
    L.push(`- LZ ${o.number ?? '–'} — ${o.title}: ${minutes} Min`);
  }
  L.push('');
  L.push('## 6 · Spickzettel — eine Seite');
  for (const { objective: o, examRating, pitfall } of prep.revisionSheet) {
    L.push(`- **LZ ${o.number ?? '–'} — ${o.title}**${examRating ? ` [${RATING_LABELS[examRating]}]` : ''} (C${o.confidence ?? 0}/5)`);
    if (pitfall) L.push(`  - ⚠ ${pitfall}`);
  }
  L.push('');
  return L.join('\n');
}

export function examPrepToHtmlDoc(prep) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const scope = prep.exam ? prep.exam.name : `Modul ${prep.module?.code || ''} — alle Lernziele`;
  const li = (items) => items.length ? `<ul>${items.join('')}</ul>` : '';
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prüfungsvorbereitung — ${esc(scope)}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#1c1917;line-height:1.55}h1{font-size:1.8rem}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}.muted{color:#777;font-size:.9em}ol.print-compact li{margin-bottom:.4rem}@media print{body{margin:0;max-width:none}}</style>
</head><body>
<h1>Prüfungsvorbereitung — ${esc(scope)}</h1>
<p class="muted">Stand: ${esc(new Date(prep.generatedAt).toLocaleDateString('de-CH'))} · ${prep.coveredCount} Lernziele · ${prep.timeSummary.totalMinutes} Min Gesamtlernzeit</p>
<h2>1 · Schwache Lernziele</h2>
${prep.weakObjectives.length ? `<ol>${prep.weakObjectives.map(({ objective: o, breakdown, examRating }) => `<li><strong>LZ ${o.number ?? '–'} — ${esc(o.title)}</strong> (Schwäche ${breakdown.score})${examRating ? ` [${RATING_LABELS[examRating]}]` : ''}<br><span class="muted">${breakdown.signals.map(s => esc(s.label)).join(' · ')}</span></li>`).join('')}</ol>` : '<p>Keine Schwachstellen.</p>'}
<h2>2 · Was zu wiederholen ist</h2>
${prep.toReview.length ? li(prep.toReview.map(({ objective: o, rhythm, examRating }) => `<li><strong>LZ ${o.number ?? '–'} — ${esc(o.title)}</strong>${examRating ? ` [${RATING_LABELS[examRating]}]` : ''}<br><span class="muted">${esc(rhythm.label)} — ${esc(rhythm.detail)} · Confidence ${o.confidence ?? 0}/5</span></li>`)) : '<p>Nichts überfällig.</p>'}
<h2>3 · Fehler, Fragen &amp; wichtige Notizen</h2>
${prep.captures.length ? li(prep.captures.map(({ capture: c, objective: o }) => `<li><strong>${c.type === 'mistake' ? 'Fehler' : c.type === 'question' ? 'Frage' : 'Notiz'}</strong> (LZ ${o.number ?? '–'}): ${esc(String(c.content || '').slice(0, 220))}</li>`)) : '<p>Keine.</p>'}
<h2>4 · Relevante Ressourcen</h2>
${prep.resources.length ? li(prep.resources.map(({ resource: r, objective: o }) => `<li>${esc(r.name)} <span class="muted">(${esc(r.type || 'Material')} · LZ ${o.number ?? '–'} · ${r.understood ? 'verstanden ✓' : 'offen'})</span></li>`)) : '<p>Keine verknüpft.</p>'}
<h2>5 · Wohin die Lernzeit ging</h2>
<p>${prep.timeSummary.totalMinutes} Min in ${prep.timeSummary.sessionCount} Sitzungen · davon ${prep.timeSummary.last7Minutes} Min in den letzten 7 Tagen.</p>
${li(prep.timeSummary.byObjective.map(({ objective: o, minutes }) => `<li>LZ ${o.number ?? '–'} — ${esc(o.title)}: <strong>${minutes} Min</strong></li>`))}
<h2>6 · Spickzettel — eine Seite</h2>
<ol>${prep.revisionSheet.map(({ objective: o, examRating, pitfall }) => `<li><strong>LZ ${o.number ?? '–'} — ${esc(o.title)}</strong>${examRating ? ` [${RATING_LABELS[examRating]}]` : ''} <span class="muted">(C${o.confidence ?? 0}/5)</span>${pitfall ? `<br>⚠ ${esc(pitfall)}` : ''}</li>`).join('')}</ol>
</body></html>`;
}
