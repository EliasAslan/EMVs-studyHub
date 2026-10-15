/**
 * Router - hash-based view management.
 * Routes: #/heute #/module #/modul/:id/:tab #/schwach #/pruefungen
 * Legacy view names (today, overview, weak-spots, ...) still work
 * via navigate(view) for backward compatibility.
 */

import { stopSessionsTimerDisplay } from './module-sessions.js';
import { stopMockExamDisplay } from './mock-exam.js';
import { resolveModuleTab, getNavState, LEGACY_VIEW_TO_TAB } from '../utils/navigation.js';

export const VIEWS = {};
let currentView = 'today';
let previousView = 'today';
let currentParams = {};

const LEGACY_TO_HASH = {
  'today': '#/heute',
  'overview': '#/module',
  'weak-spots': '#/schwach',
  'exams-global': '#/pruefungen',
  'captures': '#/erfassen',
  'weekly-review': '#/review',
  'tools': '#/werkzeuge',
  'settings': '#/einstellungen',
  'exam-prep': '#/vorbereitung',
  'mock-exam': '#/mock',
  'module-home': '#/modul',
  'module-objectives': '#/modul/__cur__/ziele',
  'module-resources': '#/modul/__cur__/material',
  'module-sessions': '#/modul/__cur__/sessions',
  'module-exams': '#/modul/__cur__/material',
  'module-plan': '#/modul/__cur__/plan',
};

const HASH_TO_VIEW = {
  '/heute': 'today',
  '/module': 'overview',
  '/schwach': 'weak-spots',
  '/pruefungen': 'exams-global',
  '/erfassen': 'captures',
  '/review': 'weekly-review',
  '/werkzeuge': 'tools',
  '/einstellungen': 'settings',
  '/vorbereitung': 'exam-prep',
  '/mock': 'mock-exam',
  '/modul': 'module',
};

export function getCurrentView() {
  return currentView;
}

// Legacy alias: some modules import { currentView } — expose a getter-based
// live binding via a Proxy-friendly object is not possible for `let`,
// so we export a function and also keep this accessor for compat.
export function getPreviousView() {
  return previousView;
}

export function getCurrentParams() {
  return { ...currentParams };
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

export function navigate(view, params = {}) {
  // New-style: navigate('module', { id, tab })
  if (view === 'module' && (params.id || params.tab)) {
    const id = params.id || window.EMVS?.getState()?.settings?.currentModuleId || '';
    const tab = resolveModuleTab(params.tab);
    setHash(`#/modul/${id}/${tab}`);
    return;
  }
  if (LEGACY_TO_HASH[view]) {
    let hash = LEGACY_TO_HASH[view];
    if (hash.includes('__cur__')) {
      const cur = window.EMVS?.getState()?.settings?.currentModuleId || '';
      hash = hash.replace('__cur__', cur);
    }
    // Preserve explicit module sub-tab requests
    if (view.startsWith('module-') && params.id) {
      const tab = view === 'module-objectives' ? 'ziele'
        : view === 'module-plan' ? 'plan'
        : view === 'module-sessions' ? 'sessions' : 'material';
      setHash(`#/modul/${params.id}/${tab}`);
      return;
    }
    setHash(hash + (params.qs || ''));
    return;
  }
  if (!VIEWS[view]) {
    console.warn(`Unknown view "${view}", falling back to today`);
    setHash('#/heute');
    return;
  }
  previousView = currentView;
  currentView = view;
  currentParams = { ...params };
  render();
  closeChrome();
}

function setHash(hash) {
  if (location.hash === hash) {
    routeFromHash();
  } else {
    location.hash = hash;
  }
}

export function routeFromHash() {
  const raw = (location.hash || '#/heute').replace(/^#/, '');
  const [pathPart, qsPart] = raw.split('?');
  const qs = Object.fromEntries(new URLSearchParams(qsPart || ''));
  const segs = pathPart.split('/').filter(Boolean);

  // #/modul/:id/:tab
  if (segs[0] === 'modul') {
    const st = window.EMVS?.getState?.();
    let id = segs[1] || st?.settings?.currentModuleId || st?.modules?.[0]?.id || '';
    const tab = resolveModuleTab(segs[2]);
    if (st && id && st.settings) {
      st.settings.currentModuleId = id;
      try { window.EMVS.save(); } catch {}
    }
    previousView = currentView;
    currentView = 'module';
    currentParams = { id, tab, ...qs };
    render();
    closeChrome();
    return;
  }

  const key = '/' + segs.join('/');
  const view = HASH_TO_VIEW[key] || HASH_TO_VIEW['/' + (segs[0] || 'heute')] || 'today';
  // Unknown module-subtab legacy handled above; unknown paths fall back
  if (!VIEWS[view]) {
    previousView = currentView;
    currentView = 'today';
    currentParams = {};
    render();
    closeChrome();
    return;
  }
  previousView = currentView;
  currentView = view;
  currentParams = { ...qs };
  // Keep module context from ?module=
  if (qs.module && window.EMVS?.getState?.()?.settings) {
    const st = window.EMVS.getState();
    st.settings.currentModuleId = qs.module;
    try { window.EMVS.save(); } catch {}
  }
  render();
  closeChrome();
}

function closeChrome() {
  // Close mobile sidebar after navigation
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', 'false');
  document.getElementById('more-overlay')?.classList.remove('open');
  document.getElementById('more-overlay')?.setAttribute('aria-hidden', 'true');
  document.getElementById('moreBtn')?.setAttribute('aria-expanded', 'false');
}

export { currentView };

function render() {
  const state = window.EMVS.getState();

  // Cleanup previous view-specific intervals
  if (previousView === 'module-sessions') {
    stopSessionsTimerDisplay();
  }
  if (previousView === 'mock-exam') {
    stopMockExamDisplay();
  }

  // Active states derive from one nav model (utils/navigation.js) so the
  // sidebar, tabbar and module tabs can never disagree about the route.
  const nav = getNavState(currentView, currentParams, state.settings.currentModuleId);

  // Update global nav active state
  document.querySelectorAll('#nav-global .toc-item').forEach(n => {
    const on = n.dataset.view === nav.global;
    n.classList.toggle('active', on);
    if (on) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  });

  // Update module nav active state: item matches when its tab AND its
  // module match the route (legacy data-view names are mapped too).
  document.querySelectorAll('.chapter-nav .toc-item, .modtabs .toc-item, .mod-current-head').forEach(n => {
    const tab = n.dataset.mtab || n.dataset.mtabGo || LEGACY_VIEW_TO_TAB[n.dataset.view];
    const mod = n.closest('.chapter, .modtabs, .mod-current')?.dataset.module || nav.moduleId;
    const on = !!tab && tab === nav.moduleTab && !!mod && mod === nav.moduleId;
    n.classList.toggle('active', on);
    if (on) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  });
  document.querySelectorAll('.chapter').forEach(ch => {
    const isCurrent = !!nav.moduleId && ch.dataset.module === nav.moduleId;
    ch.classList.toggle('expanded', isCurrent);
    ch.querySelector('.chapter-header')?.classList.toggle('active', isCurrent);
  });

  // Bottom tabbar state (module detail counts as overview)
  const tabFor = currentView === 'module' ? 'overview'
    : currentView === 'today' ? 'today'
    : currentView === 'weak-spots' ? 'weak-spots'
    : currentView === 'exams-global' ? 'exams-global' : '';
  document.querySelectorAll('#tabbar .tab[data-route]').forEach(t => {
    const on = t.dataset.route === tabFor;
    t.classList.toggle('active', on);
    t.setAttribute('aria-current', on ? 'page' : 'false');
  });
  window.EMVS?.tabbar?.updateBadges?.();

  const fn = VIEWS[currentView] || VIEWS['today'] || VIEWS['overview'];
  const root = document.getElementById('view-root');
  if (!root) return;
  root.dataset.view = currentView;
  root.innerHTML = '';
  const node = fn(state, currentParams);
  if (node) root.appendChild(node);
  document.getElementById('main')?.scrollTo?.({ top: 0 });
}

// Make navigate available globally for palette (guard: window.EMVS is
// created in app.js AFTER imports are evaluated)
if (window.EMVS) {
  window.EMVS.navigate = navigate;
} else {
  window.__EMVS_pendingNavigate = navigate;
}