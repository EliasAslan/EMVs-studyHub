/**
 * EMVS - Main Application Entry Point
 * Orchestrates views, state, and persistence
 */

import { load, save, generateId, exportData, importData, clearAll, getStorageError } from './services/store.js';
import { renderSidebar } from './components/sidebar.js';
import { initPalette } from './components/palette.js';
import { initModal } from './components/modal.js';
import { initToast } from './components/toast.js';
import { initTaskPanel } from './components/taskPanel.js';
import { initTabbar } from './components/tabbar.js';
import { initLayoutChrome } from './components/nav/index.js';
import { goTo, showShortcuts, kbdLabel } from './components/nav/shared.js';
import { shortcutMap } from './utils/navigation.js';
import { navigate, VIEWS, getCurrentView, routeFromHash } from './views/router.js';
import { openQuickCapture } from './views/captures.js';
import { startTimer } from './views/module-sessions.js';
import { openObjectiveHistory } from './views/module-objectives.js';
import { getMostOverdueObjective, getWeakestObjective } from './utils/helpers.js';

// Import views to register them
import './views/index.js';

// Global state
let state = load();

// Make state globally accessible for components
window.EMVS = {
  getState: () => state,
  setState: (newState) => { state = newState; },
  save: () => save(state),
  generateId,
  exportData: () => exportData(state),
  importData: (json) => importData(json),
  clearAll: () => { state = clearAll(); renderSidebar(); navigate('today'); }
};
// Pick up navigate registered during router module evaluation
window.EMVS.navigate = navigate;
window.EMVS.renderSidebar = renderSidebar;
if (window.__EMVS_pendingNavigate) delete window.__EMVS_pendingNavigate;

// Initialize app
function init() {
  // Storage failure banner: local data unreadable means saving is latched
  // off (see save()) so nothing gets overwritten. One persistent message
  // with a way to reach recovery (backup import / reset in settings).
  const storageError = getStorageError();
  if (storageError) showStorageErrorBanner(storageError);

  // Apply theme
  document.documentElement.dataset.theme = state.settings.theme || 'light';
  
  // Initialize components
  initModal();
  initToast();
  initTaskPanel();
  initPalette();
  initTabbar();
  initLayoutChrome();

  // Hash routing (deep-linkable tabs + module sub-tabs)
  window.addEventListener('hashchange', routeFromHash);

  // Render sidebar and initial view
  renderSidebar();
  if (location.hash) routeFromHash();
  else navigate('today');
  
  // Mobile menu toggle
  const menuBtn = document.getElementById('menuBtn');
  const sidebarEl = document.getElementById('sidebar');
  const overlayEl = document.getElementById('sidebarOverlay');
  const setSidebar = (open) => {
    sidebarEl?.classList.toggle('open', open);
    overlayEl?.classList.toggle('open', open);
    menuBtn?.setAttribute('aria-expanded', String(open));
    menuBtn?.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    if (open) sidebarEl?.querySelector('.toc-item')?.focus?.();
  };
  menuBtn?.addEventListener('click', () => {
    setSidebar(!sidebarEl?.classList.contains('open'));
  });
  overlayEl?.addEventListener('click', () => setSidebar(false));
  
  // Keyboard shortcuts. Single-key destinations come from the same registry
  // the navigation layouts render (utils/navigation.js DESTINATIONS), so the
  // key shown in a menu is always the key that works.
  const destKeys = shortcutMap();
  document.addEventListener('keydown', (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      window.EMVS.palette?.open();
      return;
    }
    if (e.key === 'Escape') {
      // Topmost-surface policy: Escape closes exactly one surface, the one
      // highest in the stacking order — never everything at once. The More
      // sheet (focus-trapped) handles its own Escape in the capture phase.
      if (window.EMVS.modal?.isOpen?.()) return; // closes itself via its own handler
      if (window.EMVS.palette?.isOpen?.()) { window.EMVS.palette.close(); return; }
      if (window.EMVS.launchpad?.isOpen?.()) { window.EMVS.launchpad.close(); return; }
      // NB: the Focus layout's "focus menu" and the classic phone drawer share
      // the same #sidebar.open class. Only treat it as the focus menu while
      // the Focus layout is actually active — otherwise the generic drawer
      // branch below must own the Escape (menuBtn aria + focus restore).
      if (window.EMVS.getLayout?.() === 'focus' && window.EMVS.focusMenu?.isOpen?.()) {
        window.EMVS.focusMenu.set(false);
        return;
      }
      if (document.getElementById('more-overlay')?.classList.contains('open')) {
        window.EMVS.tabbar?.closeMore?.();
        return;
      }
      const sidebarEl = document.getElementById('sidebar');
      if (sidebarEl?.classList.contains('open')) {
        sidebarEl.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
        // Focus returns to the control that opened the drawer.
        if (window.EMVS.getLayout?.() === 'focus') {
          document.getElementById('focus-handle')?.setAttribute('aria-expanded', 'false');
          document.getElementById('focus-handle')?.focus?.();
        } else {
          document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
          document.getElementById('menuBtn')?.focus?.();
        }
        return;
      }
      window.EMVS.closeNavChrome?.();
      return;
    }
    if (window.EMVS.palette?.isOpen()) return;
    if (isMod || e.altKey) return;
    const target = e.target;
    if (target.matches?.('input, textarea, select') || target.isContentEditable) return;
    // Dialogs, the More sheet and the launchpad own the keyboard while open:
    // otherwise a key typed in a dialog would navigate or start a timer behind it.
    if (document.querySelector('#modal-overlay.open, #more-overlay.open, #launchpad.open')) return;

    const key = e.key.toLowerCase();
    if (destKeys[e.key]) { goTo(destKeys[e.key]); return; }
    if (e.key === '/') { e.preventDefault(); window.EMVS.palette?.open(); return; }
    if (e.key === '?') { showShortcuts(); return; }
    if (key === 'g' && window.EMVS.getLayout?.() === 'bento') { window.EMVS.launchpad?.toggle(); return; }
    if (key === 'm' && window.EMVS.getLayout?.() === 'focus') { window.EMVS.focusMenu?.toggle(); return; }
    if (key === 's') {
      const st = window.EMVS.getState();
      const moduleId = st.settings.currentModuleId || st.modules[0]?.id;
      if (moduleId) startTimer(moduleId, 25);
    }
    else if (key === 'q') {
      const st = window.EMVS.getState();
      if (st.modules.length) openQuickCapture({ moduleId: st.settings.currentModuleId || st.modules[0].id });
    }
    else if (key === 'f') {
      const st = window.EMVS.getState();
      const objective = getMostOverdueObjective(st) || getWeakestObjective(st);
      if (objective) {
        st.settings.currentModuleId = objective.moduleId;
        window.EMVS.save();
        window.EMVS.renderSidebar();
        openObjectiveHistory(objective.id);
      }
    }
    else if (key === 'c') {
      const st = window.EMVS.getState();
      if (st.modules.length) openQuickCapture({ moduleId: st.settings.currentModuleId || null });
    }
  });
  
  // Set keyboard hint
  document.getElementById('kbd-hint').textContent = kbdLabel();
  
  console.log('EMVS initialized');
}

init();

export { state };

/**
 * Persistent storage-failure notice. Rendered once at startup when load()
 * recorded a read failure; stays visible because the condition (saving
 * disabled) stays true until the user recovers via settings or reloads
 * with readable data. Inline styles reuse existing theme vars — no CSS
 * or layout changes.
 */
function showStorageErrorBanner(err) {
  const main = document.getElementById('main');
  if (!main || document.getElementById('storage-error-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'storage-error-banner';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = 'margin:0 0 16px;padding:12px 16px;border:1px solid var(--red);'
    + 'border-radius:8px;background:color-mix(in srgb, var(--red) 12%, transparent);'
    + 'color:var(--ink);font-size:14px;line-height:1.5;';
  const detail = err && err.code ? ` (${err.code})` : '';
  banner.innerHTML = '<strong>⚠ Lokale Daten konnten nicht geladen werden' + detail + '.</strong> '
    + '<span>Speichern ist deaktiviert, damit keine Daten überschrieben werden. '
    + 'Stelle ein Backup wieder her oder setze die Daten zurück.</span> '
    + '<button type="button" class="btn" data-action="open-settings" style="margin-left:8px;">Einstellungen öffnen</button>';
  main.prepend(banner);
  banner.querySelector('[data-action="open-settings"]')?.addEventListener('click', () => {
    navigate('settings');
  });
}