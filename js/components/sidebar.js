/**
 * Sidebar Component
 * Compact icon rail (default) with an expandable label view.
 * Global destinations stay static in index.html; the module section
 * (current module Home + 4 tabs, module switcher) renders here.
 */

import { navigate, getCurrentView, getCurrentParams } from '../views/router.js';
import { MODULE_TABS, getNavState } from '../utils/navigation.js';

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
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', mixHex(accent, '#ffffff', 0.82));
  root.style.setProperty('--accent-ink', mixHex(accent, '#1c1917', 0.35));
  root.style.setProperty('--on-accent', getReadableTextColor(accent));
}

export function isSidebarExpanded() {
  try {
    return !!window.EMVS.getState().settings.sidebarExpanded;
  } catch {
    return false;
  }
}

export function setSidebarExpanded(expanded) {
  const state = window.EMVS.getState();
  state.settings.sidebarExpanded = !!expanded;
  window.EMVS.save();
  renderSidebar();
}

function goModule(id, tab) {
  const state = window.EMVS.getState();
  state.settings.currentModuleId = id;
  window.EMVS.save();
  renderSidebar();
  navigate('module', { id, tab });
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

  const expanded = isSidebarExpanded();
  sidebarEl.classList.toggle('expanded', expanded);
  const toggle = document.getElementById('railToggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Seitenleiste einklappen' : 'Seitenleiste erweitern');
    toggle.setAttribute('title', expanded ? 'Seitenleiste einklappen' : 'Seitenleiste erweitern');
    toggle.querySelector('.rail-toggle-ico')?.replaceChildren(document.createTextNode(expanded ? '«' : '»'));
    if (!toggle.dataset.wired) {
      toggle.dataset.wired = '1';
      toggle.addEventListener('click', () => setSidebarExpanded(!isSidebarExpanded()));
    }
  }

  const cur = state.modules.find(m => m.id === nav.moduleId) || null;

  // Module section: current module (Home + 4 tabs) + compact switcher.
  let html = '';
  if (cur) {
    html += `
      <div class="mod-current" data-module="${cur.id}">
        <button class="mod-current-head${nav.moduleTab === 'home' && currentView === 'module' ? ' active' : ''}" data-mtab-go="home" data-module="${cur.id}"
          title="Modul-Home — ${escapeHtml(cur.title)}" aria-label="Modul-Home — Modul ${escapeHtml(cur.code)}">
          <span class="toc-ico mod-home-ico" aria-hidden="true">⌂</span>
          <span class="rail-mod-dot" aria-hidden="true" style="background: var(--accent);"></span>
          <span class="mod-current-code">Modul ${escapeHtml(cur.code)}</span>
        </button>
        <nav class="modtabs" data-module="${cur.id}" aria-label="Modulbereiche">
          ${MODULE_TABS.map(t => `
            <button class="toc-item" data-mtab="${t.key}" data-module="${cur.id}" role="listitem"
              title="${MTAB_META[t.key].tip}" aria-label="${MTAB_META[t.key].tip} — Modul ${escapeHtml(cur.code)}">
              <span class="toc-ico" aria-hidden="true">${MTAB_META[t.key].ico}</span><span class="toc-lb">${t.label}</span>
            </button>`).join('')}
        </nav>
      </div>`;
  }
  if (state.modules.length > 1) {
    html += `
      <div class="toc-label">Alle Module</div>
      <div class="mod-switcher-list" role="list">
        ${state.modules.map((m, i) => `
          <button class="mod-pick${m.id === nav.moduleId ? ' active' : ''}" data-module-pick="${m.id}" role="listitem"
            title="Zu Modul ${escapeHtml(m.code)} wechseln" aria-label="Zu Modul ${escapeHtml(m.code)} — ${escapeHtml(m.title)} wechseln"
            ${m.id === nav.moduleId ? 'aria-current="page"' : ''}>
            <span class="toc-num" aria-hidden="true">${ROMAN[i] || (i + 1)}</span>
            <span class="toc-lb">Modul ${escapeHtml(m.code)} — ${escapeHtml(m.title.slice(0, 24))}</span>
          </button>`).join('')}
      </div>`;
  } else if (!cur) {
    html = `<p class="sidebar-empty">Noch keine Module — lege oben dein erstes an.</p>`;
  }
  container.innerHTML = html;

  // Module tab buttons: Home + 4 tabs keep module context.
  container.querySelectorAll('[data-mtab]').forEach(btn => {
    btn.setAttribute('tabindex', '0');
    const go = () => goModule(btn.dataset.module, btn.dataset.mtab);
    btn.addEventListener('click', go);
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
  container.querySelectorAll('[data-mtab-go]').forEach(btn => {
    btn.setAttribute('tabindex', '0');
    const go = () => goModule(btn.dataset.module, btn.dataset.mtabGo);
    btn.addEventListener('click', go);
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
  container.querySelectorAll('[data-module-pick]').forEach(btn => {
    const go = () => goModule(btn.dataset.modulePick, 'home');
    btn.addEventListener('click', go);
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  // Global nav items (re-bind every render; no {once:true} so nav keeps working)
  const globalNav = document.getElementById('nav-global');
  const overflowWrap = document.getElementById('sidebar-overflow');
  const overflowMenu = document.getElementById('overflow-menu');
  if (globalNav && overflowWrap && overflowMenu) {
    // Restore any overflowed items in canonical order (nav also holds
    // dividers/buttons, so plain appendChild would scramble the layout).
    const ORDER = ['today', 'overview', 'weak-spots', 'exams-global'];
    [...overflowMenu.querySelectorAll('.toc-item')].forEach(item => {
      item.classList.remove('overflow-item');
      const idx = ORDER.indexOf(item.dataset.view);
      const ref = [...globalNav.querySelectorAll('.toc-item')].find(
        el => ORDER.indexOf(el.dataset.view) > idx
      );
      globalNav.insertBefore(item, ref || globalNav.querySelector('.rail-div, .rail-fab, .rail-more, .rail-mod'));
    });
    overflowMenu.replaceChildren();

    const allGlobalItems = [...globalNav.querySelectorAll('.toc-item')];
    const visibleViews = ['today', 'overview', 'weak-spots', 'exams-global'];
    const hiddenItems = allGlobalItems.filter(item => !visibleViews.includes(item.dataset.view));
    const useOverflow = hiddenItems.length > 1;
    const visibleItems = useOverflow
      ? allGlobalItems.filter(item => visibleViews.includes(item.dataset.view))
      : allGlobalItems;

    if (useOverflow) {
      hiddenItems.forEach(item => {
        item.remove();
        item.classList.add('overflow-item');
        overflowMenu.appendChild(item);
      });
    }

    visibleItems.forEach(n => {
      n.classList.toggle('active', n.dataset.view === nav.global);
      n.setAttribute('tabindex', '0');
      n.setAttribute('role', 'link');
      if (n.dataset.view === nav.global) n.setAttribute('aria-current', 'page');
      else n.removeAttribute('aria-current');
      const go = () => navigate(n.dataset.view);
      n.onclick = go;
      n.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });

    overflowMenu.querySelectorAll('.toc-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === nav.global);
      n.setAttribute('tabindex', '0');
      n.setAttribute('role', 'link');
      const go = () => navigate(n.dataset.view);
      n.onclick = go;
      n.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });

    overflowWrap.hidden = !useOverflow;
    if (useOverflow) {
      const toggle2 = overflowWrap.querySelector('.overflow-toggle');
      const activeHiddenItem = hiddenItems.find(item => item.dataset.view === nav.global);
      toggle2.classList.toggle('has-active', Boolean(activeHiddenItem));
      toggle2.firstChild.textContent = activeHiddenItem ? 'Mehr · aktiv ' : 'Mehr ';
      toggle2.onclick = e => {
        e.stopPropagation();
        const isOpen = overflowWrap.classList.toggle('open');
        overflowMenu.hidden = !isOpen;
      };
      overflowMenu.hidden = true;
    }
  }

  // Current-module presence chip in the rail
  const railMod = document.getElementById('railMod');
  if (railMod) {
    railMod.hidden = !cur;
    if (cur) {
      railMod.querySelector('.rail-mod-code').textContent = cur.code;
      railMod.title = `Aktuelles Modul ${cur.code} — Module wählen`;
      railMod.querySelector('.rail-mod-dot').style.background = 'var(--accent)';
    }
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
