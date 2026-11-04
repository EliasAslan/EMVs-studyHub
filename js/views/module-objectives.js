/**
 * Module Objectives View — history first, not status first.
 *
 * Each objective is a learning thread with a past (sessions, Sicherheit
 * changes, reviews, resources used, exams, captures) and a rhythm (spaced
 * resurfacing). Rows show history signals — Sicherheit, last touched, total
 * study time, linked resource count, next review — and clicking a row opens
 * the full timeline. There are no checkboxes and no status dropdown on the
 * row; "done" means "resting until the next review", never gone.
 */

import { escapeHtml } from '../utils/helpers.js';
import {
  buildObjectiveTimeline, rhythmOf, formatLastTouched, formatNextReview,
  linkedResourceCount, resourcesForObjective, formatDate,
  examsForObjective, getExamGrade, isDue, capturesForObjective,
  CAPTURE_TYPE_LABELS, RESOURCE_TYPE_LABELS,
} from '../utils/helpers.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import {
  generateId, ensureObjectiveFields, recordReview, markUnderstood,
  reopenObjective, unlinkObjectiveEverywhere, pushCapped, deleteWithTombstone,
} from '../services/store.js';
import { openQuickCapture, openCaptureModal } from './captures.js';
import { refresh, registerPatcher } from './router.js';
import { startPomodoroFor, openSessionModal } from './module-sessions.js';

const GROUP_ORDER = ['due', 'active', 'resting', 'fresh'];
const GROUP_TITLES = {
  due: 'Fällig — zuerst wiederholen',
  active: 'In Bewegung',
  resting: 'Verstanden — ruht bis zur Wiederholung',
  fresh: 'Neu — noch nicht begonnen',
};
const GROUP_NOTES = {
  due: 'Die Wiederholung ist fällig.',
  active: 'Daran arbeitest du gerade.',
  resting: 'Verstanden heisst nicht fertig: Es ruht bis zur nächsten Wiederholung.',
  fresh: 'Noch keine Sitzung. Die erste beginnt den Verlauf.',
};

export function renderModuleObjectives(state, { embedded = false } = {}) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return document.createElement('div');

  state.learningObjectives.forEach(ensureObjectiveFields);

  const el = document.createElement('div');
  el.innerHTML = `
    ${embedded ? '' : `
    <div class="eyebrow">Verläufe · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Lernziele</h1>
    <p class="page-lede js-obj-lede"></p>`}
    <div id="objectives-groups"></div>
    <div class="mt-3">
      <button class="btn primary" id="add-objective">＋ Lernziel hinzufügen</button>
    </div>
  `;

  paintObjectiveGroups(el, state, moduleId);

  el.querySelector('#add-objective')?.addEventListener('click', () => openObjectiveModal(null, moduleId));

  registerPatcher('module-objectives', (reason) => {
    if (reason === 'objectives-rebuild' || String(reason).startsWith('objective-')) {
      paintObjectiveGroups(el, state, moduleId);
    }
  });

  return el;
}

function objectivesFor(state, moduleId) {
  return state.learningObjectives
    .filter(o => o.moduleId === moduleId)
    .sort((a, b) => {
      const now = Date.now();
      const aDue = a.reviewSchedule?.nextReview ?? Infinity;
      const bDue = b.reviewSchedule?.nextReview ?? Infinity;
      const aIsDue = aDue <= now, bIsDue = bDue <= now;
      if (aIsDue !== bIsDue) return aIsDue ? -1 : 1;
      if (aIsDue && bIsDue) return aDue - bDue;
      return (a.number ?? 0) - (b.number ?? 0);
    });
}

function groupOf(obj) {
  const r = rhythmOf(obj).key;
  if (r === 'due') return 'due';
  if (r === 'resting') return 'resting';
  if (r === 'fresh') return 'fresh';
  return 'active'; // 'active' + 'soon'
}

function paintObjectiveGroups(el, state, moduleId) {
  const objectives = objectivesFor(state, moduleId);
  const lede = el.querySelector('.js-obj-lede');
  const due = objectives.filter(o => groupOf(o) === 'due').length;
  if (lede) {
    lede.textContent = due
      ? `${objectives.length} Lernziele · ${due} fällig zur Wiederholung. Klick auf ein Ziel öffnet Notizen, Material und Verlauf.`
      : `${objectives.length} Lernziele. Klick auf ein Ziel öffnet Notizen, Material und Verlauf — Sicherheit per Klick anpassen.`;
  }
  const host = el.querySelector('#objectives-groups');
  const groups = { due: [], active: [], resting: [], fresh: [] };
  objectives.forEach(o => groups[groupOf(o)].push(o));
  host.innerHTML = GROUP_ORDER
    .filter(g => groups[g].length)
    .map(g => `
      <h2 class="section-label" style="margin-top: 28px;">${GROUP_TITLES[g]} · ${groups[g].length}</h2>
      <p class="today-empty-line" style="margin-bottom: 12px;">${GROUP_NOTES[g]}</p>
      <div class="hz-list">${groups[g].map(o => renderObjectiveCard(o, state)).join('')}</div>
    `).join('') || `<p class="today-empty-line">Noch keine Lernziele — lege oben das erste an.</p>`;

  host.querySelectorAll('.hz-item').forEach(item => bindObjectiveCard(item, state));
}

function renderObjectiveCard(obj, state) {
  const r = rhythmOf(obj);
  const resCount = linkedResourceCount(state, obj);
  const totalTime = obj.totalStudyTime || 0;
  const reviewCount = (obj.reviewHistory || []).length;
  const due = r.key === 'due';
  return `
    <div class="hz-item obj-card ${due ? 'obj-due' : ''}" data-id="${obj.id}">
      <div class="hz-head">
        <div class="hz-num">LZ ${obj.number ?? '–'}</div>
        <span class="badge rhythm rhythm-${r.key}">${escapeHtml(r.label)}</span>
        ${obj.status === 'done' ? `<span class="badge done">verstanden</span>` : ''}
        ${due ? `<span class="badge obj-due-badge">${escapeHtml(r.detail)}</span>` : ''}
      </div>
      <div class="hz-title obj-title">${escapeHtml(obj.title)}</div>
      <div class="obj-meta">
        <div class="confidence-dots" data-id="${obj.id}" role="group" aria-label="Sicherheit">
          ${[1, 2, 3, 4, 5].map(n => `<div class="confidence-dot ${n <= (obj.confidence || 0) ? 'on' : ''}" data-n="${n}" title="Sicherheit ${n}/5" role="button" tabindex="0" aria-label="Sicherheit ${n}"></div>`).join('')}
        </div>
        <span class="obj-meta-item" title="Zuletzt berührt">berührt ${escapeHtml(formatLastTouched(obj))}</span>
        <span class="obj-meta-item" title="Gesamte Lernzeit">${totalTime} Min</span>
        <span class="obj-meta-item" title="Verknüpftes Material">${resCount} Material</span>
        <span class="obj-meta-item obj-next ${due ? 'due' : ''}" title="Nächste Wiederholung">Wiederholung: ${escapeHtml(formatNextReview(obj))}</span>
        ${reviewCount ? `<span class="obj-meta-item" title="Abgeschlossene Wiederholungen">${reviewCount}× wiederholt</span>` : ''}
      </div>
      <div class="obj-actions">
        <button type="button" class="obj-open-hint" data-open-history aria-label="Lernziel öffnen: ${escapeHtml(obj.title)}">Öffnen →</button>
        <span class="obj-tools">
          <button class="edit-btn" title="Details bearbeiten" aria-label="Details bearbeiten">✎</button>
          <button class="delete-btn" title="Löschen" aria-label="Lernziel löschen">✕</button>
        </span>
      </div>
    </div>
  `;
}

function bindObjectiveCard(item, state) {
  const id = item.dataset.id;
  const obj = state.learningObjectives.find(o => o.id === id);
  if (!obj) return;

  item.querySelector('[data-open-history]')?.addEventListener('click', () => openObjectiveHistory(id));

  item.querySelectorAll('.confidence-dot').forEach(dot => {
    const set = () => {
      const n = +dot.dataset.n;
      obj.confidence = obj.confidence === n ? Math.max(0, n - 1) : n;
      obj.confidenceHistory = obj.confidenceHistory || [];
      pushCapped(obj.confidenceHistory, { value: obj.confidence, timestamp: Date.now() });
      ensureObjectiveFields(obj);
      obj.lastTouched = Date.now();
      obj.updatedAt = Date.now();
      window.EMVS.save();
      refresh('objectives-rebuild');
    };
    dot.addEventListener('click', e => { e.stopPropagation(); set(); });
    dot.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); set(); }
    });
  });

  item.querySelector('.edit-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    openObjectiveModal(obj);
  });

  item.querySelector('.delete-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    if (confirm('Lernziel wirklich löschen? Verlauf, Wiederholungen und Verknüpfungen gehen verloren.')) {
      deleteWithTombstone(state, 'learningObjectives', id);
      // Strip the deleted id from all linked entities so exam/plan/resource
      // views stay consistent instead of counting orphaned links.
      unlinkObjectiveEverywhere(state, id);
      window.EMVS.save();
      refresh('objectives-rebuild');
    }
  });
}

// ---------------------------------------------------------------------------
// History modal
// ---------------------------------------------------------------------------

const KIND_ICON = {
  created: '🌱', session: '⏱', confidence: '●', review: '👁',
  scheduled: '📅', resource: '🔗', exam: '📝', capture: '✎', note: '🗒',
};

export function openObjectiveHistory(objectiveId) {
  const state = window.EMVS.getState();
  const obj = state.learningObjectives.find(o => o.id === objectiveId);
  if (!obj) return;
  ensureObjectiveFields(obj);

  openModal({
    title: `LZ ${obj.number ?? '–'} · Lernziel`,
    body: `<div id="obj-history-body">${historyBodyHtml(state, obj)}</div>`,
    footer: `<button class="btn" data-action="close">Schließen</button>`,
    onClose: () => {},
  });

  setTimeout(() => {
    document.querySelector('#modal-footer [data-action="close"]')?.addEventListener('click', () => closeModal());
    bindHistoryBody(state, obj.id);
  }, 50);
}

function historyBodyHtml(state, obj) {
  const r = rhythmOf(obj);
  const resCount = linkedResourceCount(state, obj);
  const linked = resourcesForObjective(state, obj);
  const timeline = buildObjectiveTimeline(state, obj);
  const exams = examsForObjective(state, obj);
  const reviewCount = (obj.reviewHistory || []).length;
  const due = isDue(obj);
  const notes = capturesForObjective(state, obj);

  const resourceUsage = linked.map(res => {
    const uses = state.studySessions
      .filter(s => s.linkedObjectiveIds?.includes(obj.id) && s.linkedResourceIds?.includes(res.id))
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    const last = uses[0];
    return { res, uses: uses.length, last };
  });

  return `
    <div class="obj-hist-summary">
      <div class="obj-hist-title">${escapeHtml(obj.title)}</div>
      ${obj.description ? `<div class="obj-hist-desc">${escapeHtml(obj.description)}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
        <span class="badge rhythm rhythm-${r.key}">${escapeHtml(r.label)}</span>
        ${obj.status === 'done' ? `<span class="badge done">verstanden</span>` : ''}
        <span class="badge">Sicherheit ${obj.confidence ?? 0}/5</span>
      </div>
      <div class="obj-hist-facts">
        <span>Berührt <strong>${escapeHtml(formatLastTouched(obj))}</strong></span>
        <span><strong>${obj.totalStudyTime || 0} Min</strong> gesamt</span>
        <span><strong>${resCount}</strong> Material</span>
        <span>Wiederholung: <strong class="${due ? 'obj-next due' : ''}">${escapeHtml(formatNextReview(obj))}</strong></span>
        <span><strong>${reviewCount}×</strong> wiederholt</span>
      </div>
      <div class="timer-actions" style="margin-top:14px;">
        <button class="btn primary" data-hact="log">＋ Sitzung loggen</button>
        <button class="btn" data-hact="session">▶ Fokus starten</button>
        <button class="btn" data-hact="note-new">＋ Notiz</button>
        ${obj.status === 'done'
          ? `<button class="btn" data-hact="reopen">Wieder öffnen</button>`
          : `<button class="btn" data-hact="understood">✓ Als verstanden markieren</button>`}
      </div>
      <div class="obj-review-row">
        <span class="obj-review-label">Wiederholung festhalten:</span>
        <div class="timer-actions">
          <button class="btn" data-hact="review-solid" title="Sitzt — Abstand wächst">Sitzt ✓</button>
          <button class="btn" data-hact="review-shaky" title="Wackelig — gleicher Abstand">Wackelig ~</button>
          <button class="btn" data-hact="review-lost" title="Verloren — Abstand schrumpft">Verloren ✕</button>
        </div>
      </div>
      <div class="timer-actions" style="margin-top:10px;">
        <button class="btn ghost" data-hact="edit">✎ Details bearbeiten</button>
      </div>
    </div>

    <h3 class="section-label" style="margin-top:24px;">Notizen · ${notes.length}</h3>
    ${notes.length ? `
      <div class="obj-hist-res">
        ${notes.map(c => `
          <button type="button" class="obj-hist-res-row obj-note-row" data-note="${c.id}">
            <span class="badge">${escapeHtml(CAPTURE_TYPE_LABELS[c.type] || c.type || 'Notiz')}</span>
            <span class="obj-hist-res-name">${escapeHtml(String(c.content || '').slice(0, 140))}${String(c.content || '').length > 140 ? '…' : ''}</span>
            <span class="muted" style="font-size:12px;">${new Date(c.timestamp || c.createdAt || Date.now()).toLocaleDateString('de-CH')}</span>
          </button>`).join('')}
      </div>` : `
      <p class="today-empty-line">Noch keine Notiz zu diesem Ziel.</p>
      <div class="timer-actions" style="margin-top:8px;">
        <button class="btn ghost" data-hact="note-new">＋ Notiz hinzufügen</button>
      </div>`}

    ${resourceUsage.length ? `
      <h3 class="section-label" style="margin-top:24px;">Material · ${resourceUsage.length}</h3>
      <div class="obj-hist-res">
        ${resourceUsage.map(({ res, uses, last }) => `
          <div class="obj-hist-res-row">
            <span class="badge">${escapeHtml(RESOURCE_TYPE_LABELS[res.type] || res.type || 'Material')}</span>
            <span class="obj-hist-res-name">${res.url ? `<a href="${escapeHtml(res.url)}" target="_blank" rel="noopener">${escapeHtml(res.name)} ↗</a>` : escapeHtml(res.name)}</span>
            <span class="muted" style="font-size:12px;">${uses ? `${uses}× benutzt${last ? ` · zuletzt ${new Date(last.startTime).toLocaleDateString('de-CH')}` : ''}` : 'noch nie in Sitzung benutzt'}</span>
          </div>`).join('')}
      </div>` : ''}

    ${exams.length ? `
      <h3 class="section-label" style="margin-top:24px;">Prüfungen mit diesem Ziel · ${exams.length}</h3>
      <div class="obj-hist-res">
        ${exams.map(e => {
          const g = getExamGrade(e);
          return `<div class="obj-hist-res-row"><span class="obj-hist-res-name">${escapeHtml(e.name)}</span>
            <span class="muted" style="font-size:12px;">${e.date ? formatDate(e.date) : 'ohne Datum'}${e.weight ? ` · ${e.weight} %` : ''}${g !== null ? ` · Note ${g.toFixed(2)}` : ''}</span></div>`;
        }).join('')}
      </div>` : ''}

    <h3 class="section-label" style="margin-top:24px;">Zeitleiste · ${timeline.length} Ereignisse</h3>
    <div class="obj-timeline">
      ${timeline.map(ev => `
        <div class="obj-tl-row ${ev.future ? 'future' : ''}">
          <div class="obj-tl-icon tone-${ev.tone || 'quiet'}">${KIND_ICON[ev.kind] || '·'}</div>
          <div class="obj-tl-main">
            <div class="obj-tl-head">
              <span class="obj-tl-title">${escapeHtml(ev.title)}</span>
              <span class="obj-tl-ts">${new Date(ev.ts).toLocaleDateString('de-CH')}${ev.future ? ' · geplant' : ''}</span>
            </div>
            ${ev.detail ? `<div class="obj-tl-detail">${escapeHtml(ev.detail)}</div>` : ''}
          </div>
        </div>`).join('') || `<p class="today-empty-line">Noch keine Ereignisse — logge eine erste Sitzung.</p>`}
    </div>
  `;
}

function rerenderHistory(state, objId) {
  const stateNow = window.EMVS.getState();
  const obj = stateNow.learningObjectives.find(o => o.id === objId);
  if (!obj) { closeModal(); return; }
  const body = document.getElementById('obj-history-body');
  if (body) body.innerHTML = historyBodyHtml(stateNow, obj);
  bindHistoryBody(stateNow, objId);
  refresh('objectives-rebuild');
}

function bindHistoryBody(state, objId) {
  const body = document.getElementById('obj-history-body');
  if (!body) return;
  const act = (name, fn) => body.querySelector(`[data-hact="${name}"]`)?.addEventListener('click', fn);

  act('session', () => {
    const obj = window.EMVS.getState().learningObjectives.find(o => o.id === objId);
    closeModal();
    if (!obj) return;
    startPomodoroFor({
      moduleId: obj.moduleId,
      linkedObjectiveIds: [obj.id],
      minutes: 25,
    });
  });
  act('log', () => {
    const obj = window.EMVS.getState().learningObjectives.find(o => o.id === objId);
    if (!obj) return;
    closeModal();
    setTimeout(() => openSessionModal(null, obj.moduleId, {
      linkedObjectiveIds: [obj.id],
    }), 80);
  });
  act('note-new', () => {
    const obj = window.EMVS.getState().learningObjectives.find(o => o.id === objId);
    if (!obj) return;
    closeModal();
    setTimeout(() => openQuickCapture({
      moduleId: obj.moduleId,
      objectiveId: obj.id,
      type: 'thought',
    }), 80);
  });
  body.querySelectorAll('[data-note]').forEach(row => {
    row.addEventListener('click', () => {
      const c = window.EMVS.getState().captures.find(x => x.id === row.dataset.note);
      if (!c) return;
      closeModal();
      setTimeout(() => openCaptureModal(c), 80);
    });
  });
  act('understood', async () => {
    const st = window.EMVS.getState();
    const obj = st.learningObjectives.find(o => o.id === objId);
    if (obj.confidence < 4) {
      const msg = `Verstanden markieren bei Sicherheit ${obj.confidence}/5?`;
      const ok = await confirmDialog(msg, 'Sicherheit niedrig');
      if (!ok) return;
    }
    markUnderstood(obj);
    window.EMVS.save();
    window.EMVS.toast.show(`Verstanden — nächste Wiederholung in ${obj.reviewSchedule.interval} Tagen`);
    rerenderHistory(st, objId);
  });
  act('reopen', () => {
    const st = window.EMVS.getState();
    const obj = st.learningObjectives.find(o => o.id === objId);
    reopenObjective(obj);
    window.EMVS.save();
    window.EMVS.toast.show('Wieder geöffnet — Verlauf bleibt erhalten');
    rerenderHistory(st, objId);
  });
  const review = (outcome, msg) => () => {
    const st = window.EMVS.getState();
    const obj = st.learningObjectives.find(o => o.id === objId);
    const entry = recordReview(obj, outcome);
    window.EMVS.save();
    window.EMVS.toast.show(`${msg} — nächste Wiederholung in ${entry.interval} Tagen`);
    rerenderHistory(st, objId);
  };
  act('review-solid', review('solid', 'Sitzt'));
  act('review-shaky', review('shaky', 'Wackelig'));
  act('review-lost', review('lost', 'Verloren'));
  act('edit', () => {
    const st = window.EMVS.getState();
    const obj = st.learningObjectives.find(o => o.id === objId);
    closeModal();
    setTimeout(() => openObjectiveModal(obj), 60);
  });
}

// ---------------------------------------------------------------------------
// Create / edit details (no status checklist here)
// ---------------------------------------------------------------------------

export function openObjectiveModal(objective = null, moduleId = null) {
  const state = window.EMVS.getState();
  const modId = moduleId || objective?.moduleId || state.settings.currentModuleId;
  const nextNumber = Math.max(0, ...state.learningObjectives.filter(o => o.moduleId === modId).map(o => o.number)) + 1;

  const isNew = !objective;
  const obj = objective || {
    id: generateId(),
    moduleId: modId,
    number: nextNumber,
    title: '',
    description: '',
    status: 'todo',
    confidence: 0,
    notes: '',
    confidenceHistory: [],
    reviewHistory: [],
    lastTouched: Date.now(),
    lastReviewed: null,
    totalStudyTime: 0,
    reviewSchedule: null,
    sessionHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  ensureObjectiveFields(obj);

  openModal({
    title: isNew ? 'Neues Lernziel' : 'Lernziel bearbeiten',
    body: `
      <form id="objective-form">
        <div class="field-row">
          <label>Nummer</label>
          <input type="number" name="number" value="${obj.number}" min="1" required>
        </div>
        <div class="field-row">
          <label>Titel</label>
          <input type="text" name="title" value="${escapeHtml(obj.title)}" required placeholder="z.B. Erstellt ein konzeptionelles Datenmodell">
        </div>
        <div class="field-row">
          <label>Beschreibung</label>
          <textarea name="description" rows="3">${escapeHtml(obj.description || '')}</textarea>
        </div>
        <div class="field-row">
          <label>Sicherheit (0-5)</label>
          <input type="number" name="confidence" value="${obj.confidence}" min="0" max="5" step="1">
        </div>
        <div class="field-row">
          <label>Notizen</label>
          <textarea name="notes" rows="3" placeholder="Pitfalls, Definitionen, Merksätze…">${escapeHtml(obj.notes || '')}</textarea>
        </div>
        ${!isNew ? `<p class="today-empty-line">Rhythmus: ${escapeHtml(rhythmOf(obj).label)} · ${escapeHtml(rhythmOf(obj).detail)} · Wiederholung: ${escapeHtml(formatNextReview(obj))}. Status und Wiederholung steuerst du im Lernziel, nicht hier.</p>` : `<p class="today-empty-line">Neue Ziele starten ohne Wiederholungstermin — der Rhythmus beginnt mit der ersten Sitzung oder mit „Als verstanden markieren“.</p>`}
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;

    obj.number = parseInt(result.number) || nextNumber;
    obj.title = result.title.trim();
    obj.description = result.description?.trim() || '';
    const newConf = Math.max(0, Math.min(5, parseInt(result.confidence) || 0));
    if (newConf !== obj.confidence) {
      obj.confidenceHistory = obj.confidenceHistory || [];
      pushCapped(obj.confidenceHistory, { value: newConf, timestamp: Date.now() });
    }
    obj.confidence = newConf;
    obj.notes = result.notes?.trim() || obj.notes || '';
    obj.updatedAt = Date.now();
    obj.lastTouched = Date.now();

    if (isNew) {
      obj.moduleId = modId;
      state.learningObjectives.push(obj);
    }

    window.EMVS.save();
    refresh('objectives-rebuild');
  });

  setTimeout(() => {
    const form = document.getElementById('objective-form');
    form?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      closeModal(Object.fromEntries(fd));
    });

    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('objective-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}
