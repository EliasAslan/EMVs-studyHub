/**
 * Bottom tabbar + More sheet wiring.
 * Tabs: Heute / Module / + Erfassen (FAB) / Schwach / Prüfungen
 * Secondary views live in the More sheet + header.
 * Capture ([data-capture]) and More ([data-open-more]) triggers are shared
 * by every navigation layout.
 */
import { navigate, getCurrentView } from '../views/router.js';
import { openQuickCapture } from '../views/captures.js';
import { trapFocus, releaseTrap } from './focusTrap.js';
import { getDueObjectives } from '../utils/helpers.js';

let moreTrap = null;
let moreTrigger = null;

export function initTabbar() {
  document.querySelectorAll('#tabbar .tab[data-route], #dock [data-route]').forEach(t => {
    t.addEventListener('click', () => navigate(t.dataset.route));
  });
  // Capture and "more" triggers exist in several layouts and some layouts
  // re-render their bar, so they are handled by one delegated listener.
  document.addEventListener('click', e => {
    if (e.target.closest('[data-capture]')) { quickCapture(); return; }
    if (e.target.closest('[data-open-more]')) { openMore(); }
  });

  document.querySelectorAll('#more-sheet [data-route]').forEach(b => {
    b.addEventListener('click', () => {
      closeMore();
      navigate(b.dataset.route);
    });
  });
  document.getElementById('railMod')?.addEventListener('click', () => navigate('overview'));
  document.getElementById('more-close')?.addEventListener('click', closeMore);
  document.getElementById('more-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'more-overlay') closeMore();
  });
  document.getElementById('searchBtn')?.addEventListener('click', () => window.EMVS.palette?.open());
  // Back follows browser history; with nothing to go back to (deep link,
  // fresh tab) it climbs to the parent instead of doing nothing.
  document.getElementById('mobileBack')?.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('overview');
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

function quickCapture() {
  const st = window.EMVS.getState();
  openQuickCapture({ moduleId: st.settings.currentModuleId || null });
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

/**
 * Sync every badge for one kind (tabbar, rail, topbar, dock share the
 * data-badge hook, so all layouts stay synchronized).
 */
function setBadge(kind, n, label) {
  document.querySelectorAll(`[data-badge="${kind}"]`).forEach(b => {
    b.hidden = n === 0;
    b.textContent = n > 9 ? '9+' : String(n);
    b.setAttribute('aria-label', label);
    b.setAttribute('title', label);
  });
}

function moreTriggers() {
  return [...document.querySelectorAll('[data-open-more]')];
}

function visibleMoreTrigger() {
  return moreTriggers().find(el => el.offsetParent !== null) || null;
}

function openMore() {
  const ov = document.getElementById('more-overlay');
  if (!ov || ov.classList.contains('open')) return;
  moreTrigger = document.activeElement;
  // Current destination stays recognizable inside the sheet.
  try {
    const cur = getCurrentView();
    ov.querySelectorAll('#more-sheet [data-route]').forEach(b => {
      if (b.dataset.route === cur) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  } catch {}
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  moreTriggers().forEach(el => el.setAttribute('aria-expanded', 'true'));
  // Escape inside the trap must really close the sheet (an empty onClose
  // would release the trap but leave the sheet open).
  moreTrap = trapFocus(document.getElementById('more-sheet'), { onClose: () => closeMore(false) });
}

export function closeMore(restoreFocus = true) {
  const ov = document.getElementById('more-overlay');
  const wasTrapped = !!moreTrap;
  if (moreTrap) {
    const t = moreTrap;
    moreTrap = null;
    releaseTrap(t);
  }
  ov?.classList.remove('open');
  ov?.setAttribute('aria-hidden', 'true');
  moreTriggers().forEach(el => el.setAttribute('aria-expanded', 'false'));
  if (wasTrapped && restoreFocus) {
    // The trigger may have been re-rendered while the sheet was open.
    const target = moreTrigger && moreTrigger.isConnected ? moreTrigger : visibleMoreTrigger();
    target?.focus?.();
  }
  moreTrigger = null;
}
