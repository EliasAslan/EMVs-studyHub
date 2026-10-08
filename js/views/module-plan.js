/**
 * Module Plan View — adaptive, not rigid.
 *
 * Weeks are suggestions, not a cage. The view opens with a reality check
 * whenever open items from past weeks exist: reflow them into this week or
 * explicitly drop what no longer counts — never a growing list of failures.
 * Items respond to real activity (sessions on linked objectives, mastered
 * objectives) with suggestions, and completion renders as recorded progress
 * (quiet ink, no strikethrough).
 */

import { escapeHtml, getWeekDateRange, getCurrentWeekNumber, getPlanLeftovers, getPlanItemActivity, getPlanReality } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, ensurePlanItemFields } from '../services/store.js';
import { PLAN_ITEM_TYPES } from '../utils/helpers.js';
import { refresh, registerPatcher } from './router.js';
import { openObjectiveHistory } from './module-objectives.js';

export function renderModulePlan(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return document.createElement('div');

  state.planItems.forEach(ensurePlanItemFields);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Plan · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Aktionsplan</h1>
    <p class="page-lede">Wochen sind Vorschläge, kein Käfig. Der Plan bemerkt, wenn die Realität abweicht — und fragt, was davon noch zählt.</p>
    <div id="plan-reality"></div>
    <div class="plan-weeks" id="plan-weeks"></div>
    <div class="mt-3">
      <button class="btn primary" id="add-plan-item">＋ Plan-Eintrag hinzufügen</button>
    </div>
  `;

  paintPlan(el, state, moduleId);

  el.querySelector('#add-plan-item')?.addEventListener('click', () => openPlanItemModal(null, moduleId, () => paintPlan(el, state, moduleId)));

  registerPatcher('module-plan', (reason) => {
    if (reason === 'plan-rebuild' || String(reason).startsWith('plan-')) {
      paintPlan(el, state, moduleId);
    }
  });

  return el;
}

function paintPlan(el, state, moduleId) {
  const now = new Date();
  const reality = getPlanReality(state, moduleId, now);

  // Reality check panel — one consolidated place, not per-week shame.
  const realityEl = el.querySelector('#plan-reality');
  realityEl.innerHTML = reality.leftovers.length ? renderRealityCheck(reality, state) : '';
  bindRealityCheck(realityEl, el, state, moduleId, reality);

  // Weeks: every week that holds items, plus the current week (always visible).
  const byWeek = {};
  state.planItems.filter(p => p.moduleId === moduleId).forEach(item => {
    const w = String(item.week);
    if (!byWeek[w]) byWeek[w] = [];
    byWeek[w].push(item);
  });
  const weekNums = [...new Set([...Object.keys(byWeek), String(reality.currentWeek)])]
    .map(Number).sort((a, b) => a - b);

  const container = el.querySelector('#plan-weeks');
  if (!weekNums.length || !state.planItems.some(p => p.moduleId === moduleId)) {
    container.innerHTML = `
      <div class="card empty-state">
        <div class="icon">🗺️</div>
        <h3>Noch kein Plan</h3>
        <p>Lege unten den ersten Eintrag an — als Vorschlag, nicht als Käfig.</p>
      </div>`;
  } else {
    container.innerHTML = weekNums.map(w => renderWeek(w, byWeek[String(w)] || [], state, moduleId, reality.currentWeek, now)).join('');
    bindWeeks(container, el, state, moduleId);
  }
}

// ---------------------------------------------------------------------------
// Reality check
// ---------------------------------------------------------------------------

function renderRealityCheck(reality, state) {
  const n = reality.leftovers.length;
  return `
    <div class="plan-reality">
      <div class="section-label">Realitätscheck · ${n} offene ${n === 1 ? 'Punkt' : 'Punkte'} aus früheren Wochen</div>
      <p class="today-empty-line" style="margin-bottom: 12px;">Du bist in Woche ${reality.currentWeek}, aber das hier ist liegen geblieben. Hole es in diese Woche — oder lasse bewusst fallen, was nicht mehr zählt. Beides ist eine Entscheidung, kein Versäumnis.</p>
      <div class="plan-leftover-list">
        ${reality.leftovers.map(item => {
          const act = getPlanItemActivity(state, item);
          const linked = (item.linkedObjectiveIds || [])
            .map(id => state.learningObjectives.find(o => o.id === id))
            .filter(Boolean);
          return `
            <div class="plan-leftover" data-id="${item.id}">
              <div class="plan-leftover-main">
                <div class="plan-leftover-text">${escapeHtml(item.text)}</div>
                <div class="plan-leftover-meta">Woche ${item.week}${linked.length ? ` · ${act.linkedDone}/${act.linkedTotal} Ziele gemeistert` : ''}${act.minutesSincePlan > 0 ? ` · ${act.minutesSincePlan} Min seither gelernt` : ''}</div>
              </div>
              <div class="timer-actions">
                <button class="btn primary" data-act="reflow" data-id="${item.id}" style="min-height:30px;font-size:12px;">Diese Woche</button>
                <button class="btn" data-act="drop" data-id="${item.id}" style="min-height:30px;font-size:12px;">Fallen lassen</button>
              </div>
            </div>`;
        }).join('')}
      </div>
      <div class="timer-actions" style="margin-top: 12px;">
        <button class="btn" id="reflow-all">Alle ${n} in diese Woche holen →</button>
      </div>
    </div>`;
}

function bindRealityCheck(realityEl, el, state, moduleId, reality) {
  if (!reality.leftovers.length) return;
  const repaint = () => { window.EMVS.save(); paintPlan(el, state, moduleId); };

  realityEl.querySelectorAll('[data-act="reflow"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.planItems.find(i => i.id === btn.dataset.id);
      if (!item) return;
      item.week = reality.currentWeek;
      item.updatedAt = Date.now();
      window.EMVS.toast.show(`Eingeplant für Woche ${reality.currentWeek}`);
      repaint();
      refresh('plan-reflow', { id: item.id });
    });
  });

  realityEl.querySelectorAll('[data-act="drop"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.planItems.find(i => i.id === btn.dataset.id);
      if (!item) return;
      if (confirm(`„${item.text.slice(0, 60)}“ fallen lassen? Es bleibt mit Notiz erhalten.`)) {
        item.dropped = true;
        item.updatedAt = Date.now();
        window.EMVS.toast.show('Fallen gelassen — bewusst, nicht vergessen');
        repaint();
        refresh('plan-drop', { id: item.id });
      }
    });
  });

  realityEl.querySelector('#reflow-all')?.addEventListener('click', () => {
    reality.leftovers.forEach(item => {
      item.week = reality.currentWeek;
      item.updatedAt = Date.now();
    });
    window.EMVS.toast.show(`${reality.leftovers.length} Punkte in Woche ${reality.currentWeek} eingeplant`);
    repaint();
    refresh('plan-reflow', {});
  });
}

// ---------------------------------------------------------------------------
// Weeks + items
// ---------------------------------------------------------------------------

function renderWeek(weekNum, items, state, moduleId, currentWeek, now) {
  const done = items.filter(i => i.done).length;
  const total = items.length;
  const { start, end } = getWeekDateRange(weekNum, now.getFullYear());
  const dateRange = `${start.toLocaleDateString('de-CH', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('de-CH', { day: '2-digit', month: 'short' })}`;
  const title = items[0]?.title || `Woche ${weekNum}`;

  const isCurrent = weekNum === currentWeek;
  const isPast = getWeekDateRange(weekNum, now.getFullYear()).end < getWeekDateRange(currentWeek, now.getFullYear()).start;
  const resolved = total > 0 && items.every(i => i.done || i.dropped);
  const marker = isCurrent
    ? `<span class="badge plan-current">diese Woche</span>`
    : isPast
      ? `<span class="badge ${resolved ? '' : 'plan-open'}">${resolved ? 'festgehalten' : 'zurückliegend'}</span>`
      : `<span class="badge">Vorschlag</span>`;

  // Calm ordering inside a week: open first, then recorded, then dropped.
  const order = { open: 0, done: 1, dropped: 2 };
  const key = (i) => order[i.dropped ? 'dropped' : i.done ? 'done' : 'open'];
  const sorted = [...items].sort((a, b) => key(a) - key(b));

  return `
    <div class="week" data-week="${weekNum}" style="padding: 28px 0; border-bottom: 1px solid var(--rule);">
      <div class="week-header" style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">
        <div class="week-title" style="font-family: var(--serif); font-size: 22px; line-height: 1.2;">${escapeHtml(title)}</div>
        <div style="display:flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          ${marker}
          <div class="week-badge" style="font-family: var(--mono); font-size: 11px; color: var(--ink-3);">${escapeHtml(dateRange)} · ${done}/${total}</div>
        </div>
      </div>
      ${sorted.map(item => renderPlanItem(item, state)).join('') || `<p class="today-empty-line">Leer — Vorschläge willkommen.</p>`}
    </div>
  `;
}

function renderPlanItem(item, state) {
  const typeLabels = { task: 'Aufgabe', milestone: 'Meilenstein', review: 'Review' };
  const typeColors = { task: 'var(--ink)', milestone: 'var(--accent)', review: 'var(--green)' };
  const statusClass = item.dropped ? 'dropped' : item.done ? 'done' : '';

  const linked = (item.linkedObjectiveIds || [])
    .map(id => state.learningObjectives.find(o => o.id === id))
    .filter(Boolean);
  const act = getPlanItemActivity(state, item);

  return `
    <div class="week-check ${statusClass}" data-id="${item.id}" style="display: flex; align-items: flex-start; gap: 14px; padding: 9px 8px; border-radius: 4px; cursor: pointer; font-size: 14px; color: var(--ink-2); line-height: 1.55; transition: background 0.12s;">
      <div class="custom-check ${item.done ? 'checked' : ''} ${item.dropped ? 'dropped-check' : ''}" style="width: 16px; height: 16px; border: 1.5px solid var(--rule-2); border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; flex-shrink: 0; margin-top: 3px; background: var(--bg);">
        ${item.done ? '✓' : item.dropped ? '–' : ''}
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
          <span class="week-text">${escapeHtml(item.text)}</span>
          <span style="font-family: var(--mono); font-size: 10px; color: ${typeColors[item.type] || 'var(--ink-3)'}; text-transform: uppercase; letter-spacing: 0.05em;">${typeLabels[item.type] || item.type}</span>
          ${item.dropped ? `<span class="badge">fallengelassen</span>` : ''}
          ${item.done ? `<span class="badge done">festgehalten</span>` : ''}
        </div>
        ${linked.length ? `
          <div style="display:flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
            ${linked.map(o => `<button class="badge plan-obj-chip" data-obj="${o.id}" title="${escapeHtml(o.title)}${o.status === 'done' ? ' (gemeistert)' : ''}">LZ ${o.number}${o.status === 'done' ? ' ✓' : ''}</button>`).join('')}
            <span class="muted" style="font-size:11px;">${act.linkedDone}/${act.linkedTotal} gemeistert</span>
          </div>` : ''}
        ${item.notes ? `<div class="plan-notes">${escapeHtml(item.notes)}</div>` : ''}
        ${act.hint && !item.done && !item.dropped ? `
          <div class="plan-hint">${escapeHtml(act.hint)}
            ${act.suggestedDone ? `<button class="btn ghost plan-accept" data-id="${item.id}" style="min-height:26px;font-size:11px;margin-left:8px;">Festhalten ✓</button>` : ''}
          </div>` : ''}
        ${item.dueDate ? `<div style="font-family: var(--mono); font-size: 10px; color: var(--ink-3); margin-top: 4px;">📅 ${new Date(item.dueDate).toLocaleDateString('de-CH')}</div>` : ''}
      </div>
      <div style="display: flex; gap: 4px; flex-shrink: 0;">
        ${item.dropped
          ? `<button class="restore-plan-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 11px; color: var(--ink-2);" title="Zurückholen">↩</button>`
          : `<button class="drop-plan-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 11px; color: var(--ink-3);" title="Fallen lassen">–</button>`}
        <button class="edit-plan-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 11px; color: var(--ink-3);" title="Bearbeiten">✎</button>
        <button class="delete-plan-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 11px; color: var(--red);" title="Löschen">✕</button>
      </div>
    </div>
  `;
}

function bindWeeks(container, el, state, moduleId) {
  const repaint = () => { window.EMVS.save(); paintPlan(el, state, moduleId); refresh('plan-rebuild'); };

  container.querySelectorAll('.week-check').forEach(row => {
    const id = row.dataset.id;
    const item = state.planItems.find(i => i.id === id);
    if (!item) return;

    // Checkbox area toggles recorded progress (never strikethrough).
    row.querySelector('.custom-check')?.addEventListener('click', e => {
      e.stopPropagation();
      if (item.dropped) return;
      item.done = !item.done;
      item.updatedAt = Date.now();
      window.EMVS.toast.show(item.done ? 'Festgehalten — als Fortschritt, nicht als Streichung' : 'Wieder offen');
      repaint();
    });
  });

  container.querySelectorAll('.plan-obj-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      openObjectiveHistory(chip.dataset.obj);
    });
  });

  container.querySelectorAll('.plan-accept').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.planItems.find(i => i.id === btn.dataset.id);
      if (!item) return;
      item.done = true;
      item.updatedAt = Date.now();
      window.EMVS.toast.show('Festgehalten — die Realität hat es bestätigt');
      repaint();
    });
  });

  container.querySelectorAll('.drop-plan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.planItems.find(i => i.id === btn.dataset.id);
      if (!item) return;
      if (confirm(`„${item.text.slice(0, 60)}“ fallen lassen? Es bleibt mit Notiz erhalten.`)) {
        item.dropped = true;
        item.updatedAt = Date.now();
        window.EMVS.toast.show('Fallen gelassen — bewusst, nicht vergessen');
        repaint();
      }
    });
  });

  container.querySelectorAll('.restore-plan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.planItems.find(i => i.id === btn.dataset.id);
      if (!item) return;
      item.dropped = false;
      item.updatedAt = Date.now();
      repaint();
    });
  });

  container.querySelectorAll('.edit-plan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.planItems.find(i => i.id === btn.dataset.id);
      if (item) openPlanItemModal(item, moduleId, () => paintPlan(el, state, moduleId));
    });
  });

  container.querySelectorAll('.delete-plan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Eintrag löschen?')) {
        state.planItems = state.planItems.filter(i => i.id !== btn.dataset.id);
        window.EMVS.save();
        paintPlan(el, state, moduleId);
        refresh('plan-delete', { id: btn.dataset.id });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Create / edit (incl. notes + objective links)
// ---------------------------------------------------------------------------

export function openPlanItemModal(item = null, moduleId = null, onChange = null) {
  const state = window.EMVS.getState();
  const modId = moduleId || item?.moduleId || state.settings.currentModuleId;
  const objectives = state.learningObjectives.filter(o => o.moduleId === modId);
  const resources = state.resources.filter(r => r.moduleId === modId);

  const isNew = !item;
  const i = item || {
    id: generateId(),
    moduleId: modId,
    week: getCurrentWeekNumber(),
    title: `Woche ${getCurrentWeekNumber()}`,
    text: '',
    type: 'task',
    linkedObjectiveIds: [],
    linkedResourceIds: [],
    done: false,
    dropped: false,
    notes: '',
    dueDate: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  ensurePlanItemFields(i);

  openModal({
    title: isNew ? 'Plan-Eintrag erstellen' : 'Plan-Eintrag bearbeiten',
    body: `
      <form id="plan-form">
        <div class="field-row">
          <label>Woche (Vorschlag)</label>
          <input type="number" name="week" value="${i.week}" min="1" max="53" required>
        </div>
        <div class="field-row">
          <label>Wochen-Titel</label>
          <input type="text" name="title" value="${escapeHtml(i.title)}" placeholder="z.B. Pivot Tables">
        </div>
        <div class="field-row">
          <label>Text</label>
          <input type="text" name="text" value="${escapeHtml(i.text)}" required placeholder="Was soll gemacht werden?">
        </div>
        <div class="field-row">
          <label>Typ</label>
          <select name="type">
            <option value="task" ${i.type === 'task' ? 'selected' : ''}>Aufgabe</option>
            <option value="milestone" ${i.type === 'milestone' ? 'selected' : ''}>Meilenstein</option>
            <option value="review" ${i.type === 'review' ? 'selected' : ''}>Review</option>
          </select>
        </div>
        <div class="field-row">
          <label>Notizen — z.B. warum etwas liegen blieb</label>
          <textarea name="notes" rows="3" placeholder="Couldn't do this because X…">${escapeHtml(i.notes || '')}</textarea>
        </div>
        <div class="field-row">
          <label>Fälligkeitsdatum (optional)</label>
          <input type="date" name="dueDate" value="${i.dueDate || ''}">
        </div>
        <div class="field-row">
          <label>Verknüpfte Lernziele</label>
          <select name="linkedObjectives" multiple style="min-height: 80px;">
            ${objectives.map(o => `<option value="${o.id}" ${i.linkedObjectiveIds?.includes(o.id) ? 'selected' : ''}>LZ ${o.number}: ${escapeHtml(o.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>Verknüpfte Ressourcen</label>
          <select name="linkedResources" multiple style="min-height: 80px;">
            ${resources.map(r => `<option value="${r.id}" ${i.linkedResourceIds?.includes(r.id) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
          </select>
        </div>
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;

    i.week = parseInt(result.week) || getCurrentWeekNumber();
    i.title = result.title?.trim() || `Woche ${i.week}`;
    i.text = result.text.trim();
    i.type = result.type;
    i.notes = result.notes?.trim() || '';
    i.dueDate = result.dueDate || null;
    i.linkedObjectiveIds = result.linkedObjectives ? (Array.isArray(result.linkedObjectives) ? result.linkedObjectives : [result.linkedObjectives]) : [];
    i.linkedResourceIds = result.linkedResources ? (Array.isArray(result.linkedResources) ? result.linkedResources : [result.linkedResources]) : [];
    i.updatedAt = Date.now();

    if (isNew) {
      i.moduleId = modId;
      state.planItems.push(i);
    }

    window.EMVS.save();
    onChange?.();
    refresh('plan-rebuild');
  });

  setTimeout(() => {
    const form = document.getElementById('plan-form');
    form?.addEventListener('submit', evt => {
      evt.preventDefault();
      const fd = new FormData(form);
      const data = {};
      for (const [key, value] of fd.entries()) {
        if (key === 'linkedObjectives' || key === 'linkedResources') {
          data[key] = data[key] ? [...data[key], value] : [value];
        } else {
          data[key] = value;
        }
      }
      closeModal(data);
    });

    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('plan-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}
