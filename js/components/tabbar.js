/**
 * Bottom tabbar + More sheet wiring.
 * Tabs: Heute / Module / + Erfassen (FAB) / Schwach / Prüfungen
 * Secondary views live in the More sheet + header.
 */
import { navigate } from '../views/router.js';
import { openQuickCapture } from '../views/captures.js';
import { trapFocus, releaseTrap } from './focusTrap.js';
import { getDueObjectives } from '../utils/helpers.js';

let moreTrap = null;
let moreTrigger = null;

export function initTabbar() {
  document.querySelectorAll('#tabbar .tab[data-route]').forEach(t => {
    t.addEventListener('click', () => navigate(t.dataset.route));
  });
  document.getElementById('tabCapture')?.addEventListener('click', quickCapture);
  document.getElementById('railCapture')?.addEventListener('click', quickCapture);

  document.querySelectorAll('#more-sheet [data-route]').forEach(b => {
    b.addEventListener('click', () => {
      closeMore();
      navigate(b.dataset.route);
    });
  });
  document.getElementById('moreBtn')?.addEventListener('click', openMore);
  document.getElementById('railMore')?.addEventListener('click', openMore);
  document.getElementById('more-close')?.addEventListener('click', closeMore);
  document.getElementById('more-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'more-overlay') closeMore();
  });
  document.getElementById('searchBtn')?.addEventListener('click', () => window.EMVS.palette?.open());

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

  window.EMVS.tabbar = { updateBadges, openMore };
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
    const weak = document.getElementById('badgeWeak');
    if (weak) {
      weak.hidden = due === 0;
      weak.textContent = due > 9 ? '9+' : String(due);
      weak.setAttribute('aria-label', `${due} fällige Wiederholungen`);
    }
    const soon = (st.exams || []).filter(e => {
      if (!e.date) return false;
      const d = Math.ceil((new Date(e.date + 'T08:00:00') - Date.now()) / 86400000);
      return d >= 0 && d <= 14;
    }).length;
    const eb = document.getElementById('badgeExam');
    if (eb) {
      eb.hidden = soon === 0;
      eb.textContent = soon > 9 ? '9+' : String(soon);
      eb.setAttribute('aria-label', `${soon} Prüfungen in den nächsten 14 Tagen`);
    }
  } catch {}
}

function openMore() {
  const ov = document.getElementById('more-overlay');
  if (!ov || ov.classList.contains('open')) return;
  moreTrigger = document.activeElement;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  document.getElementById('moreBtn')?.setAttribute('aria-expanded', 'true');
  document.getElementById('railMore')?.setAttribute('aria-expanded', 'true');
  moreTrap = trapFocus(document.getElementById('more-sheet'), { onClose: () => {} });
}

function closeMore() {
  const ov = document.getElementById('more-overlay');
  if (moreTrap) {
    const t = moreTrap;
    moreTrap = null;
    releaseTrap(t);
    ov?.classList.remove('open');
    ov?.setAttribute('aria-hidden', 'true');
    document.getElementById('moreBtn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('railMore')?.setAttribute('aria-expanded', 'false');
    (moreTrigger || document.getElementById('railMore') || document.getElementById('moreBtn'))?.focus?.();
    moreTrigger = null;
    return;
  }
  ov?.classList.remove('open');
  ov?.setAttribute('aria-hidden', 'true');
  document.getElementById('moreBtn')?.setAttribute('aria-expanded', 'false');
  document.getElementById('railMore')?.setAttribute('aria-expanded', 'false');
}
