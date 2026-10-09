/**
 * EMVS - Main Application Entry Point
 * Orchestrates views, state, and persistence
 */

import { load, save, generateId, exportData, importData, clearAll, getStorageError } from './services/store.js';
import { renderSidebar } from './components/sidebar.js';
import { initPalette } from './components/palette.js';
import { initModal } from './components/modal.js';
import { initToast } from './components/toast.js';
import { navigate, VIEWS, getCurrentView } from './views/router.js';
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
  initPalette();
  
  // Render sidebar and initial view
  renderSidebar();
  navigate('today');
  
  // Mobile menu toggle
  document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      window.EMVS.palette?.open();
      return;
    }
    if (e.key === 'Escape') {
      window.EMVS.modal?.close();
      window.EMVS.palette?.close();
      return;
    }
    if (window.EMVS.palette?.isOpen()) return;
    if (!isMod && !e.target.matches('input, textarea, select')) {
      if (e.key === '1') navigate('today');
      else if (e.key === '2') navigate('weak-spots');
      else if (e.key === '3') navigate('exams-global');
      else if (e.key === '4') navigate('captures');
      else if (e.key === '5') navigate('weekly-review');
      else if (e.key === '6') navigate('tools');
      else if (e.key === '7') navigate('settings');
      else if (e.key === '8') navigate('exam-prep');
      else if (e.key.toLowerCase() === 's') {
        const st = window.EMVS.getState();
        const moduleId = st.settings.currentModuleId || st.modules[0]?.id;
        if (moduleId) startTimer(moduleId, 25);
      }
      else if (e.key.toLowerCase() === 'q') {
        const st = window.EMVS.getState();
        if (st.modules.length) openQuickCapture({ moduleId: st.settings.currentModuleId || st.modules[0].id });
      }
      else if (e.key.toLowerCase() === 'f') {
        const st = window.EMVS.getState();
        const objective = getMostOverdueObjective(st) || getWeakestObjective(st);
        if (objective) {
          st.settings.currentModuleId = objective.moduleId;
          window.EMVS.save();
          window.EMVS.renderSidebar();
          openObjectiveHistory(objective.id);
        }
      }
      else if (e.key.toLowerCase() === 'c') {
        const st = window.EMVS.getState();
        if (st.modules.length) openQuickCapture({ moduleId: st.settings.currentModuleId || null });
      }
    }
  });
  
  // Set keyboard hint
  document.getElementById('kbd-hint').textContent = navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K';
  
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