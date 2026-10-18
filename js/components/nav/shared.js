/**
 * Shared helpers for the navigation layouts (DOM side).
 * Every layout navigates through goTo()/goModule() so all ten styles
 * behave identically: same module context handling, same persistence.
 */

import { navigate, getCurrentView, getCurrentParams } from '../../views/router.js';
import { DESTINATIONS, destinationIdFor, shortcutMap } from '../../utils/navigation.js';
import { openModal } from '../modal.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const getState = () => window.EMVS.getState();

/** Current module, falling back to the first one (never undefined). */
export function currentModule(state = getState()) {
  const id = state.settings.currentModuleId;
  return state.modules.find(m => m.id === id) || state.modules[0] || null;
}

/** Destination id of the page currently shown (null for unknown routes). */
export function currentDest() {
  return destinationIdFor(getCurrentView(), getCurrentParams());
}

/** Select a module (persisted), refresh chrome, open one of its tabs. */
export function goModule(id, tab = 'home') {
  const state = getState();
  if (state.settings.currentModuleId !== id) {
    state.settings.currentModuleId = id;
    window.EMVS.save();
    window.EMVS.renderSidebar?.();
  }
  navigate('module', { id, tab });
}

/**
 * Open a destination by registry id. Module tabs and the mock exam need a
 * module; without one the user lands on the module overview, where the
 * "create module" action lives, instead of on an empty page.
 */
export function goTo(destId) {
  const d = DESTINATIONS[destId];
  if (!d) return;
  const state = getState();
  if (d.moduleTab) {
    const mod = currentModule(state);
    if (!mod) { navigate('overview'); return; }
    goModule(mod.id, d.moduleTab);
    return;
  }
  if (d.view === 'mock-exam') {
    const mod = currentModule(state);
    if (!mod) { navigate('overview'); return; }
    if (state.settings.currentModuleId !== mod.id) {
      state.settings.currentModuleId = mod.id;
      window.EMVS.save();
      window.EMVS.renderSidebar?.();
    }
  }
  navigate(d.view);
}

const BADGE_KIND = { 'weak-spots': 'weak', 'exams-global': 'exam' };

/** Markup for one destination button (shared look across layouts). */
export function destButton(id, { cls = '', label = null, showHint = false } = {}) {
  const d = DESTINATIONS[id];
  if (!d) return '';
  const badge = BADGE_KIND[id]
    ? `<span class="nav-badge" data-badge="${BADGE_KIND[id]}" role="status" hidden></span>` : '';
  return `<button type="button" class="nav-dest ${cls}" data-dest="${id}" data-fk="dest:${id}" title="${esc(d.label)}">`
    + `<span class="nav-dest-ico" aria-hidden="true">${d.ico}</span>`
    + `<span class="nav-dest-text"><span class="nav-dest-label">${esc(label || d.label)}</span>`
    + `${showHint && d.hint ? `<span class="nav-dest-hint">${esc(d.hint)}</span>` : ''}</span>${badge}</button>`;
}

/** Wire every [data-dest] in a container; `after` runs after navigation. */
export function bindDests(root, after) {
  root.querySelectorAll('[data-dest]').forEach(btn => {
    btn.addEventListener('click', () => {
      goTo(btn.dataset.dest);
      after?.(btn);
    });
  });
}

/** Mark the active destination button(s) inside a container. */
export function syncDests(root) {
  const cur = currentDest();
  root.querySelectorAll('[data-dest]').forEach(btn => {
    const on = btn.dataset.dest === cur;
    btn.classList.toggle('active', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

export function refreshBadges() {
  try { window.EMVS.tabbar?.updateBadges?.(); } catch {}
}

/**
 * Re-render a container without dropping keyboard focus: the focused
 * element is found again via its data-fk key after the rebuild.
 */
export function preserveFocus(container, rebuild) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.getAttribute('data-fk') : null;
  rebuild();
  if (key) {
    const again = [...container.querySelectorAll('[data-fk]')].find(el => el.getAttribute('data-fk') === key);
    again?.focus?.({ preventScroll: true });
  }
}

export function isMac() {
  try { return /Mac|iPhone|iPad/.test(navigator.platform || ''); } catch { return false; }
}

export function kbdLabel() {
  return isMac() ? '⌘K' : 'Strg+K';
}

/** Keyboard cheat sheet, derived from the same registry the keys use. */
export function showShortcuts() {
  const dest = Object.entries(shortcutMap())
    .map(([key, id]) => `<tr><td><kbd>${esc(key)}</kbd></td><td>${esc(DESTINATIONS[id].label)}</td></tr>`)
    .join('');
  const extra = [
    [kbdLabel(), 'Befehlspalette: Seiten, Fächer, Notizen, Werkzeuge'],
    ['/', 'Suche öffnen'],
    ['G', 'Launchpad (Bento-Layout)'],
    ['M', 'Menü ein-/ausblenden (Fokus-Layout)'],
    ['S', 'Sitzung starten (25 Min)'],
    ['Q', 'Schnell erfassen'],
    ['F', 'Nächstes Lernziel'],
    ['Esc', 'Schließen'],
  ].map(([k, t]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(t)}</td></tr>`).join('');
  openModal({
    title: 'Tastenkürzel',
    body: `<table class="shortcut-table"><tbody>${dest}${extra}</tbody></table>`
      + '<p class="muted" style="font-size:12.5px;margin-top:12px;">Kürzel ohne Strg/⌘ greifen nur, wenn kein Eingabefeld oder Dialog aktiv ist.</p>',
    footer: '<button class="btn" id="shortcuts-close">Schließen</button>',
  });
  setTimeout(() => {
    document.getElementById('shortcuts-close')?.addEventListener('click', () => window.EMVS.modal?.close());
  }, 0);
}
