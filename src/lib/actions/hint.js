/**
 * Accessible hint tooltip.
 *
 *   <button use:hint={{ text: 'Fokusmodus beenden', shortcut: 'Esc' }}>
 *
 * Hover shows after a short delay; keyboard focus shows immediately. The
 * tooltip is rendered in a fixed layer so it is not clipped by cards, and it
 * is linked through aria-describedby. Touch devices skip hover hints.
 */

const HOVER_DELAY = 350;
const HIDE_DELAY = 100;
const GAP = 8;
let counter = 0;

function normalize(value) {
  if (typeof value === 'string') return { text: value };
  return value || {};
}

export function hint(node, options = {}) {
  let opts = normalize(options);
  let tooltip = null;
  let showTimer = null;
  let hideTimer = null;
  let visible = false;
  const id = `hint-${++counter}`;
  const previousDescribedBy = node.getAttribute('aria-describedby');

  function create() {
    if (tooltip) return;
    tooltip = document.createElement('div');
    tooltip.className = 'hint-tooltip';
    tooltip.id = id;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    node.setAttribute('aria-describedby', previousDescribedBy ? `${previousDescribedBy} ${id}` : id);
  }

  function render() {
    if (!tooltip) return;
    tooltip.replaceChildren();
    if (opts.text) {
      const text = document.createElement('span');
      text.textContent = opts.text;
      tooltip.appendChild(text);
    }
    if (opts.shortcut) {
      const kbd = document.createElement('kbd');
      kbd.className = 'hint-kbd';
      kbd.textContent = opts.shortcut;
      tooltip.appendChild(kbd);
    }
  }

  function position() {
    if (!tooltip || tooltip.hidden) return;
    const rect = node.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fitsTop = rect.top >= tip.height + GAP;
    const fitsBottom = vh - rect.bottom >= tip.height + GAP;
    let placement = opts.placement || 'top';
    if (placement === 'top' && !fitsTop && fitsBottom) placement = 'bottom';
    if (placement === 'bottom' && !fitsBottom && fitsTop) placement = 'top';

    let top = placement === 'top' ? rect.top - tip.height - GAP : rect.bottom + GAP;
    let left = rect.left + rect.width / 2 - tip.width / 2;
    left = Math.max(GAP, Math.min(left, vw - tip.width - GAP));
    top = Math.max(GAP, Math.min(top, vh - tip.height - GAP));

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.dataset.placement = placement;
  }

  function show(immediate = false) {
    if (!opts.text) return;
    create();
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    const reveal = () => {
      if (!tooltip) return;
      render();
      tooltip.hidden = false;
      visible = true;
      position();
    };
    if (immediate) reveal();
    else showTimer = setTimeout(reveal, HOVER_DELAY);
  }

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (!tooltip) return;
    visible = false;
    hideTimer = setTimeout(() => {
      if (!visible && tooltip) tooltip.hidden = true;
    }, HIDE_DELAY);
  }

  const canHover = () => window.matchMedia?.('(hover: hover)').matches;

  function onEnter() {
    if (canHover()) show(false);
  }
  function onLeave() {
    hide();
  }
  function onFocus() {
    if (node.matches?.(':focus-visible')) show(true);
  }
  function onBlur() {
    hide();
  }
  function onKeydown(event) {
    if (event.key === 'Escape' && visible) {
      event.stopPropagation();
      hide();
    }
  }
  function onScroll() {
    if (visible) position();
  }
  function onResize() {
    if (visible) position();
  }

  node.addEventListener('pointerenter', onEnter);
  node.addEventListener('pointerleave', onLeave);
  node.addEventListener('focusin', onFocus);
  node.addEventListener('focusout', onBlur);
  node.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  return {
    update(next) {
      opts = normalize(next);
      if (!opts.text) {
        hide();
        return;
      }
      if (visible) {
        render();
        position();
      }
    },
    destroy() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('focusin', onFocus);
      node.removeEventListener('focusout', onBlur);
      node.removeEventListener('keydown', onKeydown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      if (previousDescribedBy) node.setAttribute('aria-describedby', previousDescribedBy);
      else node.removeAttribute('aria-describedby');
      tooltip?.remove();
      tooltip = null;
    },
  };
}
