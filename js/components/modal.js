/**
 * Modal Component
 * Reusable modal dialog for create/edit forms
 */

let currentModal = null; // { resolve, reject, onClose }

export function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('modal-close');
  
  closeBtn.addEventListener('click', () => closeModal());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeModal();
    }
  });
  
  window.EMVS.modal = {
    open: openModal,
    close: closeModal
  };
}

export function openModal({ title, body, footer, onClose }) {
  return new Promise((resolve, reject) => {
    currentModal = { resolve, reject, onClose };
    
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer || '';
    
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    
    // Focus first input
    setTimeout(() => {
      const firstInput = overlay.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
    }, 50);
  });
}

export function closeModal(result) {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (currentModal) {
    try {
      if (currentModal.onClose) currentModal.onClose(result);
    } catch {}
    // Resolve with null on cancel so callers using `if (!result) return`
    // don't trigger unhandled promise rejections.
    currentModal.resolve(result === undefined ? null : result);
    currentModal = null;
  }
}

export function confirmDialog(message, title = 'Bestätigen') {
  const p = openModal({
    title,
    body: `<p style="color: var(--ink-2);">${message}</p>`,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn danger" data-action="confirm">Bestätigen</button>
    `,
    onClose: () => {}
  }).then(r => r === true).catch(() => false);

  // Wire footer buttons (openModal itself does not bind data-action buttons)
  setTimeout(() => {
    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
    document.querySelector('#modal-footer [data-action="confirm"]')?.addEventListener('click', () => closeModal(true));
  }, 50);

  return p;
}