/**
 * Navigation shell — renders every presentation from one registry
 * (utils/navConfig.js) and keeps them in sync.
 *
 * Presentations:
 * - Desktop 'full'      labelled sidebar: primary, current module, Lernen, system
 * - Desktop 'rail'      compact icon rail; module + "Mehr" as popovers
 * - Desktop 'workspace' rail + collapsible module panel
 * - Desktop 'topbar'    horizontal bar with "Mehr" + module dropdowns, context row
 * - Desktop 'dock'      floating pill; module + "Mehr" popovers open upward
 * - Mobile (≤780px)     contextual header (Back + title) + tabbar + "Mehr" sheet
 *
 * Destinations are real links (<a href="#/…">), so browser history,
 * deep links, middle-click and keyboard activation work without
 * per-item handlers. Actions use one delegated click listener bound once.
 */

import { getCurrentView, getCurrentParams } from '../views/router.js';
import { getNavState } from '../utils/navigation.js';
import { getNavLayout, setNavLayoutSetting } from '../utils/navLayout.js';
import {
  PRIMARY_DESTINATIONS, SECONDARY_DESTINATIONS, SYSTEM_DESTINATIONS,
  MODULE_TAB_ICONS, MOBILE_MAX_WIDTH,
  getActiveDestinations, getRouteContext, getEffectiveNavLayout, moduleTabHash,
} from '../utils/navConfig.js';
import { MODULE_TABS } from '../utils/navigation.js';
import { icon } from './icons.js';
import { initNavMenus, closeMenu } from './navMenu.js';
import { objectiveProgressPercent } from '../utils/dashboard.js';
import { openQuickCapture } from '../views/captures.js';

const MODULE_TAB_LABELS = { home: 'Übersicht', ziele: 'Lernziele', plan: 'Plan', sessions: 'Sitzungen', material: 'Material' };

let lastModuleId = null;
let lastLayout = null;
let isMobile = false;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getState() {
  return window.EMVS.getState();
}

function isMac() {
  try { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); } catch { return false; }
}

/* ---------- accent from current module ---------- */

function hexToRgb(hex) {
  const value = String(hex || '#b45309').replace('#', '');
  const safe = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
  const num = Number.parseInt(safe, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function mixHex(hex, targetHex, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  const mix = (s, e) => Math.round(s + (e - s) * amount);
  const h = v => v.toString(16).padStart(2, '0');
  return `#${h(mix(a.r, b.r))}${h(mix(a.g, b.g))}${h(mix(a.b, b.b))}`;
}
function readableOn(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.64 ? '#1c1917' : '#ffffff';
}
function applyModuleAccent(state) {
  const mod = state.modules.find(m => m.id === state.settings.currentModuleId) || state.modules[0];
  const accent = mod?.accent || '#b45309';
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', mixHex(accent, '#ffffff', 0.82));
  root.style.setProperty('--accent-ink', mixHex(accent, '#1c1917', 0.35));
  root.style.setProperty('--on-accent', readableOn(accent));
}

/* ---------- shared fragments ---------- */

function badgeHtml(d) {
  return d.badge ? `<span class="nav-badge" data-badge="${d.badge}" hidden></span>` : '';
}

/** One destination link. `variant` only changes classes, never structure. */
function destLink(d, { label = d.label, kbd = false, extraClass = '' } = {}) {
  const hint = d.shortcut ? ` (Taste ${d.shortcut})` : '';
  return `<a class="nav-item ${extraClass}" href="${d.hash}" data-dest="${d.id}" title="${esc(d.label + hint)}">
    <span class="nav-ico">${icon(d.icon)}</span><span class="nav-lb">${esc(label)}</span>${badgeHtml(d)}${kbd && d.shortcut ? `<kbd class="nav-kbd" aria-hidden="true">${d.shortcut}</kbd>` : ''}
  </a>`;
}

function destList(list, opts = {}) {
  return `<ul class="nav-list" role="list">${list.map(d => `<li>${destLink(d, typeof opts === 'function' ? opts(d) : opts)}</li>`).join('')}</ul>`;
}

function captureButton(extraClass = '', { label = 'Erfassen', showLabel = true } = {}) {
  return `<button type="button" class="nav-capture ${extraClass}" data-nav-action="capture" title="Schnell erfassen (Taste C)" aria-label="Schnell erfassen: Frage, Fehler oder Gedanke festhalten">
    ${icon('plus', { size: 18 })}${showLabel ? `<span class="nav-lb">${label}</span>` : ''}
  </button>`;
}

function searchButton(extraClass = '', { showLabel = true } = {}) {
  const k = isMac() ? '⌘K' : 'Strg K';
  return `<button type="button" class="nav-item nav-search ${extraClass}" data-nav-action="search" title="Suchen und Befehle (${k})" aria-label="Suchen und Befehle (${k})">
    <span class="nav-ico">${icon('search')}</span>${showLabel ? `<span class="nav-lb">Suchen</span><kbd class="nav-kbd" aria-hidden="true">${k}</kbd>` : ''}
  </button>`;
}

function moduleProgress(state, moduleId) {
  const objs = (state.learningObjectives || []).filter(o => o.moduleId === moduleId);
  const done = objs.filter(o => o.status === 'done').length;
  return { done, total: objs.length, pct: objectiveProgressPercent(done, objs.length) };
}

/**
 * Current module (Übersicht + 4 tabs) and switcher — identical markup in
 * the full sidebar, workspace panel, popovers and the mobile sheet.
 */
function moduleNavHtml(state, cur, { headingTag = 'h2', withSwitcher = true } = {}) {
  if (!state.modules.length) {
    return `<p class="nav-empty">Noch keine Module. <a href="#/module">Erstes Modul anlegen</a></p>`;
  }
  let html = '';
  if (cur) {
    html += `<ul class="nav-list nav-mod-tabs" role="list" aria-label="Bereiche von Modul ${esc(cur.code)}">
      ${MODULE_TABS.map(t => `<li><a class="nav-item" href="${moduleTabHash(cur.id, t.key)}" data-mtab="${t.key}" data-module="${esc(cur.id)}" title="${esc(MODULE_TAB_LABELS[t.key])} — Modul ${esc(cur.code)}">
        <span class="nav-ico">${icon(MODULE_TAB_ICONS[t.key])}</span><span class="nav-lb">${esc(MODULE_TAB_LABELS[t.key])}</span></a></li>`).join('')}
    </ul>`;
  }
  const others = state.modules.filter(m => !cur || m.id !== cur.id);
  if (withSwitcher && others.length) {
    html += `<${headingTag} class="nav-label">Modul wechseln</${headingTag}>
      <ul class="nav-list" role="list">
        ${others.map(m => `<li><a class="nav-item nav-mod-pick" href="${moduleTabHash(m.id, 'home')}" title="Zu Modul ${esc(m.code)} — ${esc(m.title)}">
          <span class="nav-mod-dot" style="background:${esc(m.accent || 'var(--ink-3)')}" aria-hidden="true"></span>
          <span class="nav-lb"><span class="nav-mod-code">${esc(m.code)}</span> ${esc(m.title)}</span></a></li>`).join('')}
      </ul>`;
  }
  return html;
}

function moduleHeadHtml(cur) {
  if (!cur) return '';
  return `<div class="nav-mod-head">
    <span class="nav-mod-dot" aria-hidden="true"></span>
    <span class="nav-mod-head-text"><span class="nav-mod-code">Modul ${esc(cur.code)}</span><span class="nav-mod-title">${esc(cur.title)}</span></span>
  </div>`;
}

function secondaryHtml(headingTag = 'h2', { includeSystem = true, includeSearch = false } = {}) {
  return `<${headingTag} class="nav-label">Lernen</${headingTag}>
    ${destList(SECONDARY_DESTINATIONS)}
    ${includeSystem ? `<div class="nav-sep" role="separator"></div>${destList(SYSTEM_DESTINATIONS)}` : ''}
    ${includeSearch ? `<div class="nav-sep" role="separator"></div>${searchButton()}` : ''}`;
}

/* ---------- presentations ---------- */

function renderSidebar(state, layout, cur) {
  const el = document.getElementById('sidebar');
  if (!el) return;
  const full = layout === 'full';
  const workspace = layout === 'workspace';
  const panelOpen = workspace && !state.settings.navPanelCollapsed;
  el.className = `sidebar sb-${full ? 'full' : 'rail'}`;

  const toggle = (layout === 'full' || layout === 'rail')
    ? `<button type="button" class="sb-toggle" data-nav-action="toggle-rail" aria-pressed="${full}" title="${full ? 'Seitenleiste einklappen' : 'Seitenleiste erweitern'}" aria-label="${full ? 'Seitenleiste einklappen' : 'Seitenleiste erweitern'}">${icon(full ? 'collapse' : 'expand')}</button>`
    : '';

  let moduleBlock;
  if (full) {
    moduleBlock = `<section class="sb-section" aria-labelledby="sb-mod-label">
      <h2 class="nav-label" id="sb-mod-label">Aktuelles Modul</h2>
      ${cur ? `<a class="nav-item nav-mod-home" href="${moduleTabHash(cur.id, 'home')}" data-mtab="home" data-module="${esc(cur.id)}" title="Modul ${esc(cur.code)} — ${esc(cur.title)}">
          <span class="nav-mod-dot" aria-hidden="true"></span>
          <span class="nav-lb"><span class="nav-mod-code">Modul ${esc(cur.code)}</span><span class="nav-mod-title">${esc(cur.title)}</span></span>
        </a>` : ''}
      ${moduleNavHtml(state, cur, { headingTag: 'h3' })}
    </section>
    <nav class="sb-section" aria-labelledby="sb-learn-label">
      <h2 class="nav-label" id="sb-learn-label">Lernen</h2>
      ${destList(SECONDARY_DESTINATIONS)}
    </nav>`;
  } else if (workspace) {
    moduleBlock = state.modules.length ? `<button type="button" class="nav-item sb-mod-trigger" data-nav-action="toggle-panel" data-module-trigger aria-controls="workspace-panel" aria-expanded="${panelOpen}" title="${panelOpen ? 'Modul-Panel einklappen' : 'Modul-Panel öffnen'}">
        <span class="nav-ico">${icon('panel')}</span><span class="nav-lb">${cur ? esc(cur.code) : 'Modul'}</span>
      </button>` : '';
  } else {
    moduleBlock = state.modules.length ? `<button type="button" class="nav-item sb-mod-trigger" data-menu-trigger data-module-trigger aria-controls="pop-rail-module" aria-expanded="false" aria-haspopup="true" data-placement="right-start" title="Aktuelles Modul und Modulwechsel">
        <span class="nav-mod-dot" aria-hidden="true"></span><span class="nav-lb">${cur ? esc(cur.code) : 'Modul'}</span>
      </button>` : '';
  }

  const moreBlock = full ? '' : `<button type="button" class="nav-item sb-more" data-menu-trigger data-more-trigger aria-controls="pop-rail-more" aria-expanded="false" aria-haspopup="true" data-placement="right-start" title="Weitere Bereiche">
      <span class="nav-ico">${icon('more')}</span><span class="nav-lb">Mehr</span>
    </button>`;

  el.innerHTML = `
    <div class="sb-head">
      <a class="brand" href="#/heute" aria-label="EMVS Study Hub — zu Heute"><span class="brand-mark">EMVS</span><span class="brand-sub">study hub</span></a>
      ${toggle}
    </div>
    ${captureButton('sb-capture', { showLabel: true })}
    <nav class="sb-section sb-primary" aria-label="Hauptnavigation">
      ${destList(PRIMARY_DESTINATIONS, { kbd: full })}
    </nav>
    ${!full ? '<div class="nav-sep" role="separator"></div>' : ''}
    ${moduleBlock}
    ${moreBlock}
    <div class="sb-foot">
      ${searchButton('', { showLabel: true })}
      ${full ? destList(SYSTEM_DESTINATIONS) : ''}
    </div>`;
}

function renderWorkspacePanel(state, layout, cur) {
  const panel = document.getElementById('workspace-panel');
  if (!panel) return;
  const show = layout === 'workspace' && !state.settings.navPanelCollapsed;
  panel.hidden = !show;
  if (!show) { panel.innerHTML = ''; return; }
  const prog = cur ? moduleProgress(state, cur.id) : null;
  panel.innerHTML = `
    <div class="ws-head">
      <div class="ws-head-text">
        <p class="nav-label">Aktuelles Modul</p>
        ${cur
          ? `<a class="ws-title" href="${moduleTabHash(cur.id, 'home')}">Modul ${esc(cur.code)}</a><p class="ws-sub">${esc(cur.title)}</p>`
          : `<p class="ws-title">Kein Modul</p><p class="ws-sub">Lege ein Modul an, um zu starten.</p>`}
      </div>
      <button type="button" class="ws-close" data-nav-action="toggle-panel" aria-controls="workspace-panel" aria-expanded="true" aria-label="Modul-Panel einklappen" title="Modul-Panel einklappen">${icon('collapse')}</button>
    </div>
    ${prog && prog.total ? `
      <div class="ws-progress" role="img" aria-label="${prog.done} von ${prog.total} Lernzielen gemeistert">
        <div class="ws-progress-meta"><span>Fortschritt</span><strong>${prog.pct}%</strong></div>
        <div class="ws-progress-line"><span style="width:${prog.pct}%"></span></div>
      </div>` : ''}
    <nav class="ws-body" aria-label="Modulnavigation">${moduleNavHtml(state, cur, { headingTag: 'h2' })}</nav>`;
}

function moduleChipLabel(cur) {
  return cur ? `Modul ${esc(cur.code)}` : 'Modul';
}

function renderTopbar(state, cur) {
  const el = document.getElementById('topbar');
  if (!el) return;
  el.innerHTML = `
    <div class="tb-row">
      <a class="brand" href="#/heute" aria-label="EMVS Study Hub — zu Heute"><span class="brand-mark">EMVS</span></a>
      <nav class="tb-nav" aria-label="Hauptnavigation">
        ${destList(PRIMARY_DESTINATIONS)}
        <button type="button" class="nav-item tb-more" data-menu-trigger data-more-trigger aria-controls="pop-top-more" aria-expanded="false" aria-haspopup="true" data-placement="bottom-start">
          <span class="nav-lb">Mehr</span>${icon('chevronDown', { size: 14, className: 'nav-chev' })}
        </button>
      </nav>
      <div class="tb-actions">
        ${searchButton('tb-icon', { showLabel: false })}
        ${state.modules.length ? `<button type="button" class="tb-mod" data-menu-trigger data-module-trigger aria-controls="pop-top-module" aria-expanded="false" aria-haspopup="true" data-placement="bottom-end" title="${cur ? esc(`Modul ${cur.code} — ${cur.title}`) : 'Modul wählen'}">
          <span class="nav-mod-dot" aria-hidden="true"></span><span class="tb-mod-lb">${moduleChipLabel(cur)}</span>${icon('chevronDown', { size: 14, className: 'nav-chev' })}
        </button>` : ''}
        ${captureButton('tb-capture')}
        <a class="nav-item tb-icon" href="#/einstellungen" data-dest="settings" title="Einstellungen (Taste 7)" aria-label="Einstellungen"><span class="nav-ico">${icon('settings')}</span></a>
      </div>
    </div>
    <div class="tb-context" id="tb-context" hidden></div>`;
}

function renderDock(state, cur) {
  const el = document.getElementById('dock');
  if (!el) return;
  el.innerHTML = `
    ${destList(PRIMARY_DESTINATIONS, d => ({ label: d.short }))}
    <span class="dock-sep" aria-hidden="true"></span>
    ${state.modules.length ? `<button type="button" class="dock-btn dock-mod" data-menu-trigger data-module-trigger aria-controls="pop-dock-module" aria-expanded="false" aria-haspopup="true" data-placement="top-center" title="${cur ? esc(`Modul ${cur.code} — ${cur.title}`) : 'Modul wählen'}">
      <span class="nav-mod-dot" aria-hidden="true"></span><span class="dock-mod-lb">${cur ? esc(cur.code) : 'Modul'}</span>
    </button>` : ''}
    ${captureButton('dock-capture', { showLabel: false })}
    <button type="button" class="dock-btn" data-menu-trigger data-more-trigger aria-controls="pop-dock-more" aria-expanded="false" aria-haspopup="true" data-placement="top-end" aria-label="Weitere Bereiche" title="Weitere Bereiche">
      ${icon('more')}
    </button>`;
}

function renderPopovers(state, cur) {
  const host = document.getElementById('nav-popovers');
  if (!host) return;
  const moduleMenu = id => `<div class="nav-pop" id="${id}" hidden>
      ${moduleHeadHtml(cur)}
      ${moduleNavHtml(state, cur, { headingTag: 'p' })}
      <div class="nav-sep" role="separator"></div>
      <ul class="nav-list" role="list"><li>${destLink(PRIMARY_DESTINATIONS[1], { label: 'Alle Module' })}</li></ul>
    </div>`;
  const moreMenu = (id, opts) => `<div class="nav-pop" id="${id}" hidden>${secondaryHtml('p', opts)}</div>`;
  host.innerHTML = [
    moduleMenu('pop-rail-module'),
    moreMenu('pop-rail-more', { includeSystem: true }),
    moduleMenu('pop-top-module'),
    moreMenu('pop-top-more', { includeSystem: false }),
    moduleMenu('pop-dock-module'),
    moreMenu('pop-dock-more', { includeSystem: true, includeSearch: true }),
  ].join('');
}

function renderMobile(state, cur) {
  const header = document.getElementById('mobile-header');
  if (header) {
    header.innerHTML = `
      <div class="mh-lead" id="mh-lead"></div>
      <div class="mh-title-wrap"><p class="mh-sub" id="mh-sub"></p><p class="mh-title" id="mh-title">EMVS</p></div>
      <div class="mh-actions">
        <button type="button" class="icon-btn" data-nav-action="search" aria-label="Suchen und Befehle">${icon('search', { size: 20 })}</button>
        <button type="button" class="icon-btn" id="moreBtn" data-nav-action="more" data-more-trigger aria-label="Weitere Bereiche" aria-expanded="false" aria-controls="more-sheet" aria-haspopup="dialog">${icon('more', { size: 20 })}</button>
      </div>`;
  }
  const tabbar = document.getElementById('tabbar');
  if (tabbar) {
    const [a, b, c, d] = PRIMARY_DESTINATIONS;
    const tab = x => `<li>${destLink(x, { label: x.short, extraClass: 'tab' })}</li>`;
    tabbar.innerHTML = `<ul class="tab-list" role="list">
      ${tab(a)}${tab(b)}
      <li>${captureButton('tab-capture', { showLabel: false })}</li>
      ${tab(c)}${tab(d)}
    </ul>`;
  }
  const body = document.getElementById('more-sheet-body');
  if (body) {
    body.innerHTML = `
      ${state.modules.length ? `<section class="sheet-section" aria-labelledby="sheet-mod-label">
        <h3 class="nav-label" id="sheet-mod-label">Aktuelles Modul</h3>
        ${moduleHeadHtml(cur)}
        ${moduleNavHtml(state, cur, { headingTag: 'h3' })}
      </section>` : ''}
      <nav class="sheet-section" aria-label="Weitere Bereiche">${secondaryHtml('h3')}</nav>`;
  }
}

/* ---------- public API ---------- */

export function renderNavShell() {
  const state = getState();
  const view = getCurrentView();
  const params = getCurrentParams();
  const nav = getNavState(view, params, state.settings.currentModuleId);
  const cur = state.modules.find(m => m.id === nav.moduleId) || null;
  const layout = getNavLayout(state);
  isMobile = getEffectiveNavLayout(layout, window.innerWidth) === 'mobile';

  closeMenu({ restoreFocus: false });
  applyModuleAccent(state);
  document.body.dataset.navlayout = layout;
  document.body.dataset.navmode = isMobile ? 'mobile' : 'desktop';

  renderSidebar(state, layout, cur);
  renderWorkspacePanel(state, layout, cur);
  renderTopbar(state, cur);
  renderDock(state, cur);
  renderPopovers(state, cur);
  renderMobile(state, cur);

  lastModuleId = nav.moduleId || null;
  lastLayout = layout;
  syncNav();
}

function setCurrent(el, current, parent) {
  el.classList.toggle('is-current', current);
  el.classList.toggle('is-parent', !current && parent);
  if (current) el.setAttribute('aria-current', 'page');
  else if (parent) el.setAttribute('aria-current', 'true');
  else el.removeAttribute('aria-current');
}

/** Sync active states, context header and breadcrumbs with the route. */
export function syncNav() {
  const state = getState();
  const view = getCurrentView();
  const params = getCurrentParams();
  const nav = getNavState(view, params, state.settings.currentModuleId);
  if ((nav.moduleId || null) !== lastModuleId || getNavLayout(state) !== lastLayout) {
    renderNavShell();
    return;
  }
  const active = getActiveDestinations(view);

  document.querySelectorAll('[data-dest]').forEach(el => {
    const id = el.dataset.dest;
    setCurrent(el, id === active.current, id === active.parent);
  });
  document.querySelectorAll('[data-mtab]').forEach(el => {
    const on = view === 'module' && el.dataset.module === nav.moduleId && el.dataset.mtab === nav.moduleTab;
    setCurrent(el, on, false);
  });
  document.querySelectorAll('[data-more-trigger]').forEach(el => el.classList.toggle('has-active', active.inSecondary));
  document.querySelectorAll('[data-module-trigger]').forEach(el => el.classList.toggle('has-active', view === 'module'));

  const ctx = getRouteContext(view, params, state);

  // Upper: context row (breadcrumbs) only for nested routes.
  const tbCtx = document.getElementById('tb-context');
  if (tbCtx) {
    const nested = ctx.crumbs.length > 1;
    tbCtx.hidden = !nested;
    tbCtx.innerHTML = nested ? `<nav aria-label="Brotkrumen"><ol class="crumbs">
      ${ctx.crumbs.map((c, i) => i === ctx.crumbs.length - 1
        ? `<li><span aria-current="page">${esc(c.label)}</span></li>`
        : `<li><a href="${c.hash}">${esc(c.label)}</a>${icon('chevronRight', { size: 14, className: 'crumb-sep' })}</li>`).join('')}
    </ol></nav>` : '';
  }

  // Mobile: Back on nested routes, brand on roots.
  const lead = document.getElementById('mh-lead');
  if (lead) {
    lead.innerHTML = ctx.back
      ? `<a class="mh-back" href="${ctx.back.hash}" aria-label="Zurück zu ${esc(ctx.back.label)}">${icon('back', { size: 22 })}</a>`
      : `<a class="mh-brand" href="#/heute" aria-label="EMVS Study Hub — zu Heute">EMVS</a>`;
  }
  const title = document.getElementById('mh-title');
  const sub = document.getElementById('mh-sub');
  if (title) {
    title.textContent = ctx.back ? ctx.title : '';
    title.hidden = !ctx.back;
  }
  if (sub) {
    sub.textContent = ctx.back ? (ctx.subtitle || '') : '';
    sub.hidden = !ctx.back || !ctx.subtitle;
  }

  window.EMVS?.tabbar?.updateBadges?.();
}

/** Persist and apply a desktop layout immediately, keeping the current view. */
export function setNavLayout(layout) {
  const state = getState();
  if (!setNavLayoutSetting(state, layout)) return false;
  window.EMVS.save();
  renderNavShell();
  return true;
}

function togglePanel() {
  const state = getState();
  state.settings.navPanelCollapsed = !state.settings.navPanelCollapsed;
  window.EMVS.save();
  renderNavShell();
  const target = state.settings.navPanelCollapsed
    ? document.querySelector('#sidebar [data-nav-action="toggle-panel"]')
    : document.querySelector('#workspace-panel .ws-close');
  target?.focus();
}

function onAction(e) {
  const btn = e.target.closest('[data-nav-action]');
  if (!btn) return;
  const action = btn.dataset.navAction;
  if (action === 'capture') {
    const st = getState();
    openQuickCapture({ moduleId: st.settings.currentModuleId || null });
  } else if (action === 'search') {
    window.EMVS.tabbar?.closeMore?.({ restoreFocus: false });
    window.EMVS.palette?.open();
  } else if (action === 'more') {
    window.EMVS.tabbar?.openMore?.();
  } else if (action === 'toggle-rail') {
    const next = getNavLayout(getState()) === 'full' ? 'rail' : 'full';
    setNavLayout(next);
    document.querySelector('#sidebar [data-nav-action="toggle-rail"]')?.focus();
  } else if (action === 'toggle-panel') {
    togglePanel();
  }
}

export function closeNavChrome() {
  closeMenu({ restoreFocus: false });
  window.EMVS?.tabbar?.closeMore?.({ restoreFocus: false });
}

let bound = false;
export function initNavShell() {
  if (bound) return;
  bound = true;
  initNavMenus();
  document.addEventListener('click', onAction);
  // Switching between mobile and desktop models never changes the stored
  // desktop preference; the shell just re-renders for the new model.
  const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
  mq.addEventListener?.('change', () => {
    closeNavChrome();
    renderNavShell();
  });
  window.EMVS.navShell = { render: renderNavShell, sync: syncNav, setLayout: setNavLayout, close: closeNavChrome };
}

export function isMobileNav() {
  return isMobile;
}
