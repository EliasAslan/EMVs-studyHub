/**
 * Focus trap utility — traps Tab within an open container,
 * returns focus to the trigger on close. Escape closes topmost.
 */

let trapStack = [];

function focusables(container) {
  return [...container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null || el === document.activeElement);
}

function onKey(e) {
  const top = trapStack[trapStack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.stopPropagation();
    top.close();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = focusables(top.container);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function trapFocus(container, { onClose } = {}) {
  const trigger = document.activeElement;
  const entry = {
    container,
    close: () => {
      releaseTrap(entry);
      onClose?.();
      trigger?.focus?.();
    },
  };
  trapStack.push(entry);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => {
    const items = focusables(container);
    (items[0] || container).focus?.();
  }, 30);
  return entry;
}

export function releaseTrap(entry) {
  trapStack = trapStack.filter(t => t !== entry);
  if (!trapStack.length) document.removeEventListener('keydown', onKey, true);
}

export function closeTopTrap() {
  trapStack[trapStack.length - 1]?.close();
}
