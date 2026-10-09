/**
 * Settings View - App configuration, backup, theme
 */

import { escapeHtml } from '../utils/helpers.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { generateId, exportData, importData, clearAll, clearStorageError } from '../services/store.js';

export function renderSettings(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Konfiguration</div>
    <h1 class="page-title">Einstellungen</h1>
    <p class="page-lede">${m ? `Modul ${escapeHtml(m.code)} · ${escapeHtml(m.title)}` : 'Kein Modul ausgewählt'}</p>
    
    <div style="margin-bottom: 32px;">
      <div class="section-label">Modul-Einstellungen</div>
      ${m ? `
        <div class="field-row">
          <label>Zielnote (1.0 – 6.0)</label>
          <input type="number" id="set-target" step="0.1" min="1" max="6" value="${m.targetGrade ?? 5.0}" style="max-width: 120px;">
        </div>
        <div class="field-row">
          <label>Modul-Code</label>
          <input type="text" id="set-code" value="${escapeHtml(m.code)}" style="max-width: 120px;">
        </div>
        <div class="field-row">
          <label>Modul-Titel</label>
          <input type="text" id="set-title" value="${escapeHtml(m.title)}" style="max-width: 400px;">
        </div>
        <div class="field-row">
          <label>Akzent-Farbe</label>
          <input type="color" id="set-accent" value="${m.accent || '#b45309'}" style="width: 60px; height: 36px; border: 1px solid var(--rule); border-radius: 4px; padding: 2px;">
        </div>
      ` : '<p style="color: var(--ink-2);">Wähle ein Modul in der Sidebar, um dessen Einstellungen zu bearbeiten.</p>'}
    </div>
    
    <hr class="rule">
    
    <div style="margin-bottom: 32px;">
      <div class="section-label">App-Einstellungen</div>
      <div class="field-row">
        <label>Theme</label>
        <select id="set-theme" style="max-width: 200px;">
          <option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Hell</option>
          <option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dunkel</option>
        </select>
      </div>
    </div>
    
    <hr class="rule">
    
    <div style="margin-bottom: 32px;">
      <div class="section-label">Modul-Verwaltung</div>
      <div class="mt-2">
        <button class="btn primary" id="create-module">＋ Neues Modul erstellen</button>
      </div>
      ${state.modules.length ? `
        <div class="mt-3" style="display: flex; flex-direction: column; gap: 8px;">
          ${state.modules.map(mod => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--paper); border: 1px solid var(--rule); border-radius: 4px;">
              <div>
                <strong>Modul ${escapeHtml(mod.code)}</strong> — ${escapeHtml(mod.title)}
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn" data-action="edit-module" data-id="${mod.id}" style="font-size: 12px;">Bearbeiten</button>
                <button class="btn danger" data-action="delete-module" data-id="${mod.id}" style="font-size: 12px;">Löschen</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
    
    <hr class="rule">
    
    <div style="margin-bottom: 32px;">
      <div class="section-label">Daten</div>
      <p style="font-size: 13.5px; color: var(--ink-2); max-width: 52ch; margin-bottom: 16px;">
        Alle Daten werden lokal im Browser gespeichert (localStorage). Exportiere regelmäßig Backups.
      </p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn primary" id="btn-export">Backup exportieren (JSON)</button>
        <button class="btn" id="btn-import">Backup importieren</button>
        <button class="btn danger" id="btn-reset">Alle Daten zurücksetzen</button>
      </div>
    </div>
    
    <hr class="rule">
    
    <div>
      <div class="section-label">Info</div>
      <p style="font-size: 13.5px; color: var(--ink-2); max-width: 52ch;">
        EMVS Study Hub v1.0 — Local-first Lernmanagement.<br>
        Datenmodell: Module, Lernziele, Ressourcen, Sitzungen, Prüfungen, Plan, Erfassungen, Wochenreviews.
      </p>
    </div>
  `;
  
  // Handlers
  if (m) {
    el.querySelector('#set-target')?.addEventListener('input', e => {
      m.targetGrade = parseFloat(e.target.value) || 5.0;
      m.updatedAt = Date.now();
      window.EMVS.save();
    });
    el.querySelector('#set-code')?.addEventListener('input', e => {
      m.code = e.target.value.trim().toUpperCase();
      m.updatedAt = Date.now();
      window.EMVS.save();
      window.EMVS.renderSidebar();
    });
    el.querySelector('#set-title')?.addEventListener('input', e => {
      m.title = e.target.value.trim();
      m.updatedAt = Date.now();
      window.EMVS.save();
      window.EMVS.renderSidebar();
    });
    el.querySelector('#set-accent')?.addEventListener('input', e => {
      m.accent = e.target.value;
      m.updatedAt = Date.now();
      window.EMVS.save();
      window.EMVS.renderSidebar();
    });
  }
  
  el.querySelector('#set-theme')?.addEventListener('change', e => {
    state.settings.theme = e.target.value;
    document.documentElement.dataset.theme = state.settings.theme;
    window.EMVS.save();
  });
  
  el.querySelector('#create-module')?.addEventListener('click', () => openModuleModal());
  el.querySelector('#btn-export')?.addEventListener('click', () => window.EMVS.exportData());
  el.querySelector('#btn-import')?.addEventListener('click', () => importBackup());
  el.querySelector('#btn-reset')?.addEventListener('click', async () => {
    if (await confirmDialog('Wirklich ALLE Daten unwiderruflich löschen? Dies kann nicht rückgängig gemacht werden.', 'Daten zurücksetzen')) {
      const fresh = clearAll();
      window.EMVS.setState(fresh);
      window.EMVS.save();
      document.documentElement.dataset.theme = fresh.settings.theme;
      window.EMVS.renderSidebar();
      navigate('today');
    }
  });
  
  // Module edit/delete
  el.querySelectorAll('[data-action="edit-module"]').forEach(btn => {
    btn.addEventListener('click', () => openModuleModal(state.modules.find(m => m.id === btn.dataset.id)));
  });
  el.querySelectorAll('[data-action="delete-module"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (await confirmDialog('Modul wirklich löschen? Alle zugehörigen Lernziele, Ressourcen, Sitzungen, Prüfungen, Plan-Einträge werden ebenfalls gelöscht.', 'Modul löschen')) {
        state.modules = state.modules.filter(m => m.id !== id);
        state.learningObjectives = state.learningObjectives.filter(o => o.moduleId !== id);
        state.resources = state.resources.filter(r => r.moduleId !== id);
        state.studySessions = state.studySessions.filter(s => s.moduleId !== id);
        state.exams = state.exams.filter(e => e.moduleId !== id);
        state.examResults = state.examResults.filter(e => e.moduleId !== id);
        state.planItems = state.planItems.filter(p => p.moduleId !== id);
        state.captures = state.captures.filter(c => c.moduleId !== id);
        state.weeklyReviews = state.weeklyReviews.filter(w => w.moduleId !== id);
        
        if (state.settings.currentModuleId === id) {
          state.settings.currentModuleId = state.modules[0]?.id || null;
        }
        
        window.EMVS.save();
        window.EMVS.renderSidebar();
        navigate('today');
      }
    });
  });

  return el;
}

export function openModuleModal(module = null) {
  const state = window.EMVS.getState();
  const isNew = !module;
  const m = module || {
    id: generateId(),
    code: '',
    title: '',
    accent: '#b45309',
    targetGrade: 5.0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  openModal({
    title: isNew ? 'Neues Modul' : 'Modul bearbeiten',
    body: `
      <form id="module-form">
        <div class="field-row">
          <label>Code (z.B. 162)</label>
          <input type="text" name="code" value="${escapeHtml(m.code)}" required style="max-width: 120px; text-transform: uppercase;">
        </div>
        <div class="field-row">
          <label>Titel</label>
          <input type="text" name="title" value="${escapeHtml(m.title)}" required style="max-width: 400px;">
        </div>
        <div class="field-row">
          <label>Akzent-Farbe</label>
          <input type="color" name="accent" value="${m.accent || '#b45309'}" style="width: 60px; height: 36px; border: 1px solid var(--rule); border-radius: 4px; padding: 2px;">
        </div>
        <div class="field-row">
          <label>Zielnote</label>
          <input type="number" name="targetGrade" value="${m.targetGrade ?? 5.0}" step="0.1" min="1" max="6" style="max-width: 120px;">
        </div>
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;
    
    m.code = result.code.trim().toUpperCase();
    m.title = result.title.trim();
    m.accent = result.accent || '#b45309';
    m.targetGrade = parseFloat(result.targetGrade) || 5.0;
    m.updatedAt = Date.now();
    
    if (isNew) {
      state.modules.push(m);
      if (!state.settings.currentModuleId) {
        state.settings.currentModuleId = m.id;
      }
    }
    
    window.EMVS.save();
    window.EMVS.renderSidebar();
    navigate('settings');
  });
  
  setTimeout(() => {
    const form = document.getElementById('module-form');
    form?.addEventListener('submit', evt => {
      evt.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);
      closeModal(data);
    });
    
    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('module-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });
    
    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}

export function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const result = importData(evt.target.result);
      if (result.success) {
        const data = result.data;
        // Choosing a backup file is explicit consent to replace storage,
        // so it lifts the failed-load save latch (see save()).
        clearStorageError();
        window.EMVS.setState(data);
        window.EMVS.save();
        document.documentElement.dataset.theme = data.settings.theme || 'light';
        window.EMVS.renderSidebar();
        navigate('today');
        window.EMVS.toast.show('Backup erfolgreich importiert');
      } else {
        window.EMVS.toast.show('Import fehlgeschlagen: ' + result.error);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Make navigate available
function navigate(view) {
  window.EMVS.navigate?.(view);
}