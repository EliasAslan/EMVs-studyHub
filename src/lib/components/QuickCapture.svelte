<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import {
    appState,
    createNote,
    createHomework,
    updateNote,
    createExam,
    createModule,
    createLink,
  } from '../stores/app.js';
  import { saveAttachment, formatBytes, validateAttachmentFile } from '../services/attachments.js';
  import { todayKey } from '../data/dates.js';
  import { toast } from '../stores/toast.js';

  export let open = false;
  export let initialMode = 'note';

  const dispatch = createEventDispatcher();

  let mode = initialMode;
  let title = '';
  let body = '';
  let dueDate = todayKey();
  let examDate = todayKey();
  let code = '';
  let url = '';
  let moduleId = '';
  let file = null;
  let previewUrl = '';
  let error = '';
  let saving = false;
  let wasOpen = false;

  $: if (open && !wasOpen) {
    wasOpen = true;
    reset();
    mode = initialMode;
  }
  $: if (!open && wasOpen) {
    wasOpen = false;
  }

  function reset() {
    title = '';
    body = '';
    dueDate = todayKey();
    examDate = todayKey();
    code = '';
    url = '';
    moduleId = '';
    clearFile();
    error = '';
    saving = false;
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    file = null;
  }

  function onFile(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    const problem = validateAttachmentFile(chosen);
    if (problem) {
      error = problem;
      return;
    }
    error = '';
    clearFile();
    file = chosen;
    if (chosen.type.startsWith('image/')) previewUrl = URL.createObjectURL(chosen);
  }

  function close() {
    dispatch('close');
  }

  function normaliseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  async function save() {
    error = '';
    if (mode === 'homework') {
      if (!title.trim()) {
        error = 'Titel fehlt.';
        return;
      }
      createHomework({ title, dueDate, moduleId: moduleId || null });
      toast('Hausaufgabe erfasst');
      close();
      return;
    }

    if (mode === 'exam') {
      if (!title.trim()) {
        error = 'Titel fehlt.';
        return;
      }
      createExam({ title, date: examDate || todayKey(), moduleId: moduleId || null });
      toast('Prüfung erfasst');
      close();
      return;
    }

    if (mode === 'module') {
      if (!title.trim()) {
        error = 'Titel fehlt.';
        return;
      }
      createModule({ title, code: code || title });
      toast('Modul erstellt');
      close();
      return;
    }

    if (mode === 'link') {
      const nextUrl = normaliseUrl(url);
      if (!title.trim()) {
        error = 'Bezeichnung fehlt.';
        return;
      }
      if (!nextUrl || !/^https?:\/\/[^\s.]+\.[^\s]+/i.test(nextUrl)) {
        error = 'Bitte eine gültige URL angeben.';
        return;
      }
      createLink({ label: title, url: nextUrl, kind: 'custom', moduleId: moduleId || null });
      toast('Link erfasst');
      close();
      return;
    }

    if (!title.trim() && !body.trim() && !file) {
      error = 'Notiz ist leer.';
      return;
    }

    saving = true;
    try {
      const note = createNote({
        title: title.trim() || (file ? file.name : 'Notiz'),
        body,
        moduleId: moduleId || null,
        type: 'note',
      });
      if (file) {
        const meta = await saveAttachment(file, { ownerId: note.id });
        updateNote(note.id, { attachments: [meta] });
      }
      toast('Notiz gespeichert');
      close();
    } catch (e) {
      error = e.message || 'Speichern fehlgeschlagen.';
    } finally {
      saving = false;
    }
  }

  $: modules = $appState.modules || [];
  $: primaryModes = ['note', 'photo', 'homework'];
  $: modalTitle =
    mode === 'exam'
      ? 'Neue Prüfung'
      : mode === 'module'
        ? 'Neues Modul'
        : mode === 'link'
          ? 'Neuer Link'
          : 'Erfassen';
</script>

<Modal {open} title={modalTitle} on:close={close}>
  {#if primaryModes.includes(mode)}
    <div class="modes" role="tablist" aria-label="Was erfassen?">
      <button class="mode" class:active={mode === 'note'} type="button" role="tab" aria-selected={mode === 'note'} on:click={() => (mode = 'note')}>
        <Icon name="notes" /> Notiz
      </button>
      <button class="mode" class:active={mode === 'photo'} type="button" role="tab" aria-selected={mode === 'photo'} on:click={() => (mode = 'photo')}>
        <Icon name="photo" /> Foto
      </button>
      <button class="mode" class:active={mode === 'homework'} type="button" role="tab" aria-selected={mode === 'homework'} on:click={() => (mode = 'homework')}>
        <Icon name="homework" /> Hausaufgabe
      </button>
    </div>
  {/if}

  <div class="stack">
    {#if mode === 'homework'}
      <label class="field">
        <span>Titel</span>
        <input class="input" bind:value={title} data-autofocus placeholder="z. B. Auftrag 4 lösen" on:keydown={(e) => e.key === 'Enter' && save()} />
      </label>
      <label class="field">
        <span>Fällig</span>
        <input class="input" type="date" bind:value={dueDate} />
      </label>
    {:else if mode === 'exam'}
      <label class="field">
        <span>Titel</span>
        <input class="input" bind:value={title} data-autofocus placeholder="z. B. M294 Prüfung" on:keydown={(e) => e.key === 'Enter' && save()} />
      </label>
      <label class="field">
        <span>Datum</span>
        <input class="input" type="date" bind:value={examDate} />
      </label>
    {:else if mode === 'module'}
      <label class="field">
        <span>Titel</span>
        <input class="input" bind:value={title} data-autofocus placeholder="z. B. Datenbanken" on:keydown={(e) => e.key === 'Enter' && save()} />
      </label>
      <label class="field">
        <span>Kürzel</span>
        <input class="input" bind:value={code} placeholder="z. B. M294" />
      </label>
    {:else if mode === 'link'}
      <label class="field">
        <span>Bezeichnung</span>
        <input class="input" bind:value={title} data-autofocus placeholder="z. B. Teams M294" on:keydown={(e) => e.key === 'Enter' && save()} />
      </label>
      <label class="field">
        <span>URL</span>
        <input class="input" bind:value={url} placeholder="https://…" inputmode="url" />
      </label>
    {:else}
      <label class="field">
        <span>Titel (optional)</span>
        <input class="input" bind:value={title} data-autofocus placeholder="Kurz und klar" />
      </label>
      <label class="field">
        <span>Text</span>
        <textarea class="textarea" bind:value={body} rows="5" placeholder="Was möchtest du festhalten?"></textarea>
      </label>
      <div class="field">
        <span>{mode === 'photo' ? 'Foto' : 'Foto oder PDF (optional)'}</span>
        <div class="file-row">
          <label class="btn file-btn">
            <Icon name="photo" />
            {file ? 'Anderes Bild' : 'Bild wählen'}
            <input class="sr-only" type="file" accept="image/*" capture="environment" on:change={onFile} />
          </label>
          {#if mode !== 'photo'}
            <label class="btn file-btn">
              <Icon name="file" /> PDF
              <input class="sr-only" type="file" accept="application/pdf" on:change={onFile} />
            </label>
          {/if}
          {#if file}
            <span class="muted file-meta">{file.name} · {formatBytes(file.size)}</span>
            <button class="btn btn-ghost btn-sm" type="button" on:click={clearFile} aria-label="Datei entfernen">✕</button>
          {/if}
        </div>
        {#if previewUrl}
          <img class="preview" src={previewUrl} alt="Vorschau" />
        {/if}
      </div>
    {/if}

    {#if mode !== 'module'}
      <label class="field">
        <span>Modul (optional)</span>
        <select class="select" bind:value={moduleId}>
          <option value="">— kein Modul —</option>
          {#each modules as m (m.id)}
            <option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={close}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={save} disabled={saving}>
      {saving ? 'Speichern…' : 'Speichern'}
    </button>
  </svelte:fragment>
</Modal>

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .mode {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 44px;
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .mode.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .file-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .file-btn {
    cursor: pointer;
  }
  .file-meta {
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .preview {
    margin-top: var(--space-2);
    max-height: 180px;
    border-radius: var(--radius-2);
    border: 1px solid var(--rule);
    object-fit: cover;
  }
  .error {
    color: var(--danger);
    font-size: var(--text-sm);
  }
</style>
