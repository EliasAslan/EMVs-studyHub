<script>
  import { onDestroy } from 'svelte';
  import { appState, updateNote, deleteNote, restoreEntity } from '../stores/app.js';
  import { route, navigate, notePath, modulePath } from '../router.js';
  import { bodySegments, resolveLink, backlinks } from '../data/wikiLinks.js';
  import { formatDate, dateKey } from '../data/dates.js';
  import { toast } from '../stores/toast.js';
  import AttachmentList from '../components/AttachmentList.svelte';
  import AiButton from '../components/AiButton.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  let loadedId = null;
  let title = '';
  let body = '';
  let type = 'note';

  const TYPE_LABELS = {
    note: 'Notiz',
    mistake: 'Fehler',
    question: 'Frage',
    summary: 'Zusammenfassung',
  };

  function typeLabel(value) {
    return TYPE_LABELS[value] || value;
  }
  let moduleId = '';
  let topicId = '';
  let mode = 'edit';
  let dirty = false;
  let saveTimer = null;
  let savedAt = null;

  $: note = ($appState.notes || []).find((n) => n.id === $route.id) || null;
  $: if (note && note.id !== loadedId) {
    loadedId = note.id;
    title = note.title;
    body = note.body;
    type = note.type;
    moduleId = note.moduleId || '';
    topicId = note.topicId || '';
    dirty = false;
    savedAt = note.updatedAt || null;
  }
  $: modules = $appState.modules || [];
  $: topics = ($appState.topics || []).filter((t) => !moduleId || t.moduleId === moduleId);
  $: segments = bodySegments(body);
  $: back = note ? backlinks($appState, note.id) : [];

  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 450);
  }

  function save() {
    if (!note || !dirty) return;
    updateNote(note.id, {
      title: title.trim() || 'Ohne Titel',
      body,
      type,
      moduleId: moduleId || null,
      topicId: topicId || null,
    });
    dirty = false;
    savedAt = Date.now();
  }

  function onModuleChange() {
    if (topicId && !topics.some((t) => t.id === topicId)) topicId = '';
    scheduleSave();
  }

  function openLink(target) {
    const entry = resolveLink($appState, target);
    if (!entry) return;
    if (entry.kind === 'note') navigate(notePath(entry.id));
    else if (entry.kind === 'module') navigate(modulePath(entry.id));
    else if (entry.kind === 'homework') navigate('/homework');
    else if (entry.kind === 'exam') navigate('/exams');
  }

  function remove() {
    if (!note) return;
    const snapshot = { ...note, attachments: [...(note.attachments || [])] };
    const id = note.id;
    deleteNote(id);
    navigate('/notes');
    toast('Notiz gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => {
          restoreEntity('notes', snapshot);
          navigate(notePath(id));
        },
      },
    });
  }

  onDestroy(() => {
    clearTimeout(saveTimer);
    if (dirty) save();
  });
</script>

{#if !note}
  <div class="page">
    <EmptyState title="Notiz nicht gefunden" text="Vielleicht wurde sie gelöscht." actionLabel="Zu den Notizen" action={() => navigate('/notes')} />
  </div>
{:else}
  <div class="page">
    <nav class="crumbs" aria-label="Brotkrümelnavigation">
      <a href="#/notes">Notizen</a>
      {#if note.moduleId}
        {@const mod = modules.find((m) => m.id === note.moduleId)}
        {#if mod}
          <span aria-hidden="true">/</span>
          <a href="#{modulePath(mod.id)}">{mod.code || mod.title}</a>
        {/if}
      {/if}
    </nav>

    <div class="note-head">
      <div class="head-meta">
        <span class="type">{typeLabel(type)}</span>
        {#if savedAt}<span class="saved mono">{dirty ? 'speichert…' : `gespeichert ${formatDate(dateKey(new Date(savedAt)), 'short')}`}</span>{/if}
      </div>
      <div class="head-actions">
        <AiButton label="KI fragen" kind="note" id={note.id} />
        <AiButton label="Zusammenfassen" kind="note" id={note.id} prompt="Fasse diese Notiz in 5 Punkten zusammen." />
        <div class="segmented" role="group" aria-label="Ansicht">
          <button class="seg" class:active={mode === 'edit'} type="button" aria-pressed={mode === 'edit'} on:click={() => (mode = 'edit')}>Schreiben</button>
          <button class="seg" class:active={mode === 'read'} type="button" aria-pressed={mode === 'read'} on:click={() => (mode = 'read')}>Lesen</button>
        </div>
        <button class="icon-btn" type="button" aria-label="Notiz löschen" on:click={remove}><Icon name="trash" size={16} /></button>
      </div>
    </div>

    {#if mode === 'edit'}
      <input
        class="title-input"
        bind:value={title}
        placeholder="Titel"
        aria-label="Titel"
        on:input={scheduleSave}
      />
      <textarea
        class="body-input"
        bind:value={body}
        placeholder="Schreib los… [[Andere Notiz]] verlinkt."
        aria-label="Notiztext"
        on:input={scheduleSave}
      ></textarea>
    {:else}
      <h1 class="read-title">{title || 'Ohne Titel'}</h1>
      <div class="reading note-body">
        {#if body.trim()}
          {#each segments as segment, i (i)}
            {#if segment.type === 'text'}
              <span>{segment.text}</span>
            {:else}
              {@const entry = resolveLink($appState, segment.target)}
              {#if entry}
                <button class="wiki" type="button" on:click={() => openLink(segment.target)}>{segment.target}</button>
              {:else}
                <span class="wiki unresolved" title="Kein Ziel gefunden">{segment.target}</span>
              {/if}
            {/if}
          {/each}
        {:else}
          <p class="muted">Noch kein Text.</p>
        {/if}
      </div>
    {/if}

    <div class="meta-grid">
      <label class="field">
        <span>Typ</span>
        <select class="select" bind:value={type} on:change={scheduleSave}>
          <option value="note">Notiz</option>
          <option value="mistake">Fehler</option>
          <option value="question">Frage</option>
          <option value="summary">Zusammenfassung</option>
        </select>
      </label>
      <label class="field">
        <span>Modul</span>
        <select class="select" bind:value={moduleId} on:change={onModuleChange}>
          <option value="">Kein Modul</option>
          {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Thema</span>
        <select class="select" bind:value={topicId} on:change={scheduleSave}>
          <option value="">Kein Thema</option>
          {#each topics as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>
    </div>

    <section class="attachments-block">
      <div class="section-title"><h2>Dateien</h2></div>
      <AttachmentList attachments={note.attachments || []} ownerId={note.id} on:change={(e) => updateNote(note.id, { attachments: e.detail })} />
    </section>

    {#if back.length}
      <section class="backlinks">
        <div class="section-title"><h2>Verlinkt von</h2></div>
        <div class="back-list">
          {#each back as source (source.id)}
            <a class="back-link" href="#{notePath(source.id)}">
              <Icon name="notes" size={14} />
              <span>{source.title || 'Ohne Titel'}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 860px;
  }
  .crumbs {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .crumbs a {
    color: var(--ink-3);
    text-decoration: none;
  }
  .crumbs a:hover {
    color: var(--accent-strong);
    text-decoration: underline;
  }
  .note-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .head-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 10px;
    color: var(--ink-3);
  }
  .type {
    font-weight: 600;
  }
  .head-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .seg {
    min-height: 30px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .seg.active {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-2);
  }
  .icon-btn:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  .title-input {
    width: 100%;
    padding: var(--space-2) 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font-family: var(--font-read);
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .title-input:focus {
    outline: none;
  }
  .body-input {
    width: 100%;
    min-height: 320px;
    padding: var(--space-3) 0;
    border: 0;
    border-top: 1px solid var(--rule);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-read);
    font-size: var(--text-lg);
    line-height: 1.7;
    resize: vertical;
  }
  .body-input:focus {
    outline: none;
  }
  .read-title {
    font-family: var(--font-read);
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
  }
  .note-body {
    min-height: 200px;
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .wiki {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--accent-strong);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .wiki.unresolved {
    color: var(--ink-3);
    text-decoration-style: dashed;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
  .attachments-block,
  .backlinks {
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
  .back-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .back-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-1);
    color: var(--ink-2);
    font-size: var(--text-xs);
    text-decoration: none;
  }
  .back-link:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  @media (min-width: 720px) {
    .meta-grid {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }
</style>
