/**
 * Sidebar Component
 * Owns the classic shell and applies the active layout
 * (settings.navLayout, six styles — see utils/navLayout.js). Global
 * destinations stay static in index.html; the module section (current
 * module Home + tabs, switcher) renders here. The newer layouts (tree,
 * mega, dock, context, bento, mobile) render through components/nav/.
 */

import { navigate, getCurrentView, getCurrentParams } from '../views/router.js';
import { MODULE_TABS, getNavState } from '../utils/navigation.js';
import { getNavLayout, setNavLayoutSetting } from '../utils/navLayout.js';
import { objectiveProgressPercent } from '../utils/dashboard.js';
import { closeMore } from './tabbar.js';
import { renderLayoutChrome } from './nav/index.js';
import { openLaunchpad } from './nav/bento.js';

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

const MTAB_META = {
  home: { ico: '⌂', tip: 'Modul-Home — Übersicht' },
  ziele: { ico: '◎', tip: 'Lernziele' },
  plan: { ico: '≡', tip: 'Plan' },
  sessions: { ico: '▶', tip: 'Sitzungen' },
  material: { ico: '▤', tip: 'Material und Prüfungen' },
};

function hexToRgb(hex) {
  const value = String(hex || '#b45309').replace('#', '');
  const safe = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
  const num = Number.parseInt(safe, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function mixHex(hex, targetHex, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  const mix = (start, end) => Math.round(start + (end - start) * amount);
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(mix(a.r, b.r))}${toHex(mix(a.g, b.g))}${toHex(mix(a.b, b.b))}`;
}

function getReadableTextColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.64 ? '#1c1917' : '#ffffff';
}

function applyCurrentModuleAccent() {
  const state = window.EMVS.getState();
  const module = state.modules.find(m => m.id === state.settings.currentModuleId) || state.modules[0];
  const accent = module?.accent || '#b45309';
  const root = document.documentElement;
  // Soft/ink tints depend on the theme: a light tint on the dark theme
  // would put the theme's light text on a light background.
  const dark = root.dataset.theme === 'dark';
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', dark ? mixHex(accent, '#16120c', 0.8) : mixHex(accent, '#ffffff', 0.82));
  root.style.setProperty('--accent-ink', dark ? mixHex(accent, '#ffffff', 0.5) : mixHex(accent, '#1c1917', 0.35));
  root.style.setProperty('--on-accent', getReadableTextColor(accent));
}

// Theme switches (Settings, palette) only flip data-theme: re-derive the tints.
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => { try { applyCurrentModuleAccent(); } catch {} })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/** Returns true if the sidebar is in an expanded (tree-like) state. */
export function isSidebarExpanded() {
  try {
    return getNavLayout(window.EMVS.getState()) === 'tree';
  } catch {
    return false;
  }
}

/** Expand/collapse the sidebar by switching to/from 'tree'. */
export function setSidebarExpanded(expanded) {
  setNavLayout(expanded ? 'tree' : 'dock');
}

/**
 * Persist a layout choice and apply it immediately (no reload).
 * Unknown ids are ignored. Choosing Bento opens its launchpad right away:
 * the launchpad is that layout's home, so the switch shows it.
 */
export function setNavLayout(layout) {
  const state = window.EMVS.getState();
  const before = getNavLayout(state);
  if (!setNavLayoutSetting(state, layout)) return false;
  window.EMVS.save();
  try { closeMore(); } catch {}
  renderSidebar();
  if (layout === 'bento' && before !== 'bento') openLaunchpad();
  return true;
}

function goModule(id, tab) {
  const state = window.EMVS.getState();
  state.settings.currentModuleId = id;
  window.EMVS.save();
  renderSidebar();
  navigate('module', { id, tab });
}

/**
 * Apply the active layout to the shell: body hook for CSS, the `expanded`
 * (labeled) sidebar class for tree and context, and mobile.
 */
function applyNavLayout(layout) {
  try {
    document.body.dataset.navlayout = layout;
  } catch {}
  const sidebarEl = document.getElementById('sidebar');
  sidebarEl?.classList.toggle('expanded', ['tree', 'context', 'mobile'].includes(layout));
  // railToggle removed: layout switching now done via Settings
}

/**
 * Module section markup: current-module Home shortcut + tab rows,
 * then the module switcher.
 */
function moduleSectionHtml(state, nav, cur, currentView) {
  let html = '';
  if (cur) {
    html += `
      <div class="mod-current" data-module="${cur.id}">
        <button type="button" class="mod-current-head${nav.moduleTab === 'home' && currentView === 'module' ? ' active' : ''}" data-mtab-go="home" data-module="${cur.id}"
          title="Modul-Home — ${escapeHtml(cur.title)}" aria-label="Modul-Home — Modul ${escapeHtml(cur.code)}">
          <span class="toc-ico mod-home-ico" aria-hidden="true">⌂</span>
          <span class="rail-mod-dot" aria-hidden="true" style="background: var(--accent);"></span>
          <span class="mod-current-code">Modul ${escapeHtml(cur.code)}</span>
        </button>
        <nav class="modtabs" data-module="${cur.id}" aria-label="Modulbereiche">
          ${MODULE_TABS.map(t => `
            <button type="button" class="toc-item" data-mtab="${t.key}" data-module="${cur.id}"
              title="${MTAB_META[t.key].tip}" aria-label="${MTAB_META[t.key].tip} — Modul ${escapeHtml(cur.code)}">
              <span class="toc-ico" aria-hidden="true">${MTAB_META[t.key].ico}</span><span class="toc-lb">${t.label}</span>
            </button>`).join('')}
        </nav>
      </div>`;
  }
  if (state.modules.length > 1) {
    html += `
      <div class="toc-label">Alle Module</div>
      <div class="mod-switcher-list">
        ${state.modules.map((m, i) => `
          <button type="button" class="mod-pick${m.id === nav.moduleId ? ' active' : ''}" data-module-pick="${m.id}"
            title="Zu Modul ${escapeHtml(m.code)} wechseln" aria-label="Zu Modul ${escapeHtml(m.code)} — ${escapeHtml(m.title)} wechseln"
            ${m.id === nav.moduleId ? 'aria-current="page"' : ''}>
            <span class="toc-num" aria-hidden="true">${ROMAN[i] || (i + 1)}</span>
            <span class="toc-lb">Modul ${escapeHtml(m.code)} — ${escapeHtml(m.title.slice(0, 24))}</span>
          </button>`).join('')}
      </div>`;
  } else if (!cur) {
    html = `<p class="sidebar-empty">Noch keine Module — lege oben dein erstes an.</p>`;
  }
  return html;
}

/** Bind one rendered module section (sidebar copy or panel copy). */
function bindModuleSection(container) {
  // Module tab buttons: Home + 4 tabs keep module context.
  // These controls are native buttons. Let the browser synthesize their
  // click for Enter/Space; handling keydown as well would navigate twice.
  container.querySelectorAll('[data-mtab]').forEach(btn => {
    btn.addEventListener('click', () => goModule(btn.dataset.module, btn.dataset.mtab));
  });
  container.querySelectorAll('[data-mtab-go]').forEach(btn => {
    btn.addEventListener('click', () => goModule(btn.dataset.module, btn.dataset.mtabGo));
  });
  container.querySelectorAll('[data-module-pick]').forEach(btn => {
    btn.addEventListener('click', () => goModule(btn.dataset.modulePick, 'home'));
  });
}

export function renderSidebar() {
  const state = window.EMVS.getState();
  const currentView = getCurrentView();
  const params = getCurrentParams();
  const nav = getNavState(currentView, params, state.settings.currentModuleId);
  const sidebarEl = document.getElementById('sidebar');
  const container = document.getElementById('nav-modules');
  if (!container || !sidebarEl) return;
  applyCurrentModuleAccent();

  const layout = getNavLayout(state);
  applyNavLayout(layout);

  const cur = state.modules.find(m => m.id === nav.moduleId) || null;

  // Module section renders into the sidebar.
  if (container) {
    container.innerHTML = moduleSectionHtml(state, nav, cur, currentView);
    bindModuleSection(container);
  }

  // Global destinations: active state + activation (re-bound on every render).
  // Native <button> elements are already in the tab order — no tabindex needed.
  document.querySelectorAll('#nav-global .toc-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === nav.global);
    if (n.dataset.view === nav.global) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
    const go = () => navigate(n.dataset.view);
    n.onclick = go;
    n.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });

  // Layout-specific chrome (tree, mega, dock, context, bento, mobile) and the contextual mobile header.
  renderLayoutChrome(layout, state);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
