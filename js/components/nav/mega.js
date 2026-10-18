/**
 * Mega layout — horizontal top navigation. Categories open large,
 * grouped menus (links with short descriptions) instead of a permanent
 * sidebar. Click/Enter/Space or hover open a menu; Escape, outside click
 * or leaving with Tab close it; Arrow keys move between categories.
 */

import { MEGA_MENUS, DESTINATIONS, destinationIdFor } from '../../utils/navigation.js';
import { getModuleProgress } from '../../utils/navData.js';
import { getCurrentView, getCurrentParams } from '../../views/router.js';
import { esc, currentModule, destButton, bindDests, syncDests, goModule, refreshBadges, kbdLabel } from './shared.js';

let hoverTimer = null;
let outsideWired = false;

function panelHtml(menu, state) {
  const cur = currentModule(state);
  return `<div class="mega-cols">${menu.groups.map(g => {
    if (g.kind === 'modules') {
      return `<div class="mega-col"><h3 class="mega-col-title">${esc(g.title)}</h3>
        <div class="mega-links">${state.modules.length ? state.modules.map(m => {
          const p = getModuleProgress(state, m.id);
          return `<button type="button" class="nav-dest mega-subject${cur && m.id === cur.id ? ' is-current' : ''}" data-module-pick="${esc(m.id)}" data-fk="mp:${esc(m.id)}">
            <span class="tree-dot" aria-hidden="true" style="background:${esc(m.accent || 'var(--accent)')}"></span>
            <span class="nav-dest-text"><span class="nav-dest-label">${esc(m.code)}</span><span class="nav-dest-hint">${esc(m.title || '')}</span></span>
            <span class="tree-meta" aria-label="${p.pct}% gemeistert">${p.pct}%</span></button>`;
        }).join('') : '<p class="sidebar-empty">Noch keine Module.</p>'}</div></div>`;
    }
    const items = g.items.filter(id => state.modules.length > 0 || !DESTINATIONS[id].moduleTab);
    if (!items.length) return '';
    return `<div class="mega-col"><h3 class="mega-col-title">${esc(g.title)}</h3>
      <div class="mega-links">${items.map(id => destButton(id, { cls: 'mega-link', showHint: true })).join('')}</div></div>`;
  }).join('')}</div>`;
}

export function render(state) {
  const bar = document.getElementById('topchrome');
  if (!bar) return;
  bar.hidden = false;
  bar.dataset.style = 'mega';
  bar.setAttribute('aria-label', 'Hauptnavigation');
  bar.innerHTML = `
    <span class="brand-mark">EMVS</span>
    <nav class="mega-nav" aria-label="Hauptnavigation">
      <ul class="mega-list">
        ${MEGA_MENUS.map(m => m.groups ? `
          <li class="mega-item" data-menu="${m.id}">
            <button type="button" class="mega-trigger" id="mega-btn-${m.id}" aria-expanded="false" aria-controls="mega-panel-${m.id}" aria-haspopup="true">
              <span>${esc(m.label)}</span><span class="mega-caret" aria-hidden="true">▾</span>
            </button>
            <div class="mega-panel" id="mega-panel-${m.id}" role="region" aria-labelledby="mega-btn-${m.id}" hidden>${panelHtml(m, state)}</div>
          </li>` : `
          <li class="mega-item">${destButton(m.dest, { cls: 'mega-trigger mega-direct' })}</li>`).join('')}
      </ul>
    </nav>
    <div class="topchrome-actions">
      <button type="button" class="tc-btn" id="megaSearch" aria-label="Suchen und Befehle öffnen (${kbdLabel()})" title="Suchen (${kbdLabel()})"><span aria-hidden="true">⌕</span></button>
      <button type="button" class="tc-btn tc-primary" data-capture aria-label="Schnell erfassen: Frage, Fehler oder Gedanke festhalten" title="Schnell erfassen">+</button>
      <button type="button" class="tc-btn" data-open-more aria-label="Weitere Bereiche öffnen" aria-expanded="false" aria-controls="more-sheet" title="Weitere Bereiche">⋯</button>
    </div>`;
  wire(bar, state);
  refreshBadges();
  sync(state);
}

function closeAll(except = null, focusTrigger = false) {
  clearTimeout(hoverTimer);
  const bar = document.getElementById('topchrome');
  if (!bar) return;
  bar.querySelectorAll('.mega-item[data-menu]').forEach(item => {
    if (item === except) return;
    const btn = item.querySelector('.mega-trigger');
    const panel = item.querySelector('.mega-panel');
    if (panel && !panel.hidden) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      item.classList.remove('open');
      if (focusTrigger) btn.focus();
    }
  });
}

function openMenu(item, focusFirst = false) {
  closeAll(item);
  const btn = item.querySelector('.mega-trigger');
  const panel = item.querySelector('.mega-panel');
  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  item.classList.add('open');
  if (focusFirst) panel.querySelector('button')?.focus();
}

function wire(bar, state) {
  const nav = bar.querySelector('.mega-nav');
  bindDests(bar, () => closeAll());
  bar.querySelector('#megaSearch')?.addEventListener('click', () => window.EMVS.palette?.open());
  bar.querySelectorAll('[data-module-pick]').forEach(btn => {
    btn.addEventListener('click', () => { closeAll(); goModule(btn.dataset.modulePick, 'home'); });
  });

  const items = [...nav.querySelectorAll('.mega-item')];
  const triggers = () => items.map(i => i.querySelector('.mega-trigger'));
  items.forEach(item => {
    const isMenu = !!item.dataset.menu;
    const trigger = item.querySelector('.mega-trigger');
    if (isMenu) {
      trigger.addEventListener('click', () => {
        clearTimeout(hoverTimer);
        if (item.classList.contains('open')) closeAll(); else openMenu(item);
      });
      item.addEventListener('keydown', e => {
        if (e.key === 'Escape' && item.classList.contains('open')) {
          e.stopPropagation(); closeAll(null, true);
        } else if (e.key === 'ArrowDown' && e.target === trigger) {
          e.preventDefault(); openMenu(item, true);
        } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target !== trigger) {
          const links = [...item.querySelectorAll('.mega-panel button')];
          const i = links.indexOf(document.activeElement);
          if (i >= 0) {
            e.preventDefault();
            links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
          }
        }
      });
      item.addEventListener('focusout', e => {
        if (!item.contains(e.relatedTarget) && item.classList.contains('open')) closeAll();
      });
      if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        item.addEventListener('mouseenter', () => {
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => openMenu(item), 120);
        });
      }
    }
    trigger.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const list = triggers();
      const i = list.indexOf(trigger);
      e.preventDefault();
      list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length].focus();
    });
  });
  nav.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      // Keep a menu that the keyboard or a click is working in.
      if (!nav.contains(document.activeElement) || document.activeElement === document.body) closeAll();
    }, 180);
  });

  if (!outsideWired) {
    outsideWired = true;
    document.addEventListener('pointerdown', e => {
      const b = document.getElementById('topchrome');
      if (b && b.dataset.style === 'mega' && !e.target.closest('#topchrome .mega-item')) closeAll();
    });
  }
}

/** Active destination + which category contains it. */
export function sync(state) {
  const bar = document.getElementById('topchrome');
  if (!bar || bar.dataset.style !== 'mega') return;
  syncDests(bar);
  const cur = destinationIdFor(getCurrentView(), getCurrentParams());
  MEGA_MENUS.forEach(m => {
    const item = bar.querySelector(`.mega-item[data-menu="${m.id}"]`);
    if (!item || !m.groups) return;
    const has = m.groups.some(g => (g.items || []).includes(cur));
    item.querySelector('.mega-trigger')?.classList.toggle('has-active', has);
  });
  bar.querySelectorAll('.mega-subject').forEach(btn => {
    const on = state.settings.currentModuleId === btn.dataset.modulePick;
    btn.classList.toggle('is-current', on);
  });
}

export function closeMenus() { closeAll(); }

export function teardown() { closeAll(); }
