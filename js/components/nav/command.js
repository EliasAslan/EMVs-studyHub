/**
 * Command layout — search first. A wide search field opens the command
 * palette (pages, subjects, notes, tools, actions); keyboard shortcuts do
 * the rest. A breadcrumb shows where you are, and the four primary
 * destinations stay one click away as a quiet fallback.
 */

import { getBreadcrumb } from '../../utils/navigation.js';
import { getCurrentView, getCurrentParams, } from '../../views/router.js';
import { esc, destButton, bindDests, syncDests, goTo, refreshBadges, kbdLabel, showShortcuts } from './shared.js';

function crumbsHtml(state) {
  const trail = getBreadcrumb(getCurrentView(), getCurrentParams(), state);
  return trail.map((c, i) => {
    const last = i === trail.length - 1;
    return `<li>${last || !c.dest
      ? `<span${last ? ' aria-current="page"' : ''}>${esc(c.label)}</span>`
      : `<button type="button" class="cmd-crumb" data-crumb="${esc(c.dest)}">${esc(c.label)}</button>`}</li>`;
  }).join('<li class="cmd-sep" aria-hidden="true">/</li>');
}

export function render(state) {
  const bar = document.getElementById('topchrome');
  if (!bar) return;
  bar.hidden = false;
  bar.dataset.style = 'command';
  bar.setAttribute('aria-label', 'Befehlsleiste');
  bar.innerHTML = `
    <span class="brand-mark">EMVS</span>
    <nav class="cmd-crumbs" aria-label="Standort"><ol id="cmdCrumbs">${crumbsHtml(state)}</ol></nav>
    <button type="button" class="cmd-search" id="cmdSearch" aria-haspopup="dialog" aria-label="Seiten, Fächer, Notizen und Werkzeuge suchen (${kbdLabel()})">
      <span class="cmd-search-ico" aria-hidden="true">⌕</span>
      <span class="cmd-search-ph">Seiten, Fächer, Notizen, Werkzeuge …</span>
      <kbd>${kbdLabel()}</kbd>
    </button>
    <div class="cmd-quick" role="group" aria-label="Schnellzugriff">
      ${['today', 'overview', 'weak-spots', 'exams-global'].map(id => destButton(id, { cls: 'cmd-quick-btn' })).join('')}
    </div>
    <div class="topchrome-actions">
      <button type="button" class="tc-btn" id="cmdHelp" aria-label="Tastenkürzel anzeigen" title="Tastenkürzel">?</button>
      <button type="button" class="tc-btn tc-primary" data-capture aria-label="Schnell erfassen: Frage, Fehler oder Gedanke festhalten" title="Schnell erfassen (Q)">+</button>
      <button type="button" class="tc-btn" data-open-more aria-label="Weitere Bereiche öffnen" aria-expanded="false" aria-controls="more-sheet" title="Weitere Bereiche">⋯</button>
    </div>`;
  bar.querySelector('#cmdSearch').addEventListener('click', () => window.EMVS.palette?.open());
  bar.querySelector('#cmdHelp').addEventListener('click', showShortcuts);
  bindDests(bar);
  wireCrumbs(bar);
  refreshBadges();
  sync(state);
}

function wireCrumbs(bar) {
  bar.querySelectorAll('[data-crumb]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.crumb)));
}

export function sync(state) {
  const bar = document.getElementById('topchrome');
  if (!bar || bar.dataset.style !== 'command') return;
  syncDests(bar);
  const ol = bar.querySelector('#cmdCrumbs');
  if (ol) { ol.innerHTML = crumbsHtml(state); wireCrumbs(bar); }
}

export function teardown() {}
