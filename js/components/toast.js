/**
 * Toast Component
 * Non-blocking notifications with an optional action or undo.
 */

let toastTimeout = null;

export function initToast() {
  window.EMVS.toast = {
    show: showToast,
    hide: hideToast
  };
}

export function showToast(message, options = {}) {
  const toast = document.getElementById('toast');
  const messageEl = document.getElementById('toast-message');
  const undoBtn = document.getElementById('toast-undo');
  const actionBtn = document.getElementById('toast-action');

  messageEl.textContent = message;

  if (options.action && actionBtn) {
    actionBtn.textContent = options.action.label || 'Öffnen';
    actionBtn.style.display = 'inline-block';
    actionBtn.onclick = () => {
      options.action.onClick?.();
      hideToast();
    };
  } else if (actionBtn) {
    actionBtn.style.display = 'none';
    actionBtn.onclick = null;
  }

  if (options.undo) {
    undoBtn.style.display = 'inline-block';
    undoBtn.onclick = () => {
      options.undo();
      hideToast();
    };
  } else {
    undoBtn.style.display = 'none';
  }

  toast.classList.add('open');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(hideToast, options.duration || 5000);
}

export function hideToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('open');
  if (toastTimeout) clearTimeout(toastTimeout);
}
