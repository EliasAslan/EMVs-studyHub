<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import {
    saveAttachment,
    getAttachment,
    deleteAttachment,
    validateAttachmentFile,
    formatBytes,
  } from '../services/attachments.js';
  import { toast } from '../stores/toast.js';

  export let attachments = [];
  export let ownerId;
  const dispatch = createEventDispatcher();

  let previewOpen = false;
  let previewUrl = '';
  let previewRecord = null;
  let busy = false;

  function emit(next) {
    dispatch('change', next);
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = validateAttachmentFile(file);
    if (problem) {
      toast(problem);
      return;
    }
    busy = true;
    try {
      const meta = await saveAttachment(file, { ownerId });
      emit([...(attachments || []), meta]);
      toast('Datei gespeichert');
    } catch (e) {
      toast(e.message || 'Datei konnte nicht gespeichert werden');
    } finally {
      busy = false;
    }
  }

  async function open(meta) {
    try {
      const record = await getAttachment(meta.id);
      if (!record?.blob) {
        toast('Datei ist nur auf dem Gerät vorhanden, auf dem sie gespeichert wurde.');
        return;
      }
      previewRecord = record;
      previewUrl = URL.createObjectURL(record.blob);
      previewOpen = true;
    } catch {
      toast('Datei konnte nicht geöffnet werden');
    }
  }

  function closePreview() {
    previewOpen = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    previewRecord = null;
  }

  async function remove(meta) {
    try {
      await deleteAttachment(meta.id);
    } catch {
      /* removing metadata still works */
    }
    emit((attachments || []).filter((a) => a.id !== meta.id));
    toast('Datei entfernt');
  }

  function download() {
    if (!previewUrl || !previewRecord) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = previewRecord.name || 'datei';
    a.click();
  }
</script>

<div class="attachments">
  {#if attachments?.length}
    <ul class="list">
      {#each attachments as meta (meta.id)}
        <li class="row">
          <button class="open" type="button" on:click={() => open(meta)}>
            <Icon name={meta.type === 'application/pdf' ? 'file' : 'photo'} size={16} />
            <span class="name">{meta.name}</span>
            <span class="size mono">{formatBytes(meta.size)}</span>
          </button>
          <button class="icon" type="button" aria-label={`${meta.name} entfernen`} on:click={() => remove(meta)}>
            <Icon name="trash" size={15} />
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted empty">Keine Dateien.</p>
  {/if}

  <label class="btn btn-sm upload">
    <Icon name="plus" size={15} />
    {busy ? 'Speichern…' : 'PDF oder Bild'}
    <input class="sr-only" type="file" accept="application/pdf,image/*" on:change={onFile} disabled={busy} />
  </label>
  <p class="hint">Lokal gespeichert, nicht in Cloud oder Backup.</p>
</div>

<Modal open={previewOpen} title={previewRecord?.name || 'Datei'} wide on:close={closePreview}>
  {#if previewRecord?.type?.startsWith('image/')}
    <img class="preview-img" src={previewUrl} alt={previewRecord.name} loading="lazy" decoding="async" />
  {:else}
    <iframe class="preview-pdf" src={previewUrl} title={previewRecord?.name || 'PDF'}></iframe>
  {/if}
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={closePreview}>Schliessen</button>
    <button class="btn" type="button" on:click={download}>Herunterladen</button>
  </svelte:fragment>
</Modal>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: var(--space-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-1);
  }
  .row:hover {
    background: var(--surface-2);
  }
  .open {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    min-height: 36px;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-align: left;
    font-size: var(--text-sm);
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .size {
    font-size: 10px;
    color: var(--ink-3);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
  }
  .icon:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  .upload {
    cursor: pointer;
  }
  .hint {
    margin-top: var(--space-1);
    font-size: 10px;
    color: var(--ink-3);
  }
  .empty {
    font-size: var(--text-xs);
    margin-bottom: var(--space-2);
  }
  .preview-img {
    max-width: 100%;
    max-height: 65vh;
    margin: 0 auto;
    border-radius: var(--radius-2);
  }
  .preview-pdf {
    width: 100%;
    height: 65vh;
    border: 0;
    border-radius: var(--radius-2);
  }
</style>
