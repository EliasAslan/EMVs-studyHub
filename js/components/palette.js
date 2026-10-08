/**
 * Command Palette Component
 * Quick navigation and actions via keyboard
 */

import { openModuleModal as openModuleSheet, importBackup as importBackupFile } from '../views/settings.js';
import { openObjectiveModal as openObjectiveSheet } from '../views/module-objectives.js';
import { openResourceModal as openResourceSheet } from '../views/module-resources.js';
import { openSessionModal as openSessionSheet, startTimer } from '../views/module-sessions.js';
import { openCaptureModal as openCaptureSheet, openQuickCapture as openQuickCaptureSheet } from '../views/captures.js';
import { openReviewModal as openWeeklyReviewSheet } from '../views/weekly-review.js';
import { openObjectiveHistory } from '../views/module-objectives.js';
import { getDueObjectives, getMostOverdueObjective, getWeakestObjective } from '../utils/helpers.js';

export function initPalette() {
  const overlay = document.getElementById('palette-overlay');
  const input = document.getElementById('palette-input');
  const list = document.getElementById('palette-list');
  
  let items = [];
  let selected = 0;
  
  function build(query) {
    const q = query.toLowerCase().trim();
    const state = window.EMVS.getState();
    const moduleId = state.settings.currentModuleId || state.modules[0]?.id || null;
    const focusObjective = getMostOverdueObjective(state) || getWeakestObjective(state);
    const dueCount = getDueObjectives(state).length;
    const cmds = [];
    const add = (command) => {
      if (command.available !== false) cmds.push(command);
    };
    const selectModule = (action) => () => {
      if (!moduleId) {
        openModuleSheet();
        return;
      }
      state.settings.currentModuleId = moduleId;
      window.EMVS.save();
      renderSidebar();
      action(moduleId);
    };
    
    // Global navigation
    add({ label: 'Heute', aliases: ['start', 'übersicht', 'fokus'], group: 'navigation', action: () => navigate('today'), shortcut: '1' });
    add({ label: 'Schwachstellen', aliases: ['schwach', 'probleme', 'fällig', 'wiederholen'], group: 'navigation', action: () => navigate('weak-spots'), shortcut: '2' });
    add({ label: 'Prüfungen', aliases: ['prüfung', 'examen'], group: 'navigation', action: () => navigate('exams-global') });
    add({ label: 'Erfassen', aliases: ['capture', 'notiz', 'frage', 'fehler', 'gedanke'], group: 'navigation', action: () => openQuickCapture() });
    add({ label: 'Review', aliases: ['wochenreview', 'reflexion'], group: 'navigation', action: () => navigate('weekly-review') });
    add({ label: 'Werkzeuge', aliases: ['links', 'ressourcen', 'tools'], group: 'navigation', action: () => navigate('tools') });
    add({ label: 'Prüfungsvorbereitung', aliases: ['vorbereitung', 'mock'], group: 'navigation', action: () => navigate('exam-prep') });
    add({ label: 'Einstellungen', aliases: ['setup', 'konfiguration'], group: 'navigation', action: () => navigate('settings') });
    
    // Module-specific
    state.modules.forEach(m => {
      ['Home', 'Lernziele', 'Ressourcen', 'Sitzungen', 'Prüfungen', 'Plan'].forEach(sub => {
        add({
          label: `Modul ${m.code} · ${sub}`,
          aliases: [m.title, sub],
          group: 'modul',
          action: () => {
            state.settings.currentModuleId = m.id;
            window.EMVS.save();
            renderSidebar();
            const map = { 'Home': 'module-home', 'Lernziele': 'module-objectives', 'Ressourcen': 'module-resources', 'Sitzungen': 'module-sessions', 'Prüfungen': 'module-exams', 'Plan': 'module-plan' };
            navigate(map[sub]);
          }
        });
      });
    });
    
    // Actions
    add({ label: 'Nächstes Lernziel öffnen', aliases: ['fokus', 'next', 'weiter'], group: 'aktion', action: () => {
      if (!focusObjective) { navigate('today'); return; }
      state.settings.currentModuleId = focusObjective.moduleId;
      window.EMVS.save();
      renderSidebar();
      openObjectiveHistory(focusObjective.id);
    }, shortcut: 'F', available: !!focusObjective });
    add({ label: `Fällige Wiederholungen öffnen${dueCount ? ` · ${dueCount}` : ''}`, aliases: ['due', 'reviews', 'wiederholung'], group: 'aktion', action: () => navigate('weak-spots'), available: dueCount > 0 });
    add({ label: 'Sitzung starten · 25 Min', aliases: ['timer', 'lernen', 'pomodoro', 'starten'], group: 'aktion', action: selectModule((id) => startTimer(id, 25)), shortcut: 'S' });
    add({ label: 'Sitzung protokollieren', aliases: ['lernzeit', 'loggen'], group: 'aktion', action: () => openSessionModal() });
    add({ label: 'Mock-Prüfung starten', aliases: ['mock', 'simulieren'], group: 'aktion', action: () => openMockExam() });
    add({ label: 'Neues Modul erstellen', aliases: ['modul anlegen'], group: 'verwalten', action: () => openModuleModal() });
    add({ label: 'Neues Lernziel erstellen', aliases: ['ziel anlegen'], group: 'verwalten', action: () => openObjectiveModal() });
    add({ label: 'Neue Ressource hinzufügen', aliases: ['ressource anlegen'], group: 'verwalten', action: () => openResourceModal() });
    add({ label: '⚡ Frage festhalten', aliases: ['frage', 'unsicher'], group: 'erfassen', action: () => openQuickCapture({ type: 'question' }), shortcut: 'Q' });
    add({ label: '⚡ Fehler festhalten', aliases: ['fehler', 'falsch'], group: 'erfassen', action: () => openQuickCapture({ type: 'mistake' }) });
    add({ label: '⚡ Begriff festhalten', aliases: ['begriff', 'definition'], group: 'erfassen', action: () => openQuickCapture({ type: 'term' }) });
    add({ label: '⚡ Gedanke festhalten', aliases: ['gedanke', 'notiz'], group: 'erfassen', action: () => openQuickCapture({ type: 'thought' }) });
    add({ label: 'Wochenreview schreiben', aliases: ['review schreiben'], group: 'verwalten', action: () => openWeeklyReviewModal() });
    add({ label: 'Backup exportieren', aliases: ['sichern', 'json'], group: 'verwalten', action: () => window.EMVS.exportData() });
    add({ label: 'Backup importieren', aliases: ['wiederherstellen'], group: 'verwalten', action: () => importBackup() });
    add({ label: 'Theme: Hell', aliases: ['hell', 'licht'], group: 'ansicht', action: () => setTheme('light') });
    add({ label: 'Theme: Dunkel', aliases: ['dunkel', 'dark'], group: 'ansicht', action: () => setTheme('dark') });
    
    const filtered = q
      ? cmds.filter(c => [c.label, ...(c.aliases || [])].join(' ').toLowerCase().includes(q))
      : cmds;
    items = filtered;
    selected = 0;
    
    if (!filtered.length) {
      list.innerHTML = `<div class="palette-empty">Keine Treffer.</div>`;
      return;
    }
    
    list.innerHTML = filtered.map((c, i) => `
      <div class="palette-item ${i === 0 ? 'selected' : ''}" data-i="${i}" role="option">
        <span>${escapeHtml(c.label)}</span>
        <span class="palette-meta"><span class="group">${escapeHtml(c.group)}</span>${c.shortcut ? `<kbd>${escapeHtml(c.shortcut)}</kbd>` : ''}</span>
      </div>
    `).join('');
    
    list.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('click', () => execute(+item.dataset.i));
      item.addEventListener('mouseenter', () => select(+item.dataset.i));
    });
  }
  
  function select(i) {
    selected = i;
    list.querySelectorAll('.palette-item').forEach((el, idx) => el.classList.toggle('selected', idx === i));
  }
  
  function execute(i) {
    const cmd = items[i];
    if (!cmd) return;
    close();
    cmd.action();
  }
  
  function open() {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    input.value = '';
    input.focus();
    build('');
  }
  
  function close() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }
  
  function move(delta) {
    if (!items.length) return;
    const next = (selected + delta + items.length) % items.length;
    select(next);
    list.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  
  // Event listeners
  document.getElementById('cmd-trigger').addEventListener('click', open);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  input.addEventListener('input', e => build(e.target.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); execute(selected); }
    else if (e.key === 'Escape') { close(); }
  });
  
  window.EMVS.palette = { open, close, isOpen: () => overlay.classList.contains('open') };
}

// Helper functions (imported from views/actions)
function navigate(view) {
  // This will be set by router
  window.EMVS.navigate?.(view);
}

function renderSidebar() {
  window.EMVS.renderSidebar?.();
}

function openModuleModal() {
  openModuleSheet();
}

function openObjectiveModal() {
  const st = window.EMVS.getState();
  const modId = st.settings.currentModuleId || st.modules[0]?.id || null;
  if (!modId) { openModuleSheet(); return; }
  openObjectiveSheet(null, modId);
}

function openResourceModal() {
  const st = window.EMVS.getState();
  const modId = st.settings.currentModuleId || st.modules[0]?.id || null;
  if (!modId) { openModuleSheet(); return; }
  openResourceSheet(null, modId);
}

function openSessionModal() {
  const st = window.EMVS.getState();
  const modId = st.settings.currentModuleId || st.modules[0]?.id || null;
  if (!modId) { openModuleSheet(); return; }
  openSessionSheet(null, modId);
}

function openMockExam() {
  const st = window.EMVS.getState();
  const modId = st.settings.currentModuleId || st.modules[0]?.id || null;
  if (!modId) { openModuleSheet(); return; }
  st.settings.currentModuleId = modId;
  window.EMVS.save();
  renderSidebar();
  navigate('mock-exam');
}

function openCaptureModal() {
  openCaptureSheet();
}

function openQuickCapture(preset = {}) {
  const st = window.EMVS.getState();
  openQuickCaptureSheet({ moduleId: st.settings.currentModuleId || null, ...preset });
}

function openWeeklyReviewModal() {
  openWeeklyReviewSheet();
}

function importBackup() {
  importBackupFile();
}

function setTheme(theme) {
  const state = window.EMVS.getState();
  state.settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  window.EMVS.save();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}