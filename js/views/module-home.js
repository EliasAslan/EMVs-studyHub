/**
 * Module Home — dashboard section for one module.
 *
 * Rendered as the 'home' tab inside views/module.js (which owns the page
 * header + subtab bar, so this section renders no duplicate headings).
 * Every section derives from real state; empty sections collapse to a
 * single actionable line instead of filler widgets.
 */

import {
  escapeHtml, formatDate, getNextExam, getWeakestObjective, getModuleStats,
  calculateProjection, getWeakSpots, getRecentSessions, relativeDay,
} from '../utils/helpers.js';
import { formatCountdown, getOpenPlanItems, getRecentCaptures } from '../utils/navigation.js';
import { navigate } from './router.js';
import { openSessionModal } from './module-sessions.js';
import { openObjectiveHistory } from './module-objectives.js';
import { openCaptureModal } from './captures.js';
import { renderToday } from './today.js';

export function renderModuleHomeSection(state, m) {
  if (!m) return renderToday(state);

  const exam = getNextExam(state, m.id);
  const weak = getWeakestObjective(state, m.id);
  const stats = getModuleStats(state, m.id);
  const projection = calculateProjection(state, m.id, m.targetGrade ?? 5.0);
  const lastSession = getRecentSessions(state, 50).find(s => s.moduleId === m.id) || null;
  const spots = getWeakSpots(state, { moduleId: m.id, limit: 2 });
  const notes = getRecentCaptures(state, { limit: 3 }).filter(c => !c.moduleId || c.moduleId === m.id);
  const todos = getOpenPlanItems(state, { moduleId: m.id, limit: 3 });

  const el = document.createElement('div');
  el.className = 'mod-home';
  el.innerHTML = `
    ${renderExamSection(state, m, exam)}
    <div class="section-label" style="margin-top: 24px;">Weiterlernen</div>
    ${renderContinue(m, weak)}
    <div class="section-label" style="margin-top: 24px;">Fortschritt</div>
    <div class="stat-list">
      <div class="stat-row">
        <span class="stat-label">Lernziele gemeistert</span>
        <span class="stat-value">${stats.objectivesDone} <span class="muted">/ ${stats.objectivesTotal}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Ressourcen verstanden</span>
        <span class="stat-value">${stats.resourcesDone} <span class="muted">/ ${stats.resourcesTotal}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Diese Woche gelernt</span>
        <span class="stat-value">${stats.sessionsThisWeek} <span class="muted">Minuten</span></span>
      </div>
    </div>
    ${projection ? `
      <div class="section-label" style="margin-top: 24px;">Prognose</div>
      <div class="projection">${renderProjectionText(projection, m.targetGrade ?? 5.0)}</div>
    ` : ''}
    ${renderLastSession(state, m, lastSession)}
    ${spots.length ? renderSpots(state, m, spots) : ''}
    ${notes.length ? renderNotes(state, notes) : ''}
    ${todos.length ? renderTodos(state, m, todos) : ''}
  `;

  wireModuleHome(el, state, m);
  return el;
}

function goTab(m, tab) {
  navigate('module', { id: m.id, tab });
}

function renderExamSection(state, m, exam) {
  if (!exam) {
    return `
      <div class="section-label">Nächste Prüfung</div>
      <p class="today-empty-line">Keine Prüfung eingetragen.</p>
      <div class="btn-row" style="margin-top: 12px;">
        <button class="btn" data-goto="material">Prüfung eintragen</button>
      </div>`;
  }
  const cd = formatCountdown(exam.date);
  return `
    <div class="section-label">Nächste Prüfung</div>
    <div class="mod-exam">
      <div class="mod-exam-name">${escapeHtml(exam.name)}</div>
      <div class="mod-exam-meta">${escapeHtml(formatDate(exam.date))}${exam.weight ? ` · ${escapeHtml(String(exam.weight))} %` : ''}
        ${cd ? `<span class="badge ${cd.urgent ? 'in-progress' : 'todo'} mod-exam-cd">${escapeHtml(cd.text)}</span>` : ''}
      </div>
      <div class="btn-row" style="margin-top: 12px;">
        <button class="btn" data-goto="material">Zu den Prüfungen</button>
      </div>
    </div>`;
}

function renderContinue(m, weak) {
  if (!weak) {
    return `
      <div class="today-focus">
        <div class="today-focus-label">Bereit</div>
        <div class="today-focus-title">Alles im Rhythmus.</div>
        <div class="today-focus-context">Kein offenes Lernziel — vertiefe einen Verlauf oder protokolliere eine freie Sitzung.</div>
        <div class="timer-actions" style="margin-top: 16px;">
          <button class="btn primary" data-goto="sessions">Sitzung protokollieren</button>
        </div>
      </div>`;
  }
  return `
    <div class="today-focus">
      <div class="today-focus-label">Schwächstes Lernziel · Modul ${escapeHtml(m.code)}</div>
      <div class="today-focus-title">${escapeHtml(weak.title)}</div>
      <div class="today-focus-context">Lernziel ${weak.number ?? '–'} · Confidence ${weak.confidence ?? 0}/5</div>
      <div class="timer-actions" style="margin-top: 16px;">
        <button class="btn primary" data-start-session="${weak.id}">▶ Session starten</button>
        <button class="btn" data-open-history="${weak.id}">Verlauf</button>
      </div>
    </div>`;
}

function renderLastSession(state, m, s) {
  if (!s) return '';
  const linked = (s.linkedObjectiveIds || [])
    .map(id => state.learningObjectives.find(o => o.id === id)?.number)
    .filter(n => n !== undefined && n !== null);
  return `
    <div class="section-label" style="margin-top: 24px;">Letzte Sitzung</div>
    <div class="today-session" role="link" tabindex="0" data-goto-session>
      <span class="today-session-when">${escapeHtml(relativeDay(s.startTime))}</span>
      <span class="today-session-dur">${escapeHtml(String(s.duration ?? 0))} Min</span>
      <span class="today-session-objs">${linked.length ? `LZ ${linked.join(', ')}` : 'freie Sitzung'}</span>
      ${s.note ? `<span class="today-session-note">${escapeHtml(s.note.slice(0, 80))}${s.note.length > 80 ? '…' : ''}</span>` : ''}
    </div>`;
}

function renderSpots(state, m, spots) {
  return `
    <div class="section-label" style="margin-top: 24px;">Braucht Aufmerksamkeit</div>
    <div class="list">
      ${spots.map(({ objective: o, breakdown: b }) => `
        <div class="list-item mod-spot" role="link" tabindex="0" data-open-history="${o.id}">
          <div style="flex: 1; min-width: 0;">
            <div class="mod-spot-title">${escapeHtml(o.title)}</div>
            <div class="mod-spot-meta">LZ ${o.number ?? '–'} · ${escapeHtml(b.signals.slice(0, 2).map(s => s.label).join(' · ') || b.level)}</div>
          </div>
          <span class="badge ${b.level === 'hoch' ? 'in-progress' : 'todo'}">${escapeHtml(b.level)}</span>
        </div>`).join('')}
    </div>
    <a href="#/schwach?module=${encodeURIComponent(m.id)}" class="today-prompt-link" data-weak-all>Alle Schwachstellen →</a>`;
}

function renderNotes(state, notes) {
  return `
    <div class="section-label" style="margin-top: 24px;">Notizen</div>
    <div class="list">
      ${notes.map(c => `
        <div class="list-item mod-note" role="link" tabindex="0" data-open-capture="${c.id}">
          <div style="flex: 1; min-width: 0;">
            <div class="mod-note-text">${escapeHtml(String(c.content || '').slice(0, 120))}${String(c.content || '').length > 120 ? '…' : ''}</div>
            <div class="mod-note-meta">${escapeHtml(relativeDay(c.timestamp || c.createdAt))}${c.type ? ` · ${escapeHtml(c.type)}` : ''}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderTodos(state, m, todos) {
  return `
    <div class="section-label" style="margin-top: 24px;">To-do</div>
    <div class="list">
      ${todos.map(p => `
        <div class="list-item mod-todo" data-todo="${p.id}">
          <button class="todo-check${p.done ? ' done' : ''}" data-todo-toggle="${p.id}" role="checkbox"
            aria-checked="${p.done ? 'true' : 'false'}" aria-label="Aufgabe abhaken: ${escapeHtml(p.text.slice(0, 60))}">✓</button>
          <div style="flex: 1; min-width: 0;">
            <div class="mod-todo-text">${escapeHtml(p.text)}</div>
            <div class="mod-todo-meta">Woche ${escapeHtml(String(p.week ?? '–'))}${p.dueDate ? ` · ${escapeHtml(formatDate(p.dueDate))}` : ''}</div>
          </div>
        </div>`).join('')}
    </div>
    <a href="#/modul/${encodeURIComponent(m.id)}/plan" class="today-prompt-link" data-goto-plan>Zum Plan →</a>`;
}

function renderProjectionText(projection, target) {
  const t = Number(target ?? 5.0);
  const n = projection.needed;
  const fmt = v => Number(v).toFixed(2);
  if (!projection.reachable || n > 6) {
    return `Für Zielnote <strong>${fmt(t)}</strong> müsstest du in den verbleibenden <strong>${projection.remainingWeight}%</strong> eine <strong>${fmt(n)}</strong> erreichen — nicht erreichbar.`;
  }
  if (n < 1) {
    return `Zielnote <strong>${fmt(t)}</strong> ist gesichert.`;
  }
  return `Für Zielnote <strong>${fmt(t)}</strong> brauchst du mindestens <strong>${fmt(n)}</strong> in den verbleibenden <strong>${projection.remainingWeight}%</strong>.`;
}

function setCurrentModule(id) {
  const st = window.EMVS.getState();
  st.settings.currentModuleId = id;
  window.EMVS.save();
  window.EMVS.renderSidebar();
}

function startSessionFor(moduleId, objectiveId) {
  const st = window.EMVS.getState();
  const obj = st.learningObjectives.find(o => o.id === objectiveId);
  if (!obj) return;
  st.settings.currentModuleId = obj.moduleId;
  window.EMVS.save();
  window.EMVS.renderSidebar();
  openSessionModal(null, obj.moduleId, { linkedObjectiveIds: [obj.id], duration: 25 });
}

function wireModuleHome(el, state, m) {
  el.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', () => goTab(m, b.dataset.goto)));
  el.querySelector('[data-goto-session]')?.addEventListener('click', () => goTab(m, 'sessions'));
  el.querySelector('[data-goto-session]')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTab(m, 'sessions'); }
  });
  el.querySelector('[data-goto-plan]')?.addEventListener('click', e => {
    e.preventDefault();
    goTab(m, 'plan');
  });
  el.querySelector('[data-weak-all]')?.addEventListener('click', e => {
    e.preventDefault();
    navigate('weak-spots', { qs: `?module=${encodeURIComponent(m.id)}` });
  });
  el.querySelectorAll('[data-start-session]').forEach(b =>
    b.addEventListener('click', () => startSessionFor(m.id, b.dataset.startSession)));
  const openHistory = (id) => {
    setCurrentModule(m.id);
    openObjectiveHistory(id);
  };
  el.querySelectorAll('[data-open-history]').forEach(node => {
    const open = () => openHistory(node.dataset.openHistory);
    if (node.tagName === 'BUTTON') {
      node.addEventListener('click', open);
      return;
    }
    node.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      open();
    });
    node.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) {
        e.preventDefault();
        open();
      }
    });
  });
  el.querySelectorAll('[data-open-capture]').forEach(row => {
    const open = () => {
      const c = window.EMVS.getState().captures.find(x => x.id === row.dataset.openCapture);
      if (c) openCaptureModal(c);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
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
      window.EMVS.toast?.show(item.done ? 'Festgehalten' : 'Wieder offen');
    }));
}
