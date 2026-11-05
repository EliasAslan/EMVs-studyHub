<script>
  import { appState, createNote } from '../stores/app.js';
  import { navigate, notePath } from '../router.js';
  import { persistedStore } from '../stores/viewPrefs.js';
  import { toast } from '../stores/toast.js';
  import NoteCard from '../components/NoteCard.svelte';
  import Modal from '../components/Modal.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  const filters = persistedStore('studyhub_notes_filters', {
    moduleId: 'all',
    topicId: 'all',
    type: 'all',
    query: '',
  });

  let createOpen = false;
  let title = '';
  let body = '';
  let type = 'note';
  let moduleId = '';
  let topicId = '';

  $: modules = $appState.modules || [];
  $: topics = ($appState.topics || []).filter(
    (t) => $filters.moduleId === 'all' || t.moduleId === $filters.moduleId,
  );
  $: notes = ($appState.notes || [])
    .filter((n) => $filters.moduleId === 'all' || n.moduleId === $filters.moduleId)
    .filter((n) => $filters.topicId === 'all' || n.topicId === $filters.topicId)
    .filter((n) => $filters.type === 'all' || n.type === $filters.type)
    .filter((n) => {
      const q = $filters.query.toLowerCase().trim();
      if (!q) return true;
      return `${n.title} ${n.body}`.toLowerCase().includes(q);
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  function setFilter(patch) {
    filters.update((f) => ({ ...f, ...patch }));
  }

  function save() {
    if (!title.trim() && !body.trim()) return;
    const note = createNote({
      moduleId: moduleId || null,
      topicId: topicId || null,
      title: title.trim() || 'Notiz',
      body,
      type,
    });
    createOpen = false;
    title = '';
    body = '';
    type = 'note';
    moduleId = '';
    topicId = '';
    toast('Notiz gespeichert');
    navigate(notePath(note.id));
  }

  function openCreate() {
    moduleId = $filters.moduleId === 'all' ? '' : $filters.moduleId;
    topicId = '';
    createOpen = true;
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Wissen</p>
      <h1>Notizen</h1>
    </div>
    <button class="btn btn-primary" type="button" on:click={openCreate}><Icon name="plus" size={16} /> Notiz</button>
  </header>

  <div class="filters">
    <input
      class="input search"
      type="search"
      placeholder="Notizen durchsuchen"
      aria-label="Notizen durchsuchen"
      value={$filters.query}
      on:input={(e) => setFilter({ query: e.target.value })}
    />
    <select class="select" value={$filters.moduleId} aria-label="Modul filtern" on:change={(e) => setFilter({ moduleId: e.target.value, topicId: 'all' })}>
      <option value="all">Alle Module</option>
      {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
    </select>
    <select class="select" value={$filters.topicId} aria-label="Thema filtern" on:change={(e) => setFilter({ topicId: e.target.value })}>
      <option value="all">Alle Themen</option>
      {#each topics as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
    </select>
    <select class="select" value={$filters.type} aria-label="Typ filtern" on:change={(e) => setFilter({ type: e.target.value })}>
      <option value="all">Alle Typen</option>
      <option value="note">Notiz</option>
      <option value="mistake">Fehler</option>
      <option value="question">Frage</option>
      <option value="summary">Zusammenfassung</option>
    </select>
  </div>

  {#if notes.length}
    <p class="count">{notes.length} {notes.length === 1 ? 'Notiz' : 'Notizen'}</p>
    <div class="grid">
      {#each notes as note (note.id)}
        <NoteCard {note} />
      {/each}
    </div>
  {:else}
    <EmptyState
      title="Keine Notizen gefunden"
      text={$filters.query || $filters.moduleId !== 'all' || $filters.type !== 'all' ? 'Filter zurücksetzen oder neue Notiz erfassen.' : 'Text, Foto oder beides — in Sekunden erfasst.'}
      actionLabel="Notiz erfassen"
      action={openCreate}
      secondaryLabel={$filters.query || $filters.moduleId !== 'all' || $filters.type !== 'all' ? 'Filter zurücksetzen' : ''}
      secondary={() => filters.set({ moduleId: 'all', topicId: 'all', type: 'all', query: '' })}
    />
  {/if}
</div>

<Modal open={createOpen} title="Neue Notiz" on:close={() => (createOpen = false)}>
  <div class="stack">
    <label class="field"><span>Titel</span><input class="input" bind:value={title} data-autofocus placeholder="Kurz und klar" /></label>
    <label class="field"><span>Text</span><textarea class="textarea" bind:value={body} rows="7" placeholder="[[Andere Notiz]] verlinkt."></textarea></label>
    <div class="two">
      <label class="field">
        <span>Typ</span>
        <select class="select" bind:value={type}>
          <option value="note">Notiz</option>
          <option value="mistake">Fehler</option>
          <option value="question">Frage</option>
          <option value="summary">Zusammenfassung</option>
        </select>
      </label>
      <label class="field">
        <span>Modul</span>
        <select class="select" bind:value={moduleId}>
          <option value="">Kein Modul</option>
          {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
        </select>
      </label>
    </div>
    <label class="field">
      <span>Thema</span>
      <select class="select" bind:value={topicId}>
        <option value="">Kein Thema</option>
        {#each ($appState.topics || []).filter((t) => !moduleId || t.moduleId === moduleId) as t (t.id)}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
    </label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (createOpen = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={save} disabled={!title.trim() && !body.trim()}>Speichern</button>
  </svelte:fragment>
</Modal>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 1000px;
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .eyebrow {
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  h1 {
    font-size: clamp(1.9rem, 4vw, 2.4rem);
    letter-spacing: -0.03em;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .filters .select {
    width: auto;
    min-width: 140px;
  }
  .search {
    flex: 1 1 220px;
  }
  .count {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-3);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
</style>
