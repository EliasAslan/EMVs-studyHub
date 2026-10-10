/**
 * Module Objectives View — history first, not status first.
 *
 * Each objective is a learning thread with a past (sessions, confidence
 * changes, reviews, resources used, exams, captures) and a rhythm (spaced
 * resurfacing). Rows show history signals — confidence, last touched, total
 * study time, linked resource count, next review — and clicking a row opens
 * the full timeline. There are no checkboxes and no status dropdown on the
 * row; "done" means "resting until the next review", never gone.
 */

import { escapeHtml } from '../utils/helpers.js';
import {
  buildObjectiveTimeline, rhythmOf, formatLastTouched, formatNextReview,
  linkedResourceCount, resourcesForObjective,
  examsForObjective, getExamGrade, isDue,
} from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import {
  generateId, ensureObjectiveFields, recordReview, markUnderstood,
  reopenObjective, unlinkObjectiveEverywhere,
} from '../services/store.js';
import { refresh, registerPatcher } from './router.js';
import { openSessionModal } from './module-sessions.js';

const GROUP_ORDER = ['due', 'active', 'resting', 'fresh'];
const GROUP_TITLES = {
  due: 'Wieder fällig — zuerst vergessen',
  active: 'In Bewegung',
  resting: 'Verstanden — ruht bis zum Review',
  fresh: 'Neu — noch unberührt',
};
const GROUP_NOTES = {
  due: 'Diese Fäden hast du als verstanden abgelegt — ihr Review ist fällig.',
  active: 'Hier arbeitest du gerade. Berührung hält den Faden warm.',
  resting: 'Verstanden heisst nicht fertig: jedes ruht bis zu seinem nächsten Review.',
  fresh: 'Noch kein Verlauf. Eine erste Sitzung beginnt die Geschichte.',
};

export function renderModuleObjectives(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return document.createElement('div');

  state.learningObjectives.forEach(ensureObjectiveFields);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Verläufe · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Lernverläufe</h1>
    <p class="page-lede js-obj-lede"></p>
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
      ? `${objectives.length} Lernverläufe · ${due} fällig zur Wiederholung. Klick auf einen Verlauf öffnet seine Geschichte.`
      : `${objectives.length} Lernverläufe. Klick auf einen Verlauf öffnet seine Geschichte — Confidence per Klick anpassen.`;
  }
  const host = el.querySelector('#objectives-groups');
  const groups = { due: [], active: [], resting: [], fresh: [] };
  objectives.forEach(o => groups[groupOf(o)].push(o));
  host.innerHTML = GROUP_ORDER
    .filter(g => groups[g].length)
    .map(g => `
      <div class="section-label" style="margin-top: 28px;">${GROUP_TITLES[g]} · ${groups[g].length}</div>
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
    <div class="hz-item obj-card ${due ? 'obj-due' : ''}" data-id="${obj.id}" role="link" tabindex="0"
         aria-label="Verlauf öffnen: ${escapeHtml(obj.title)}" title="Verlauf öffnen">
      <div class="hz-head">
        <div class="hz-num">LZ ${obj.number ?? '–'}</div>
        <span class="badge rhythm rhythm-${r.key}">${escapeHtml(r.label)}</span>
        ${obj.status === 'done' ? `<span class="badge done">verstanden</span>` : ''}
        ${due ? `<span class="badge obj-due-badge">${escapeHtml(r.detail)}</span>` : ''}
      </div>
      <div class="hz-title obj-title">${escapeHtml(obj.title)}</div>
      <div class="obj-meta">
        <div class="confidence-dots" data-id="${obj.id}" role="group" aria-label="Confidence">
          ${[1, 2, 3, 4, 5].map(n => `<div class="confidence-dot ${n <= (obj.confidence || 0) ? 'on' : ''}" data-n="${n}" title="Confidence ${n}/5" role="button" tabindex="0" aria-label="Confidence ${n}"></div>`).join('')}
        </div>
        <span class="obj-meta-item" title="Zuletzt berührt">berührt ${escapeHtml(formatLastTouched(obj))}</span>
        <span class="obj-meta-item" title="Gesamte Lernzeit">${totalTime} Min</span>
        <span class="obj-meta-item" title="Verknüpfte Ressourcen">${resCount} Ressource${resCount === 1 ? '' : 'n'}</span>
        <span class="obj-meta-item obj-next ${due ? 'due' : ''}" title="Nächstes Review">Review: ${escapeHtml(formatNextReview(obj))}</span>
        ${reviewCount ? `<span class="obj-meta-item" title="Abgeschlossene Reviews">${reviewCount}× reviewt</span>` : ''}
      </div>
      <div class="obj-actions">
        <span class="obj-open-hint">Verlauf öffnen →</span>
        <span class="obj-tools">
          <button class="edit-btn" title="Details bearbeiten">✎</button>
          <button class="delete-btn" title="Löschen">✕</button>
        </span>
      </div>
    </div>
  `;
}

function bindObjectiveCard(item, state) {
  const id = item.dataset.id;
  const obj = state.learningObjectives.find(o => o.id === id);
  if (!obj) return;

  const open = (e) => {
    if (e?.target?.closest('.confidence-dot') || e?.target?.closest('button') || e?.target?.closest('select')) return;
    openObjectiveHistory(id);
  };
  item.addEventListener('click', open);
  item.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('.confidence-dot')) return;
      e.preventDefault();
      openObjectiveHistory(id);
    }
  });

  item.querySelectorAll('.confidence-dot').forEach(dot => {
    const set = () => {
      const n = +dot.dataset.n;
      obj.confidence = obj.confidence === n ? Math.max(0, n - 1) : n;
      obj.confidenceHistory = obj.confidenceHistory || [];
      obj.confidenceHistory.push({ value: obj.confidence, timestamp: Date.now() });
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
    if (confirm('Lernziel wirklich löschen? Verlauf, Reviews und Verknüpfungen gehen verloren.')) {
      state.learningObjectives = state.learningObjectives.filter(x => x.id !== id);
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
    title: `LZ ${obj.number ?? '–'} · Verlauf`,
    body: `<div id="obj-history-body">${historyBodyHtml(state, obj)}</div>`,
    footer: `<button class="btn" data-action="close">Schliessen</button>`,
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
        <span class="badge">Confidence ${obj.confidence ?? 0}/5</span>
      </div>
      <div class="obj-hist-facts">
        <span>Berührt <strong>${escapeHtml(formatLastTouched(obj))}</strong></span>
        <span><strong>${obj.totalStudyTime || 0} Min</strong> gesamt</span>
        <span><strong>${resCount}</strong> Ressourcen</span>
        <span>Review: <strong class="${due ? 'obj-next due' : ''}">${escapeHtml(formatNextReview(obj))}</strong></span>
        <span><strong>${reviewCount}×</strong> reviewt</span>
      </div>
      <div class="timer-actions" style="margin-top:14px;">
        <button class="btn primary" data-hact="session">⏱ Sitzung loggen</button>
        ${obj.status === 'done'
          ? `<button class="btn" data-hact="reopen">Wieder öffnen</button>`
          : `<button class="btn" data-hact="understood">✓ Als verstanden markieren</button>`}
      </div>
      <div class="obj-review-row">
        <span class="obj-review-label">Review festhalten:</span>
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

    ${resourceUsage.length ? `
      <div class="section-label" style="margin-top:24px;">Verknüpfte Ressourcen · ${resourceUsage.length}</div>
      <div class="obj-hist-res">
        ${resourceUsage.map(({ res, uses, last }) => `
          <div class="obj-hist-res-row">
            <span class="badge">${escapeHtml(res.type || 'Material')}</span>
            <span class="obj-hist-res-name">${res.url ? `<a href="${escapeHtml(res.url)}" target="_blank" rel="noopener">${escapeHtml(res.name)} ↗</a>` : escapeHtml(res.name)}</span>
            <span class="muted" style="font-size:12px;">${uses ? `${uses}× benutzt${last ? ` · zuletzt ${new Date(last.startTime).toLocaleDateString('de-CH')}` : ''}` : 'noch nie in Sitzung benutzt'}</span>
          </div>`).join('')}
      </div>` : ''}

    ${exams.length ? `
      <div class="section-label" style="margin-top:24px;">Prüfungen mit diesem Ziel · ${exams.length}</div>
      <div class="obj-hist-res">
        ${exams.map(e => {
          const g = getExamGrade(e);
          return `<div class="obj-hist-res-row"><span class="obj-hist-res-name">${escapeHtml(e.name)}</span>
            <span class="muted" style="font-size:12px;">${e.date || 'ohne Datum'}${e.weight ? ` · ${e.weight}%` : ''}${g !== null ? ` · Note ${g.toFixed(2)}` : ''}</span></div>`;
        }).join('')}
      </div>` : ''}

    <div class="section-label" style="margin-top:24px;">Zeitleiste · ${timeline.length} Ereignisse</div>
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
    openSessionModal(null, obj?.moduleId, { linkedObjectiveIds: [objId], duration: 25 });
  });
  act('understood', () => {
    const st = window.EMVS.getState();
    const obj = st.learningObjectives.find(o => o.id === objId);
    markUnderstood(obj);
    window.EMVS.save();
    window.EMVS.toast.show(`Verstanden — nächstes Review in ${obj.reviewSchedule.interval} Tagen`);
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
    window.EMVS.toast.show(`${msg} — nächstes Review in ${entry.interval} Tagen`);
    rerenderHistory(st, objId);
  };
  act('review-solid', review('solid', 'Review: sitzt'));
  act('review-shaky', review('shaky', 'Review: wackelig'));
  act('review-lost', review('lost', 'Review: verloren'));
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
          <label>Confidence (0-5)</label>
          <input type="number" name="confidence" value="${obj.confidence}" min="0" max="5" step="1">
        </div>
        <div class="field-row">
          <label>Notizen</label>
          <textarea name="notes" rows="3" placeholder="Pitfalls, Definitionen, Merksätze…">${escapeHtml(obj.notes || '')}</textarea>
        </div>
        ${!isNew ? `<p class="today-empty-line">Rhythmus: ${escapeHtml(rhythmOf(obj).label)} · ${escapeHtml(rhythmOf(obj).detail)} · Review: ${escapeHtml(formatNextReview(obj))}. Status und Review steuerst du im Verlauf, nicht hier.</p>` : `<p class="today-empty-line">Neue Ziele starten ohne Review-Termin — der Rhythmus beginnt mit der ersten Sitzung oder mit „Als verstanden markieren“.</p>`}
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
      obj.confidenceHistory.push({ value: newConf, timestamp: Date.now() });
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
