/**
 * Module Resources View — a personal library, not a checklist.
 *
 * A resource tracks two independent signals:
 *   - USED: the material was opened/worked with (linked in a session, or
 *     explicitly marked as used). Watching/reading/opening ≠ learning.
 *   - UNDERSTOOD: an explicit user judgment, never set automatically.
 *
 * Cards show both signals plus linked objectives; clicking a card opens the
 * full usage/understanding history. Search + type/state filters included.
 */

import { escapeHtml } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, ensureResourceFields, markResourceUsed, setResourceUnderstood } from '../services/store.js';
import { RESOURCE_TYPES } from '../utils/helpers.js';
import { getResourceUsage, formatLastUsed, rhythmOf } from '../utils/helpers.js';
import { refresh, registerPatcher } from './router.js';
import { openSessionModal } from './module-sessions.js';
import { openObjectiveHistory } from './module-objectives.js';

// Filter state lives at module level so repaints (list-only) keep it.
const filters = { q: '', type: 'all', state: 'all' };
const STATE_FILTERS = [
  { key: 'all', label: 'Alle' },
  { key: 'understood', label: 'Verstanden' },
  { key: 'open', label: 'Noch offen' },
  { key: 'used', label: 'Benutzt' },
  { key: 'unused', label: 'Nie benutzt' },
];

export function renderModuleResources(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return document.createElement('div');

  state.resources.forEach(ensureResourceFields);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Bibliothek · Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title">Lernmaterial</h1>
    <p class="page-lede js-res-lede"></p>
    <div class="res-search">
      <input class="res-search-input" id="res-search" type="search"
        placeholder="Suchen — Name, Notiz, URL…" value="${escapeHtml(filters.q)}"
        aria-label="Ressourcen suchen">
    </div>
    <div class="res-filters" role="group" aria-label="Typ filtern">
      <button class="badge filter-btn ${filters.type === 'all' ? 'active' : ''}" data-tfilter="all">Alle Typen</button>
      ${RESOURCE_TYPES.map(t => `<button class="badge filter-btn ${filters.type === t ? 'active' : ''}" data-tfilter="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
    </div>
    <div class="res-filters" role="group" aria-label="Stand filtern" style="margin-top:8px;">
      ${STATE_FILTERS.map(f => `<button class="badge filter-btn ${filters.state === f.key ? 'active' : ''}" data-sfilter="${f.key}">${f.label}</button>`).join('')}
    </div>
    <div class="res-list" id="resources-list"></div>
    <div class="mt-3">
      <button class="btn primary" id="add-resource">＋ Ressource hinzufügen</button>
    </div>
  `;

  paintResourceList(el, state, moduleId);

  el.querySelector('#res-search')?.addEventListener('input', e => {
    filters.q = e.target.value;
    paintResourceList(el, state, moduleId, true);
  });
  el.querySelectorAll('[data-tfilter]').forEach(b => b.addEventListener('click', () => {
    filters.type = b.dataset.tfilter;
    el.querySelectorAll('[data-tfilter]').forEach(x => x.classList.toggle('active', x === b));
    paintResourceList(el, state, moduleId, true);
  }));
  el.querySelectorAll('[data-sfilter]').forEach(b => b.addEventListener('click', () => {
    filters.state = b.dataset.sfilter;
    el.querySelectorAll('[data-sfilter]').forEach(x => x.classList.toggle('active', x === b));
    paintResourceList(el, state, moduleId, true);
  }));

  el.querySelector('#add-resource')?.addEventListener('click', () => openResourceModal(null, moduleId, () => paintResourceList(el, state, moduleId)));

  registerPatcher('module-resources', (reason) => {
    if (reason === 'resources-rebuild' || String(reason).startsWith('resource-')) {
      paintResourceList(el, state, moduleId);
    }
  });

  return el;
}

function resourcesFor(state, moduleId) {
  return state.resources
    .filter(r => r.moduleId === moduleId)
    .sort((a, b) => (b.focus === '70' ? 1 : -1) || a.name.localeCompare(b.name));
}

function applyFilters(state, list) {
  const q = filters.q.trim().toLowerCase();
  return list.filter(r => {
    if (filters.type !== 'all' && r.type !== filters.type) return false;
    const usage = getResourceUsage(state, r);
    if (filters.state === 'understood' && !r.understood) return false;
    if (filters.state === 'open' && r.understood) return false;
    if (filters.state === 'used' && usage.totalUses === 0) return false;
    if (filters.state === 'unused' && usage.totalUses > 0) return false;
    if (q) {
      const hay = `${r.name} ${r.notes || ''} ${r.url || ''} ${r.type || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function paintResourceList(el, state, moduleId, keepFocus = false) {
  const all = resourcesFor(state, moduleId);
  const list = applyFilters(state, all);
  const understood = all.filter(r => r.understood).length;
  const unused = all.filter(r => getResourceUsage(state, r).totalUses === 0).length;
  const lede = el.querySelector('.js-res-lede');
  if (lede) {
    lede.textContent = all.length
      ? `${all.length} Ressourcen · ${understood} verstanden · ${unused} noch nie benutzt. Benutzt ≠ verstanden: Öffnen heisst nicht Können.`
      : 'Noch keine Ressourcen — lege oben die erste an.';
  }
  const host = el.querySelector('#resources-list');
  host.innerHTML = list.length
    ? list.map(r => renderResourceCard(r, state)).join('')
    : `<div class="card empty-state"><div class="icon">📚</div><h3>Nichts gefunden</h3><p>Filter oder Suche anpassen — oder eine neue Ressource anlegen.</p></div>`;
  host.querySelectorAll('.res-card').forEach(card => bindResourceCard(card, el, state, moduleId));
  if (keepFocus) {
    const input = el.querySelector('#res-search');
    if (document.activeElement !== input && filters.q) {
      // keep typing flow: restore focus at end after list repaint
      input?.focus();
      const v = input.value;
      input.value = '';
      input.value = v;
    }
  }
}

function usageBadge(state, res) {
  const usage = getResourceUsage(state, res);
  if (!usage.totalUses) return `<span class="badge">nie benutzt</span>`;
  const last = usage.lastUsedTs ? new Date(usage.lastUsedTs).toLocaleDateString('de-CH') : '';
  return `<span class="badge res-used" title="${usage.sessions.length}× in Sitzungen · ${usage.manual.length}× markiert">${usage.totalUses}× benutzt${last ? ` · ${last}` : ''}</span>`;
}

function renderResourceCard(res, state) {
  const objectives = state.learningObjectives.filter(o => res.linkedObjectiveIds?.includes(o.id));
  return `
    <div class="res-card" data-id="${res.id}" role="link" tabindex="0" title="Verlauf öffnen">
      <div class="res-card-top">
        <div class="res-focus" title="Priorität: ${res.focus === '70' ? 'High-Yield' : 'Advanced'}">${escapeHtml(res.focus)}</div>
        <div class="res-main">
          <div class="res-name">
            ${res.url ? `<a href="${escapeHtml(res.url)}" target="_blank" rel="noopener" style="text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(res.name)} ↗</a>` : escapeHtml(res.name)}
          </div>
          <div class="res-sub">
            <span class="badge">${escapeHtml(res.type)}</span>
            ${usageBadge(state, res)}
            ${res.understood
              ? `<span class="badge done">verstanden ✓</span>`
              : `<span class="badge">noch offen</span>`}
          </div>
          <div class="res-links">
            ${objectives.length
              ? objectives.map(o => `<button class="badge res-obj-chip" data-obj="${o.id}" title="${escapeHtml(o.title)}">LZ ${o.number}</button>`).join('')
              : `<span class="muted" style="font-size:12px;">kein Lernziel verknüpft</span>`}
          </div>
        </div>
        <div class="res-actions">
          <button class="edit-btn" data-act="edit" title="Bearbeiten">✎</button>
          <button class="delete-btn" data-act="delete" title="Löschen">✕</button>
        </div>
      </div>
      <div class="res-quick">
        <button class="btn ghost" data-act="used" title="Als benutzt markieren — kein Verstehen vorausgesetzt">Benutzt ✓</button>
        ${res.understood
          ? `<button class="btn ghost" data-act="reopen" title="Verstanden-Markierung zurücknehmen">Wieder offen</button>`
          : `<button class="btn ghost" data-act="understood" title="Explizit: ich habe das verstanden">Verstanden ✓</button>`}
        <span class="res-open-hint">Verlauf öffnen →</span>
      </div>
    </div>
  `;
}

function bindResourceCard(card, el, state, moduleId) {
  const id = card.dataset.id;
  const res = state.resources.find(r => r.id === id);
  if (!res) return;

  card.addEventListener('click', e => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.res-obj-chip')) return;
    openResourceHistory(id, () => paintResourceList(el, state, moduleId));
  });
  card.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button') && e.target === card) {
      e.preventDefault();
      openResourceHistory(id, () => paintResourceList(el, state, moduleId));
    }
  });

  card.querySelectorAll('.res-obj-chip').forEach(chip => chip.addEventListener('click', e => {
    e.stopPropagation();
    openObjectiveHistory(chip.dataset.obj);
  }));

  const repaint = () => {
    window.EMVS.save();
    paintResourceList(el, state, moduleId);
  };

  card.querySelector('[data-act="used"]')?.addEventListener('click', e => {
    e.stopPropagation();
    markResourceUsed(res);
    window.EMVS.toast.show(`Benutzt festgehalten — Verstehen bleibt ${res.understood ? 'bestehen' : 'offen'}`);
    repaint();
    refresh('resource-used', { id });
  });
  card.querySelector('[data-act="understood"]')?.addEventListener('click', e => {
    e.stopPropagation();
    setResourceUnderstood(res, true);
    window.EMVS.toast.show('Als verstanden markiert');
    repaint();
    refresh('resource-understood', { id });
  });
  card.querySelector('[data-act="reopen"]')?.addEventListener('click', e => {
    e.stopPropagation();
    setResourceUnderstood(res, false);
    window.EMVS.toast.show('Wieder offen — Verlauf bleibt erhalten');
    repaint();
    refresh('resource-understood', { id });
  });
  card.querySelector('[data-act="edit"]')?.addEventListener('click', e => {
    e.stopPropagation();
    openResourceModal(res, moduleId, () => paintResourceList(el, state, moduleId));
  });
  card.querySelector('[data-act="delete"]')?.addEventListener('click', e => {
    e.stopPropagation();
    if (confirm('Ressource wirklich löschen? Verlauf und Verknüpfungen gehen verloren.')) {
      state.resources = state.resources.filter(x => x.id !== id);
      // Unlink from sessions (keep sessions, drop the reference)
      state.studySessions.forEach(s => {
        if (s.linkedResourceIds?.includes(id)) {
          s.linkedResourceIds = s.linkedResourceIds.filter(x => x !== id);
        }
      });
      window.EMVS.save();
      paintResourceList(el, state, moduleId);
      refresh('resource-delete', { id });
    }
  });
}

// ---------------------------------------------------------------------------
// History modal: linked objectives + usage/understanding timeline
// ---------------------------------------------------------------------------

export function openResourceHistory(resourceId, onChange = null) {
  const state = window.EMVS.getState();
  const res = state.resources.find(r => r.id === resourceId);
  if (!res) return;
  ensureResourceFields(res);

  openModal({
    title: 'Ressource · Verlauf',
    body: `<div id="res-history-body">${resourceHistoryHtml(state, res)}</div>`,
    footer: `<button class="btn" data-action="close">Schliessen</button>`,
    onClose: () => {},
  });

  setTimeout(() => {
    document.querySelector('#modal-footer [data-action="close"]')?.addEventListener('click', () => closeModal());
    bindResourceHistory(resourceId, onChange);
  }, 50);
}

function resourceHistoryHtml(state, res) {
  const usage = getResourceUsage(state, res);
  const objectives = state.learningObjectives.filter(o => res.linkedObjectiveIds?.includes(o.id));
  const events = [];

  if (res.createdAt) events.push({ ts: res.createdAt, icon: '🌱', title: 'Angelegt', detail: '', tone: 'quiet' });

  for (const s of usage.sessions) {
    const objNums = (s.linkedObjectiveIds || [])
      .map(oid => state.learningObjectives.find(o => o.id === oid)?.number)
      .filter(n => n !== undefined);
    events.push({
      ts: new Date(s.startTime).getTime() || s.createdAt || 0,
      icon: '⏱', title: `Benutzt in Sitzung · ${s.duration || 0} Min`, tone: 'accent',
      detail: [s.note || '', objNums.length ? `LZ ${objNums.join(', ')}` : ''].filter(Boolean).join(' — '),
    });
  }
  for (const u of usage.manual) {
    events.push({
      ts: u.timestamp, icon: '👁', title: 'Als benutzt markiert', tone: 'quiet', detail: u.note || 'ausserhalb einer Sitzung',
    });
  }
  for (const h of (res.understoodHistory || [])) {
    events.push({
      ts: h.timestamp, icon: h.value ? '✓' : '↩',
      title: h.value ? 'Als verstanden markiert' : 'Zurück auf offen',
      tone: h.value ? 'green' : 'quiet', detail: '',
    });
  }
  events.sort((a, b) => b.ts - a.ts);

  return `
    <div class="obj-hist-summary">
      <div class="obj-hist-title">${escapeHtml(res.name)}</div>
      ${res.url ? `<div style="margin-top:4px;"><a href="${escapeHtml(res.url)}" target="_blank" rel="noopener" style="text-decoration: underline; text-underline-offset: 3px; font-size:13.5px;">${escapeHtml(res.url.length > 60 ? res.url.slice(0, 60) + '…' : res.url)} ↗</a></div>` : ''}
      ${res.notes ? `<div class="obj-hist-desc">${escapeHtml(res.notes)}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
        <span class="badge">${escapeHtml(res.type || 'Material')}</span>
        <span class="badge" title="Priorität">${escapeHtml(res.focus === '70' ? 'High-Yield' : 'Advanced')}</span>
        ${usage.totalUses
          ? `<span class="badge res-used">${usage.totalUses}× benutzt · ${escapeHtml(formatLastUsed(usage.lastUsedTs))}</span>`
          : `<span class="badge">nie benutzt</span>`}
        ${res.understood ? `<span class="badge done">verstanden ✓</span>` : `<span class="badge">noch offen</span>`}
      </div>
      <div class="timer-actions" style="margin-top:6px;">
        <button class="btn" data-ract="used">Benutzt ✓</button>
        ${res.understood
          ? `<button class="btn" data-ract="reopen">Wieder offen</button>`
          : `<button class="btn primary" data-ract="understood">Verstanden ✓</button>`}
        <button class="btn" data-ract="session">⏱ Sitzung mit dieser Ressource</button>
      </div>
      <p class="today-empty-line" style="margin-top:10px;">Benutzt ≠ verstanden: Öffnen zählt als Benutzung — Verstehen markierst du explizit.</p>
      <div class="timer-actions" style="margin-top:6px;">
        <button class="btn ghost" data-ract="edit">✎ Bearbeiten</button>
      </div>
    </div>

    <div class="section-label" style="margin-top:24px;">Verknüpfte Lernziele · ${objectives.length}</div>
    ${objectives.length ? `<div class="obj-hist-res">${objectives.map(o => {
      const r = rhythmOf(o);
      return `<div class="obj-hist-res-row">
        <button class="badge res-obj-chip" data-robj="${o.id}" title="Verlauf öffnen">LZ ${o.number}</button>
        <span class="obj-hist-res-name">${escapeHtml(o.title.length > 70 ? o.title.slice(0, 70) + '…' : o.title)}</span>
        <span class="muted" style="font-size:12px;">Confidence ${o.confidence ?? 0}/5 · ${escapeHtml(r.label)}</span>
      </div>`;
    }).join('')}</div>` : `<p class="today-empty-line">Noch kein Lernziel verknüpft — über Bearbeiten zuordnen.</p>`}

    <div class="section-label" style="margin-top:24px;">Zeitleiste · ${events.length} Ereignisse</div>
    <div class="obj-timeline">
      ${events.map(ev => `
        <div class="obj-tl-row">
          <div class="obj-tl-icon tone-${ev.tone || 'quiet'}">${ev.icon}</div>
          <div class="obj-tl-main">
            <div class="obj-tl-head">
              <span class="obj-tl-title">${escapeHtml(ev.title)}</span>
              <span class="obj-tl-ts">${new Date(ev.ts).toLocaleDateString('de-CH')}</span>
            </div>
            ${ev.detail ? `<div class="obj-tl-detail">${escapeHtml(ev.detail)}</div>` : ''}
          </div>
        </div>`).join('') || `<p class="today-empty-line">Noch keine Benutzung — markiere sie als benutzt oder verlinke sie in einer Sitzung.</p>`}
    </div>
  `;
}

function bindResourceHistory(resourceId, onChange) {
  const body = document.getElementById('res-history-body');
  if (!body) return;
  const rerender = () => {
    const st = window.EMVS.getState();
    const res = st.resources.find(r => r.id === resourceId);
    if (!res) { closeModal(); return; }
    const host = document.getElementById('res-history-body');
    if (host) host.innerHTML = resourceHistoryHtml(st, res);
    bindResourceHistory(resourceId, onChange);
    onChange?.();
    refresh('resources-rebuild');
  };
  const act = (name, fn) => body.querySelector(`[data-ract="${name}"]`)?.addEventListener('click', fn);

  act('used', () => {
    const st = window.EMVS.getState();
    const res = st.resources.find(r => r.id === resourceId);
    markResourceUsed(res);
    window.EMVS.save();
    window.EMVS.toast.show('Benutzt festgehalten — Verstehen bleibt separat');
    rerender();
  });
  act('understood', () => {
    const st = window.EMVS.getState();
    const res = st.resources.find(r => r.id === resourceId);
    setResourceUnderstood(res, true);
    window.EMVS.save();
    window.EMVS.toast.show('Als verstanden markiert');
    rerender();
  });
  act('reopen', () => {
    const st = window.EMVS.getState();
    const res = st.resources.find(r => r.id === resourceId);
    setResourceUnderstood(res, false);
    window.EMVS.save();
    window.EMVS.toast.show('Wieder offen — Verlauf bleibt erhalten');
    rerender();
  });
  act('session', () => {
    const st = window.EMVS.getState();
    const res = st.resources.find(r => r.id === resourceId);
    closeModal();
    openSessionModal(null, res?.moduleId, { linkedResourceIds: [resourceId], linkedObjectiveIds: [...(res?.linkedObjectiveIds || [])], duration: 25 });
  });
  act('edit', () => {
    const st = window.EMVS.getState();
    const res = st.resources.find(r => r.id === resourceId);
    closeModal();
    setTimeout(() => openResourceModal(res, res?.moduleId, () => { onChange?.(); refresh('resources-rebuild'); }), 60);
  });
  body.querySelectorAll('[data-robj]').forEach(chip => chip.addEventListener('click', () => {
    openObjectiveHistory(chip.dataset.robj);
  }));
}

// ---------------------------------------------------------------------------
// Create / edit (library cataloguing, incl. objective links)
// ---------------------------------------------------------------------------

export function openResourceModal(resource = null, moduleId = null, onChange = null) {
  const state = window.EMVS.getState();
  const modId = moduleId || resource?.moduleId || state.settings.currentModuleId;
  const objectives = state.learningObjectives.filter(o => o.moduleId === modId);

  const isNew = !resource;
  const res = resource || {
    id: generateId(),
    moduleId: modId,
    name: '',
    type: 'Video',
    focus: '70',
    status: 'todo',
    url: '',
    linkedObjectiveIds: [],
    notes: '',
    usageHistory: [],
    understood: false,
    understoodAt: null,
    understoodHistory: [],
    lastUsed: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  ensureResourceFields(res);

  openModal({
    title: isNew ? 'Neue Ressource' : 'Ressource bearbeiten',
    body: `
      <form id="resource-form">
        <div class="field-row">
          <label>Name</label>
          <input type="text" name="name" value="${escapeHtml(res.name)}" required placeholder="z.B. Normalization Practice (UNF to 3NF)">
        </div>
        <div class="field-row">
          <label>Typ</label>
          <select name="type">
            ${RESOURCE_TYPES.map(t => `<option value="${t}" ${res.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>Priorität</label>
          <select name="focus">
            <option value="70" ${res.focus === '70' ? 'selected' : ''}>70 – High-Yield</option>
            <option value="30" ${res.focus === '30' ? 'selected' : ''}>30 – Advanced</option>
          </select>
        </div>
        <div class="field-row">
          <label>URL (optional)</label>
          <input type="url" name="url" value="${escapeHtml(res.url || '')}" placeholder="https://...">
        </div>
        <div class="field-row">
          <label>Verknüpfte Lernziele (eins oder mehrere)</label>
          <select name="linkedObjectives" multiple style="min-height: 100px;">
            ${objectives.map(o => `<option value="${o.id}" ${res.linkedObjectiveIds?.includes(o.id) ? 'selected' : ''}>LZ ${o.number}: ${escapeHtml(o.title)}</option>`).join('')}
          </select>
          <small style="color: var(--ink-3);">Strg/Cmd + Klick für Mehrfachauswahl</small>
        </div>
        <div class="field-row">
          <label>Notizen</label>
          <textarea name="notes" rows="3">${escapeHtml(res.notes || '')}</textarea>
        </div>
        ${!isNew ? `<p class="today-empty-line">Stand: ${getResourceUsage(state, res).totalUses}× benutzt · ${res.understood ? 'verstanden ✓' : 'noch offen'}. Beides änderst du auf der Karte oder im Verlauf — Benutzen markiert nie automatisch Verstehen.</p>` : ''}
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;

    res.name = result.name.trim();
    res.type = result.type;
    res.focus = result.focus;
    res.url = result.url?.trim() || '';
    res.linkedObjectiveIds = result.linkedObjectives ? (Array.isArray(result.linkedObjectives) ? result.linkedObjectives : [result.linkedObjectives]) : [];
    res.notes = result.notes?.trim() || '';
    res.updatedAt = Date.now();

    if (isNew) {
      res.moduleId = modId;
      state.resources.push(res);
    }

    window.EMVS.save();
    onChange?.();
    refresh('resources-rebuild');
  });

  setTimeout(() => {
    const form = document.getElementById('resource-form');
    form?.addEventListener('submit', e => {
      e.preventDefault();
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
      const form = document.getElementById('resource-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}
