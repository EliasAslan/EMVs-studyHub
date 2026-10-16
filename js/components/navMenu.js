/**
 * Accessible popover menus for the nav shell (Upper dropdowns, Dock and
 * rail "Mehr"/module popovers).
 *
 * - One menu open at a time; trigger gets aria-expanded.
 * - Click, Enter/Space/ArrowDown open; Escape closes and returns focus.
 * - Arrow keys / Home / End move between items; Tab closes naturally.
 * - Outside click closes; position is clamped to the viewport and
 *   recomputed on resize/scroll.
 * Event listeners are bound once at document level (no per-render leaks).
 */

let openState = null; // { trigger, panel }

function items(panel) {
  return [...panel.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.offsetParent !== null);
}

function place(trigger, panel) {
  const placement = panel.dataset.placement || 'bottom-start';
  panel.style.left = '0px';
  panel.style.top = '0px';
  const t = trigger.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top;
  let left;
  if (placement.startsWith('top')) top = t.top - p.height - 8;
  else if (placement.startsWith('right')) top = t.top;
  else top = t.bottom + 6;
  if (placement.startsWith('right')) left = t.right + 8;
  else if (placement.endsWith('end')) left = t.right - p.width;
  else if (placement.endsWith('center')) left = t.left + t.width / 2 - p.width / 2;
  else left = t.left;
  // Flip vertically if it would leave the viewport.
  if (top + p.height > vh - margin && placement.startsWith('bottom')) top = t.top - p.height - 6;
  if (top < margin && placement.startsWith('top')) top = t.bottom + 6;
  left = Math.min(Math.max(margin, left), vw - p.width - margin);
  top = Math.min(Math.max(margin, top), Math.max(margin, vh - p.height - margin));
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.maxHeight = `${Math.max(160, vh - margin * 2)}px`;
}

export function openMenu(trigger, { focus = 'first' } = {}) {
  const panel = document.getElementById(trigger.getAttribute('aria-controls'));
  if (!panel) return;
  if (openState && openState.trigger === trigger) return;
  closeMenu({ restoreFocus: false });
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  openState = { trigger, panel };
  place(trigger, panel);
  const list = items(panel);
  const current = panel.querySelector('[aria-current="page"]');
  const target = focus === 'last' ? list[list.length - 1] : (current || list[0]);
  target?.focus({ preventScroll: true });
}

export function closeMenu({ restoreFocus = true } = {}) {
  if (!openState) return;
  const { trigger, panel } = openState;
  openState = null;
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
}

export function isMenuOpen() {
  return !!openState;
}

function onClick(e) {
  const trigger = e.target.closest('[data-menu-trigger]');
  if (trigger) {
    e.preventDefault();
    if (openState && openState.trigger === trigger) closeMenu();
    else openMenu(trigger);
    return;
  }
  if (!openState) return;
  if (openState.panel.contains(e.target)) {
    // Activating an item closes the menu; the link/handler does the rest.
    if (e.target.closest('a[href], button')) closeMenu({ restoreFocus: false });
    return;
  }
  closeMenu({ restoreFocus: false });
}

function onKeydown(e) {
  const trigger = e.target.closest?.('[data-menu-trigger]');
  if (trigger && !openState && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    openMenu(trigger, { focus: e.key === 'ArrowUp' ? 'last' : 'first' });
    return;
  }
  if (!openState) return;
  const { panel } = openState;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    return;
  }
  if (!panel.contains(document.activeElement)) return;
  const list = items(panel);
  const idx = list.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); list[(idx + 1) % list.length]?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); list[(idx - 1 + list.length) % list.length]?.focus(); }
  else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
  else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
  else if (e.key === 'Tab') closeMenu({ restoreFocus: false });
}

function reposition() {
  if (openState) place(openState.trigger, openState.panel);
}

let bound = false;
export function initNavMenus() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', onClick);
  // Capture phase so Escape closes the menu before app-level handlers.
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', reposition, true);
}
