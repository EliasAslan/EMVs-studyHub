<script>
  import { appState, createLink, updateLink, deleteLink, restoreEntity } from '../stores/app.js';
  import { persistedStore } from '../stores/viewPrefs.js';
  import { toast } from '../stores/toast.js';
  import LinkRow from '../components/LinkRow.svelte';
  import Modal from '../components/Modal.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  const filters = persistedStore('studyhub_links_filters', { moduleId: 'all' });

  const kinds = [
    { value: 'teams', label: 'Teams' },
    { value: 'onenote', label: 'OneNote' },
    { value: 'website', label: 'Website' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'custom', label: 'Andere' },
  ];

  let open = false;
  let editing = null;
  let label = '';
  let url = '';
  let kind = 'custom';
  let moduleId = '';

  $: modules = $appState.modules || [];
  $: links = ($appState.links || [])
    .filter((l) => $filters.moduleId === 'all' || l.moduleId === $filters.moduleId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
  $: globalCount = ($appState.links || []).filter((l) => !l.moduleId).length;

  function setFilter(value) {
    filters.update((f) => ({ ...f, moduleId: value }));
  }

  function openCreate() {
    editing = null;
    label = '';
    url = '';
    kind = 'custom';
    moduleId = $filters.moduleId === 'all' ? '' : $filters.moduleId;
    open = true;
  }

  function openEdit(link) {
    editing = link;
    label = link.label;
    url = link.url;
    kind = link.kind || 'custom';
    moduleId = link.moduleId || '';
    open = true;
  }

  function normaliseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  function save() {
    const nextLabel = label.trim();
    const nextUrl = normaliseUrl(url);
    if (!nextLabel) {
      toast('Bezeichnung fehlt.');
      return;
    }
    if (!nextUrl || !/^https?:\/\/[^\s.]+\.[^\s]+/i.test(nextUrl)) {
      toast('Bitte eine gültige URL angeben.');
      return;
    }
    if (editing) {
      updateLink(editing.id, { label: nextLabel, url: nextUrl, kind, moduleId: moduleId || null });
      toast('Link gespeichert');
    } else {
      createLink({ label: nextLabel, url: nextUrl, kind, moduleId: moduleId || null });
      toast('Link erfasst');
    }
    open = false;
  }

  function remove(link) {
    const snapshot = { ...link };
    deleteLink(link.id);
    toast('Link gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => restoreEntity('links', snapshot),
      },
    });
  }

  function moduleLabel(id) {
    const mod = modules.find((m) => m.id === id);
    return mod ? `${mod.code ? `${mod.code} · ` : ''}${mod.title}` : 'Kein Modul';
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Ordnung</p>
      <h1>Links</h1>
    </div>
    <button class="btn btn-primary" type="button" on:click={openCreate}>
      <Icon name="plus" size={16} /> Link
    </button>
  </header>

  <div class="filters">
    <select class="select" value={$filters.moduleId} aria-label="Modul filtern" on:change={(e) => setFilter(e.target.value)}>
      <option value="all">Alle Links</option>
      <option value="">Ohne Modul</option>
      {#each modules as m (m.id)}
        <option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>
      {/each}
    </select>
    <span class="count">{links.length} {links.length === 1 ? 'Link' : 'Links'}{globalCount ? ` · ${globalCount} global` : ''}</span>
  </div>

  {#if links.length}
    <div class="card list">
      {#each links as link (link.id)}
        <LinkRow {link} showModule={$filters.moduleId === 'all'}>
          <svelte:fragment slot="actions">
            <button class="icon" type="button" aria-label={`${link.label} bearbeiten`} on:click={() => openEdit(link)}>
              <Icon name="edit" size={15} />
            </button>
            <button class="icon" type="button" aria-label={`${link.label} löschen`} on:click={() => remove(link)}>
              <Icon name="trash" size={15} />
            </button>
          </svelte:fragment>
        </LinkRow>
      {/each}
    </div>
  {:else}
    <EmptyState
      title="Keine Links"
      text="Teams, OneNote, Schulwebsite oder YouTube — alles an einem Ort."
      actionLabel="Link erfassen"
      action={openCreate}
    />
  {/if}
</div>

<Modal open={open} title={editing ? 'Link bearbeiten' : 'Neuer Link'} on:close={() => (open = false)}>
  <div class="stack">
    <label class="field">
      <span>Bezeichnung</span>
      <input class="input" bind:value={label} data-autofocus placeholder="z. B. Teams M294" />
    </label>
    <label class="field">
      <span>URL</span>
      <input class="input" bind:value={url} placeholder="https://…" inputmode="url" />
    </label>
    <div class="two">
      <label class="field">
        <span>Art</span>
        <select class="select" bind:value={kind}>
          {#each kinds as k (k.value)}
            <option value={k.value}>{k.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Modul</span>
        <select class="select" bind:value={moduleId}>
          <option value="">Kein Modul</option>
          {#each modules as m (m.id)}
            <option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>
          {/each}
        </select>
      </label>
    </div>
    {#if editing && editing.moduleId}
      <p class="muted small">Aktuell: {moduleLabel(editing.moduleId)}</p>
    {/if}
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (open = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={save} disabled={!label.trim() || !url.trim()}>
      Speichern
    </button>
  </svelte:fragment>
</Modal>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 880px;
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .eyebrow {
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    color: var(--ink-2);
  }
  h1 {
    font-size: clamp(1.9rem, 4vw, 2.4rem);
    letter-spacing: -0.03em;
  }
  .filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .filters .select {
    width: auto;
    min-width: 180px;
  }
  .count {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .list {
    padding: var(--space-1);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
  }
  .icon:hover {
    background: var(--surface);
    color: var(--ink);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .small {
    font-size: var(--text-xs);
  }
</style>
