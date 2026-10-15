/**
 * PDF Import — "PDF → neues Modul" via the user's local Ollama.
 *
 * Non-blocking flow: file picker → meta (code/title) → the analysis runs
 * as a background task (services/pdfTasks.js) rendered by the floating
 * task panel — the user keeps using the app meanwhile. When done, the
 * panel offers "results review": this modal, whose edits live-sync back
 * into the task draft so they survive closing/reopening. Commit only
 * creates what the user checked; existing data is never touched.
 */

import { escapeHtml } from '../utils/helpers.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { getLocalAISettings, checkConnection, describeLocalAIError } from '../services/localAI.js';
import {
  describeStartBlock,
  createTask,
  runTask,
  dismissTask,
  markCommitted,
  updateDraft,
  buildModuleEntities,
  getTask,
} from '../services/pdfTasks.js';
import { setReviewOpener, focusTaskPanel } from '../components/taskPanel.js';
import { navigate } from './router.js';

export function openPdfImport() {
  const block = describeStartBlock();
  if (block === 'active') {
    window.EMVS?.toast?.show('Analyse läuft bereits — siehe Aufgabenpanel');
    focusTaskPanel();
    return;
  }
  if (block === 'unreviewed') {
    confirmDialog(
      'Es liegt noch ein ungeprüftes Ergebnis vor. Neue Analyse starten und das alte Ergebnis verwerfen?',
      'Analyse ersetzen',
    ).then((yes) => {
      if (yes) {
        dismissTask();
        pickPdfFile();
      } else {
        focusTaskPanel();
      }
    }).catch(() => {});
    return;
  }
  pickPdfFile();
}

function pickPdfFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,application/pdf';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) openPdfMetaStep(file);
  };
  input.click();
}

function suggestTitle(filename) {
  return String(filename || '').replace(/\.pdf$/i, '').replace(/[_\-]+/g, ' ').trim().slice(0, 80);
}

function openPdfMetaStep(file) {
  openModal({
    title: 'Modul aus PDF',
    body: `
      <p class="pdf-note">Die Analyse läuft lokal und im Hintergrund: PDF-Text und Anfragen verlassen diesen Rechner nicht — sie gehen nur an dein eigenes Ollama. Du kannst die App währenddessen weiter nutzen.</p>
      <div class="field-row">
        <label for="pdf-file-name">Datei</label>
        <input type="text" id="pdf-file-name" value="${escapeHtml(file.name)}" disabled style="max-width: 100%;">
      </div>
      <div class="field-row">
        <label for="pdf-mod-code">Modul-Code</label>
        <input type="text" id="pdf-mod-code" required maxlength="12" placeholder="z.B. 162" style="max-width: 160px; text-transform: uppercase;">
      </div>
      <div class="field-row">
        <label for="pdf-mod-title">Modul-Titel</label>
        <input type="text" id="pdf-mod-title" required maxlength="120" value="${escapeHtml(suggestTitle(file.name))}" style="max-width: 100%;">
      </div>
      <div class="pdf-error" id="pdf-error" role="alert" hidden></div>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="analyze">Analyse starten</button>
    `,
    onClose: () => {},
  });

  setTimeout(() => {
    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
    document.querySelector('#modal-footer [data-action="analyze"]')?.addEventListener('click', async (e) => {
      const code = document.getElementById('pdf-mod-code')?.value.trim().toUpperCase() || '';
      const title = document.getElementById('pdf-mod-title')?.value.trim() || '';
      const errBox = document.getElementById('pdf-error');
      if (!code || !title) {
        if (errBox) { errBox.hidden = false; errBox.textContent = 'Bitte Modul-Code und Titel ausfüllen.'; }
        return;
      }
      const btn = e.currentTarget;
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      try {
        const ai = getLocalAISettings(window.EMVS.getState());
        const conn = await checkConnection({ baseUrl: ai.baseUrl });
        if (!conn.ok) {
          if (errBox) {
            errBox.hidden = false;
            errBox.innerHTML = `${escapeHtml(describeLocalAIError(conn.error))} <button class="btn ghost pdf-inline-btn" id="pdf-goto-settings">Anleitung öffnen</button>`;
            errBox.querySelector('#pdf-goto-settings')?.addEventListener('click', () => {
              closeModal();
              navigate('settings');
            });
          }
          return;
        }
        // Hand off to the background task; the modal closes, the panel takes over.
        const task = createTask({ file, code, title, ai });
        closeModal();
        window.EMVS?.toast?.show('Analyse läuft im Hintergrund — du kannst weiterarbeiten');
        runTask(task).catch(() => {});
      } finally {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      }
    });
  }, 50);
}

function draftItemHtml(kind, item, i) {
  const checked = item.checked !== false ? 'checked' : '';
  if (kind === 'obj') {
    return `
      <li class="pdf-draft-item" data-kind="obj" data-idx="${i}">
        <label class="pdf-check"><input type="checkbox" data-check ${checked}><span class="sr-only">Lernziel ${i + 1} übernehmen</span></label>
        <div class="pdf-draft-main">
          <input type="text" data-title value="${escapeHtml(item.title)}" aria-label="Lernziel ${i + 1} Titel" maxlength="300">
          <textarea data-desc rows="2" aria-label="Lernziel ${i + 1} Beschreibung" maxlength="800" placeholder="Beschreibung (optional)">${escapeHtml(item.description || '')}</textarea>
        </div>
      </li>`;
  }
  return `
    <li class="pdf-draft-item" data-kind="res" data-idx="${i}">
      <label class="pdf-check"><input type="checkbox" data-check ${checked}><span class="sr-only">Ressource übernehmen: ${escapeHtml(item.name)}</span></label>
      <div class="pdf-draft-main">
        <div class="pdf-res-name">${escapeHtml(item.name)}</div>
        ${item.note ? `<div class="pdf-res-note">${escapeHtml(item.note)}</div>` : ''}
      </div>
    </li>`;
}

/** Review (and edit) a finished task result. Edits sync into the task draft. */
export function openPdfReview(task) {
  const t = task || getTask();
  if (!t || t.status !== 'done' || !t.result) return;
  const objs = t.result.objectives || [];
  const ress = t.result.resources || [];

  openModal({
    title: `Entwurf prüfen — ${t.title}`,
    body: `
    <p class="pdf-note">${objs.length} Lernziel${objs.length !== 1 ? 'e' : ''}${ress.length ? `, ${ress.length} Ressource${ress.length !== 1 ? 'n' : ''}` : ''} aus dem PDF vorgeschlagen. Abgewähltes wird nicht übernommen — nichts wird automatisch gespeichert. Änderungen bleiben erhalten, auch wenn du zwischendurch woanders weiterarbeitest.</p>
    <div class="section-label">Lernziele</div>
    <ul class="pdf-draft-list" id="pdf-obj-list">
      ${objs.map((o, i) => draftItemHtml('obj', o, i)).join('')}
    </ul>
    ${ress.length ? `
      <div class="section-label" style="margin-top: 16px;">Ressourcen</div>
      <ul class="pdf-draft-list" id="pdf-res-list">
        ${ress.map((r, i) => draftItemHtml('res', r, i)).join('')}
      </ul>` : ''}
    `,
    footer: `
    <button class="btn" data-action="later">Später prüfen</button>
    <button class="btn primary" data-action="commit" id="pdf-commit">Modul erstellen</button>
    `,
    onClose: () => {},
  });

  const syncDraft = () => {
    const nextObjs = [...document.querySelectorAll('#pdf-obj-list .pdf-draft-item')].map((li) => ({
      title: li.querySelector('[data-title]')?.value ?? '',
      description: li.querySelector('[data-desc]')?.value ?? '',
      checked: !!li.querySelector('[data-check]')?.checked,
    }));
    const nextRes = [...document.querySelectorAll('#pdf-res-list .pdf-draft-item')].map((li) => {
      const prev = (t.result.resources || []).find((r, idx) => String(idx) === li.dataset.idx);
      return {
        name: prev?.name || '',
        note: prev?.note || '',
        checked: !!li.querySelector('[data-check]')?.checked,
      };
    });
    updateDraft(t, nextObjs, nextRes);
    const n = nextObjs.filter(o => o.checked && o.title.trim()).length;
    const btn = document.getElementById('pdf-commit');
    if (btn) btn.textContent = `Modul erstellen · ${n} Lernziel${n !== 1 ? 'e' : ''}`;
  };

  setTimeout(() => {
    document.querySelectorAll('#pdf-obj-list [data-check], #pdf-obj-list [data-title], #pdf-obj-list [data-desc], #pdf-res-list [data-check]')
      .forEach(c => c.addEventListener('input', syncDraft));
    document.querySelectorAll('#pdf-obj-list [data-check], #pdf-res-list [data-check]')
      .forEach(c => c.addEventListener('change', syncDraft));
    syncDraft();
    document.querySelector('#modal-footer [data-action="later"]')?.addEventListener('click', () => {
      syncDraft();
      closeModal();
      window.EMVS?.toast?.show('Entwurf gespeichert — über das Aufgabenpanel fortsetzen');
    });
    document.querySelector('#modal-footer [data-action="commit"]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      try {
        syncDraft();
        commitPdfTask(t);
      } finally {
        btn.removeAttribute('aria-busy');
      }
    });
  }, 50);
}

function commitPdfTask(t) {
  const draft = t.result || { objectives: [], resources: [] };
  const objectives = (draft.objectives || []).filter(o => o.checked !== false);
  const resources = (draft.resources || []).filter(r => r.checked !== false);
  if (!objectives.filter(o => String(o.title || '').trim().length >= 3).length) {
    window.EMVS.toast?.show('Mindestens ein Lernziel auswählen — oder später prüfen');
    return;
  }
  const built = buildModuleEntities(
    { code: t.code, title: t.title },
    { objectives, resources },
  );
  if (!built.objectives.length) {
    window.EMVS.toast?.show('Mindestens ein gültiges Lernziel auswählen');
    return;
  }
  const state = window.EMVS.getState();
  const moduleId = built.module.id;
  state.modules.push(built.module);
  built.objectives.forEach(o => state.learningObjectives.push(o));
  built.resources.forEach(r => state.resources.push(r));
  state.settings.currentModuleId = moduleId;
  if (!window.EMVS.save()) {
    // Roll back in-memory additions so a failed save never leaves ghost data.
    state.modules = state.modules.filter(m => m.id !== moduleId);
    state.learningObjectives = state.learningObjectives.filter(o => o.moduleId !== moduleId);
    state.resources = state.resources.filter(r => r.moduleId !== moduleId);
    window.EMVS.toast?.show('Speichern fehlgeschlagen — nichts wurde übernommen');
    return;
  }
  markCommitted(t);
  dismissTask();
  closeModal(true);
  window.EMVS.renderSidebar();
  navigate('module', { id: moduleId, tab: 'ziele' });
  window.EMVS.toast?.show(`Modul ${built.module.code} erstellt · ${built.objectives.length} Lernziele übernommen`);
}

// Panel → review wiring (registered on import; no import cycle).
setReviewOpener(openPdfReview);
