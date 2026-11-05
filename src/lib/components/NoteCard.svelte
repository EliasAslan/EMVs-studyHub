<script>
  import { appState, moduleTitle } from '../stores/app.js';
  import { notePath } from '../router.js';
  import { formatDate, dateKey } from '../data/dates.js';
  import Icon from './Icon.svelte';

  export let note;
  export let showModule = true;

  $: excerpt = (note.body || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  $: module = note.moduleId ? moduleTitle($appState, note.moduleId) : '';
  $: date = formatDate(dateKey(new Date(note.updatedAt || note.createdAt)), 'short');
</script>

<a class="note-card" href="#{notePath(note.id)}">
  <div class="note-top">
    <span class="type">{note.type === 'note' ? 'Notiz' : note.type}</span>
    {#if showModule && module}<span class="module">{module}</span>{/if}
    {#if note.attachments?.length}<span class="att" aria-label="Mit Datei"><Icon name="photo" size={13} /></span>{/if}
  </div>
  <h3>{note.title || 'Ohne Titel'}</h3>
  {#if excerpt}<p>{excerpt}</p>{/if}
  <span class="date mono">{date}</span>
</a>

<style>
  .note-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
    transition: border-color var(--motion), background var(--motion);
  }
  .note-card:hover {
    border-color: var(--rule-strong);
    background: var(--surface-2);
    color: var(--ink);
  }
  .note-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 10px;
    color: var(--ink-3);
  }
  .type {
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .module {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .att {
    margin-left: auto;
    color: var(--ink-3);
  }
  h3 {
    font-size: var(--text-sm);
    font-weight: 650;
    line-height: 1.3;
  }
  p {
    font-family: var(--font-read);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--ink-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .date {
    margin-top: var(--space-1);
    font-size: 10px;
    color: var(--ink-3);
  }
</style>
