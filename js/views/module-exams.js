/**
 * Module Exams View — diagnosis first, grades as data.
 *
 * An exam covers learning objectives; per covered objective the user records
 * weak | okay | strong. The breakdown feeds the Weak Spots system
 * (scoreObjectiveRisk), so a bad exam tells WHERE the user is weak instead
 * of just producing a bad number. Grades stay useful as data but carry no
 * red/green pass/fail treatment — 3.9 vs 4.1 is not a moral category.
 */

import { escapeHtml, formatDate, getExamGrade, calculateProjection, getObjectiveExamSignal } from '../utils/helpers.js';
import { EXAM_RATING_LABELS } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, ensureExamFields, syncExamObjectives, setObjectiveRating } from '../services/store.js';
import { refresh, registerPatcher, navigate } from './router.js';
import { setExamPrepPreset } from './exam-prep.js';

const RATINGS = ['weak', 'okay', 'strong'];

export function renderModuleExams(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return document.createElement('div');

  state.exams.forEach(ensureExamFields);
  const objectives = state.learningObjectives.filter(o => o.moduleId === moduleId);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Prüfungen · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Prüfungsverlauf</h1>
    <p class="page-lede">Eine Prüfung diagnostiziert: verknüpfe die abgedeckten Lernziele und halte pro Ziel fest, wo du stehst — schwach, okay, stark. Die Note bleibt eine Zahl; die Aufschlüsselung zeigt, wohin du als Nächstes schaust.</p>
    <div class="exam-list" id="exams-list"></div>
    <div class="mt-3 timer-actions">
      <button class="btn primary" id="add-exam">＋ Prüfung hinzufügen</button>
      <button class="btn" id="start-mock">▶ Mock-Prüfung starten</button>
      <button class="btn" id="open-prep">📄 Prüfungsvorbereitung</button>
    </div>

    <hr class="rule" style="margin-top: 32px;">
    <div class="section-label">Prognose</div>
    <div class="projection" id="projection" style="padding: 24px 0; font-size: 15px; color: var(--ink-2); line-height: 1.55; max-width: 60ch;"></div>
  `;

  paintExamList(el, state, moduleId, objectives);
  updateProjection(el, state, moduleId);

  el.querySelector('#add-exam')?.addEventListener('click', () => openExamModal(null, moduleId));
  el.querySelector('#start-mock')?.addEventListener('click', () => navigate('mock-exam'));
  el.querySelector('#open-prep')?.addEventListener('click', () => {
    setExamPrepPreset({ moduleId, examId: null });
    navigate('exam-prep');
  });

  registerPatcher('module-exams', (reason, payload = {}) => {
    if (reason === 'exams-rebuild') {
      paintExamList(el, state, moduleId, objectives);
      updateProjection(el, state, moduleId);
      return;
    }
    if (reason === 'exam-delete' && payload.id) {
      el.querySelector(`.exam-item[data-id="${payload.id}"]`)?.remove();
      updateProjection(el, state, moduleId);
      return;
    }
    if (reason === 'exam-rating' && payload.id) {
      const card = el.querySelector(`.exam-item[data-id="${payload.id}"]`);
      const exam = state.exams.find(e => e.id === payload.id);
      if (card && exam) {
        const host = card.querySelector('.exam-breakdown');
        if (host) host.innerHTML = breakdownHtml(state, exam, objectives);
        bindBreakdown(host, state, exam);
      }
    }
  });

  return el;
}

function examsFor(state, moduleId) {
  return state.exams
    .filter(e => e.moduleId === moduleId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function paintExamList(el, state, moduleId, objectives) {
  const exams = examsFor(state, moduleId);
  const list = el.querySelector('#exams-list');
  list.innerHTML = exams.length
    ? exams.map(e => renderExamItem(state, e, objectives)).join('')
    : `<div class="card empty-state"><div class="icon">📝</div><h3>Noch keine Prüfungen</h3><p>Lege die nächste Prüfung an — und verknüpfe danach, was sie abdeckt.</p></div>`;
  bindExamItems(list, el, state, moduleId, exams);
}

function updateProjection(el, state, moduleId) {
  const m = state.modules.find(x => x.id === moduleId);
  const projEl = el.querySelector('#projection');
  if (projEl) projEl.innerHTML = renderProjection(state, moduleId, m?.targetGrade);
}

function bindExamItems(list, el, state, moduleId, exams) {
  list.querySelectorAll('.exam-item').forEach(item => {
    const id = item.dataset.id;
    const exam = exams.find(e => e.id === id);
    if (!exam) return;

    // Score/grade inputs → patch grade + projection in place (neutral display)
    item.querySelectorAll('.exam-input').forEach(inp => {
      inp.addEventListener('input', () => {
        exam[inp.dataset.field] = inp.value;
        exam.updatedAt = Date.now();
        window.EMVS.save();
        updateExamDisplay(item, exam, state, moduleId);
      });
    });

    bindBreakdown(item.querySelector('.exam-breakdown'), state, exam);

    item.querySelector('.exam-diagnose')?.addEventListener('click', e => {
      e.stopPropagation();
      openExamDiagnosis(id);
    });

    item.querySelector('.exam-prep')?.addEventListener('click', e => {
      e.stopPropagation();
      setExamPrepPreset({ moduleId: exam.moduleId, examId: id });
      navigate('exam-prep');
    });

    item.querySelector('.edit-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      openExamModal(exam);
    });

    item.querySelector('.delete-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Prüfung wirklich löschen? Diagnose und Aufschlüsselung gehen verloren.')) {
        state.exams = state.exams.filter(x => x.id !== id);
        state.examResults = state.examResults.filter(x => x.examId !== id);
        window.EMVS.save();
        refresh('exam-delete', { id });
      }
    });
  });
}

/** One-tap rating controls inside a breakdown container. */
function bindBreakdown(host, state, exam) {
  if (!host) return;
  host.querySelectorAll('[data-rate]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const oid = btn.dataset.obj;
    const current = exam.objectiveResults?.find(r => r.objectiveId === oid)?.rating || null;
    const next = btn.dataset.rate === current ? null : btn.dataset.rate;
    setObjectiveRating(exam, oid, next);
    window.EMVS.save();
    window.EMVS.toast.show(next ? `LZ als ${EXAM_RATING_LABELS[next].toLowerCase()} festgehalten` : 'Bewertung zurückgenommen');
    refresh('exam-rating', { id: exam.id });
  }));
}

function ratingSegmented(exam, objectiveId) {
  const current = exam.objectiveResults?.find(r => r.objectiveId === objectiveId)?.rating || null;
  return `<div class="rate-seg" role="group" aria-label="Leistung einschätzen">
    ${RATINGS.map(r => `<button class="badge rate-btn rate-${r} ${current === r ? 'active' : ''}" data-rate="${r}" data-obj="${objectiveId}" title="${EXAM_RATING_LABELS[r]}">${EXAM_RATING_LABELS[r]}</button>`).join('')}
  </div>`;
}

function breakdownHtml(state, exam, objectives) {
  const covered = objectives.filter(o => exam.linkedObjectiveIds?.includes(o.id));
  if (!covered.length) {
    return `<p class="today-empty-line">Noch keine Lernziele abgedeckt — über Bearbeiten oder Diagnose verknüpfen.</p>`;
  }
  const rows = covered.map(o => {
    const entry = exam.objectiveResults?.find(r => r.objectiveId === o.id);
    return `<div class="exam-obj-row">
      <span class="exam-obj-label" title="${escapeHtml(o.title)}">LZ ${o.number}</span>
      ${ratingSegmented(exam, o.id)}
      ${entry?.note ? `<span class="exam-obj-note">${escapeHtml(entry.note.length > 80 ? entry.note.slice(0, 80) + '…' : entry.note)}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="section-label" style="margin:12px 0 8px;">Aufschlüsselung · ${covered.length} ${covered.length === 1 ? 'Lernziel' : 'Lernziele'}</div>
    <div class="exam-obj-list">${rows}</div>
    <div class="exam-dx-line">${diagnosisLine(state, exam, objectives)}</div>`;
}

/** One-line diagnostic summary: where is the user weak? */
function diagnosisLine(state, exam, objectives) {
  const covered = objectives.filter(o => exam.linkedObjectiveIds?.includes(o.id));
  const rated = covered.filter(o => exam.objectiveResults?.some(r => r.objectiveId === o.id && r.rating));
  if (!rated.length) {
    return covered.length
      ? `<span class="muted">Noch nicht aufgeschlüsselt — tippe pro Ziel auf schwach, okay oder stark.</span>`
      : '';
  }
  const weak = rated.filter(o => exam.objectiveResults.find(r => r.objectiveId === o.id)?.rating === 'weak');
  if (!weak.length) {
    return `<span class="exam-dx-ok">Keine Schwachstelle in dieser Aufschlüsselung — ${rated.length} ${rated.length === 1 ? 'Ziel' : 'Ziele'} eingeschätzt.</span>`;
  }
  return `<span class="exam-dx-warn">Schwachstellen: ${weak.map(o => `LZ ${o.number}`).join(', ')} — fliessen in die Schwachstellen-Einschätzung ein.</span>`;
}

function renderExamItem(state, exam, objectives) {
  const grade = getExamGrade(exam);
  const daysLeft = exam.date ? Math.ceil((new Date(exam.date) - new Date()) / 86400000) : null;
  const dateStatus = daysLeft !== null && grade === null
    ? (daysLeft < 0 ? 'vergangen' : daysLeft === 0 ? 'heute' : `in ${daysLeft} Tagen`)
    : '';

  return `
    <div class="exam-item" data-id="${exam.id}" style="display: grid; grid-template-columns: 1fr auto; gap: 20px; padding: 22px 8px; border-radius: 4px; align-items: baseline; transition: background 0.15s; border: 1px solid var(--rule); margin-bottom: 12px;">
      <div class="exam-main">
        <div class="exam-name" style="font-family: var(--serif); font-size: 22px; line-height: 1.2; color: var(--ink);">${escapeHtml(exam.name)}${exam.isMock ? ' <span class="badge">Mock · 0 %</span>' : ''}</div>
        <div class="exam-meta" style="display: flex; gap: 20px; align-items: baseline; font-family: var(--mono); font-size: 12px; color: var(--ink-3); flex-wrap: wrap; margin-top: 8px;">
          <span><input class="exam-input wide" type="date" value="${exam.date || ''}" data-field="date" data-id="${exam.id}" style="background: transparent; border: none; border-bottom: 1px dashed var(--rule-2); padding: 2px 4px; font-family: var(--mono); font-size: 12px; color: var(--ink); outline: none; width: 110px; text-align: left;"></span>
          <span><input class="exam-input" type="number" value="${exam.weight || 0}" data-field="weight" data-id="${exam.id}" style="width: 50px; text-align: center;"><span style="margin-left:2px;">%</span></span>
          <span>
            <input class="exam-input" value="${exam.score ?? ''}" data-field="score" data-id="${exam.id}" placeholder="—" style="width: 60px; text-align: center;">
            <span style="color:var(--ink-3);">/</span>
            <input class="exam-input" value="${exam.max ?? ''}" data-field="max" data-id="${exam.id}" placeholder="—" style="width: 60px; text-align: center;">
          </span>
          ${dateStatus ? `<span class="muted">${dateStatus}</span>` : ''}
        </div>
        <div class="exam-breakdown">${breakdownHtml(state, exam, objectives)}</div>
      </div>
      <div class="exam-grade" style="font-family: var(--serif); font-size: 40px; line-height: 1; color: var(--ink); font-variant-numeric: lining-nums; letter-spacing: -0.02em; text-align: right;" title="Note als Datum, nicht als Urteil">${grade === null ? '—' : grade.toFixed(2)}</div>
      <div style="grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; flex-wrap: wrap;">
        <button class="btn ghost exam-diagnose" style="min-height:30px;font-size:12px;">Diagnose →</button>
        <button class="btn ghost exam-prep" style="min-height:30px;font-size:12px;" title="Prüfungsvorbereitung für diese Prüfung">📄 Prep</button>
        <button class="edit-btn" style="padding: 4px 8px; font-size: 11px; color: var(--ink-3);" title="Bearbeiten">✎</button>
        <button class="delete-btn" style="padding: 4px 8px; font-size: 11px; color: var(--red);" title="Löschen">✕</button>
      </div>
    </div>
  `;
}

function updateExamDisplay(item, exam, state, moduleId) {
  const grade = getExamGrade(exam);
  const gradeEl = item.querySelector('.exam-grade');
  if (gradeEl) gradeEl.textContent = grade === null ? '—' : grade.toFixed(2);

  const projEl = document.getElementById('projection');
  if (projEl) {
    const m = state.modules.find(x => x.id === moduleId);
    projEl.innerHTML = renderProjection(state, moduleId, m?.targetGrade);
  }
}

function renderProjection(state, moduleId, targetGrade) {
  const proj = calculateProjection(state, moduleId, targetGrade || 5.0);
  if (!proj) return '<span style="color: var(--ink-3);">Noch keine offenen Prüfungen mit Gewichtung.</span>';

  const n = proj.needed;
  if (!proj.reachable || n > 6) {
    return `Für Zielnote <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${(targetGrade || 5.0).toFixed(2)}</span> müsstest du in den verbleibenden <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${proj.remainingWeight}%</span> eine <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${n.toFixed(2)}</span> erreichen — nicht erreichbar.`;
  }
  if (n < 1) {
    return `Zielnote <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${(targetGrade || 5.0).toFixed(2)}</span> ist gesichert.`;
  }
  return `Für Zielnote <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${(targetGrade || 5.0).toFixed(2)}</span> brauchst du mindestens <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${n.toFixed(2)}</span> in den verbleibenden <span class="mono-strong" style="font-family: var(--mono); color: var(--accent-ink); font-weight: 500;">${proj.remainingWeight}%</span>.`;
}

// ---------------------------------------------------------------------------
// Diagnosis modal: coverage + per-objective performance + notes
// ---------------------------------------------------------------------------

export function openExamDiagnosis(examId) {
  const state = window.EMVS.getState();
  const exam = state.exams.find(e => e.id === examId);
  if (!exam) return;
  ensureExamFields(exam);

  openModal({
    title: `Diagnose · ${exam.name || 'Prüfung'}`,
    body: `<div id="exam-dx-body">${diagnosisHtml(state, exam)}</div>`,
    footer: `<button class="btn" data-action="close">Schliessen</button>`,
    onClose: () => {},
  });

  setTimeout(() => {
    document.querySelector('#modal-footer [data-action="close"]')?.addEventListener('click', () => closeModal());
    bindDiagnosis(examId);
  }, 50);
}

function diagnosisHtml(state, exam) {
  const objectives = state.learningObjectives.filter(o => o.moduleId === exam.moduleId);
  const grade = getExamGrade(exam);
  const covered = objectives.filter(o => exam.linkedObjectiveIds?.includes(o.id));

  return `
    <div class="obj-hist-summary">
      <div class="obj-hist-facts">
        <span>Note <strong>${grade === null ? '—' : grade.toFixed(2)}</strong>${exam.score !== '' && exam.max !== '' ? ` <span class="muted">(${escapeHtml(String(exam.score))}/${escapeHtml(String(exam.max))})</span>` : ''}</span>
        <span><strong>${exam.weight || 0}%</strong> Gewicht${exam.isMock ? ' <span class="badge">Mock</span>' : ''}</span>
        <span>${exam.date ? formatDate(exam.date) : 'ohne Datum'}</span>
      </div>
      ${exam.description ? `<div class="obj-hist-desc">${escapeHtml(exam.description)}</div>` : ''}
      <p class="today-empty-line" style="margin-top:8px;">Die Note ist ein Datum. Entscheidend ist die Aufschlüsselung darunter — sie speist die Schwachstellen-Einschätzung.</p>
    </div>

    <div class="section-label" style="margin-top:20px;">Abdeckung · ${covered.length} ${covered.length === 1 ? 'Lernziel' : 'Lernziele'}</div>
    <div class="field-row">
      <label>Abgedeckte Lernziele (Mehrfachauswahl)</label>
      <select id="dx-coverage" multiple style="min-height: 100px;">
        ${objectives.map(o => `<option value="${o.id}" ${exam.linkedObjectiveIds?.includes(o.id) ? 'selected' : ''}>LZ ${o.number}: ${escapeHtml(o.title)}</option>`).join('')}
      </select>
    </div>

    <div class="section-label" style="margin-top:20px;">Leistung pro Lernziel</div>
    <div id="dx-rows">
      ${covered.length ? covered.map(o => {
        const entry = exam.objectiveResults?.find(r => r.objectiveId === o.id);
        return `<div class="dx-row" data-obj="${o.id}">
          <div class="dx-row-head">
            <span class="exam-obj-label">LZ ${o.number}</span>
            <span class="dx-row-title">${escapeHtml(o.title.length > 80 ? o.title.slice(0, 80) + '…' : o.title)}</span>
          </div>
          <div class="dx-row-controls">${ratingSegmented(exam, o.id)}</div>
          <input class="dx-note" data-obj="${o.id}" type="text" value="${escapeHtml(entry?.note || '')}" placeholder="Notiz zu diesem Ziel (optional)">
        </div>`;
      }).join('') : `<p class="today-empty-line">Noch nichts abgedeckt — wähle oben Lernziele aus.</p>`}
    </div>

    <div class="section-label" style="margin-top:20px;">Schwachstellen aus dieser Prüfung</div>
    <div class="exam-dx-line">${diagnosisLine(state, exam, objectives)}</div>
  `;
}

function rerenderDiagnosis(examId) {
  const st = window.EMVS.getState();
  const exam = st.exams.find(e => e.id === examId);
  if (!exam) { closeModal(); return; }
  const body = document.getElementById('exam-dx-body');
  if (body) body.innerHTML = diagnosisHtml(st, exam);
  bindDiagnosis(examId);
  refresh('exams-rebuild');
}

function bindDiagnosis(examId) {
  const body = document.getElementById('exam-dx-body');
  if (!body) return;

  body.querySelector('#dx-coverage')?.addEventListener('change', e => {
    const st = window.EMVS.getState();
    const exam = st.exams.find(x => x.id === examId);
    exam.linkedObjectiveIds = Array.from(e.target.selectedOptions).map(o => o.value);
    syncExamObjectives(exam);
    exam.updatedAt = Date.now();
    window.EMVS.save();
    rerenderDiagnosis(examId);
  });

  body.querySelectorAll('[data-rate]').forEach(btn => btn.addEventListener('click', () => {
    const st = window.EMVS.getState();
    const exam = st.exams.find(x => x.id === examId);
    const oid = btn.dataset.obj;
    const current = exam.objectiveResults?.find(r => r.objectiveId === oid)?.rating || null;
    setObjectiveRating(exam, oid, btn.dataset.rate === current ? null : btn.dataset.rate);
    window.EMVS.save();
    rerenderDiagnosis(examId);
  }));

  body.querySelectorAll('.dx-note').forEach(input => input.addEventListener('change', () => {
    const st = window.EMVS.getState();
    const exam = st.exams.find(x => x.id === examId);
    setObjectiveRating(exam, input.dataset.obj, exam.objectiveResults?.find(r => r.objectiveId === input.dataset.obj)?.rating ?? null, input.value.trim());
    window.EMVS.save();
    refresh('exams-rebuild');
  }));
}

// ---------------------------------------------------------------------------
// Create / edit basics (coverage managed here and in diagnosis)
// ---------------------------------------------------------------------------

export function openExamModal(exam = null, moduleId = null) {
  const state = window.EMVS.getState();
  const modId = moduleId || exam?.moduleId || state.settings.currentModuleId;
  const objectives = state.learningObjectives.filter(o => o.moduleId === modId);

  const isNew = !exam;
  const e = exam || {
    id: generateId(),
    moduleId: modId,
    name: '',
    date: '',
    weight: 0,
    score: '',
    max: '',
    linkedObjectiveIds: [],
    objectiveResults: [],
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  ensureExamFields(e);

  openModal({
    title: isNew ? 'Neue Prüfung' : 'Prüfung bearbeiten',
    body: `
      <form id="exam-form">
        <div class="field-row">
          <label>Name</label>
          <input type="text" name="name" value="${escapeHtml(e.name)}" required placeholder="z.B. Prüfung 1">
        </div>
        <div class="field-row">
          <label>Datum</label>
          <input type="date" name="date" value="${e.date || ''}">
        </div>
        <div class="field-row">
          <label>Gewichtung (%)</label>
          <input type="number" name="weight" value="${e.weight || 0}" min="0" max="100" required>
        </div>
        <div class="field-row">
          <label>Score / Maximalpunkte (optional, für Note + Prognose)</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" name="score" value="${escapeHtml(e.score ?? '')}" placeholder="—" style="max-width:100px;">
            <span style="color:var(--ink-3);">/</span>
            <input type="text" name="max" value="${escapeHtml(e.max ?? '')}" placeholder="—" style="max-width:100px;">
          </div>
        </div>
        <div class="field-row">
          <label>Beschreibung</label>
          <textarea name="description" rows="3">${escapeHtml(e.description || '')}</textarea>
        </div>
        <div class="field-row">
          <label>Abgedeckte Lernziele</label>
          <select name="linkedObjectives" multiple style="min-height: 100px;">
            ${objectives.map(o => `<option value="${o.id}" ${e.linkedObjectiveIds?.includes(o.id) ? 'selected' : ''}>LZ ${o.number}: ${escapeHtml(o.title)}</option>`).join('')}
          </select>
        </div>
        ${!isNew ? `<p class="today-empty-line">Die Leistung pro Lernziel (schwach / okay / stark) hältst du auf der Karte oder in der Diagnose fest — nicht hier.</p>` : ''}
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;

    e.name = result.name.trim();
    e.date = result.date || '';
    e.weight = parseInt(result.weight) || 0;
    e.score = result.score?.trim() ?? '';
    e.max = result.max?.trim() ?? '';
    e.description = result.description?.trim() || '';
    e.linkedObjectiveIds = result.linkedObjectives ? (Array.isArray(result.linkedObjectives) ? result.linkedObjectives : [result.linkedObjectives]) : [];
    syncExamObjectives(e);
    e.updatedAt = Date.now();

    if (isNew) {
      e.moduleId = modId;
      state.exams.push(e);
    }

    window.EMVS.save();
    refresh('exams-rebuild');
  });

  setTimeout(() => {
    const form = document.getElementById('exam-form');
    form?.addEventListener('submit', evt => {
      evt.preventDefault();
      const fd = new FormData(form);
      const data = {};
      for (const [key, value] of fd.entries()) {
        if (key === 'linkedObjectives') {
          data[key] = data[key] ? [...data[key], value] : [value];
        } else {
          data[key] = value;
        }
      }
      closeModal(data);
    });

    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('exam-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}

// Re-export for the global view (single home for diagnosis copy).
export { getObjectiveExamSignal };
