/**
 * Focus layout — distraction-free. No navigation chrome while working:
 * only a small handle in the corner shows where you are. The full
 * navigation (the sidebar, used as an off-canvas drawer) opens on demand:
 * click the handle, press M, or dwell on the left screen edge.
 */

import { routeTitle } from '../../utils/navigation.js';
import { getCurrentView, getCurrentParams } from '../../views/router.js';

let wired = false;
let edgeTimer = null;
let openedByHover = false;
let leaveTimer = null;

const els = () => ({
  handle: document.getElementById('focus-handle'),
  edge: document.getElementById('focus-edge'),
  sidebar: document.getElementById('sidebar'),
  overlay: document.getElementById('sidebarOverlay'),
});

export function isFocusMenuOpen() {
  return els().sidebar?.classList.contains('open') === true;
}

export function setFocusMenu(open, { byHover = false } = {}) {
  const { handle, sidebar, overlay } = els();
  if (!sidebar) return;
  sidebar.classList.toggle('open', open);
  overlay?.classList.toggle('open', open);
  handle?.setAttribute('aria-expanded', String(open));
  handle?.setAttribute('aria-label', open ? 'Navigation schließen' : 'Navigation öffnen');
  openedByHover = open && byHover;
  if (open && !byHover) {
    setTimeout(() => sidebar.querySelector('.toc-item, .nav-dest, button')?.focus?.(), 60);
  } else if (!open && sidebar.contains(document.activeElement)) {
    handle?.focus();
  }
}

export function toggleFocusMenu() {
  setFocusMenu(!isFocusMenuOpen());
}

export function render(state) {
  const { handle, edge, sidebar } = els();
  if (!handle || !edge || !sidebar) return;
  handle.hidden = false;
  edge.hidden = false;
  if (!wired) {
    wired = true;
    handle.addEventListener('click', toggleFocusMenu);
    edge.addEventListener('mouseenter', () => {
      clearTimeout(edgeTimer);
      edgeTimer = setTimeout(() => { if (!isFocusMenuOpen()) setFocusMenu(true, { byHover: true }); }, 260);
    });
    const scheduleClose = () => {
      if (!openedByHover) return;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        if (openedByHover && !sidebar.contains(document.activeElement)) setFocusMenu(false);
      }, 450);
    };
    edge.addEventListener('mouseleave', () => { clearTimeout(edgeTimer); scheduleClose(); });
    sidebar.addEventListener('mouseleave', scheduleClose);
    // Moving from the edge into the opened menu keeps it open.
    sidebar.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
  }
  sync(state);
}

export function sync(state) {
  const { handle } = els();
  if (!handle) return;
  const t = routeTitle(getCurrentView(), getCurrentParams(), state);
  const label = handle.querySelector('.focus-where');
  if (label) label.textContent = t.sub ? `${t.title} · ${t.sub}` : t.title;
}

export function teardown() {
  const { handle, edge } = els();
  clearTimeout(edgeTimer);
  clearTimeout(leaveTimer);
  if (handle) handle.hidden = true;
  if (edge) edge.hidden = true;
  openedByHover = false;
}
