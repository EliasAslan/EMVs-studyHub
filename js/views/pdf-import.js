/**
 * PDF Import — "PDF → neues Modul" via the user's local Ollama.
 *
 * Flow: file picker → meta (code/title) → progress (extract → chunks →
 * merge, cancellable) → draft review (checkboxes + editable fields) →
 * commit. The AI never writes directly; commit only creates what the user
 * checked. Existing data is never touched (new module + new entities only).
 */

import { escapeHtml } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, ensureObjectiveFields } from '../services/store.js';
import { extractPdfText, describePdfError } from '../services/pdfExtract.js';
import {
  getLocalAISettings,
  checkConnection,
  extractObjectivesFromText,
  describeLocalAIError,
} from '../services/localAI.js';
import { navigate } from './router.js';

export function openPdfImport() {
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
      <p class="pdf-note">Die Analyse läuft lokal: PDF-Text und Anfragen verlassen diesen Rechner nicht — sie gehen nur an dein eigenes Ollama.</p>
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
      <button class="btn primary" data-action="analyze">Analysieren</button>
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
        runPdfAnalysis(file, { code, title, ai, fileRef: file });
      } finally {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      }
    });
  }, 50);
}

function setModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
}

function showProgress(meta, statusText, phase = null) {
  const bar = statusText
    ? `<div class="pdf-progress"><div class="pdf-progress-fill" style="width: ${phase?.total ? Math.round((phase.done / phase.total) * 100) : 0}%"></div></div>
       <p class="pdf-status" role="status">${escapeHtml(statusText)}</p>`
    : '';
  setModal(
    `Modul aus PDF — ${escapeHtml(meta.title)}`,
    `<p class="pdf-note">Analyse läuft lokal über <span class="mono">${escapeHtml(meta.ai.model)}</span>. Das kann bei langen PDFs einige Minuten dauern.</p>${bar}<div class="pdf-error" id="pdf-error" role="alert" hidden></div>`,
    `<button class="btn" data-action="cancel">Abbrechen</button>`,
  );
  document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => {
    meta.abort.abort();
    closeModal();
  });
}

async function runPdfAnalysis(file, meta) {
  meta.abort = new AbortController();
  const { signal } = meta;
  showProgress(meta, 'Text wird extrahiert…');

  let extracted;
  try {
    extracted = await extractPdfText(file, {
      signal,
      onProgress: ({ done, total }) => showProgress(meta, `Text wird extrahiert… Seite ${done}/${total}`, { done, total }),
    });
  } catch (e) {
    if (e?.code === 'aborted') return;
    return showPdfError(meta, describePdfError(e?.code));
  }

  showProgress(meta, 'Lernziele werden extrahiert…', { done: 0, total: 1 });
  let result;
  try {
    result = await extractObjectivesFromText(extracted.text, {
      model: meta.ai.model,
      baseUrl: meta.ai.baseUrl,
      numCtx: meta.ai.numCtx,
      moduleTitle: meta.title,
      signal,
      onProgress: (p) => {
        if (p.phase === 'chunks') showProgress(meta, `Lernziele werden extrahiert… Abschnitt ${Math.min(p.done + 1, p.total)}/${p.total}`, p);
        else showProgress(meta, 'Ergebnisse werden zusammengeführt…', { done: 1, total: 1 });
      },
    });
  } catch (e) {
    if (e?.code === 'aborted' || signal.aborted) return;
    return showPdfError(meta, describeLocalAIError(e?.code));
  }

  if (!result.objectives.length && !result.resources.length) {
    return showPdfError(meta, 'Keine Lernziele gefunden. Das PDF enthält evtl. zu wenig Fliesstext — Titel ggf. manuell anlegen.');
  }
  openPdfReviewStep(meta, result);
}

function showPdfError(meta, message) {
  showProgress(meta, null);
  const box = document.getElementById('pdf-error');
  if (box) { box.hidden = false; box.textContent = message; }
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn" data-action="close">Schliessen</button>
    <button class="btn" data-action="retry">Erneut versuchen</button>
  `;
  document.querySelector('#modal-footer [data-action="close"]')?.addEventListener('click', () => closeModal());
  document.querySelector('#modal-footer [data-action="retry"]')?.addEventListener('click', () => openPdfMetaStep(meta.fileRef || { name: '' }));
}

function draftItemHtml(kind, item, i) {
  const id = `pdf-${kind}-${i}`;
  if (kind === 'obj') {
    return `
      <li class="pdf-draft-item" data-kind="obj" data-idx="${i}">
        <label class="pdf-check"><input type="checkbox" data-check checked><span class="sr-only">Lernziel ${i + 1} übernehmen</span></label>
        <div class="pdf-draft-main">
          <input type="text" data-title value="${escapeHtml(item.title)}" aria-label="Lernziel ${i + 1} Titel" maxlength="300">
          <textarea data-desc rows="2" aria-label="Lernziel ${i + 1} Beschreibung" maxlength="800" placeholder="Beschreibung (optional)">${escapeHtml(item.description || '')}</textarea>
        </div>
      </li>`;
  }
  return `
    <li class="pdf-draft-item" data-kind="res" data-idx="${i}">
      <label class="pdf-check"><input type="checkbox" data-check checked><span class="sr-only">Ressource übernehmen: ${escapeHtml(item.name)}</span></label>
      <div class="pdf-draft-main">
        <div class="pdf-res-name">${escapeHtml(item.name)}</div>
        ${item.note ? `<div class="pdf-res-note">${escapeHtml(item.note)}</div>` : ''}
      </div>
    </li>`;
}

function openPdfReviewStep(meta, result) {
  const objs = result.objectives;
  const ress = result.resources;
  setModal(
    `Entwurf prüfen — ${escapeHtml(meta.title)}`,
    `
    <p class="pdf-note">${objs.length} Lernziel${objs.length !== 1 ? 'e' : ''}${ress.length ? `, ${ress.length} Ressource${ress.length !== 1 ? 'n' : ''}` : ''} aus dem PDF vorgeschlagen. Abgewähltes wird nicht übernommen — nichts wird automatisch gespeichert.</p>
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
    `
    <button class="btn" data-action="cancel">Verwerfen</button>
    <button class="btn primary" data-action="commit" id="pdf-commit">Modul erstellen</button>
    `,
  );

  const updateCommitLabel = () => {
    const n = document.querySelectorAll('#pdf-obj-list [data-check]:checked').length;
    const btn = document.getElementById('pdf-commit');
    if (btn) btn.textContent = `Modul erstellen · ${n} Lernziel${n !== 1 ? 'e' : ''}`;
  };
  document.querySelectorAll('[data-check]').forEach(c => c.addEventListener('change', updateCommitLabel));
  updateCommitLabel();

  document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  document.querySelector('#modal-footer [data-action="commit"]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    try {
      commitPdfModule(meta);
    } finally {
      btn.removeAttribute('aria-busy');
    }
  });
}

function collectChecked(listId, kind) {
  const out = [];
  document.querySelectorAll(`#${listId} .pdf-draft-item`).forEach((li) => {
    if (!li.querySelector('[data-check]')?.checked) return;
    if (kind === 'obj') {
      const title = li.querySelector('[data-title]')?.value.trim() || '';
      if (!title) return;
      out.push({ title, description: li.querySelector('[data-desc]')?.value.trim() || '' });
    } else {
      out.push({
        name: li.querySelector('.pdf-res-name')?.textContent.trim() || '',
        note: li.querySelector('.pdf-res-note')?.textContent.trim() || '',
      });
    }
  });
  return out.filter(x => (x.title || x.name) && String(x.title || x.name).length >= 3);
}

function commitPdfModule(meta) {
  const objectives = collectChecked('pdf-obj-list', 'obj');
  const resources = collectChecked('pdf-res-list', 'res');
  if (!objectives.length) {
    window.EMVS.toast?.show('Mindestens ein Lernziel auswählen — oder verwerfen');
    return;
  }
  const state = window.EMVS.getState();
  const now = Date.now();
  const moduleId = generateId();
  state.modules.push({
    id: moduleId,
    code: meta.code,
    title: meta.title,
    accent: '#b45309',
    targetGrade: 5.0,
    createdAt: now,
    updatedAt: now,
  });
  objectives.forEach((o, i) => {
    state.learningObjectives.push(ensureObjectiveFields({
      id: generateId(),
      moduleId,
      number: i + 1,
      title: o.title,
      description: o.description,
      status: 'todo',
      confidence: 0,
      notes: '',
      confidenceHistory: [],
      reviewHistory: [],
      lastTouched: now,
      lastReviewed: null,
      totalStudyTime: 0,
      reviewSchedule: null,
      sessionHistory: [],
      createdAt: now,
      updatedAt: now,
    }));
  });
  resources.forEach((r) => {
    state.resources.push({
      id: generateId(),
      moduleId,
      name: r.name,
      type: 'Other',
      focus: '70',
      status: 'todo',
      url: '',
      linkedObjectiveIds: [],
      notes: r.note || 'Aus PDF importiert',
      createdAt: now,
      updatedAt: now,
    });
  });
  state.settings.currentModuleId = moduleId;
  if (!window.EMVS.save()) {
    // Roll back in-memory additions so a failed save never leaves ghost data.
    state.modules = state.modules.filter(m => m.id !== moduleId);
    state.learningObjectives = state.learningObjectives.filter(o => o.moduleId !== moduleId);
    state.resources = state.resources.filter(r => r.moduleId !== moduleId);
    window.EMVS.toast?.show('Speichern fehlgeschlagen — nichts wurde übernommen');
    return;
  }
  closeModal(true);
  window.EMVS.renderSidebar();
  navigate('module', { id: moduleId, tab: 'ziele' });
  window.EMVS.toast?.show(`Modul ${meta.code} erstellt · ${objectives.length} Lernziele übernommen`);
}
