/**
 * Bento layout — a visual launchpad. A slim bar keeps the current page and
 * a launchpad button; the launchpad is a grid of grouped cards (subjects,
 * today, study tools, upcoming tests, recent activity, other places).
 * Choosing a card navigates, so nobody has to browse a long menu.
 */

import { getBentoData, relativeTime } from '../../utils/navData.js';
import { routeTitle } from '../../utils/navigation.js';
import { getCurrentView, getCurrentParams } from '../../views/router.js';
import { trapFocus, releaseTrap } from '../focusTrap.js';
import { openQuickCapture } from '../../views/captures.js';
import { esc, getState, goTo, goModule, destButton, bindDests, refreshBadges, kbdLabel } from './shared.js';

let trap = null;

const ACTIVITY_ICO = { session: '▶', capture: '⚡', review: '↻' };

export function render(state) {
  const bar = document.getElementById('topchrome');
  if (!bar) return;
  bar.hidden = false;
  bar.dataset.style = 'bento';
  bar.setAttribute('aria-label', 'Navigationsleiste');
  bar.innerHTML = `
    <span class="brand-mark">EMVS</span>
    <button type="button" class="bento-launch" id="bentoLaunch" aria-haspopup="dialog" aria-expanded="false" aria-controls="launchpad">
      <span aria-hidden="true">⊞</span><span>Launchpad</span><kbd>G</kbd>
    </button>
    <p class="bento-where" id="bentoWhere" aria-live="polite"></p>
    <div class="topchrome-actions">
      <button type="button" class="tc-btn" id="bentoSearch" aria-label="Suchen und Befehle öffnen (${kbdLabel()})" title="Suchen (${kbdLabel()})"><span aria-hidden="true">⌕</span></button>
      <button type="button" class="tc-btn tc-primary" data-capture aria-label="Schnell erfassen: Frage, Fehler oder Gedanke festhalten" title="Schnell erfassen">+</button>
      <button type="button" class="tc-btn" data-open-more aria-label="Weitere Bereiche öffnen" aria-expanded="false" aria-controls="more-sheet" title="Weitere Bereiche">⋯</button>
    </div>`;
  bar.querySelector('#bentoLaunch').addEventListener('click', () => toggleLaunchpad());
  bar.querySelector('#bentoSearch').addEventListener('click', () => window.EMVS.palette?.open());
  sync(state);
}

export function sync(state) {
  const where = document.getElementById('bentoWhere');
  if (where) {
    const t = routeTitle(getCurrentView(), getCurrentParams(), state);
    where.textContent = t.sub ? `${t.title} · ${t.sub}` : t.title;
  }
  // The launchpad never stays open over the page that was just chosen.
  if (isLaunchpadOpen()) closeLaunchpad(false);
}

function subjectsHtml(data) {
  if (!data.subjects.length) {
    return '<p class="lp-empty">Noch keine Module. Lege über „Module“ dein erstes Fach an.</p>';
  }
  return `<div class="lp-subjects">${data.subjects.map(s => `
    <button type="button" class="lp-subject" data-subject="${esc(s.id)}" style="--subj:${esc(s.accent || 'var(--accent)')}">
      <span class="lp-subject-top"><strong>${esc(s.code)}</strong>${s.due ? `<span class="nav-badge" aria-label="${s.due} fällig">${s.due}</span>` : ''}</span>
      <span class="lp-subject-title">${esc(s.title)}</span>
      <span class="lp-bar" role="img" aria-label="${s.pct}% gemeistert (${s.done} von ${s.total})"><span style="width:${s.pct}%"></span></span>
      <span class="lp-subject-meta">${s.done}/${s.total} Lernziele</span>
    </button>`).join('')}</div>`;
}

function launchpadHtml(state) {
  const data = getBentoData(state);
  const now = Date.now();
  return `
    <header class="lp-head">
      <div><p class="eyebrow">Launchpad</p><h2 class="lp-title" id="lp-title">Wohin soll es gehen?</h2></div>
      <button type="button" class="lp-close" id="lp-close" aria-label="Launchpad schließen" title="Schließen (Esc)">×</button>
    </header>
    <div class="lp-grid">
      <section class="lp-card lp-card-subjects" aria-labelledby="lp-h-sub"><h3 id="lp-h-sub">Fächer</h3>${subjectsHtml(data)}</section>
      <section class="lp-card lp-card-today" aria-labelledby="lp-h-today"><h3 id="lp-h-today">Heute</h3>
        <button type="button" class="lp-today" data-dest="today">
          <span class="lp-today-n">${data.dueCount}</span>
          <span class="lp-today-t">${data.dueCount === 1 ? 'Wiederholung fällig' : 'Wiederholungen fällig'}</span>
          <span class="lp-today-s">${data.openTasks} offene ${data.openTasks === 1 ? 'Aufgabe' : 'Aufgaben'} · Tagesfokus öffnen →</span>
        </button></section>
      <section class="lp-card lp-card-tools" aria-labelledby="lp-h-tools"><h3 id="lp-h-tools">Lernwerkzeuge</h3>
        <div class="lp-tools">${['weak-spots', 'exam-prep', 'mock-exam', 'weekly-review', 'tools'].map(id => destButton(id, { cls: 'lp-tool', showHint: true })).join('')}</div></section>
      <section class="lp-card lp-card-exams" aria-labelledby="lp-h-exams"><h3 id="lp-h-exams">Anstehende Prüfungen</h3>
        ${data.exams.length ? `<ul class="lp-list">${data.exams.map(e => `
          <li><button type="button" class="lp-row${e.urgent ? ' urgent' : ''}" data-exam-module="${esc(e.moduleId || '')}">
            <span class="lp-row-main"><strong>${esc(e.name)}</strong><small>${esc(e.moduleCode)}</small></span>
            <span class="lp-row-when">${esc(e.text)}</span></button></li>`).join('')}</ul>`
          : '<p class="lp-empty">Keine Prüfungen geplant.</p>'}
        <button type="button" class="lp-link" data-dest="exams-global">Alle Prüfungen →</button></section>
      <section class="lp-card lp-card-activity" aria-labelledby="lp-h-act"><h3 id="lp-h-act">Zuletzt</h3>
        ${data.activity.length ? `<ul class="lp-list">${data.activity.map(a => `
          <li><button type="button" class="lp-row" data-activity="${a.kind}" data-activity-module="${esc(a.moduleId || '')}">
            <span class="lp-row-ico" aria-hidden="true">${ACTIVITY_ICO[a.kind] || '•'}</span>
            <span class="lp-row-main"><strong>${esc(a.title)}</strong></span>
            <span class="lp-row-when">${esc(relativeTime(a.at, now))}</span></button></li>`).join('')}</ul>`
          : '<p class="lp-empty">Noch keine Aktivität.</p>'}</section>
      <section class="lp-card lp-card-other" aria-labelledby="lp-h-other"><h3 id="lp-h-other">Weiteres</h3>
        <div class="lp-tools">${destButton('captures', { cls: 'lp-tool', showHint: true })}${destButton('settings', { cls: 'lp-tool', showHint: true })}
          <button type="button" class="nav-dest lp-tool" id="lp-capture"><span class="nav-dest-ico" aria-hidden="true">+</span><span class="nav-dest-text"><span class="nav-dest-label">Schnell erfassen</span><span class="nav-dest-hint">Frage, Fehler oder Gedanke</span></span></button></div></section>
    </div>`;
}

export function isLaunchpadOpen() {
  return document.getElementById('launchpad')?.classList.contains('open') === true;
}

export function openLaunchpad() {
  const lp = document.getElementById('launchpad');
  const sheet = document.getElementById('lp-sheet');
  if (!lp || !sheet || isLaunchpadOpen()) return;
  const state = getState();
  sheet.innerHTML = launchpadHtml(state);
  lp.classList.add('open');
  lp.setAttribute('aria-hidden', 'false');
  document.getElementById('bentoLaunch')?.setAttribute('aria-expanded', 'true');

  bindDests(sheet, () => closeLaunchpad(false));
  sheet.querySelector('#lp-close')?.addEventListener('click', () => closeLaunchpad());
  sheet.querySelectorAll('[data-subject]').forEach(b => b.addEventListener('click', () => {
    closeLaunchpad(false); goModule(b.dataset.subject, 'home');
  }));
  sheet.querySelectorAll('[data-exam-module]').forEach(b => b.addEventListener('click', () => {
    closeLaunchpad(false);
    if (b.dataset.examModule) goModule(b.dataset.examModule, 'material'); else goTo('exams-global');
  }));
  sheet.querySelectorAll('[data-activity]').forEach(b => b.addEventListener('click', () => {
    closeLaunchpad(false);
    const mod = b.dataset.activityModule;
    if (b.dataset.activity === 'capture') goTo('captures');
    else if (mod) goModule(mod, b.dataset.activity === 'session' ? 'sessions' : 'ziele');
    else goTo('today');
  }));
  sheet.querySelector('#lp-capture')?.addEventListener('click', () => {
    closeLaunchpad(false);
    openQuickCapture({ moduleId: state.settings.currentModuleId || null });
  });
  lp.onclick = e => { if (e.target === lp) closeLaunchpad(); };
  trap = trapFocus(sheet, { onClose: () => closeLaunchpad(false, true) });
  // trapFocus lands on the first focusable (the close button); the first
  // destination card is the better starting point.
  setTimeout(() => { if (isLaunchpadOpen()) sheet.querySelector('.lp-subject, .lp-today, .lp-tool')?.focus(); }, 60);
  refreshBadges();
}

/** `restoreFocus` is for explicit dismissals; navigation moves focus on its own. */
export function closeLaunchpad(restoreFocus = true, fromTrap = false) {
  const lp = document.getElementById('launchpad');
  if (!lp || !lp.classList.contains('open')) return;
  lp.classList.remove('open');
  lp.setAttribute('aria-hidden', 'true');
  document.getElementById('bentoLaunch')?.setAttribute('aria-expanded', 'false');
  if (trap) { const t = trap; trap = null; releaseTrap(t); }
  if (restoreFocus && !fromTrap) document.getElementById('bentoLaunch')?.focus();
}

export function toggleLaunchpad() {
  if (isLaunchpadOpen()) closeLaunchpad(); else openLaunchpad();
}

export function teardown() {
  closeLaunchpad(false);
}
