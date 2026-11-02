/**
 * Today View - the default landing screen.
 * Answers, on one screen: what now, what did I do, what is shaky.
 * No hero countdown, no percentage stats, no streaks, no red, no shaming.
 */

import { escapeHtml, daysUntil, getRecentSessions, relativeDay, buildReviewQueue, normalizeTodaySkips, riskReasons } from '../utils/helpers.js';
import { recordReview, pushCapped, ensureObjectiveFields } from '../services/store.js';
import { getOpenPlanItems, getRecentCaptures } from '../utils/navigation.js';
import { navigate } from './router.js';
import { openModuleModal } from './settings.js';
import { openObjectiveHistory } from './module-objectives.js';
import { openCaptureModal } from './captures.js';
import { openSessionModal } from './module-sessions.js';

export function renderToday(state) {
  const now = new Date();
  const dateLine = now.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  // Skips expire at midnight; dropping stale ids keeps the queue honest.
  if (normalizeTodaySkips(state, now.getTime())) window.EMVS.save();
  // An outcome flag can outlive its objective (deleted on another view/tab).
  const pendingOutcome = state.settings.todayReviewOutcome;
  if (pendingOutcome && !state.learningObjectives.some(o => o.id === pendingOutcome)) {
    delete state.settings.todayReviewOutcome;
    window.EMVS.save();
  }
  const queue = buildReviewQueue(state, {
    now: now.getTime(),
    skipIds: state.settings.todaySkipIds || []
  });
  const closestExams = closestTests(state, 3);
  const recent = getRecentSessions(state, 3);
  const todos = getOpenPlanItems(state, { limit: 5 });
  const notes = getRecentCaptures(state, { limit: 3 });

  // Visible items: hero (idx 0) + up to 3 collapsed rows (idx 1-3)
  const visibleCount = Math.min(queue.length, 4);
  const tailCount = queue.length - visibleCount;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Heute · ${escapeHtml(dateLine)}</div>
    <h1 class="page-title today-title">Was jetzt <em>zählt.</em></h1>

    ${queue.length ? `
      <h2 class="section-label">Wiederholungen · ${visibleCount} von ${queue.length}</h2>
      <div class="queue">${queue.slice(0, visibleCount).map((item, idx) => renderQueueItem(item, state, idx)).join('')}</div>
      ${tailCount > 0 ? `<p class="queue-tail">… ${tailCount} weitere folgen heute</p>` : ''}
    ` : !state.modules.length ? `
      <div class="today-focus">
        <div class="today-focus-label">Noch nichts da</div>
        <div class="today-focus-title">Lege dein erstes Modul an.</div>
        <div class="today-focus-context">Module, Lernziele und Prüfungen verwalten sich danach fast von allein.</div>
        <div class="timer-actions mt-2">
          <button class="btn primary" data-action="new-module">＋ Erstes Modul erstellen</button>
        </div>
      </div>
    ` : `
      <div class="today-focus">
        <div class="today-focus-label">Bereit</div>
        <div class="today-focus-title">Alles im Rhythmus.</div>
        <div class="today-focus-context">Keine Wiederholung fällig — vertiefe einen Verlauf oder protokolliere eine freie Sitzung.</div>
        <div class="timer-actions mt-2">
          <button class="btn" data-log-session>＋ Sitzung protokollieren</button>
        </div>
      </div>
    `}

    <h2 class="section-label mt-3">Nächste Prüfungen</h2>
    ${renderClosestExams(closestExams, state)}

    <hr class="rule today-rule">

    <div class="section-head">
      <h2 class="section-label" style="margin: 0;">Am Rand</h2>
      <button type="button" class="btn ghost btn-sm" data-log-session>＋ Sitzung</button>
    </div>
    <div class="am-rand">
      ${recent.length ? `
        <div class="am-rand-row" data-am-rand="recent">
          <span class="am-rand-label">Zuletzt aktiv ${recent.length}</span>
          <button class="btn ghost am-rand-expand" data-am-rand-target="recent" aria-expanded="false">alle →</button>
        </div>
        <div class="am-rand-panel" id="am-rand-recent" hidden>${renderRecent(recent, state)}</div>
      ` : ''}
      ${todos.length ? `
        <div class="am-rand-row" data-am-rand="todos">
          <span class="am-rand-label">To-do ${todos.length}</span>
          <button class="btn ghost am-rand-expand" data-am-rand-target="todos" aria-expanded="false">alle →</button>
        </div>
        <div class="am-rand-panel" id="am-rand-todos" hidden><div class="today-todos">${todos.map(p => renderTodoRow(p, state)).join('')}</div></div>
      ` : ''}
      ${notes.length ? `
        <div class="am-rand-row" data-am-rand="notes">
          <span class="am-rand-label">Notizen ${notes.length}</span>
          <button class="btn ghost am-rand-expand" data-am-rand-target="notes" aria-expanded="false">alle →</button>
        </div>
        <div class="am-rand-panel" id="am-rand-notes" hidden><div class="today-notes">${notes.map(c => renderNoteRow(c, state)).join('')}</div></div>
      ` : ''}
    </div>
  `;

  // Empty state handlers
  el.querySelectorAll('[data-action="new-module"]').forEach(b =>
    b.addEventListener('click', () => openModuleModal())
  );

  // Activity rows → jump to that module's Übersicht (sessions live there).
  el.querySelectorAll('.today-session[data-module]').forEach(row => {
    row.addEventListener('click', () => {
      const st = window.EMVS.getState();
      st.settings.currentModuleId = row.dataset.module;
      window.EMVS.save();
      window.EMVS.renderSidebar();
      navigate('module', { id: row.dataset.module, tab: 'home' });
    });
  });

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
  el.querySelectorAll('[data-todo-open]').forEach(btn =>
    btn.addEventListener('click', () => {
      const st = window.EMVS.getState();
      if (btn.dataset.todoOpen) {
        st.settings.currentModuleId = btn.dataset.todoOpen;
        window.EMVS.save();
        window.EMVS.renderSidebar();
      }
      navigate('module', { id: btn.dataset.todoOpen || st.settings.currentModuleId, tab: 'plan' });
    }));

  // Notes rows open the capture editor.
  el.querySelectorAll('[data-capture]').forEach(row => {
    row.addEventListener('click', () => {
      const c = window.EMVS.getState().captures.find(x => x.id === row.dataset.capture);
      if (c) openCaptureModal(c);
    });
  });

  // Manual session log: one tap from Today, no timer required.
  el.querySelectorAll('[data-log-session]').forEach(btn =>
    btn.addEventListener('click', () => {
      const st = window.EMVS.getState();
      const moduleId = st.settings.currentModuleId || st.modules[0]?.id;
      if (!moduleId) { openModuleModal(); return; }
      openSessionModal(null, moduleId);
    }));

  // Exam strip + "Alle Prüfungen" go through the router (focus/scroll reset).
  el.querySelectorAll('[data-goto-exams]').forEach(b =>
    b.addEventListener('click', () => navigate('exams-global')));

  const objectiveById = (id) =>
    window.EMVS.getState().learningObjectives.find(o => o.id === id);

  // Optional secondary path: carry the objective into the focus room and let
  // the user start the Pomodoro themselves. The primary path is the inline
  // outcome buttons above, which need no timer.
  const beginReview = (obj) => {
    if (!obj) return;
    const st = window.EMVS.getState();
    st.settings.currentModuleId = obj.moduleId;
    st.settings.pendingReviewObjectiveId = obj.id;
    window.EMVS.save();
    window.EMVS.renderSidebar();
    navigate('focus');
  };

  // Queue actions
  el.querySelectorAll('.q-start').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      beginReview(objectiveById(btn.dataset.obj));
    })
  );
  el.querySelectorAll('.q-history').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openObjectiveHistory(btn.dataset.obj);
    })
  );
  // Outcome choice buttons
  el.querySelectorAll('.q-outcome-solid, .q-outcome-shaky, .q-outcome-lost, .q-outcome-defer').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const objId = btn.dataset.obj;
      const outcome = btn.dataset.outcome;
      const st = window.EMVS.getState();
      const obj = st.learningObjectives.find(o => o.id === objId);
      if (!obj) return;
      
      if (outcome === 'defer') {
        // "Später" means today, not "never": add the objective to today's
        // skipIds so the queue re-queues it at the end instead of leaving it
        // as the first card forever. Same day-scoping as Überspringen.
        normalizeTodaySkips(st);
        const skipIds = new Set(st.settings.todaySkipIds || []);
        skipIds.add(objId);
        st.settings.todaySkipIds = Array.from(skipIds);
        delete st.settings.todayReviewOutcome;
        window.EMVS.save();
        window.EMVS.toast?.show('Wiederholung verschoben — heute nicht mehr angesagt');
        window.EMVS.refresh('today-outcome-defer', { skipIds: st.settings.todaySkipIds });
        return;
      }
      
      // Record the review using the existing ladder
      const entry = recordReview(obj, outcome);
      window.EMVS.save();
      
      // Show toast with the existing phrasing
      const interval = entry.interval;
      const nextIn = interval === 1 ? 'morgen' : `in ${interval} Tagen`;
      const phrases = {
        solid: 'Sitzt',
        shaky: 'Wackelig',
        lost: 'Verloren'
      };
      window.EMVS.toast?.show(`${phrases[outcome]} — nächste Wiederholung ${nextIn}`, {
        action: {
          label: 'Sitzung loggen',
          onClick: () => openSessionModal(null, obj.moduleId, {
            linkedObjectiveIds: [obj.id],
            duration: 25,
            note: 'Wiederholung',
          }),
        },
      });
      
      // Clear outcome flag and advance (re-render will show next card)
      delete st.settings.todayReviewOutcome;
      // Also clear any skipIds for this objective since it's now reviewed
      if (st.settings.todaySkipIds) {
        st.settings.todaySkipIds = st.settings.todaySkipIds.filter(id => id !== objId);
      }
      window.EMVS.save();
      window.EMVS.refresh('today-outcome-recorded', { objectiveId: objId, outcome });
    })
  );
  // Sicherheit dots: edit in place, no session, no re-render.
  el.querySelectorAll('.q-card .confidence-dot').forEach(dot => {
    const set = () => {
      const obj = objectiveById(dot.dataset.obj);
      if (!obj) return;
      const n = Number(dot.dataset.n);
      obj.confidence = obj.confidence === n ? Math.max(0, n - 1) : n;
      obj.confidenceHistory = obj.confidenceHistory || [];
      pushCapped(obj.confidenceHistory, { value: obj.confidence, timestamp: Date.now() });
      ensureObjectiveFields(obj);
      obj.lastTouched = Date.now();
      obj.updatedAt = Date.now();
      window.EMVS.save();
      const card = dot.closest('.q-card');
      card?.querySelectorAll('.confidence-dot').forEach(d => {
        const on = Number(d.dataset.n) <= obj.confidence;
        d.classList.toggle('on', on);
        d.setAttribute('aria-pressed', String(on));
      });
      card?.querySelector('.q-card-confidence')?.setAttribute('aria-label', `Sicherheit ${obj.confidence}/5`);
      // Weak cards print the risk reasons (including Sicherheit) in the body.
      const reasonLine = card?.querySelector('.q-card-reason');
      if (reasonLine && (card.dataset.kind === 'weak' || card.dataset.kind === 'weakest')) {
        reasonLine.textContent = riskReasons(window.EMVS.getState(), obj, Date.now()).join(' · ');
      }
    };
    dot.addEventListener('click', e => { e.stopPropagation(); set(); });
    dot.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); set(); }
    });
  });

  // Background click opens the learning thread (notes, history, material).
  // The outcome buttons keep their own action; nested buttons/dots are ignored.
  el.querySelector('.q-card:not(.q-outcome)')?.addEventListener('click', e => {
    if (e.target.closest('button, .confidence-dot')) return;
    openObjectiveHistory(e.currentTarget.dataset.obj);
  });
  el.querySelectorAll('.q-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openObjectiveHistory(row.dataset.obj);
    });
  });

  // Am Rand expandable panels
  el.querySelectorAll('.am-rand-expand').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const target = btn.dataset.amRandTarget;
      const panel = el.querySelector(`#am-rand-${target}`);
      const isOpen = !panel.hidden;
      panel.hidden = !isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  return el;
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
    <div class="exam-strip">
      ${list.map(e => {
        const m = moduleOf(state, e.moduleId);
        const d = daysUntil(e.date);
        const when = d === null ? '' : d < 0 ? 'überschritten' : d === 0 ? 'heute' : d === 1 ? 'morgen' : `in ${d} Tagen`;
        const urgent = d !== null && d <= 14;
        return `
          <button type="button" class="exam-chip ${urgent ? 'urgent' : ''}" data-goto-exams>
            <span class="exam-chip-name">${escapeHtml(e.name)}</span>
            <span class="exam-chip-meta">${m ? `Modul ${escapeHtml(m.code)} · ` : ''}${escapeHtml(when)}${e.weight ? ` · ${escapeHtml(String(e.weight))}%` : ''}</span>
          </button>`;
      }).join('')}
    </div>
    <button type="button" class="today-prompt-link" data-goto-exams>Alle Prüfungen →</button>`;
}

function moduleOf(state, moduleId) {
  return state.modules.find(m => m.id === moduleId);
}

/**
 * Render a single queue item.
 * First item (idx 0) is the q-card; next 2-3 are collapsed q-rows.
 * If state.settings.todayReviewOutcome matches this objective, shows the outcome choice.
 */
function renderQueueItem(item, state, idx) {
  const obj = item.objective;
  const m = moduleOf(state, obj.moduleId);
  const isHero = idx === 0;
  const isCollapsedRow = idx > 0 && idx <= 3;
  const kindLabel = kindToLabel(item.kind);

  // Check if we should show the outcome choice for this objective
  const showOutcome = state.settings.todayReviewOutcome === obj.id;

  // Interactive Sicherheit rating (same contract as module-objectives.js:
  // tapping the current value lowers it by one).
  const confidence = obj.confidence ?? 0;
  const dots = [1, 2, 3, 4, 5].map(n => `
    <span class="confidence-dot ${n <= confidence ? 'on' : ''}" data-n="${n}" data-obj="${obj.id}"
          title="Sicherheit ${n}/5" role="button" tabindex="0" aria-label="Sicherheit ${n}/5"
          aria-pressed="${n <= confidence ? 'true' : 'false'}"></span>
  `).join('');

  if (showOutcome) {
    // Outcome choice - "Wie saß das?"
    return `
      <div class="q-card q-outcome" data-obj="${obj.id}" data-kind="${item.kind}">
        <div class="q-card-eyebrow">${escapeHtml(kindLabel)}</div>
        <div class="q-card-title">${escapeHtml(obj.title)}</div>
        <div class="q-card-outcome-question">Wie saß das?</div>
        <div class="q-card-outcome-actions">
          <button class="btn primary q-outcome-solid" data-obj="${obj.id}" data-outcome="solid">Sitzt</button>
          <button class="btn q-outcome-shaky" data-obj="${obj.id}" data-outcome="shaky">Wackelig</button>
          <button class="btn ghost q-outcome-lost" data-obj="${obj.id}" data-outcome="lost">Verloren</button>
          <button class="btn ghost q-outcome-defer" data-obj="${obj.id}" data-outcome="defer">Später</button>
        </div>
      </div>`;
  }

  if (isHero) {
    // q-card - expanded view. Inline outcomes are the primary action; the
    // focus room stays available as a secondary path.
    return `
      <div class="q-card" data-obj="${obj.id}" data-kind="${item.kind}">
        <div class="q-card-eyebrow">${escapeHtml(kindLabel)}</div>
        <div class="q-card-title">${escapeHtml(obj.title)}</div>
        <div class="q-card-meta">
          <span>LZ ${escapeHtml(String(obj.number ?? '–'))}${m ? ` · Modul ${escapeHtml(m.code)}` : ''}</span>
          <span class="q-card-confidence" role="group" aria-label="Sicherheit ${confidence}/5">${dots}</span>
        </div>
        <div class="q-card-reason">${escapeHtml(item.reason)}</div>
        <div class="q-card-actions q-outcomes">
          <button class="btn primary q-outcome-solid" data-obj="${obj.id}" data-outcome="solid">Sitzt</button>
          <button class="btn q-outcome-shaky" data-obj="${obj.id}" data-outcome="shaky">Wackelig</button>
          <button class="btn ghost q-outcome-lost" data-obj="${obj.id}" data-outcome="lost">Verloren</button>
          <button class="btn ghost q-outcome-defer" data-obj="${obj.id}" data-outcome="defer">Später</button>
        </div>
        <div class="q-card-links">
          <button class="q-link q-start" data-obj="${obj.id}">▶ Fokus starten</button>
          <button class="q-link q-history" data-obj="${obj.id}">Lernziel öffnen</button>
        </div>
      </div>`;
  } else if (isCollapsedRow) {
    // Collapsed row with the same inline outcomes, one click away.
    return `
      <div class="q-row" data-obj="${obj.id}" data-kind="${item.kind}">
        <span class="q-row-kind">${escapeHtml(kindLabel)}</span>
        <span class="q-row-title">${escapeHtml(obj.title)}</span>
        <span class="q-row-meta">LZ ${escapeHtml(String(obj.number ?? '–'))}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
        <span class="q-row-actions">
          <button class="q-row-btn q-outcome-solid" data-obj="${obj.id}" data-outcome="solid" aria-label="Sitzt" title="Sitzt">✓</button>
          <button class="q-row-btn q-outcome-shaky" data-obj="${obj.id}" data-outcome="shaky" aria-label="Wackelig" title="Wackelig">~</button>
          <button class="q-row-btn q-outcome-lost" data-obj="${obj.id}" data-outcome="lost" aria-label="Verloren" title="Verloren">✕</button>
          <button class="q-row-btn q-outcome-defer" data-obj="${obj.id}" data-outcome="defer" aria-label="Später" title="Später">→</button>
        </span>
      </div>`;
  } else {
    // Hidden beyond the first 4 - will be counted in the tail
    return '';
  }
}

function kindToLabel(kind) {
  switch (kind) {
    case 'overdue': return 'Überfällig';
    case 'weakest': return 'Schwächstes';
    case 'due': return 'Fällig';
    case 'weak': return 'Schwach';
    default: return kind;
  }
}

function objectiveNumbers(state, session) {
  const nums = (session.linkedObjectiveIds || [])
    .map(id => state.learningObjectives.find(o => o.id === id)?.number)
    .filter(n => n !== undefined && n !== null);
  return nums.length ? `LZ ${nums.join(', ')}` : 'freie Sitzung';
}

function renderRecent(recent, state) {
  if (!recent.length) {
    return `<p class="today-empty-line">Noch keine Sitzungen — protokolliere eine über „＋ Sitzung“.</p>`;
  }
  return `
    <div class="today-sessions">
      ${recent.map(s => {
        const m = moduleOf(state, s.moduleId);
        return `
          <button type="button" class="today-session" data-module="${s.moduleId || ''}">
            <span class="today-session-when">${escapeHtml(relativeDay(s.startTime))}</span>
            <span class="today-session-dur">${escapeHtml(String(s.duration ?? 0))} Min</span>
            <span class="today-session-objs">${escapeHtml(objectiveNumbers(state, s))}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
            ${s.note ? `<span class="today-session-note">${escapeHtml(s.note.slice(0, 80))}${s.note.length > 80 ? '…' : ''}</span>` : ''}
          </button>`;
      }).join('')}
    </div>`;
}

function renderTodoRow(p, state) {
  const m = moduleOf(state, p.moduleId);
  return `
    <div class="today-session today-todo">
      <button class="todo-check" data-todo-toggle="${p.id}" role="checkbox" aria-checked="false"
        aria-label="Aufgabe abhaken: ${escapeHtml(p.text.slice(0, 60))}">✓</button>
      <span class="today-session-note" style="flex-basis: auto; flex: 1;">${escapeHtml(p.text)}</span>
      <span class="today-session-objs">W${escapeHtml(String(p.week ?? '–'))}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
      <button class="btn ghost" data-todo-open="${escapeHtml(p.moduleId || '')}" aria-label="Zum Modulplan">Plan →</button>
    </div>`;
}

function renderNoteRow(c, state) {
  const m = moduleOf(state, c.moduleId);
  return `
    <button type="button" class="today-session today-note" data-capture="${c.id}">
      <span class="today-session-when">${escapeHtml(relativeDay(c.timestamp || c.createdAt))}</span>
      <span class="today-session-note" style="flex-basis:100%;">${escapeHtml(String(c.content || '').slice(0, 120))}${String(c.content || '').length > 120 ? '…' : ''}</span>
      <span class="today-session-objs">${escapeHtml(c.type || '')}${m ? ` · ${escapeHtml(m.code)}` : ''}</span>
    </button>`;
}

/** Re-export for back-compat (tests, other views). */
export { buildTodayPlan } from '../utils/helpers.js';
