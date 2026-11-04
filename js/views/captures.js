/**
 * Captures View — a lightweight inbox for everything that doesn't fit
 * another entity: questions, terms, resources, mistakes, thoughts.
 *
 * Each capture holds content + timestamp + optional module/objective, and is
 * editable/deletable. Speed is the point: `openQuickCapture()` opens a
 * minimal sheet (autofocus, Cmd/Ctrl+Enter saves, current module preset)
 * that never navigates away — safe to use mid-session while a timer runs.
 * Nothing here disappears silently: captures resurface in objective history.
 */

import { escapeHtml, formatDateTime } from '../utils/helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, deleteWithTombstone } from '../services/store.js';
import { CAPTURE_TYPES, CAPTURE_TYPE_LABELS } from '../utils/helpers.js';
import { navigate, getCurrentView } from './router.js';
import {
  saveAttachment, getAttachment, deleteAttachment, deleteAttachmentsForResource,
  attachmentUrl, formatBytes, validateAttachmentFile,
} from '../services/attachments.js';

// List filter state (module-level so list-only repaints keep it).
const listFilters = { q: '', type: 'all', unlinked: false, module: 'all' };

/**
 * Open Notizen narrowed to one module (used by the module dashboard link).
 * `null`/`'all'` clears the module filter.
 */
export function setCaptureModuleFilter(moduleId = 'all') {
  listFilters.module = moduleId || 'all';
  listFilters.unlinked = false;
}

export function renderCaptures(state) {
  const modules = state.modules;
  const allObjectives = state.learningObjectives;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="eyebrow">Notizen</div>
    <h1 class="page-title">Notizen</h1>
    <p class="page-lede">Deine Notizen zu Modulen und Lernzielen — durchsuchbar, typisiert, an einer Stelle. Optional einem Modul oder Lernziel zuordnen.</p>

    <div class="timer-actions mb-3">
      <button class="btn primary" id="add-capture">＋ Notiz</button>
      <button class="btn" id="quick-capture">⚡ Schnell erfassen</button>
    </div>

    <div class="res-search">
      <input class="res-search-input" id="capture-search" type="search"
        placeholder="Notizen durchsuchen…" value="${escapeHtml(listFilters.q)}" aria-label="Notizen durchsuchen">
    </div>

    <div class="capture-module-filter" style="margin:-4px 0 10px;">
      <label class="sr-only" for="capture-module-filter">Modul filtern</label>
      <select id="capture-module-filter" style="max-width: 260px;">
        <option value="all" ${listFilters.module === 'all' ? 'selected' : ''}>Alle Module</option>
        <option value="none" ${listFilters.module === 'none' ? 'selected' : ''}>Ohne Modul</option>
        ${modules.map(m => `<option value="${m.id}" ${listFilters.module === m.id ? 'selected' : ''}>Modul ${escapeHtml(m.code)}</option>`).join('')}
      </select>
    </div>

    <div class="capture-filters mb-3" style="display: flex; gap: 8px; flex-wrap: wrap;">
      <button class="badge filter-btn ${listFilters.type === 'all' && !listFilters.unlinked ? 'active' : ''}" data-filter="all">Alle</button>
      ${CAPTURE_TYPES.map(t => `<button class="badge filter-btn ${listFilters.type === t ? 'active' : ''}" data-filter="${t}">${CAPTURE_TYPE_LABELS[t]}</button>`).join('')}
      <button class="badge filter-btn ${listFilters.unlinked ? 'active' : ''}" data-filter="__unlinked" title="Notizen ohne Modul und Lernziel">Ohne Zuordnung</button>
    </div>
    <div class="captures-list" id="captures-list"></div>
  `;

  paintCaptureList(el, state, modules, allObjectives);

  el.querySelector('#quick-capture')?.addEventListener('click', () => openQuickCapture());
  el.querySelector('#add-capture')?.addEventListener('click', () => openCaptureModal(null));

  el.querySelector('#capture-search')?.addEventListener('input', e => {
    listFilters.q = e.target.value;
    paintCaptureList(el, state, modules, allObjectives);
  });

  el.querySelector('#capture-module-filter')?.addEventListener('change', e => {
    listFilters.module = e.target.value || 'all';
    paintCaptureList(el, state, modules, allObjectives);
  });

  el.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter;
      if (f === '__unlinked') {
        listFilters.unlinked = !listFilters.unlinked;
        if (listFilters.unlinked) {
          listFilters.type = 'all';
          listFilters.module = 'all';
          const moduleSelect = el.querySelector('#capture-module-filter');
          if (moduleSelect) moduleSelect.value = 'all';
        }
      } else {
        listFilters.type = f;
        listFilters.unlinked = false;
      }
      el.querySelectorAll('.filter-btn').forEach(b => {
        const bf = b.dataset.filter;
        const active = bf === '__unlinked' ? listFilters.unlinked : (!listFilters.unlinked && listFilters.type === bf);
        b.classList.toggle('active', active);
      });
      paintCaptureList(el, state, modules, allObjectives);
    });
  });

  return el;
}

function filteredCaptures(state, modules, allObjectives) {
  const q = listFilters.q.trim().toLowerCase();
  return [...state.captures]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .filter(c => {
      if (listFilters.module === 'none' && c.moduleId) return false;
      if (listFilters.module !== 'all' && listFilters.module !== 'none' && c.moduleId !== listFilters.module) return false;
      if (listFilters.unlinked && (c.moduleId || c.objectiveId)) return false;
      if (!listFilters.unlinked && listFilters.type !== 'all' && c.type !== listFilters.type) return false;
      if (q) {
        const module = modules.find(m => m.id === c.moduleId);
        const objective = allObjectives.find(o => o.id === c.objectiveId);
        const hay = [c.content, ...(c.tags || []), module?.code, module?.title, objective?.title]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
}

function paintCaptureList(el, state, modules, allObjectives) {
  const captures = filteredCaptures(state, modules, allObjectives);
  const host = el.querySelector('#captures-list');
  host.innerHTML = captures.length
    ? captures.map(c => renderCaptureItem(c, modules, allObjectives)).join('')
    : `<div class="card empty-state"><div class="icon">📝</div><h3>Noch keine Notizen</h3><p>${state.captures.length ? 'Filter oder Suche anpassen.' : 'Halte deine erste Frage, deinen ersten Fehler, deinen ersten Gedanken fest — über „＋ Notiz“.'}</p></div>`;

  host.querySelectorAll('.capture-item').forEach(item => {
    const id = item.dataset.id;
    const capture = state.captures.find(c => c.id === id);
    if (!capture) return;

    item.querySelector('.edit-capture-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      openCaptureModal(capture);
    });

    item.querySelector('.attach-capture-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      pickCaptureAttachment(capture, () => paintCaptureList(el, state, modules, allObjectives));
    });

    item.querySelectorAll('[data-note-file]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      openCaptureAttachment(capture.id, btn.dataset.noteFile, () => paintCaptureList(el, state, modules, allObjectives));
    }));

    item.querySelector('.delete-capture-btn')?.addEventListener('click', async e => {
      e.stopPropagation();
      const snapshot = JSON.parse(JSON.stringify(state.captures));
      const { deleteWithUndo } = await import('../components/undoDelete.js');
      deleteWithUndo({
        message: 'Notiz gelöscht',
        snapshot,
        remove: () => {
          deleteWithTombstone(state, 'captures', id);
          deleteAttachmentsForResource(id).catch(() => {});
        },
        restore: (snap) => {
          state.captures = snap;
        },
      });
      paintCaptureList(el, state, modules, allObjectives);
    });
  });
}

function pickCaptureAttachment(capture, onChange) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,image/*';
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    const error = validateAttachmentFile(file);
    if (error) { window.EMVS.toast?.show(error); return; }
    try {
      const meta = await saveAttachment(file, { resourceId: capture.id });
      capture.attachments = [...(capture.attachments || []), meta];
      capture.updatedAt = Date.now();
      window.EMVS.save();
      onChange?.();
      window.EMVS.toast?.show('Datei lokal angehängt');
    } catch (err) {
      window.EMVS.toast?.show(err?.message || 'Datei konnte nicht gespeichert werden');
    }
  });
  input.click();
}

async function openCaptureAttachment(captureId, fileId, onChange) {
  const state = window.EMVS.getState();
  const capture = state.captures.find(c => c.id === captureId);
  if (!capture) return;
  let record;
  try { record = await getAttachment(fileId); } catch { record = null; }
  if (!record?.blob) {
    window.EMVS.toast?.show('Datei nicht gefunden — bitte neu anhängen');
    return;
  }
  const url = attachmentUrl(record.blob);
  const isImage = record.type?.startsWith('image/');
  const isPdf = record.type === 'application/pdf';
  openModal({
    title: record.name,
    body: `
      <div class="attachment-preview">
        ${isImage
          ? `<img src="${url}" alt="${escapeHtml(record.name)}">`
          : isPdf
            ? `<iframe src="${url}" title="${escapeHtml(record.name)}"></iframe>`
            : `<p class="muted">Vorschau für diesen Dateityp nicht verfügbar.</p>`}
      </div>
      <p class="today-empty-line">${formatBytes(record.size)} · lokal gespeichert, nicht in der Cloud.</p>
    `,
    footer: `
      <button class="btn" data-action="close">Schliessen</button>
      <a class="btn" href="${url}" download="${escapeHtml(record.name)}">Herunterladen</a>
      <button class="btn danger" data-action="delete-file">Entfernen</button>
    `,
    onClose: () => URL.revokeObjectURL(url),
  });
  setTimeout(() => {
    document.querySelector('#modal-footer [data-action="close"]')?.addEventListener('click', () => closeModal());
    document.querySelector('#modal-footer [data-action="delete-file"]')?.addEventListener('click', async () => {
      if (!confirm('Angehängte Datei entfernen?')) return;
      try { await deleteAttachment(fileId); } catch {}
      capture.attachments = (capture.attachments || []).filter(a => a.id !== fileId);
      capture.updatedAt = Date.now();
      window.EMVS.save();
      closeModal();
      onChange?.();
      window.EMVS.toast?.show('Datei entfernt');
    });
  }, 50);
}

function renderCaptureItem(capture, modules, allObjectives) {
  const module = capture.moduleId ? modules.find(m => m.id === capture.moduleId) : null;
  const objective = capture.objectiveId ? allObjectives.find(o => o.id === capture.objectiveId) : null;
  const typeLabel = CAPTURE_TYPE_LABELS[capture.type] || capture.type;
  const typeColors = {
    question: 'var(--blue)',
    term: 'var(--green)',
    resource: 'var(--accent)',
    mistake: 'var(--red)',
    thought: 'var(--ink-2)'
  };

  return `
    <div class="capture-item" data-id="${capture.id}" data-type="${capture.type}" style="border: 1px solid var(--rule); border-radius: 8px; padding: 16px; margin-bottom: 12px; background: var(--paper); transition: background 0.12s;">
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 8px; background: ${typeColors[capture.type] || 'var(--ink)'}20; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;">
          ${getCaptureIcon(capture.type)}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
            <span class="badge" style="background: ${typeColors[capture.type] || 'var(--ink)'}20; border-color: ${typeColors[capture.type] || 'var(--ink)'}; color: ${typeColors[capture.type] || 'var(--ink)'};">${typeLabel}</span>
            <span style="font-family: var(--mono); font-size: 11px; color: var(--ink-3);">${formatDateTime(capture.timestamp)}</span>
            ${module ? `<span style="font-family: var(--mono); font-size: 11px; color: var(--accent);">Modul ${escapeHtml(module.code)}</span>` : ''}
            ${objective ? `<span style="font-family: var(--mono); font-size: 11px; color: var(--green);">LZ ${objective.number}</span>` : ''}
            ${!module && !objective ? `<span style="font-family: var(--mono); font-size: 11px; color: var(--ink-3);">ohne Zuordnung</span>` : ''}
          </div>
          <div style="color: var(--ink); line-height: 1.6; white-space: pre-wrap;">${escapeHtml(capture.content)}</div>
          ${capture.tags?.length ? `<div style="margin-top: 8px; display: flex; gap: 4px; flex-wrap: wrap;">${capture.tags.map(t => `<span class="badge" style="font-size: 10px;">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          ${capture.attachments?.length ? `
          <div class="res-attachments capture-attachments">
            ${capture.attachments.map(a => `
              <button type="button" class="res-file" data-note-file="${a.id}" title="Öffnen: ${escapeHtml(a.name)}">
                <span class="res-file-ico">${a.type?.startsWith('image/') ? '🖼' : '📄'}</span>
                <span class="res-file-name">${escapeHtml(a.name)}</span>
                <span class="res-file-size">${formatBytes(a.size)}</span>
              </button>`).join('')}
          </div>` : ''}
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="attach-capture-btn" style="padding: 4px 8px; font-size: 11px; color: var(--ink-3);" title="PDF oder Foto anhängen" aria-label="Datei anhängen">📎</button>
          <button class="edit-capture-btn" style="padding: 4px 8px; font-size: 11px; color: var(--ink-3);" title="Bearbeiten">✎</button>
          <button class="delete-capture-btn" style="padding: 4px 8px; font-size: 11px; color: var(--red);" title="Löschen">✕</button>
        </div>
      </div>
    </div>
  `;
}

function getCaptureIcon(type) {
  const icons = {
    question: '❓',
    term: '📖',
    resource: '🔗',
    mistake: '⚠️',
    thought: '💭'
  };
  return icons[type] || '📝';
}

function afterSaveRefresh() {
  // Never yank the user out of a running session: only rebuild when the
  // captures view is actually showing; otherwise a toast is enough.
  if (getCurrentView() === 'captures') navigate('captures');
}

function persistCapture(state, c, isNew) {
  if (isNew) state.captures.push(c);
  window.EMVS.save();
  window.EMVS.toast.show('Festgehalten — geht nicht verloren');
  afterSaveRefresh();
}

// ---------------------------------------------------------------------------
// Quick capture: minimal sheet for mid-session use.
// Content first (autofocus), type as one-tap pills, module/objective
// preset from current context. Cmd/Ctrl+Enter saves. No navigation.
// ---------------------------------------------------------------------------

export function openQuickCapture(preset = {}) {
  const state = window.EMVS.getState();
  const modules = state.modules;
  const defaultModuleId = preset.moduleId || state.settings.currentModuleId || null;
  const objectives = state.learningObjectives.filter(o => !defaultModuleId || o.moduleId === defaultModuleId);

  let quickType = preset.type || 'thought';

  openModal({
    title: '⚡ Schnell erfassen',
    body: `
      <form id="quick-capture-form">
        <div class="qc-types" role="group" aria-label="Typ wählen">
          ${CAPTURE_TYPES.map(t => `<button type="button" class="badge filter-btn qc-type ${t === quickType ? 'active' : ''}" data-qtype="${t}">${getCaptureIcon(t)} ${CAPTURE_TYPE_LABELS[t]}</button>`).join('')}
        </div>
        <div class="field-row" style="margin-top:12px;">
          <label for="qc-content">Was geht dir durch den Kopf?</label>
          <textarea name="content" id="qc-content" rows="3" required
            placeholder="Frage, Fehler, Begriff, Gedanke…">${escapeHtml(preset.content || '')}</textarea>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <div class="field-row" style="flex:1;min-width:160px;">
            <label for="qc-module">Modul (optional)</label>
            <select name="moduleId" id="qc-module">
              <option value="">—</option>
              ${modules.map(m => `<option value="${m.id}" ${defaultModuleId === m.id ? 'selected' : ''}>${escapeHtml(m.code)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row" style="flex:2;min-width:200px;">
            <label for="qc-objective">Lernziel (optional)</label>
            <select name="objectiveId" id="qc-objective">
              <option value="">—</option>
              ${objectives.map(o => `<option value="${o.id}" ${preset.objectiveId === o.id ? 'selected' : ''}>LZ ${o.number}: ${escapeHtml(o.title.slice(0, 40))}</option>`).join('')}
            </select>
          </div>
        </div>
        <p class="today-empty-line">⌘/Strg + Enter speichert sofort — die Sitzung läuft weiter.</p>
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Festhalten</button>
    `,
    onClose: () => {}
  });

  setTimeout(() => {
    const content = document.getElementById('qc-content');
    content?.focus();
    // Place cursor at end of preset content
    if (content && content.value) content.setSelectionRange(content.value.length, content.value.length);

    document.querySelectorAll('.qc-type').forEach(b => b.addEventListener('click', () => {
      quickType = b.dataset.qtype;
      document.querySelectorAll('.qc-type').forEach(x => x.classList.toggle('active', x === b));
    }));

    // When the module changes, narrow the objective list to that module.
    document.getElementById('qc-module')?.addEventListener('change', e => {
      const mid = e.target.value || null;
      const st = window.EMVS.getState();
      const objs = st.learningObjectives.filter(o => !mid || o.moduleId === mid);
      const sel = document.getElementById('qc-objective');
      if (sel) sel.innerHTML = `<option value="">—</option>` + objs.map(o => `<option value="${o.id}">LZ ${o.number}: ${escapeHtml(o.title.slice(0, 40))}</option>`).join('');
    });

    const submit = () => {
      const text = content?.value.trim();
      if (!text) { content?.focus(); return; }
      const mid = document.getElementById('qc-module')?.value || null;
      const oid = document.getElementById('qc-objective')?.value || null;
      const c = {
        id: generateId(),
        type: quickType,
        content: text,
        moduleId: mid,
        objectiveId: oid,
        tags: [],
        timestamp: new Date().toISOString(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const st = window.EMVS.getState();
      persistCapture(st, c, true);
      closeModal();
    };

    content?.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', submit);
    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}

// ---------------------------------------------------------------------------
// Full editor: create + edit with all fields (type, tags, links).
// ---------------------------------------------------------------------------

export function openCaptureModal(capture = null, preset = {}) {
  const state = window.EMVS.getState();
  const modules = state.modules;
  const allObjectives = state.learningObjectives;

  const isNew = !capture;
  const c = capture || {
    id: generateId(),
    type: preset.type || 'thought',
    content: preset.content || '',
    moduleId: preset.moduleId || state.settings.currentModuleId || null,
    objectiveId: preset.objectiveId || null,
    tags: [],
    timestamp: new Date().toISOString(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  openModal({
    title: isNew ? 'Neue Notiz' : 'Notiz bearbeiten',
    body: `
      <form id="capture-form">
        <div class="field-row">
          <label>Typ</label>
          <select name="type" required>
            ${CAPTURE_TYPES.map(t => `<option value="${t}" ${c.type === t ? 'selected' : ''}>${CAPTURE_TYPE_LABELS[t]}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>Inhalt</label>
          <textarea name="content" rows="4" required placeholder="Was möchtest du festhalten?">${escapeHtml(c.content)}</textarea>
        </div>
        <div class="field-row">
          <label>Modul (optional)</label>
          <select name="moduleId">
            <option value="">— Kein Modul —</option>
            ${modules.map(m => `<option value="${m.id}" ${c.moduleId === m.id ? 'selected' : ''}>Modul ${escapeHtml(m.code)}: ${escapeHtml(m.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>Lernziel (optional)</label>
          <select name="objectiveId">
            <option value="">— Kein Lernziel —</option>
            ${allObjectives.map(o => {
              const mod = modules.find(m => m.id === o.moduleId);
              return `<option value="${o.id}" ${c.objectiveId === o.id ? 'selected' : ''}>${mod ? `Modul ${mod.code} – ` : ''}LZ ${o.number}: ${escapeHtml(o.title.slice(0, 50))}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>Tags (kommagetrennt, optional)</label>
          <input type="text" name="tags" value="${(c.tags || []).map(t => escapeHtml(t)).join(', ')}" placeholder="z.B. wichtig, wiederholen, prüfung">
        </div>
        ${!isNew ? `<p class="today-empty-line">Festgehalten: ${formatDateTime(c.timestamp)} — Bearbeiten ändert den Inhalt, nicht den Zeitpunkt.</p>` : ''}
      </form>
    `,
    footer: `
      <button class="btn" data-action="cancel">Abbrechen</button>
      <button class="btn primary" data-action="save">Speichern</button>
    `,
    onClose: () => {}
  }).then(result => {
    if (!result) return;

    c.type = result.type;
    c.content = result.content.trim();
    if (!c.content) return;
    c.moduleId = result.moduleId || null;
    c.objectiveId = result.objectiveId || null;
    c.tags = result.tags ? result.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    // Editing revises the content, never the capture moment.
    if (isNew) c.timestamp = new Date().toISOString();
    c.updatedAt = Date.now();

    persistCapture(state, c, isNew);
  });

  setTimeout(() => {
    const form = document.getElementById('capture-form');
    form?.addEventListener('submit', evt => {
      evt.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);
      data.tags = data.tags || '';
      closeModal(data);
    });

    document.querySelector('#modal-footer [data-action="save"]')?.addEventListener('click', () => {
      const form = document.getElementById('capture-form');
      if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit')); }
    });

    document.querySelector('#modal-footer [data-action="cancel"]')?.addEventListener('click', () => closeModal());
  }, 50);
}
