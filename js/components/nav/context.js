/**
 * Context layout — navigation by what the student wants to do now.
 * Four modes (Lernen / Üben / Planen / Wiederholen) each gather the pages
 * and activities that belong to that goal. Lives in its own container
 * inside the sidebar, so the other layouts' markup is never touched.
 */

import { CONTEXT_MODES, DESTINATIONS, resolveContextMode, isContextModeId } from '../../utils/navigation.js';
import { startTimer } from '../../views/module-sessions.js';
import { esc, getState, currentDest, currentModule, destButton, bindDests, syncDests, preserveFocus, refreshBadges } from './shared.js';

// A manual mode pick lasts until the next navigation, so a click on a mode
// tab is never undone by an unrelated re-render.
let manualMode = null;

function effectiveMode(state) {
  if (isContextModeId(manualMode)) return manualMode;
  return resolveContextMode(currentDest(), state.settings.contextMode);
}

export function render(state) {
  const host = document.getElementById('context-nav');
  if (!host) return;
  host.hidden = false;
  const modeId = effectiveMode(state);
  const mode = CONTEXT_MODES.find(m => m.id === modeId) || CONTEXT_MODES[0];
  const hasModule = state.modules.length > 0;
  const items = mode.items.filter(id => hasModule || !DESTINATIONS[id].moduleTab);

  preserveFocus(host, () => {
    host.innerHTML = `
      <div class="toc-label">Ziel wählen</div>
      <div class="ctx-modes" role="tablist" aria-label="Lernziel">
        ${CONTEXT_MODES.map(m => `
          <button type="button" role="tab" class="ctx-mode${m.id === mode.id ? ' active' : ''}" id="ctx-tab-${m.id}"
            data-mode="${m.id}" data-fk="mode:${m.id}" aria-selected="${m.id === mode.id}" aria-controls="ctx-panel"
            tabindex="${m.id === mode.id ? 0 : -1}">
            <span class="ctx-mode-ico" aria-hidden="true">${m.ico}</span><span class="ctx-mode-lb">${esc(m.label)}</span>
          </button>`).join('')}
      </div>
      <div class="ctx-panel" id="ctx-panel" role="tabpanel" aria-labelledby="ctx-tab-${mode.id}">
        <p class="ctx-lede">${esc(mode.lede)}</p>
        <div class="ctx-list">${items.map(id => destButton(id, { cls: 'ctx-item', showHint: true })).join('')}</div>
        ${mode.id === 'practice' && hasModule ? `
          <button type="button" class="btn ctx-action" id="ctx-start" data-fk="ctx-start">▶ Sitzung starten · 25 Min</button>` : ''}
        ${!hasModule ? '<p class="sidebar-empty">Lege ein Modul an, um Lernziele, Plan und Sitzungen zu nutzen.</p>' : ''}
      </div>`;
  });

  bindDests(host);
  host.querySelectorAll('.ctx-mode').forEach(btn => {
    btn.addEventListener('click', () => pick(btn.dataset.mode));
    btn.addEventListener('keydown', e => {
      const tabs = [...host.querySelectorAll('.ctx-mode')];
      const i = tabs.indexOf(btn);
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); pick(next.dataset.mode); }
    });
  });
  host.querySelector('#ctx-start')?.addEventListener('click', () => {
    const mod = currentModule(getState());
    if (mod) startTimer(mod.id, 25);
  });
  syncDests(host);
  refreshBadges();
}

function pick(modeId) {
  manualMode = modeId;
  const state = getState();
  state.settings.contextMode = modeId;
  window.EMVS.save();
  render(state);
  document.getElementById(`ctx-tab-${modeId}`)?.focus();
}

/** Route changed: the page decides the mode again; remember it. */
export function sync(state) {
  manualMode = null;
  const dest = currentDest();
  const wanted = resolveContextMode(dest, state.settings.contextMode);
  if (dest && state.settings.contextMode !== wanted) {
    state.settings.contextMode = wanted;
    try { window.EMVS.save(); } catch {}
  }
  render(state);
}

export function teardown() {
  const host = document.getElementById('context-nav');
  if (host) { host.hidden = true; host.replaceChildren(); }
}
