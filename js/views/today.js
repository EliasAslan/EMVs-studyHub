/**
 * Today View - the default landing screen.
 * Answers, on one screen: what now, what did I do, what is shaky.
 * No hero countdown, no percentage stats, no streaks, no red, no shaming.
 */

import { escapeHtml, daysUntil, getNextExam, getWeakestObjective, getMostOverdueObjective, getRiskiestObjective, riskReasons, getRecentSessions, relativeDay, getDailyPrompt, getDueObjectives, rhythmOf, getCurrentWeekNumber, hasWeeklyReview } from '../utils/helpers.js';
import { navigate } from './router.js';
import { openSessionModal } from './module-sessions.js';
import { openModuleModal } from './settings.js';
import { openObjectiveModal, openObjectiveHistory } from './module-objectives.js';

export function renderToday(state) {
  const now = new Date();
  const dateLine = now.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  const exam = getNextExam(state);
  const focus = pickFocus(state);
  const weak = focus?.objective
    ? getRiskiestObjective(state, [focus.objective.id])
    : getRiskiestObjective(state);
  const recent = getRecentSessions(state, 3);
  const prompt = getDailyPrompt(now);
  const due = getDueObjectives(state).slice(0, 5);
  const dueCount = getDueObjectives(state).length;
  const reviewWeek = getCurrentWeekNumber(now);
  const reviewDue = state.modules.length > 0 &&
    !hasWeeklyReview(state, reviewWeek, now.getFullYear(), state.settings.currentModuleId);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Heute · ${escapeHtml(dateLine)}</div>
    <h1 class="page-title today-title">Was jetzt <em>zählt.</em></h1>

    <div class="today-exam">${renderExamLine(state, exam)}</div>

    <hr class="rule today-rule">

    <div class="section-label">Fokus heute</div>
    ${renderFocus(focus, state)}

    ${due.length ? `
      <div class="section-label" style="margin-top: 28px;">Wieder fällig · ${dueCount}</div>
      <p class="today-empty-line" style="margin-bottom: 12px;">Zuerst vergessen: Verstandenes kehrt im Rhythmus zurück — kein Häkchen, sondern ein Wiedersehen.</p>
      <div class="today-due-list">${due.map(o => renderDueRow(o, state)).join('')}</div>
    ` : ''}

    ${weak ? `
      <div class="section-label" style="margin-top: 28px;">Schwaches Signal</div>
      ${renderWeak(weak, state)}
      <a href="#" class="today-prompt-link" id="today-weak-all">Alle Schwachstellen →</a>
    ` : ''}

    <hr class="rule today-rule">

    <div class="section-label">Zuletzt aktiv</div>
    ${renderRecent(recent, state)}

    <hr class="rule today-rule">

    ${reviewDue ? `
      <div class="today-review-nudge">
        <div>
          <div class="today-review-nudge-title">Wochenreview offen — KW ${reviewWeek}</div>
          <div class="today-review-nudge-sub">Drei Fragen, fünf Minuten, mit den Fakten der Woche daneben.</div>
        </div>
        <button class="btn primary" id="today-review-now">Jetzt reviewen</button>
      </div>
      <hr class="rule today-rule">
    ` : ''}

    <div class="today-prompt">
      <span class="today-prompt-q">„${escapeHtml(prompt)}“</span>
      <a href="#" class="today-prompt-link" id="today-review-link">Zum Wochenreview →</a>
    </div>
  `;

  // Fokus: start session (pre-filled sheet)
  el.querySelector('#today-start-session')?.addEventListener('click', () => {
    const obj = focus?.objective;
    if (!obj) return;
    startSessionFor(obj);
  });

  // Fokus empty states
  el.querySelector('#today-new-objective')?.addEventListener('click', () => {
    const modId = state.settings.currentModuleId || state.modules[0]?.id || null;
    openObjectiveModal(null, modId);
  });
  el.querySelectorAll('[data-action="new-module"]').forEach(b =>
    b.addEventListener('click', () => openModuleModal())
  );

  // Activity rows → jump to that module's sessions.
  // Due rows (data-obj) open the objective history instead.
  el.querySelectorAll('.today-session:not(.today-due)').forEach(row => {
    const open = () => {
      const st = window.EMVS.getState();
      st.settings.currentModuleId = row.dataset.module;
      window.EMVS.save();
      window.EMVS.renderSidebar();
      navigate('module-sessions');
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  el.querySelectorAll('.today-due').forEach(row => {
    const id = row.dataset.obj;
    const open = () => openObjectiveHistory(id);
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      open();
    });
    row.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) { e.preventDefault(); open(); }
    });
  });
  el.querySelectorAll('.today-due-history').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); openObjectiveHistory(b.dataset.obj); })
  );
  el.querySelectorAll('.today-due-start').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      const obj = window.EMVS.getState().learningObjectives.find(o => o.id === b.dataset.obj);
      if (obj) startSessionFor(obj);
    })
  );

  // Review prompt link
  el.querySelector('#today-review-link')?.addEventListener('click', e => {
    e.preventDefault();
    navigate('weekly-review');
  });
  el.querySelector('#today-review-now')?.addEventListener('click', () => navigate('weekly-review'));

  // Weak signal → full ranked list
  el.querySelector('#today-weak-all')?.addEventListener('click', e => {
    e.preventDefault();
    navigate('weak-spots');
  });

  return el;
}

/**
 * Fokus priority: most overdue review → weakest objective → empty state.
 */
function pickFocus(state) {
  const overdue = getMostOverdueObjective(state);
  if (overdue) {
    const due = overdue.reviewSchedule.nextReview;
    const days = Math.max(0, Math.floor((Date.now() - due) / 86400000));
    const understood = overdue.status === 'done' ? ' · einst verstanden' : '';
    return {
      kind: 'overdue',
      objective: overdue,
      label: 'Überfälliges Review',
      context: (days === 0
        ? 'Review ist heute fällig'
        : days === 1 ? 'Review ist seit gestern fällig' : `Review ist seit ${days} Tagen fällig`) + understood
    };
  }
  const weak = getWeakestObjective(state);
  if (weak) {
    return {
      kind: 'weakest',
      objective: weak,
      label: 'Schwächstes Lernziel',
      context: `Confidence ${weak.confidence ?? 0}/5`
    };
  }
  return null;
}

function moduleOf(state, moduleId) {
  return state.modules.find(m => m.id === moduleId);
}

function renderExamLine(state, exam) {
  if (!exam) return `<span class="today-exam-quiet">Keine Prüfung eingetragen</span>`;
  const m = moduleOf(state, exam.moduleId);
  const d = daysUntil(exam.date);
  const when = d === null ? '' : d < 0 ? 'überschritten' : d === 0 ? 'heute' : d === 1 ? 'morgen' : `in ${d} Tagen`;
  return `<span class="today-exam-name">${escapeHtml(exam.name)}</span>
    <span class="today-exam-meta">${m ? `Modul ${escapeHtml(m.code)} · ` : ''}${escapeHtml(when)}${exam.weight ? ` · ${escapeHtml(String(exam.weight))} %` : ''}</span>`;
}

function renderFocus(focus, state) {
  if (!focus?.objective) {
    if (!state.modules.length) {
      return `
        <div class="today-focus">
          <div class="today-focus-label">Noch nichts da</div>
          <div class="today-focus-title">Lege dein erstes Modul an.</div>
          <div class="today-focus-context">Module, Lernziele und Prüfungen verwalten sich danach fast von allein.</div>
          <div class="timer-actions" style="margin-top: 16px;">
            <button class="btn primary" data-action="new-module">＋ Erstes Modul erstellen</button>
          </div>
        </div>`;
    }
    return `
      <div class="today-focus">
        <div class="today-focus-label">Bereit</div>
        <div class="today-focus-title">Alles im Rhythmus.</div>
        <div class="today-focus-context">Kein Review fällig — vertiefe einen Verlauf oder protokolliere eine freie Sitzung.</div>
        <div class="timer-actions" style="margin-top: 16px;">
          <button class="btn primary" id="today-new-objective">＋ Lernziel erstellen</button>
        </div>
      </div>`;
  }
  const obj = focus.objective;
  const m = moduleOf(state, obj.moduleId);
  return `
    <div class="today-focus">
      <div class="today-focus-label">${escapeHtml(focus.label)}${m ? ` · Modul ${escapeHtml(m.code)}` : ''}</div>
      <div class="today-focus-title">${escapeHtml(obj.title)}</div>
      <div class="today-focus-context">${escapeHtml(focus.context)}${m ? ` · ${escapeHtml(m.title)}` : ''}</div>
      <div class="timer-actions" style="margin-top: 16px;">
        <button class="btn primary" id="today-start-session">▶ Session starten</button>
      </div>
    </div>`;
}

function renderWeak(obj, state) {
  const m = moduleOf(state, obj.moduleId);
  return `
    <div class="today-weak">
      <div class="today-weak-title">${escapeHtml(obj.title)}</div>
      <div class="today-weak-meta">LZ ${escapeHtml(String(obj.number ?? '–'))}${m ? ` · Modul ${escapeHtml(m.code)}` : ''} · ${escapeHtml(riskReasons(state, obj).join(' · '))}</div>
    </div>`;
}

function renderDueRow(obj, state) {
  const m = moduleOf(state, obj.moduleId);
  const r = rhythmOf(obj);
  return `
    <div class="today-session today-due" role="link" tabindex="0" data-obj="${obj.id}">
      <span class="today-session-when">${escapeHtml(r.detail)}</span>
      <span class="today-session-objs">LZ ${escapeHtml(String(obj.number ?? '–'))}${m ? ` · ${escapeHtml(m.code)}` : ''}${obj.status === 'done' ? ' · verstanden' : ''}</span>
      <span class="today-session-note" style="flex-basis:100%;">${escapeHtml(obj.title)}</span>
      <span class="today-due-actions">
        <button class="btn ghost today-due-history" data-obj="${obj.id}">Verlauf →</button>
        <button class="btn ghost today-due-start" data-obj="${obj.id}">▶ Session</button>
      </span>
    </div>`;
}

function objectiveNumbers(state, session) {
  const nums = (session.linkedObjectiveIds || [])
    .map(id => state.learningObjectives.find(o => o.id === id)?.number)
    .filter(n => n !== undefined && n !== null);
  return nums.length ? `LZ ${nums.join(', ')}` : 'freie Sitzung';
}

function renderRecent(recent, state) {
  if (!recent.length) {
    return `<p class="today-empty-line">Noch keine Sitzungen — starte oben eine Session oder nutze den Timer unter Sitzungen.</p>`;
  }
  return `
    <div class="today-sessions">
      ${recent.map(s => {
        const m = moduleOf(state, s.moduleId);
        return `
          <div class="today-session" role="link" tabindex="0" data-module="${s.moduleId || ''}">
            <span class="today-session-when">${escapeHtml(relativeDay(s.startTime))}</span>
            <span class="today-session-dur">${escapeHtml(String(s.duration ?? 0))} Min</span>
            <span class="today-session-objs">${escapeHtml(objectiveNumbers(state, s))}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
            ${s.note ? `<span class="today-session-note">${escapeHtml(s.note.slice(0, 80))}${s.note.length > 80 ? '…' : ''}</span>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function startSessionFor(obj) {
  const st = window.EMVS.getState();
  st.settings.currentModuleId = obj.moduleId;
  window.EMVS.save();
  window.EMVS.renderSidebar();
  openSessionModal(null, obj.moduleId, { linkedObjectiveIds: [obj.id], duration: 25 });
}
