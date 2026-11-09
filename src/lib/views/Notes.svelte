<script>
  import { onMount } from 'svelte';
  import { appState } from '../stores/app.js';
  import { navigate, replacePath, route } from '../router.js';
  import { persistedStore } from '../stores/viewPrefs.js';
  import { extractTags } from '../data/markdown.js';
  import NoteListRow from '../components/NoteListRow.svelte';
  import NoteDetail from './NoteDetail.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import KnowledgeSummary from '../components/KnowledgeSummary.svelte';
  import Icon from '../components/Icon.svelte';
  import AiButton from '../components/AiButton.svelte';

  const filters = persistedStore('studyhub_notes_filters', {
    moduleId: 'all',
    topicId: 'all',
    type: 'all',
    tag: 'all',
    query: '',
  });

  // Older saved filters predate the tag field.
  $: if (!('tag' in $filters)) filters.update((f) => ({ ...f, tag: 'all' }));

  // Split view is a large-monitor affordance only. Everything below this
  // uses the single-column focused writing layout (list OR detail).
  const WIDE_QUERY = '(min-width: 1200px)';

  let wide = typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches;
  let filtersOpen = false;

  onMount(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const update = () => (wide = mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  $: modules = $appState.modules || [];
  $: topics = ($appState.topics || []).filter(
    (t) => $filters.moduleId === 'all' || t.moduleId === $filters.moduleId,
  );
  $: allNotes = $appState.notes || [];
  $: notes = allNotes
    .filter((n) => $filters.moduleId === 'all' || n.moduleId === $filters.moduleId)
    .filter((n) => $filters.topicId === 'all' || n.topicId === $filters.topicId)
    .filter((n) => $filters.type === 'all' || n.type === $filters.type)
    .filter((n) => $filters.tag === 'all' || extractTags(n.body).includes($filters.tag))
    .filter((n) => {
      const q = $filters.query.toLowerCase().trim();
      if (!q) return true;
      return `${n.title} ${n.body}`.toLowerCase().includes(q);
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  $: tagCounts = (() => {
    const map = new Map();
    for (const n of allNotes) {
      for (const tag of extractTags(n.body)) map.set(tag, (map.get(tag) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();

  $: if ($route.query.tag && $route.query.tag !== $filters.tag) {
    filters.update((f) => ({ ...f, tag: $route.query.tag }));
  }

  $: isDetail = $route.name === 'note';
  $: activeId = isDetail ? $route.id : null;

  $: hasFilters =
    $filters.query ||
    $filters.moduleId !== 'all' ||
    $filters.topicId !== 'all' ||
    $filters.type !== 'all' ||
    $filters.tag !== 'all';

  $: activeFilterCount =
    ($filters.moduleId !== 'all' ? 1 : 0) +
    ($filters.topicId !== 'all' ? 1 : 0) +
    ($filters.type !== 'all' ? 1 : 0) +
    ($filters.tag !== 'all' ? 1 : 0);

  function setFilter(patch) {
    filters.update((f) => ({ ...f, ...patch }));
  }

  function setTag(tag) {
    setFilter({ tag });
    replacePath(tag === 'all' ? '/notes' : `/notes?tag=${encodeURIComponent(tag)}`);
  }

  function resetFilters() {
    filters.set({ moduleId: 'all', topicId: 'all', type: 'all', tag: 'all', query: '' });
    if ($route.query.tag) replacePath('/notes');
  }

  function openCreate() {
    navigate('/notes/new');
  }
</script>

<div class="page" class:wide>
  {#if wide || !isDetail}
    <div class="list-pane" class:wide>
      <header class="page-head">
        <div class="head-titles">
          <p class="eyebrow">Wissen</p>
          <h1>Notizen</h1>
        </div>
        <div class="head-actions">
          {#if allNotes.length}
            <AiButton
              ref="notizen"
              prompt="Fasse meine wichtigsten Notizen in wenigen Sätzen zusammen."
              label="Zusammenfassen"
            />
          {/if}
          <button class="btn btn-primary" type="button" on:click={openCreate}>
            <Icon name="plus" size={16} /> Notiz
          </button>
        </div>
      </header>

      <div class="filters">
        <div class="filter-bar">
          <input
            class="input search"
            type="search"
            placeholder="Notizen durchsuchen"
            aria-label="Notizen durchsuchen"
            value={$filters.query}
            on:input={(e) => setFilter({ query: e.target.value })}
          />
          <button
            class="chip filter-toggle"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="notes-filter-grid"
            on:click={() => (filtersOpen = !filtersOpen)}
          >
            Filter
            {#if activeFilterCount}<span class="filter-count">{activeFilterCount}</span>{/if}
            <Icon name={filtersOpen ? 'chevronDown' : 'chevronRight'} size={13} />
          </button>
        </div>
        {#if filtersOpen}
          <div class="filter-grid" id="notes-filter-grid">
            <select
              class="select"
              value={$filters.moduleId}
              aria-label="Modul filtern"
              on:change={(e) => setFilter({ moduleId: e.target.value, topicId: 'all' })}
            >
              <option value="all">Alle Module</option>
              {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
            </select>
            <select
              class="select"
              value={$filters.topicId}
              aria-label="Thema filtern"
              on:change={(e) => setFilter({ topicId: e.target.value })}
            >
              <option value="all">Alle Themen</option>
              {#each topics as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
            </select>
            <select
              class="select"
              value={$filters.type}
              aria-label="Typ filtern"
              on:change={(e) => setFilter({ type: e.target.value })}
            >
              <option value="all">Alle Typen</option>
              <option value="note">Notiz</option>
              <option value="mistake">Fehler</option>
              <option value="question">Frage</option>
              <option value="summary">Zusammenfassung</option>
            </select>
            {#if activeFilterCount}
              <button class="btn btn-ghost btn-sm reset" type="button" on:click={resetFilters}>
                Filter zurücksetzen ({activeFilterCount})
              </button>
            {/if}
          </div>
        {/if}
      </div>

      {#if tagCounts.length}
        <div class="tags" aria-label="Nach Tag filtern">
          <button class="chip" class:is-active={$filters.tag === 'all'} type="button" aria-pressed={$filters.tag === 'all'} on:click={() => setTag('all')}>Alle</button>
          {#each tagCounts as [tag, count] (tag)}
            <button class="chip" class:is-active={$filters.tag === tag} type="button" aria-pressed={$filters.tag === tag} on:click={() => setTag(tag)}>
              #{tag}<span class="tag-count">{count}</span>
            </button>
          {/each}
        </div>
      {/if}

      <div class="list-scroll">
        {#if notes.length}
          <p class="count">{notes.length} {notes.length === 1 ? 'Notiz' : 'Notizen'}</p>
          <div class="rows">
            {#each notes as note (note.id)}
              <NoteListRow {note} active={note.id === activeId} />
            {/each}
          </div>
        {:else}
          <EmptyState
            title="Keine Notizen gefunden"
            text={hasFilters ? 'Filter zurücksetzen oder neue Notiz erfassen.' : 'Text, Foto oder beides — in Sekunden erfasst.'}
            actionLabel="Notiz erfassen"
            action={openCreate}
            secondaryLabel={hasFilters ? 'Filter zurücksetzen' : ''}
            secondary={resetFilters}
          />
        {/if}

        {#if allNotes.length}
          <div class="summary-wrap"><KnowledgeSummary /></div>
        {/if}
      </div>
    </div>
  {/if}

  {#if wide || isDetail}
    <div class="detail-pane">
      {#if activeId}
        <NoteDetail noteId={activeId} />
      {:else}
        <div class="detail-empty">
          <span class="detail-icon"><Icon name="notes" size={22} /></span>
          <h2>Wähle eine Notiz</h2>
          <p class="muted">Oder beginne eine neue — tippen genügt, gespeichert wird von selbst.</p>
          <button class="btn btn-primary" type="button" on:click={openCreate}>
            <Icon name="plus" size={16} /> Neue Notiz
          </button>
          {#if notes.length}
            <p class="detail-hint">Zuletzt: {notes.slice(0, 3).map((n) => n.title || 'Ohne Titel').join(' · ')}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
    max-width: 1000px;
    min-width: 0;
  }
  .page.wide {
    display: grid;
    grid-template-columns: minmax(280px, 330px) minmax(0, 1fr);
    gap: var(--space-5);
    max-width: 1120px;
    align-items: start;
  }
  .list-pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .list-pane.wide {
    position: sticky;
    top: var(--space-4);
    height: calc(100vh - var(--space-6));
    overflow: hidden;
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .head-titles {
    min-width: 0;
  }
  .head-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
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
  .wide h1 {
    font-size: 1.75rem;
  }
  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .filter-bar {
    display: flex;
    gap: var(--space-2);
  }
  .filter-bar .search {
    flex: 1;
  }
  .filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    min-height: 40px;
    cursor: pointer;
    font: inherit;
    font-size: var(--text-xs);
  }
  .filter-count {
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .filter-grid {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
  }
  .filter-grid .select {
    width: 100%;
  }
  .filter-grid .reset {
    justify-self: start;
    color: var(--accent-strong);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .tags .chip {
    cursor: pointer;
    font: inherit;
    font-size: var(--text-xs);
  }
  .tags .chip:hover {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .tag-count {
    margin-left: 5px;
    font-size: 10px;
    color: var(--ink-3);
  }
  .list-scroll {
    min-height: 0;
    overflow-y: auto;
  }
  .list-pane.wide {
    height: calc(100vh - var(--space-6));
  }
  .list-pane.wide .list-scroll {
    flex: 1;
    min-height: 0;
    padding-right: 2px;
  }
  .count {
    margin-bottom: var(--space-1);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .summary-wrap {
    margin-top: var(--space-3);
  }
  .detail-pane {
    min-width: 0;
  }
  .detail-empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-5);
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-3);
    color: var(--ink-2);
  }
  .detail-empty h2 {
    font-size: var(--text-xl);
    color: var(--ink);
  }
  .detail-empty p {
    max-width: 42ch;
    font-size: var(--text-sm);
  }
  .detail-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-2);
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .detail-hint {
    margin-top: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  @media (min-width: 640px) {
    .page:not(.wide) .filter-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: center;
    }
    .page:not(.wide) .filter-grid .reset {
      grid-column: 1 / -1;
    }
  }
</style>
