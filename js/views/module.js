/**
 * Module detail — Home dashboard plus 4 sub-tabs (Ziele | Plan | Sessions | Material).
 * Material merges Ressourcen + Modul-Prüfungen (display-only).
 */
import { escapeHtml } from '../utils/helpers.js';
import { MODULE_TABS, resolveModuleTab, getBreadcrumb } from '../utils/navigation.js';
import { navigate } from './router.js';
import { openModuleModal } from './settings.js';
import { renderModuleObjectives } from './module-objectives.js';
import { renderModulePlan } from './module-plan.js';
import { renderModuleSessions } from './module-sessions.js';
import { renderModuleResources } from './module-resources.js';
import { renderModuleExams } from './module-exams.js';
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
  const crumbs = getBreadcrumb('module', { id: m.id, tab }, state);

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="mod-switcher">
      <label class="sr-only" for="mod-switch">Modul wechseln</label>
      <select class="mod-switch" id="mod-switch" aria-label="Modul wechseln">
        ${state.modules.map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>Modul ${escapeHtml(x.code)} — ${escapeHtml(x.title.slice(0, 32))}</option>`).join('')}
      </select>
    </div>
    <div class="eyebrow">Modul ${escapeHtml(m.code)}</div>
    <h1 class="page-title mod-title">${escapeHtml(m.title)}</h1>
    <nav class="mod-breadcrumb" aria-label="Brotkrümelnavigation">
      ${crumbs.map(c => escapeHtml(c.label)).join(' <span aria-hidden="true">›</span> ')}
    </nav>
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
    else if (tab === 'ziele') host.appendChild(renderModuleObjectives(state));
    else if (tab === 'plan') host.appendChild(renderModulePlan(state));
    else if (tab === 'sessions') host.appendChild(renderModuleSessions(state));
    else if (tab === 'material') {
      const r = renderModuleResources(state);
      const x = renderModuleExams(state);
      const wrapR = document.createElement('section');
      wrapR.innerHTML = `<h2 class="section-label" style="margin:16px 0 8px;">Lernmaterial</h2>`;
      wrapR.appendChild(r);
      const wrapX = document.createElement('section');
      wrapX.innerHTML = `<hr class="rule"><h2 class="section-label" style="margin:0 0 8px;">Prüfungen dieses Moduls</h2>`;
      wrapX.appendChild(x);
      host.appendChild(wrapR);
      host.appendChild(wrapX);
    }
  } catch (err) {
    console.warn('module subtab render failed', err);
    host.innerHTML = `<div class="card"><p>Dieser Bereich konnte nicht geladen werden.</p></div>`;
  }
  return el;
}
