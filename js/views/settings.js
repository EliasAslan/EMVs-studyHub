/**
 * Settings View - App configuration, backup, theme
 */

import { escapeHtml } from '../utils/helpers.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { generateId, exportData, importData, clearAll, clearStorageError } from '../services/store.js';
import { renderAuthPanel } from '../services/auth.js';
import { setNavLayout } from '../components/sidebar.js';
import { NAV_LAYOUTS, NAV_LAYOUT_TIERS, getNavLayout } from '../utils/navLayout.js';

/** Tiny schematic of each navigation layout for the picker (decorative). */
function layoutPreview(id) {
  switch (id) {
    case 'rail': return '<i class="nl-bar nl-slim"></i><i class="nl-page"></i>';
    case 'workspace': return '<i class="nl-bar nl-slim"></i><i class="nl-panel"></i><i class="nl-page"></i>';
    case 'tree': return '<i class="nl-bar nl-wide nl-lines"></i><i class="nl-page"></i>';
    case 'mega': return '<i class="nl-top"></i><i class="nl-drop"></i><i class="nl-page"></i>';
    case 'dock': return '<i class="nl-page"></i><i class="nl-pill"></i>';
    case 'mobile': return '<i class="nl-phonetop"></i><i class="nl-page"></i><i class="nl-tabs"></i>';
    case 'context': return '<i class="nl-bar nl-wide nl-segs"></i><i class="nl-page"></i>';
    case 'command': return '<i class="nl-top nl-search"></i><i class="nl-page"></i>';
    case 'bento': return '<i class="nl-cell nl-c1"></i><i class="nl-cell nl-c2"></i><i class="nl-cell nl-c3"></i><i class="nl-cell nl-c4"></i>';
    case 'focus': return '<i class="nl-page"></i><i class="nl-dot"></i>';
    default: return '<i class="nl-bar"></i><i class="nl-page"></i>';
  }
}
import { getLocalAISettings, checkConnection, describeLocalAIError } from '../services/localAI.js';
import { openPdfImport } from './pdf-import.js';

export function renderSettings(state) {
  const moduleId = state.settings.currentModuleId;
  const m = state.modules.find(x => x.id === moduleId);
  const ai = getLocalAISettings(state);
  const siteOrigin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://em-vs-study-hub.vercel.app';
  const navLayout = getNavLayout(state);
  
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Dein Lernbereich</div>
    <h1 class="page-title">Einstellungen</h1>
    <p class="page-lede settings-intro">Passe Study Hub an deinen Lernalltag an. Module, Darstellung, lokale KI und Datensicherung — die wichtigsten Optionen auf einen Blick.</p>
    <div class="settings-context">
      <span class="settings-context-item"><span class="settings-context-dot" aria-hidden="true"></span>${m ? `Aktives Modul: <strong>${escapeHtml(m.code)} · ${escapeHtml(m.title)}</strong>` : 'Noch kein Modul ausgewählt'}</span>
      <span class="settings-context-note">Änderungen werden automatisch gespeichert.</span>
    </div>
    
    <div class="settings-section">
      <details class="settings-group">
      <summary class="settings-group-summary"><span>Modul-Einstellungen</span><span class="settings-summary-hint">Zielnote, Titel und Farbe</span></summary>
      <div class="settings-group-content">
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
      </details>
    </div>
    
    <hr class="rule">
    
    <div class="settings-section">
      <details class="settings-group">
      <summary class="settings-group-summary"><span>App-Einstellungen</span><span class="settings-summary-hint">Theme und Darstellung</span></summary>
      <div class="settings-group-content">
      <div class="field-row">
        <label>Theme</label>
        <select id="set-theme" style="max-width: 200px;">
          <option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Hell</option>
          <option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dunkel</option>
        </select>
      </div>
      <div class="field-row">
        <div class="nav-layout-pick" role="radiogroup" aria-label="Navigation">
          ${NAV_LAYOUT_TIERS.map(g => `
            <fieldset class="nav-layout-group" data-tier="${g.id}">
              <legend>${escapeHtml(g.label)}</legend>
              ${NAV_LAYOUTS.filter(l => l.tier === g.id).map(l => `
                <label class="nav-layout-option${navLayout === l.id ? ' selected' : ''}">
                  <input type="radio" name="nav-layout" value="${l.id}"${navLayout === l.id ? ' checked' : ''}>
                  <span class="nl-preview nl-${l.id}" aria-hidden="true">${layoutPreview(l.id)}</span>
                  <span class="nl-text"><strong>${escapeHtml(l.label)}</strong><small>${escapeHtml(l.hint)}</small></span>
                </label>`).join('')}
            </fieldset>`).join('')}
        </div>
        <p class="muted" style="font-size: 12.5px; margin-top: 8px;">Wechselt sofort, ganz ohne Neuladen — die Auswahl bleibt gespeichert. Auf schmalen Bildschirmen nutzt Study Hub automatisch die mobile Navigation (Befehlspalette: Strg+K; „Navigation: …“ wechselt das Layout von überall); die Desktop-Auswahl bleibt dabei erhalten.</p>
      </div>
    </div>
      </details>
    </div>
    
    <hr class="rule">

    <div class="settings-section">
      <details class="settings-group" open>
        <summary class="settings-group-summary"><span>Lokale KI (Ollama, optional)</span><span class="settings-summary-hint">PDF-Import mit Qwen</span></summary>
        <div class="settings-group-content">
      <p class="settings-ai-intro">
        Erstelle Lernziele und Ressourcen aus einem PDF mit <strong>Qwen auf deinem eigenen PC</strong>. Die KI ist optional; deine normale Lernplanung funktioniert auch ohne sie.
      </p>
      <div class="ai-action-card">
        <div class="ai-action-copy">
          <strong>Was möchtest du mit der KI machen?</strong>
          <span>PDF hochladen, Lernziele und Ressourcen erkennen lassen und den Entwurf prüfen.</span>
        </div>
        <button class="btn primary ai-import-cta" id="ai-import-pdf">PDF auswählen →</button>
      </div>
      <div class="ai-status" id="ai-status">
        <span class="ai-dot" id="ai-dot" aria-hidden="true"></span>
        <span id="ai-status-text">Noch nicht geprüft</span>
        <button class="btn" id="ai-test" style="font-size: 12px;">Verbindung testen</button>
      </div>
      <div class="field-row">
        <label for="ai-model">Modell</label>
        <input type="text" id="ai-model" list="ai-model-list" value="${escapeHtml(ai.model)}" style="max-width: 240px;" placeholder="z.B. qwen3:8b">
        <datalist id="ai-model-list"></datalist>
      </div>
      <div class="field-row">
        <label for="ai-baseurl">Ollama-Adresse</label>
        <input type="text" id="ai-baseurl" value="${escapeHtml(ai.baseUrl)}" style="max-width: 280px;" inputmode="url" placeholder="http://localhost:11434">
      </div>
      <details class="ai-setup" id="ai-setup">
        <summary>Einrichtung für diese Website <span class="settings-guide-meta">· einmalig pro Website-Adresse</span></summary>
        <p class="settings-guide-lede">Ollama und <span class="mono">qwen3:8b</span> sind bereits installiert? Dann brauchst du nur den Website-Zugriff freizugeben und Ollama neu zu starten.</p>
        <ol>
          <li><strong>Ollama und das Modell prüfen.</strong> Öffne PowerShell und führe aus:
            <span class="mono">ollama --version</span>
            <span class="mono">ollama list</span>
            Wenn <span class="mono">qwen3:8b</span> fehlt, lade es mit <span class="mono">ollama pull qwen3:8b</span>.
          </li>
          <li><strong>Dieser Website Zugriff erlauben.</strong> Folgenden Befehl in PowerShell ausführen (einmalig):
            <div class="mono" id="ai-origins-cmd">setx OLLAMA_ORIGINS "${escapeHtml(siteOrigin)},http://localhost:*,http://127.0.0.1:*"</div>
            <button class="btn ghost" id="ai-copy-origins" style="font-size: 12px;">Befehl kopieren</button>
          </li>
          <li><strong>Ollama neu starten.</strong> Wichtig — sonst gilt die Freigabe nicht: Tray-Icon (unten rechts) → <em>Quit Ollama</em> → Ollama neu öffnen. Alternativ in PowerShell: <span class="mono">ollama serve</span></li>
          <li><strong>Verbindung testen.</strong> Oben auf „Verbindung testen“ klicken. Bei Erfolg steht dort „Verbunden“ plus die gefundenen Modelle — diese erscheinen dann auch als Vorschläge im Modell-Feld.</li>
          <li><strong>PDF importieren.</strong> Unter Übersicht (leerer Start) oder hier in der Modul-Verwaltung auf <strong>„Modul aus PDF“</strong> klicken, Datei wählen, Entwurf prüfen, übernehmen.</li>
        </ol>
        <details class="ai-troubleshooting">
          <summary>Wenn etwas nicht klappt</summary>
          <ul class="ai-trouble">
          <li><span class="mono">nicht erreichbar</span> — Ollama läuft nicht auf diesem Rechner. <span class="mono">ollama serve</span> starten.</li>
          <li><span class="mono">antwortet nicht</span> — Ollama läuft, aber kein Modell geladen. <span class="mono">ollama list</span> prüfen.</li>
          <li><span class="mono">CORS / blockt</span> — Schritt 2+3 wiederholen: exakte Adresse oben kopieren, neues PowerShell-Fenster, Ollama wirklich beenden und neu starten.</li>
          <li><span class="mono">Modell nicht installiert</span> — Modellname im Feld prüfen oder per <span class="mono">ollama pull &lt;name&gt;</span> laden.</li>
          </ul>
        </details>
        <p class="muted settings-guide-footnote">Der Befehl wird für die aktuell geöffnete Website erzeugt. Nutze am besten die feste Adresse <span class="mono">em-vs-study-hub.vercel.app</span>, damit du die Freigabe nicht für wechselnde Vorschau-URLs wiederholen musst. Nach dem Ausführen des Befehls Ollama vollständig beenden und erneut öffnen.</p>
      </details>
        </div>
      </details>
    </div>

    <hr class="rule">

    <div class="settings-section">
      <details class="settings-group">
      <summary class="settings-group-summary"><span>Konto / Supabase</span><span class="settings-summary-hint">Anmeldung und Cloud</span></summary>
      <div class="settings-group-content">
      <div id="supabase-auth-panel"></div>
    </div>
      </details>
    </div>

    <hr class="rule">
    
    <div class="settings-section">
      <details class="settings-group">
      <summary class="settings-group-summary"><span>Modul-Verwaltung</span><span class="settings-summary-hint">Module erstellen und bearbeiten</span></summary>
      <div class="settings-group-content">
      <div class="mt-2" style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn primary" id="create-module">＋ Neues Modul erstellen</button>
        <button class="btn" id="create-module-pdf">Modul aus PDF (lokale KI)</button>
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
      </details>
    </div>
    
    <hr class="rule">
    
    <div class="settings-section">
      <details class="settings-group">
      <summary class="settings-group-summary"><span>Daten</span><span class="settings-summary-hint">Backup und Zurücksetzen</span></summary>
      <div class="settings-group-content">
      <p style="font-size: 13.5px; color: var(--ink-2); max-width: 52ch; margin-bottom: 16px;">
        Study Hub speichert Daten standardmäßig lokal im Browser. Supabase-Sync erfolgt manuell im Konto-Bereich; exportiere regelmäßig Backups.
      </p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn primary" id="btn-export">Backup exportieren (JSON)</button>
        <button class="btn" id="btn-import">Backup importieren</button>
        <button class="btn danger" id="btn-reset">Alle Daten zurücksetzen</button>
      </div>
    </div>
      </details>
    </div>
    
    <hr class="rule">
    
    <div class="settings-section">
      <details class="settings-group">
      <summary class="settings-group-summary"><span>Info</span><span class="settings-summary-hint">Version und Datenmodell</span></summary>
      <div class="settings-group-content">
      <p style="font-size: 13.5px; color: var(--ink-2); max-width: 52ch;">
        EMVS Study Hub v1.0 — Local-first Lernmanagement.<br>
        Datenmodell: Module, Lernziele, Ressourcen, Sitzungen, Prüfungen, Plan, Erfassungen, Wochenreviews.
      </p>
    </div>
  `;
  
  renderAuthPanel(el.querySelector('#supabase-auth-panel'));

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

  // Navigation layout: applies immediately, persists via settings.
  el.querySelectorAll('input[name="nav-layout"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      setNavLayout(radio.value);
      el.querySelectorAll('.nav-layout-option').forEach(opt => {
        opt.classList.toggle('selected', opt.querySelector('input')?.checked === true);
      });
    });
  });

  // Local AI (Ollama) settings
  const saveLocalAI = () => {
    state.settings.localAI = {
      model: el.querySelector('#ai-model')?.value.trim() || 'qwen3:8b',
      baseUrl: el.querySelector('#ai-baseurl')?.value.trim() || 'http://localhost:11434',
      numCtx: state.settings.localAI?.numCtx || 8192,
    };
    window.EMVS.save();
  };
  el.querySelector('#ai-model')?.addEventListener('change', saveLocalAI);
  el.querySelector('#ai-baseurl')?.addEventListener('change', saveLocalAI);
  el.querySelector('#ai-copy-origins')?.addEventListener('click', async (e) => {
    const cmd = el.querySelector('#ai-origins-cmd')?.textContent.trim() || '';
    try {
      await navigator.clipboard.writeText(cmd);
      window.EMVS.toast?.show('Befehl kopiert — in PowerShell ausführen, dann Ollama neu starten');
    } catch {
      window.EMVS.toast?.show('Kopieren fehlgeschlagen — Befehl manuell übernehmen');
    }
  });
  const runAiTest = async () => {
    const btn = el.querySelector('#ai-test');
    const dot = el.querySelector('#ai-dot');
    const label = el.querySelector('#ai-status-text');
    btn?.setAttribute('aria-busy', 'true');
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Prüfe…';
    try {
      saveLocalAI();
      const current = getLocalAISettings(window.EMVS.getState());
      const conn = await checkConnection({ baseUrl: current.baseUrl });
      const list = el.querySelector('#ai-model-list');
      if (list && conn.models.length) {
        list.innerHTML = conn.models.map(n => `<option value="${escapeHtml(n)}">`).join('');
      }
      if (dot) dot.dataset.state = conn.ok ? 'ok' : 'fail';
      if (label) {
        label.textContent = conn.ok
          ? (conn.models.length ? `Verbunden — ${conn.models.length} Modell${conn.models.length !== 1 ? 'e' : ''} gefunden` : 'Verbunden — keine Modelle gefunden (ollama pull …)')
          : describeLocalAIError(conn.error);
      }
      // Auto-open the guide when the check fails, so the fix is one click away.
      if (!conn.ok) el.querySelector('#ai-setup')?.setAttribute('open', '');
    } finally {
      btn?.removeAttribute('aria-busy');
      if (btn) btn.disabled = false;
    }
  };
  el.querySelector('#ai-test')?.addEventListener('click', runAiTest);
  // Live status on open — no stale "not checked yet".
  runAiTest();
  
  el.querySelector('#create-module')?.addEventListener('click', () => openModuleModal());
  el.querySelector('#create-module-pdf')?.addEventListener('click', () => openPdfImport());
  el.querySelector('#ai-import-pdf')?.addEventListener('click', () => openPdfImport());
  el.querySelector('#btn-export')?.addEventListener('click', () => window.EMVS.exportData());
  el.querySelector('#btn-import')?.addEventListener('click', () => importBackup());
  el.querySelector('#btn-reset')?.addEventListener('click', async () => {
    if (await confirmDialog('Wirklich ALLE Daten unwiderruflich löschen? Dies kann nicht rückgängig gemacht werden.', 'Daten zurücksetzen')) {
      const fresh = clearAll();
      window.EMVS.setState(fresh);
      // Dismiss the storage-failure banner only once saving verifiably
      // works again — clearAll() lifted the latch, so true means recovered.
      if (window.EMVS.save()) hideStorageErrorBanner();
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
      </details>
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
    reader.onerror = () => {
      window.EMVS.toast.show('Backup konnte nicht gelesen werden — Datei prüfen und erneut versuchen');
    };
    reader.onload = async evt => {
      const result = importData(evt.target.result);
      if (!result.success) {
        window.EMVS.toast.show('Import fehlgeschlagen: ' + result.error);
        return;
      }
      // Importing replaces the entire local dataset — require explicit
      // confirmation AFTER the file parsed, so a wrong-file click or a
      // corrupt file can never silently destroy current data.
      const ok = await confirmDialog(
        'Backup importieren? Dies ersetzt alle aktuellen Daten unwiderruflich. Exportiere zuerst ein Backup, falls du den aktuellen Stand behalten willst.',
        'Backup importieren'
      );
      if (!ok) return;
      const data = result.data;
      // Choosing a backup file is explicit consent to replace storage,
      // so it lifts the failed-load save latch (see save()).
      clearStorageError();
      window.EMVS.setState(data);
      // Dismiss the storage-failure banner only once the recovery save
      // verifiably succeeded — a failed save keeps warning and latch.
      if (window.EMVS.save()) hideStorageErrorBanner();
      document.documentElement.dataset.theme = data.settings.theme || 'light';
      window.EMVS.renderSidebar();
      navigate('today');
      window.EMVS.toast.show('Backup erfolgreich importiert');
    };
    reader.readAsText(file);
  };
  input.click();
}

// Make navigate available
function navigate(view) {
  window.EMVS.navigate?.(view);
}

/**
 * Remove the startup storage-failure banner (see showStorageErrorBanner in
 * app.js). Called only after a recovery save returned true — i.e. saving is
 * verifiably re-enabled — never on mere navigation to settings, and never
 * after a failed import or failed save.
 */
function hideStorageErrorBanner() {
  document.getElementById('storage-error-banner')?.remove();
}