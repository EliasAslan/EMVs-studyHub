/**
 * Sidebar Component
 * Renders module navigation and global navigation
 */

import { navigate, getCurrentView } from '../views/router.js';
import { generateId } from '../services/store.js';

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

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

export function renderSidebar() {
  const state = window.EMVS.getState();
  const currentView = getCurrentView();
  const container = document.getElementById('nav-modules');
  if (!container) return;
  applyCurrentModuleAccent();
  
  container.innerHTML = state.modules.map((m, i) => `
    <div class="chapter ${m.id === state.settings.currentModuleId ? 'expanded' : ''}" data-module="${m.id}">
      <div class="chapter-header ${m.id === state.settings.currentModuleId ? 'active' : ''}">
        <span class="chapter-num">${ROMAN[i] || (i + 1)}</span>
        <span class="chapter-title">Modul ${escapeHtml(m.code)}</span>
      </div>
      <div class="chapter-sub">${escapeHtml(m.title)}</div>
      <nav class="chapter-nav">
        <div class="toc-item" data-view="module-home">Home</div>
        <div class="toc-item" data-view="module-objectives">Ziele</div>
        <div class="toc-item" data-view="module-resources">Ressourcen</div>
        <div class="toc-item" data-view="module-sessions">Sitzungen</div>
        <div class="toc-item" data-view="module-exams">Prüfungen</div>
        <div class="toc-item" data-view="module-plan">Plan</div>
      </nav>
    </div>
  `).join('');

  // Module headers - click to switch module
  container.querySelectorAll('.chapter-header').forEach(h => {
    h.addEventListener('click', () => {
      const id = h.closest('.chapter').dataset.module;
      if (state.settings.currentModuleId === id && currentView.startsWith('module-')) return;
      state.settings.currentModuleId = id;
      window.EMVS.save();
      renderSidebar();
      navigate('module-home');
    });
  });

  container.querySelectorAll('.chapter').forEach(ch => {
    const nav = ch.querySelector('.chapter-nav');
    const items = [...nav.querySelectorAll('.toc-item')];
    const visible = ['module-home', 'module-objectives', 'module-sessions'];
    const overflowItems = items.filter(item => !visible.includes(item.dataset.view));
    const useOverflow = overflowItems.length > 1;
    const mainItems = useOverflow
      ? items.filter(item => visible.includes(item.dataset.view))
      : items;

    if (useOverflow) {
      overflowItems.forEach(item => item.remove());
      const wrap = document.createElement('div');
      wrap.className = 'chapter-overflow';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'overflow-toggle';
      btn.innerHTML = 'Mehr <span>▾</span>';
      const menu = document.createElement('div');
      menu.className = 'overflow-menu';
      overflowItems.forEach(item => {
        menu.appendChild(item);
        item.classList.add('overflow-item');
      });
      wrap.appendChild(btn);
      wrap.appendChild(menu);
      nav.appendChild(wrap);
      btn.onclick = e => {
        e.stopPropagation();
        const isOpen = wrap.classList.toggle('open');
        menu.hidden = !isOpen;
      };
      menu.hidden = true;
      if (overflowItems.some(item => item.dataset.view === currentView)) {
        btn.classList.add('has-active');
        btn.firstChild.textContent = 'Mehr · aktiv ';
      }

      overflowItems.forEach(item => {
        const nv = item.dataset.view;
        item.classList.toggle('active', nv === currentView && ch.dataset.module === state.settings.currentModuleId);
        item.onclick = e => {
          e.stopPropagation();
          wrap.classList.remove('open');
          menu.hidden = true;
          navigate(nv);
        };
      });
    }

    mainItems.forEach(item => {
      const nv = item.dataset.view;
      item.classList.toggle('active', nv === currentView && ch.dataset.module === state.settings.currentModuleId);
      item.onclick = e => { e.stopPropagation(); navigate(nv); };
    });
  });

  // Global nav items (re-bind every render; no {once:true} so nav keeps working)
  const globalNav = document.getElementById('nav-global');
  const overflowWrap = document.getElementById('sidebar-overflow');
  const overflowMenu = document.getElementById('overflow-menu');
  if (globalNav && overflowWrap && overflowMenu) {
    [...overflowMenu.querySelectorAll('.toc-item')].forEach(item => globalNav.appendChild(item));
    overflowMenu.replaceChildren();

    const allGlobalItems = [...globalNav.querySelectorAll('.toc-item')];
    const visibleViews = ['today', 'weak-spots', 'captures'];
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
      n.classList.toggle('active', n.dataset.view === currentView);
      n.onclick = () => navigate(n.dataset.view);
    });

    overflowMenu.querySelectorAll('.toc-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === currentView);
      n.onclick = () => navigate(n.dataset.view);
    });

    overflowWrap.hidden = !useOverflow;
    if (useOverflow) {
      const toggle = overflowWrap.querySelector('.overflow-toggle');
      const activeHiddenItem = hiddenItems.find(item => item.dataset.view === currentView);
      toggle.classList.toggle('has-active', Boolean(activeHiddenItem));
      toggle.firstChild.textContent = activeHiddenItem ? 'Mehr · aktiv ' : 'Mehr ';
      toggle.onclick = e => {
        e.stopPropagation();
        const isOpen = overflowWrap.classList.toggle('open');
        overflowMenu.hidden = !isOpen;
      };
      overflowMenu.hidden = true;
    }
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}