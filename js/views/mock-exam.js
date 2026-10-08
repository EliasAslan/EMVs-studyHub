/**
 * Mock Exam Mode — an actual mode, not a checkbox or plan item.
 *
 * Flow: setup (objectives + duration) → timed run (one recall prompt per
 * objective, distraction-free) → self-scoring (weak/okay/strong per prompt)
 * → result summary. The result is recorded as a zero-weight exam, so it
 * feeds the same diagnostic systems as real exams (weak spots, timelines)
 * without ever moving the grade projection.
 *
 * Run state lives module-locally; phase transitions re-render in place
 * (never via navigate). Leaving the view discards an unfinished run —
 * only recorded results persist.
 */

import { escapeHtml, getExamGrade, EXAM_RATING_LABELS } from '../utils/helpers.js';
import { generateId, ensureExamFields, updateObjectiveHistory } from '../services/store.js';
import { navigate } from './router.js';

export const MOCK_DURATIONS = [10, 15, 25, 45];
export const MOCK_DEFAULT_COUNT = 5;

const MOCK_PROMPT_VERBS = [
  'Erkläre aus dem Kopf',
  'Wende an',
  'Unterscheide und begründe',
  'Gib ein Beispiel für',
  'Beschreibe Schritt für Schritt',
];

const MOCK_POINTS = { weak: 0, okay: 1, strong: 2 };
const MOCK_RATINGS = ['weak', 'okay', 'strong'];

/**
 * One recall prompt per objective. Deterministic verb rotation so a run is
 * reproducible and testable. Prompts deliberately carry no notes or
 * solutions — recall, not recognition.
 */
export function buildMockPrompts(objectives) {
  return (objectives || []).map((o, i) => ({
    objectiveId: o.id,
    verb: MOCK_PROMPT_VERBS[(i + (o.number || 0)) % MOCK_PROMPT_VERBS.length],
  }));
}

/**
 * Score a completed run. ratings: { objectiveId: 'weak'|'okay'|'strong' }.
 * strong = 2, okay = 1, weak = 0 → score/max plus per-rating id lists.
 */
export function scoreMockRatings(ratings, objectiveIds) {
  const ids = { weak: [], okay: [], strong: [] };
  let score = 0;
  for (const oid of objectiveIds || []) {
    const r = ratings?.[oid];
    if (r === 'weak' || r === 'okay' || r === 'strong') {
      ids[r].push(oid);
      score += MOCK_POINTS[r];
    }
  }
  const max = (objectiveIds || []).length * 2;
  return { score, max, ...ids };
}

// Active run (null outside the mode). EndsAt is absolute so timer restarts
// after in-place re-renders stay accurate.
let run = null;
let timerId = null;

/** Router cleanup on leaving the mode: stop the clock, drop the run. */
export function stopMockExamDisplay() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  run = null;
}

function stopTimerOnly() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

export function renderMockExam(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  const el = document.createElement('div');
  el.className = 'mock-wrap';
  if (!m) {
    el.innerHTML = `<div class="eyebrow">Mock-Prüfung</div>
      <h1 class="page-title">Mock-Prüfung</h1>
      <p class="page-lede">Kein Modul ausgewählt.</p>`;
    return el;
  }
  if (!run || run.moduleId !== moduleId) {
    run = null;
    el.appendChild(renderSetup(state, m));
    return el;
  }
  if (run.phase === 'running') el.appendChild(renderRunning(state, m));
  else if (run.phase === 'scoring') el.appendChild(renderScoring(state, m));
  else if (run.phase === 'result') el.appendChild(renderResult(state, m));
  else el.appendChild(renderSetup(state, m));
  return el;
}

function rerenderMock() {
  const root = document.getElementById('view-root');
  if (!root) return;
  stopTimerOnly();
  const state = window.EMVS.getState();
  root.innerHTML = '';
  root.dataset.view = 'mock-exam';
  root.appendChild(renderMockExam(state));
  if (run?.phase === 'running') startTimer();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function weakestFirst(objectives) {
  return [...objectives].sort((a, b) =>
    ((a.confidence ?? 0) - (b.confidence ?? 0)) || ((a.number ?? 0) - (b.number ?? 0)));
}

function renderSetup(state, m) {
  const objectives = state.learningObjectives.filter(o => o.moduleId === m.id);
  const sorted = weakestFirst(objectives);
  const preset = new Set(sorted.slice(0, MOCK_DEFAULT_COUNT).map(o => o.id));

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Mock-Prüfung · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Mock-Prüfung</h1>
    <p class="page-lede">Ein fokussierter Durchgang: eine Frage pro Lernziel, auf Zeit, aus dem Kopf. Das Ergebnis wird als Mock (0&nbsp;%) festgehalten — Diagnose ja, Notendruck nein.</p>
    ${objectives.length ? `
      <div class="section-label">Lernziele · schwächste zuerst</div>
      <div class="mock-objlist">
        ${sorted.map(o => `
          <label class="mock-objrow">
            <input type="checkbox" data-oid="${o.id}" ${preset.has(o.id) ? 'checked' : ''}>
            <span class="mock-objnum">LZ ${o.number ?? '–'}</span>
            <span class="mock-objtitle">${escapeHtml(o.title)}</span>
            <span class="badge">Confidence ${o.confidence ?? 0}/5</span>
          </label>`).join('')}
      </div>
      <div class="section-label" style="margin-top:24px;">Dauer</div>
      <div class="mock-durations" role="group" aria-label="Dauer wählen">
        ${MOCK_DURATIONS.map(d => `
          <label class="badge mock-dur ${d === 25 ? 'active' : ''}">
            <input type="radio" name="mock-dur" value="${d}" ${d === 25 ? 'checked' : ''} style="display:none;"> ${d} Min
          </label>`).join('')}
      </div>
      <p class="page-lede js-mock-info" style="margin-top:16px;"></p>
      <div class="timer-actions" style="margin-top:16px;">
        <button class="btn primary" id="mock-start">▶ Mock starten</button>
        <button class="btn" id="mock-back">Zurück zu Prüfungen</button>
      </div>
    ` : `
      <div class="card empty-state">
        <div class="icon">📝</div>
        <h3>Keine Lernziele</h3>
        <p>Ein Mock braucht Fragen — lege zuerst Lernziele an.</p>
        <div class="timer-actions" style="justify-content:center; margin-top:16px;">
          <button class="btn primary" id="mock-goto-obj">Zu den Lernzielen</button>
        </div>
      </div>
    `}`;

  const boxes = [...el.querySelectorAll('[data-oid]')];
  const info = el.querySelector('.js-mock-info');
  const updateInfo = () => {
    const n = boxes.filter(b => b.checked).length;
    if (info) info.textContent = n
      ? `${n} ${n === 1 ? 'Frage' : 'Fragen'} · selbst bewertet nach Ablauf der Zeit.`
      : 'Wähle mindestens ein Lernziel.';
  };
  boxes.forEach(b => b.addEventListener('change', updateInfo));
  updateInfo();

  el.querySelectorAll('.mock-dur').forEach(l => l.addEventListener('click', () => {
    el.querySelectorAll('.mock-dur').forEach(x => x.classList.toggle('active', x === l));
  }));

  el.querySelector('#mock-start')?.addEventListener('click', () => {
    const selected = boxes.filter(b => b.checked).map(b => b.dataset.oid);
    if (!selected.length) {
      window.EMVS.toast.show('Wähle mindestens ein Lernziel');
      return;
    }
    const objs = selected
      .map(id => objectives.find(o => o.id === id))
      .filter(Boolean);
    const durMin = parseInt(el.querySelector('input[name="mock-dur"]:checked')?.value || '25', 10);
    run = {
      phase: 'running',
      moduleId: m.id,
      prompts: buildMockPrompts(objs),
      index: 0,
      ratings: {},
      totalSec: durMin * 60,
      startedAt: Date.now(),
      endsAt: Date.now() + durMin * 60 * 1000,
      durationMin: durMin,
    };
    rerenderMock();
  });

  el.querySelector('#mock-back')?.addEventListener('click', () => navigate('module-exams'));
  el.querySelector('#mock-goto-obj')?.addEventListener('click', () => navigate('module-objectives'));

  return el;
}

// ---------------------------------------------------------------------------
// Timed run (distraction-free: timer, progress, one prompt)
// ---------------------------------------------------------------------------

function objectiveOf(state, oid) {
  return state.learningObjectives.find(o => o.id === oid);
}

function formatClock(sec) {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  stopTimerOnly();
  timerId = setInterval(() => {
    if (!run || run.phase !== 'running') { stopTimerOnly(); return; }
    const left = Math.round((run.endsAt - Date.now()) / 1000);
    const disp = document.getElementById('mock-timer');
    if (!disp) { stopTimerOnly(); return; }
    disp.textContent = formatClock(left);
    disp.classList.toggle('low', left <= 60);
    const bar = document.getElementById('mock-timebar-fill');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, (left / run.totalSec) * 100))}%`;
    if (left <= 0) {
      stopTimerOnly();
      run.phase = 'scoring';
      window.EMVS.toast.show('Zeit um — bewerte deine Antworten');
      rerenderMock();
    }
  }, 500);
}

function renderRunning(state, m) {
  const el = document.createElement('div');
  const n = run.prompts.length;
  el.innerHTML = `
    <div class="eyebrow">Mock-Prüfung · Modul ${escapeHtml(m.code)} · läuft</div>
    <div class="mock-timer" id="mock-timer" role="timer" aria-label="Verbleibende Zeit">${formatClock(Math.round((run.endsAt - Date.now()) / 1000))}</div>
    <div class="mock-timebar"><div class="mock-timebar-fill" id="mock-timebar-fill"></div></div>
    <div class="mock-progress" id="mock-progress"></div>
    <div id="mock-prompt-wrap"></div>
    <div class="timer-actions mock-nav">
      <button class="btn" id="mock-prev">← Zurück</button>
      <button class="btn" id="mock-next">Weiter →</button>
      <button class="btn primary" id="mock-finish">Beenden & bewerten</button>
    </div>
    <div class="timer-actions" style="margin-top:12px;">
      <button class="btn ghost" id="mock-abort">Abbrechen (verwerfen)</button>
    </div>`;

  paintPrompt(el, state);

  el.querySelector('#mock-prev')?.addEventListener('click', () => {
    run.index = (run.index - 1 + n) % n;
    paintPrompt(el, window.EMVS.getState());
  });
  el.querySelector('#mock-next')?.addEventListener('click', () => {
    run.index = (run.index + 1) % n;
    paintPrompt(el, window.EMVS.getState());
  });
  el.querySelector('#mock-finish')?.addEventListener('click', () => {
    if (confirm('Mock jetzt beenden und bewerten? Die Uhr stoppt.')) {
      stopTimerOnly();
      run.phase = 'scoring';
      rerenderMock();
    }
  });
  el.querySelector('#mock-abort')?.addEventListener('click', () => {
    if (confirm('Mock verwerfen? Es wird nichts festgehalten.')) {
      stopMockExamDisplay();
      navigate('module-exams');
    }
  });
  return el;
}

function paintPrompt(el, state) {
  const p = run.prompts[run.index];
  const obj = objectiveOf(state, p.objectiveId);
  const prog = el.querySelector('#mock-progress');
  if (prog) prog.textContent = `Frage ${run.index + 1} von ${run.prompts.length}`;
  const wrap = el.querySelector('#mock-prompt-wrap');
  if (wrap) {
    wrap.innerHTML = `
      <div class="mock-prompt">
        <div class="mock-prompt-verb">${escapeHtml(p.verb)}</div>
        <div class="mock-prompt-title">${escapeHtml(obj?.title || '—')}</div>
        <div class="mock-prompt-hint">Antworte aus dem Kopf — laut, auf Papier oder in Gedanken. Keine Notizen, kein Nachschlagen.</div>
      </div>`;
  }
  el.querySelector('#mock-prev').disabled = run.prompts.length < 2;
  el.querySelector('#mock-next').disabled = run.prompts.length < 2;
}

// ---------------------------------------------------------------------------
// Self-scoring
// ---------------------------------------------------------------------------

function renderScoring(state, m) {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Mock-Prüfung · Modul ${escapeHtml(m.code)} · Auswertung</div>
    <h1 class="page-title">Wie lief's?</h1>
    <p class="page-lede">Bewerte jede Antwort ehrlich — schwach, okay oder stark. Daraus entsteht die Diagnose.</p>
    <div id="mock-score-list">
      ${run.prompts.map((p, i) => {
        const obj = objectiveOf(state, p.objectiveId);
        const cur = run.ratings[p.objectiveId] || null;
        return `<div class="dx-row" data-obj="${p.objectiveId}">
          <div class="dx-row-head">
            <span class="exam-obj-label">Frage ${i + 1}</span>
            <span class="dx-row-title">${escapeHtml(obj?.title || '—')}</span>
          </div>
          <div class="dx-row-controls">
            <div class="rate-seg" role="group" aria-label="Antwort bewerten">
              ${['weak', 'okay', 'strong'].map(r => `
                <button class="badge rate-btn rate-${r} ${cur === r ? 'active' : ''}" data-rate="${r}" data-obj="${p.objectiveId}">${EXAM_RATING_LABELS[r]}</button>`).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <p class="page-lede js-mock-score-hint"></p>
    <div class="timer-actions" style="margin-top:16px;">
      <button class="btn primary" id="mock-record">Ergebnis festhalten</button>
    </div>`;

  const hint = el.querySelector('.js-mock-score-hint');
  const updateHint = () => {
    const rated = Object.keys(run.ratings).length;
    const n = run.prompts.length;
    if (hint) hint.textContent = rated < n
      ? `Noch ${n - rated} ${n - rated === 1 ? 'Antwort' : 'Antworten'} unbewertet.`
      : 'Alles bewertet — bereit zum Festhalten.';
  };
  updateHint();

  el.querySelectorAll('[data-rate]').forEach(btn => btn.addEventListener('click', () => {
    const oid = btn.dataset.obj;
    run.ratings[oid] = run.ratings[oid] === btn.dataset.rate ? null : btn.dataset.rate;
    if (!run.ratings[oid]) delete run.ratings[oid];
    btn.parentElement.querySelectorAll('[data-rate]').forEach(b =>
      b.classList.toggle('active', run.ratings[oid] === b.dataset.rate));
    updateHint();
  }));

  el.querySelector('#mock-record')?.addEventListener('click', () => {
    if (Object.keys(run.ratings).length < run.prompts.length) {
      window.EMVS.toast.show('Bewerte zuerst alle Antworten');
      return;
    }
    recordMockResult();
    run.phase = 'result';
    rerenderMock();
  });

  return el;
}

/** Persist the run: zero-weight exam (diagnosis) + study session (time). */
function recordMockResult() {
  const state = window.EMVS.getState();
  const oids = run.prompts.map(p => p.objectiveId);
  const { score, max } = scoreMockRatings(run.ratings, oids);
  const elapsedMin = Math.max(1, Math.round((Date.now() - run.startedAt) / 60000));
  const dateStr = new Date().toISOString().slice(0, 10);
  const dateLabel = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });

  const exam = {
    id: generateId(),
    moduleId: run.moduleId,
    name: `Mock · ${dateLabel} · ${oids.length} ${oids.length === 1 ? 'Ziel' : 'Ziele'}`,
    date: dateStr,
    weight: 0,
    score,
    max,
    linkedObjectiveIds: [...oids],
    objectiveResults: oids.map(oid => ({
      objectiveId: oid,
      rating: run.ratings[oid] || null,
      note: 'Mock-Prüfung',
    })),
    description: `Mock-Prüfung, ${run.durationMin} Min geplant, ${elapsedMin} Min gebraucht.`,
    isMock: true,
    durationMin: run.durationMin,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  ensureExamFields(exam);
  state.exams.push(exam);

  const session = {
    id: generateId(),
    moduleId: run.moduleId,
    startTime: new Date(run.startedAt).toISOString(),
    duration: elapsedMin,
    linkedObjectiveIds: [...oids],
    linkedResourceIds: [],
    note: `Mock-Prüfung (${oids.length} ${oids.length === 1 ? 'Ziel' : 'Ziele'})`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.studySessions.push(session);
  updateObjectiveHistory(state, session);

  window.EMVS.save();
  run.result = { examId: exam.id, score, max, elapsedMin };
  window.EMVS.toast.show(`Mock festgehalten: ${score}/${max} Punkte`);
}

// ---------------------------------------------------------------------------
// Result summary
// ---------------------------------------------------------------------------

function renderResult(state, m) {
  const { examId, score, max, elapsedMin } = run.result;
  const exam = state.exams.find(e => e.id === examId);
  const grade = exam ? getExamGrade(exam) : null;
  const oids = run.prompts.map(p => p.objectiveId);
  const { weak, okay, strong } = scoreMockRatings(run.ratings, oids);
  const objOf = (id) => objectiveOf(state, id);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Mock-Prüfung · Modul ${escapeHtml(m.code)} · Ergebnis</div>
    <h1 class="page-title">${score} <span style="color:var(--ink-3);">/ ${max}</span></h1>
    <p class="page-lede">Festgehalten als Mock (0&nbsp;%) — fliesst in Diagnose und Schwachstellen ein, nicht in die Prognose.${grade !== null ? ` Rechnerische Note: ${grade.toFixed(2)} (Datum, kein Urteil).` : ''} Gebraucht: ${elapsedMin} Min.</p>

    <div style="margin:12px 0; display:flex; gap:6px; flex-wrap:wrap;">
      ${weak.length ? `<span class="badge rate-weak active">${weak.length}× schwach</span>` : ''}
      ${okay.length ? `<span class="badge rate-okay active">${okay.length}× okay</span>` : ''}
      ${strong.length ? `<span class="badge rate-strong active">${strong.length}× stark</span>` : ''}
    </div>

    <div class="section-label">Aufschlüsselung</div>
    <div class="exam-obj-list">
      ${oids.map(oid => {
        const o = objOf(oid);
        const r = run.ratings[oid];
        return `<div class="exam-obj-row">
          <span class="exam-obj-label">LZ ${o?.number ?? '–'}</span>
          <span style="flex:1; min-width:0;">${escapeHtml(o?.title || '—')}</span>
          <span class="badge rate-${r} active">${EXAM_RATING_LABELS[r]}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="exam-dx-line" style="margin-top:12px;">${weak.length
      ? `<span class="exam-dx-warn">Schwachstellen aus diesem Mock: ${weak.map(id => `LZ ${objOf(id)?.number ?? '–'}`).join(', ')} — fliessen in die Schwachstellen-Einschätzung ein.</span>`
      : `<span class="exam-dx-ok">Keine Schwachstelle in diesem Durchgang.${okay.length ? ' Okay bleibt ausbaufähig.' : ''}</span>`}</div>

    <div class="timer-actions" style="margin-top:24px;">
      <button class="btn primary" id="mock-to-exams">Zu Prüfungen</button>
      <button class="btn" id="mock-to-weak">Schwachstellen ansehen</button>
      <button class="btn" id="mock-again">Neuer Mock</button>
    </div>`;

  el.querySelector('#mock-to-exams')?.addEventListener('click', () => {
    stopMockExamDisplay();
    navigate('module-exams');
  });
  el.querySelector('#mock-to-weak')?.addEventListener('click', () => {
    stopMockExamDisplay();
    navigate('weak-spots');
  });
  el.querySelector('#mock-again')?.addEventListener('click', () => {
    run = null;
    rerenderMock();
  });

  return el;
}
