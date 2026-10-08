/**
 * Tools View - External links and resources
 */

import { escapeHtml } from '../utils/helpers.js';

export function renderTools(state) {
  const groups = {
    'Offizielle Unterlagen': [
      { label: 'Heft Module 162', target: 'https://www.unormal.org/bfo/current/Inf1-Md162/' },
      { label: 'ICT Berufsbildung — Informatiker EFZ', target: 'https://www.ict-berufsbildung.ch/grundbildung/ict-lehren/informatiker-in-efz' },
      { label: 'Rahmenlehrplan Informatik', target: 'https://www.sbfi.admin.ch/sbfi/de/home/berufsbildung/berufe/ict-berufe.html' },
    ],
    'Software & Tools': [
      { label: 'LibreOffice Calc', target: 'https://www.libreoffice.org/download/download-libreoffice/' },
      { label: 'LibreOffice Base', target: 'https://www.libreoffice.org/download/download-libreoffice/' },
      { label: 'Draw.io (ERD Diagramme)', target: 'https://app.diagrams.net/' },
      { label: 'DB Designer (Online)', target: 'https://www.dbdesigner.net/' },
    ],
    'Lernressourcen': [
      { label: 'SQL Zoo (Übungen)', target: 'https://sqlzoo.net/' },
      { label: 'W3Schools SQL Tutorial', target: 'https://www.w3schools.com/sql/' },
      { label: 'Mode Analytics SQL Tutorial', target: 'https://mode.com/sql-tutorial/' },
      { label: 'PostgreSQL Exercises', target: 'https://pgexercises.com/' },
    ],
    'Pivot & Calc': [
      { label: 'Calc Keyboard Shortcuts (PDF)', target: 'https://wiki.documentfoundation.org/Images/Calc_Shortcuts.pdf' },
      { label: 'Pivot Table Tutorial (LibreOffice)', target: 'https://wiki.documentfoundation.org/Documentation/Calc_Guide' },
      { label: 'DataPilot Guide', target: 'https://help.libreoffice.org/Calc/Using_DataPilot' },
    ],
  };
  
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Sammlung</div>
    <h1 class="page-title">Werkzeuge & Links</h1>
    <p class="page-lede">Kuratierte externe Ressourcen, nach Kategorien gruppiert.</p>
    ${Object.entries(groups).map(([name, links]) => `
      <div style="margin-bottom: 32px;">
        <div class="section-label">${escapeHtml(name)}</div>
        <div class="link-list">
          ${links.map((l, i) => `
            <div class="link-row" role="link" tabindex="0" data-target="${escapeHtml(l.target)}" style="display: grid; grid-template-columns: 28px 1fr auto; align-items: baseline; gap: 12px; padding: 12px 8px; border-radius: 4px; cursor: pointer; transition: background 0.15s;">
              <span class="link-num" style="font-family: var(--mono); font-size: 11px; color: var(--ink-3);">${String(i + 1).padStart(2, '0')}</span>
              <span class="link-label" style="font-size: 14.5px; color: var(--ink);">${escapeHtml(l.label)}</span>
              <span class="link-hint" style="font-family: var(--mono); font-size: 11px; color: var(--ink-3);">↗</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
  
  el.querySelectorAll('.link-row').forEach(c => {
    const activate = () => {
      const t = c.dataset.target;
      if (t && t !== '#') window.open(t, '_blank', 'noopener');
    };
    c.addEventListener('click', activate);
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });
  
  return el;
}