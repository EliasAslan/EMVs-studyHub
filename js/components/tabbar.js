/**
 * Mobile chrome behaviour: "Mehr" sheet (focus-trapped dialog), tabbar
 * hide-on-scroll and badge counts shared by every presentation.
 * Markup is rendered by navShell.js from the navigation registry.
 */
import { trapFocus, releaseTrap } from './focusTrap.js';
import { getDueObjectives } from '../utils/helpers.js';

let moreTrap = null;
let moreTrigger = null;

export function initTabbar() {
  document.getElementById('more-close')?.addEventListener('click', () => closeMore());
  document.getElementById('more-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'more-overlay') closeMore();
  });

  // Hide tabbar on scroll down, show on scroll up (more reading room)
  const main = document.getElementById('main');
  let lastY = 0;
  main?.addEventListener('scroll', () => {
    const bar = document.getElementById('tabbar');
    if (!bar) return;
    const y = main.scrollTop;
    if (y > lastY + 8 && y > 140) bar.classList.add('hide');
    else if (y < lastY - 8) bar.classList.remove('hide');
    lastY = y;
  }, { passive: true });

  window.EMVS.tabbar = { updateBadges, openMore, closeMore };
  updateBadges();
}

export function updateBadges() {
  try {
    const st = window.EMVS.getState();
    const due = getDueObjectives(st).length;
    setBadge('weak', due, `${due} fällige Wiederholungen`);
    const soon = (st.exams || []).filter(e => {
      if (!e.date) return false;
      const d = Math.ceil((new Date(e.date + 'T08:00:00') - Date.now()) / 86400000);
      return d >= 0 && d <= 14;
    }).length;
    setBadge('exam', soon, `${soon} Prüfungen in den nächsten 14 Tagen`);
  } catch {}
}

/** Every presentation shares the data-badge hook, so counts never diverge. */
function setBadge(kind, n, label) {
  document.querySelectorAll(`[data-badge="${kind}"]`).forEach(b => {
    b.hidden = n === 0;
    b.textContent = n > 9 ? '9+' : String(n);
    b.setAttribute('title', label);
    // Announce the count as part of the link name, not as a live region.
    let sr = b.nextElementSibling;
    if (!sr || !sr.classList.contains('sr-only')) {
      sr = document.createElement('span');
      sr.className = 'sr-only';
      b.after(sr);
    }
    sr.textContent = n === 0 ? '' : `, ${label}`;
    b.setAttribute('aria-hidden', 'true');
  });
}

export function openMore() {
  const ov = document.getElementById('more-overlay');
  if (!ov || ov.classList.contains('open')) return;
  moreTrigger = document.activeElement;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  document.getElementById('moreBtn')?.setAttribute('aria-expanded', 'true');
  moreTrap = trapFocus(document.getElementById('more-sheet'), { onClose: () => closeMore() });
  const current = ov.querySelector('[aria-current="page"]');
  (current || ov.querySelector('a[href], button'))?.focus?.();
}

export function closeMore({ restoreFocus = true } = {}) {
  const ov = document.getElementById('more-overlay');
  if (!ov || !ov.classList.contains('open')) return;
  const t = moreTrap;
  moreTrap = null;
  if (t) releaseTrap(t);
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
  document.getElementById('moreBtn')?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) (moreTrigger?.isConnected ? moreTrigger : document.getElementById('moreBtn'))?.focus?.();
  moreTrigger = null;
}
