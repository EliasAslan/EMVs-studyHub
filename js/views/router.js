/**
 * Router - View management
 */

import { stopHomeTimerDisplay } from './module-home.js';
import { stopSessionsTimerDisplay } from './module-sessions.js';
import { stopMockExamDisplay } from './mock-exam.js';

export const VIEWS = {};
let currentView = 'today';
let previousView = 'today';

export function getCurrentView() {
  return currentView;
}

// Legacy alias: some modules import { currentView } — expose a getter-based
// live binding via a Proxy-friendly object is not possible for `let`,
// so we export a function and also keep this accessor for compat.
export function getPreviousView() {
  return previousView;
}

export function registerView(name, renderFn) {
  VIEWS[name] = renderFn;
}

/**
 * Targeted-update pattern — the fix for "stop wiping #view-root".
 *
 * Views that change a single row or value (confidence, status, score)
 * register a patcher instead of re-rendering:
 *
 *   registerPatcher('module-objectives', (reason, payload) => { … });
 *
 * Handlers mutate state, call window.EMVS.save(), then refresh(reason,
 * payload). The patcher touches only the affected nodes (dot classes,
 * badge class, grade text, …). Structural changes (add/delete) rebuild
 * only their list container, never the whole page.
 *
 * Full render happens on navigation only. When no patcher is registered
 * for the current view, refresh() falls back to a full render.
 */
const PATCHERS = {};

export function registerPatcher(view, fn) {
  PATCHERS[view] = fn;
}

export function refresh(reason, payload) {
  const patch = PATCHERS[currentView];
  if (patch) {
    try {
      patch(reason, payload);
      return;
    } catch (e) {
      console.warn(`Patcher for "${currentView}" failed, full render instead:`, e);
    }
  }
  render();
}

export function navigate(view) {
  if (!VIEWS[view]) {
    console.warn(`Unknown view "${view}", falling back to today`);
    view = 'today';
  }
  previousView = currentView;
  currentView = view;
  render();
  // Close mobile sidebar after navigation
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

export { currentView };

function render() {
  const state = window.EMVS.getState();
  
  // Cleanup previous view-specific intervals
  if (previousView === 'module-home') {
    stopHomeTimerDisplay();
  }
  if (previousView === 'module-sessions') {
    stopSessionsTimerDisplay();
  }
  if (previousView === 'mock-exam') {
    stopMockExamDisplay();
  }
  
  // Update global nav active state
  document.querySelectorAll('#nav-global .toc-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === currentView);
  });
  
  // Update module nav active state
  document.querySelectorAll('.chapter-nav .toc-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === currentView);
  });
  document.querySelectorAll('.chapter').forEach(ch => {
    const isCurrent = ch.dataset.module === state.settings.currentModuleId;
    ch.classList.toggle('expanded', isCurrent);
    ch.querySelector('.chapter-header')?.classList.toggle('active', isCurrent);
  });
  
  const fn = VIEWS[currentView] || VIEWS['today'] || VIEWS['overview'];
  const root = document.getElementById('view-root');
  if (!root) return;
  root.dataset.view = currentView;
  root.innerHTML = '';
  const node = fn(state);
  if (node) root.appendChild(node);
}

// Make navigate available globally for palette (guard: window.EMVS is
// created in app.js AFTER imports are evaluated)
if (window.EMVS) {
  window.EMVS.navigate = navigate;
} else {
  window.__EMVS_pendingNavigate = navigate;
}