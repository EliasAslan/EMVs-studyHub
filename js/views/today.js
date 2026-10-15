/**
 * Today View - the default landing screen.
 * Answers, on one screen: what now, what did I do, what is shaky.
 * No hero countdown, no percentage stats, no streaks, no red, no shaming.
 */

import { escapeHtml, daysUntil, getNextExam, getWeakestObjective, getMostOverdueObjective, getRiskiestObjective, riskReasons, getRecentSessions, relativeDay, getDailyPrompt, getDueObjectives, rhythmOf, getCurrentWeekNumber, hasWeeklyReview } from '../utils/helpers.js';
import { getOpenPlanItems, getRecentCaptures } from '../utils/navigation.js';
import { navigate } from './router.js';
import { openSessionModal } from './module-sessions.js';
import { openModuleModal } from './settings.js';
import { openObjectiveModal, openObjectiveHistory } from './module-objectives.js';
import { openCaptureModal } from './captures.js';

export function renderToday(state) {
  const now = new Date();
  const dateLine = now.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  const focus = pickFocus(state);
  const nextUp = pickNextUp(state, focus);
  const closestExams = closestTests(state, 3);
  const weak = focus?.objective
    ? getRiskiestObjective(state, [focus.objective.id])
    : getRiskiestObjective(state);
  const recent = getRecentSessions(state, 3);
  const prompt = getDailyPrompt(now);
  const due = getDueObjectives(state).slice(0, 5);
  const dueCount = getDueObjectives(state).length;
  const todos = getOpenPlanItems(state, { limit: 5 });
  const notes = getRecentCaptures(state, { limit: 3 });
  const reviewWeek = getCurrentWeekNumber(now);
  const reviewDue = state.modules.length > 0 &&
    !hasWeeklyReview(state, reviewWeek, now.getFullYear(), state.settings.currentModuleId);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Heute · ${escapeHtml(dateLine)}</div>
    <h1 class="page-title today-title">Was jetzt <em>zählt.</em></h1>

    <div class="section-label">Jetzt</div>
    ${renderFocus(focus, state)}

    ${nextUp.length ? `
      <div class="section-label" style="margin-top: 24px;">Als Nächstes</div>
      <div class="nextup-list">${nextUp.map(n => renderNextUp(n, state)).join('')}</div>
    ` : ''}

    <div class="section-label" style="margin-top: 24px;">Nächste Prüfungen</div>
    ${renderClosestExams(closestExams, state)}

    ${due.length ? `
      <div class="section-label" style="margin-top: 28px;">Wieder fällig · ${dueCount}</div>
      <p class="today-empty-line" style="margin-bottom: 12px;">Zuerst vergessen: Verstandenes kehrt im Rhythmus zurück — kein Häkchen, sondern ein Wiedersehen.</p>
      <div class="today-due-list">${due.map(o => renderDueRow(o, state)).join('')}</div>
    ` : ''}

    ${weak ? `
      <div class="section-label" style="margin-top: 28px;">Schwaches Signal</div>
      ${renderWeak(weak, state)}
      <a href="#/schwach" class="today-prompt-link" id="today-weak-all">Alle Schwachstellen →</a>
    ` : ''}

    <hr class="rule today-rule">

    <div class="section-label">Zuletzt aktiv</div>
    ${renderRecent(recent, state)}

    ${todos.length ? `
      <div class="section-label" style="margin-top: 28px;">To-do · ${todos.length}</div>
      <div class="today-todos">${todos.map(p => renderTodoRow(p, state)).join('')}</div>
    ` : ''}

    ${notes.length ? `
      <div class="section-label" style="margin-top: 28px;">Notizen</div>
      <div class="today-notes">${notes.map(c => renderNoteRow(c, state)).join('')}</div>
    ` : ''}

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
      <a href="#/review" class="today-prompt-link" id="today-review-link">Zum Wochenreview →</a>
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
      navigate('module', { id: row.dataset.module, tab: 'sessions' });
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

  // To-do rows: toggle in place, row opens the module plan.
  el.querySelectorAll('[data-todo-toggle]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const st = window.EMVS.getState();
      const item = st.planItems.find(p => p.id === btn.dataset.todoToggle);
      if (!item) return;
      item.done = !item.done;
      window.EMVS.save();
      btn.classList.toggle('done', item.done);
      btn.setAttribute('aria-checked', item.done ? 'true' : 'false');
      btn.closest('.today-todo')?.classList.toggle('is-done', item.done);
      window.EMVS.toast?.show(item.done ? 'Festgehalten' : 'Wieder offen');
    }));
  el.querySelectorAll('.today-todo').forEach(row => {
    const open = () => {
      const st = window.EMVS.getState();
      if (row.dataset.todoModule) {
        st.settings.currentModuleId = row.dataset.todoModule;
        window.EMVS.save();
        window.EMVS.renderSidebar();
      }
      navigate('module', { id: row.dataset.todoModule || st.settings.currentModuleId, tab: 'plan' });
    };
    row.addEventListener('click', e => {
      if (e.target.closest('[data-todo-toggle]')) return;
      open();
    });
    row.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-todo-toggle]')) { e.preventDefault(); open(); }
    });
  });

  // Notes rows open the capture editor.
  el.querySelectorAll('.today-note').forEach(row => {
    const open = () => {
      const c = window.EMVS.getState().captures.find(x => x.id === row.dataset.capture);
      if (c) openCaptureModal(c);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

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

  // Next-up actions
  el.querySelectorAll('[data-next-obj]').forEach(b =>
    b.addEventListener('click', () => {
      const obj = window.EMVS.getState().learningObjectives.find(o => o.id === b.dataset.nextObj);
      if (obj) startSessionFor(obj);
    })
  );
  el.querySelectorAll('[data-next-hist]').forEach(b =>
    b.addEventListener('click', () => openObjectiveHistory(b.dataset.nextHist))
  );

  return el;
}

/**
 * Recommender: one focus + max two secondary actions.
 * Secondary = next due (excluding focus) + riskiest excluding focus/due.
 */
function pickNextUp(state, focus) {
  const out = [];
  const focusId = focus?.objective?.id;
  const due = getDueObjectives(state).filter(o => o.id !== focusId).slice(0, 1);
  due.forEach(o => out.push({ kind: 'due', objective: o }));
  if (out.length < 2) {
    const excl = [focusId, ...out.map(n => n.objective.id)].filter(Boolean);
    const r = getRiskiestObjective(state, excl);
    if (r) out.push({ kind: 'weak', objective: r });
  }
  return out.slice(0, 2);
}

function renderNextUp(n, state) {
  const m = moduleOf(state, n.objective.moduleId);
  const tag = n.kind === 'due' ? 'Fällig' : 'Schwach';
  return `
    <div class="nextup-row">
      <span class="badge nextup-tag">${tag}</span>
      <span class="nextup-title">${escapeHtml(n.objective.title)}</span>
      <span class="nextup-meta">LZ ${escapeHtml(String(n.objective.number ?? '–'))}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
      <span class="nextup-actions">
        <button class="btn ghost nextup-btn" data-next-hist="${n.objective.id}">Verlauf</button>
        <button class="btn ghost nextup-btn" data-next-obj="${n.objective.id}">▶</button>
      </span>
    </div>`;
}

/** Closest tests sorted by date, then weight. */
function closestTests(state, n = 3) {
  return [...(state.exams || [])]
    .filter(e => e.date)
    .map(e => ({ e, d: daysUntil(e.date) }))
    .filter(x => x.d !== null && x.d >= -30)
    .sort((a, b) => (a.d - b.d) || ((b.e.weight || 0) - (a.e.weight || 0)))
    .slice(0, n)
    .map(x => x.e);
}

function renderClosestExams(list, state) {
  if (!list.length) return `<p class="today-empty-line">Keine Prüfung eingetragen — lege unter Prüfungen die nächste an.</p>`;
  return `
    <div class="exam-strip" role="list">
      ${list.map(e => {
        const m = moduleOf(state, e.moduleId);
        const d = daysUntil(e.date);
        const when = d === null ? '' : d < 0 ? 'überschritten' : d === 0 ? 'heute' : d === 1 ? 'morgen' : `in ${d} Tagen`;
        const urgent = d !== null && d <= 14;
        return `
          <a class="exam-chip ${urgent ? 'urgent' : ''}" role="listitem" href="#/pruefungen">
            <span class="exam-chip-name">${escapeHtml(e.name)}</span>
            <span class="exam-chip-meta">${m ? `Modul ${escapeHtml(m.code)} · ` : ''}${escapeHtml(when)}${e.weight ? ` · ${escapeHtml(String(e.weight))}%` : ''}</span>
          </a>`;
      }).join('')}
    </div>
    <a href="#/pruefungen" class="today-prompt-link">Alle Prüfungen →</a>`;
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

function renderTodoRow(p, state) {
  const m = moduleOf(state, p.moduleId);
  return `
    <div class="today-session today-todo" role="link" tabindex="0" data-todo-module="${p.moduleId || ''}">
      <button class="todo-check" data-todo-toggle="${p.id}" role="checkbox" aria-checked="false"
        aria-label="Aufgabe abhaken: ${escapeHtml(p.text.slice(0, 60))}">✓</button>
      <span class="today-session-note" style="flex-basis: auto; flex: 1;">${escapeHtml(p.text)}</span>
      <span class="today-session-objs">W${escapeHtml(String(p.week ?? '–'))}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
    </div>`;
}

function renderNoteRow(c, state) {
  const m = moduleOf(state, c.moduleId);
  return `
    <div class="today-session today-note" role="link" tabindex="0" data-capture="${c.id}">
      <span class="today-session-when">${escapeHtml(relativeDay(c.timestamp || c.createdAt))}</span>
      <span class="today-session-note" style="flex-basis:100%;">${escapeHtml(String(c.content || '').slice(0, 120))}${String(c.content || '').length > 120 ? '…' : ''}</span>
      <span class="today-session-objs">${escapeHtml(c.type || '')}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
    </div>`;
}

function startSessionFor(obj) {
  const st = window.EMVS.getState();
  st.settings.currentModuleId = obj.moduleId;
  window.EMVS.save();
  window.EMVS.renderSidebar();
  openSessionModal(null, obj.moduleId, { linkedObjectiveIds: [obj.id], duration: 25 });
}
