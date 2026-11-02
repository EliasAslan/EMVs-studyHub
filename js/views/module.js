/**
 * Module detail — one compact header, four tabs:
 * Übersicht (dashboard + sessions), Lernziele, Material, Plan.
 * Exams live on the global Prüfungen page, not here.
 */
import { escapeHtml } from '../utils/helpers.js';
import { MODULE_TABS, resolveModuleTab } from '../utils/navigation.js';
import { navigate } from './router.js';
import { openModuleModal } from './settings.js';
import { renderModuleObjectives } from './module-objectives.js';
import { renderModulePlan } from './module-plan.js';
import { renderModuleResources } from './module-resources.js';
import { renderModuleHomeSection } from './module-home.js';

export function renderModule(state, params = {}) {
  const m = state.modules.find(x => x.id === params.id)
    || state.modules.find(x => x.id === state.settings.currentModuleId)
    || state.modules[0];
  if (!m) {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="eyebrow">Modul</div>
      <h1 class="page-title">Kein Modul ausgewählt</h1>
      <p class="page-lede">Es gibt noch keine Module. Lege oben dein erstes Modul an.</p>
      <button class="btn primary" data-action="new-module">＋ Erstes Modul erstellen</button>
    `;
    el.querySelector('[data-action="new-module"]').addEventListener('click', () => {
      openModuleModal();
    });
    return el;
  }
  const tab = resolveModuleTab(params.tab);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="mod-head">
      <div class="mod-head-text">
        <div class="eyebrow">Modul ${escapeHtml(m.code)}</div>
        <h1 class="page-title mod-title">${escapeHtml(m.title)}</h1>
      </div>
      ${state.modules.length > 1 ? `
      <div class="mod-switcher">
        <label class="sr-only" for="mod-switch">Modul wechseln</label>
        <select class="mod-switch" id="mod-switch" aria-label="Modul wechseln">
          ${state.modules.map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>Modul ${escapeHtml(x.code)}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <div class="subtabs" role="tablist" aria-label="Modulbereiche">
      ${MODULE_TABS.map(t => `<button class="subtab ${t.key === tab ? 'active' : ''}" role="tab" aria-selected="${t.key === tab}" data-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div class="mod-body" id="mod-body" role="tabpanel"></div>
  `;

  el.querySelector('#mod-switch')?.addEventListener('change', e => {
    navigate('module', { id: e.target.value, tab });
  });
  el.querySelectorAll('.subtab').forEach(b => {
    b.addEventListener('click', () => navigate('module', { id: m.id, tab: b.dataset.tab }));
  });

  const host = el.querySelector('#mod-body');
  try {
    if (tab === 'home') host.appendChild(renderModuleHomeSection(state, m));
    else if (tab === 'ziele') host.appendChild(renderModuleObjectives(state, { embedded: true }));
    else if (tab === 'plan') host.appendChild(renderModulePlan(state, { embedded: true }));
    else if (tab === 'material') host.appendChild(renderModuleResources(state, { embedded: true }));
  } catch (err) {
    console.warn('module subtab render failed', err);
    host.innerHTML = `<div class="card"><p>Dieser Bereich konnte nicht geladen werden.</p></div>`;
  }
  return el;
}
