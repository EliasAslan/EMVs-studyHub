<script>
  import { appState, moduleTitle } from '../stores/app.js';
  import { notePath } from '../router.js';
  import { formatDate, dateKey } from '../data/dates.js';

  export let note;
  export let active = false;

  const TYPE_LABELS = {
    note: 'Notiz',
    mistake: 'Fehler',
    summary: 'Zusammenfassung',
    question: 'Frage',
    idea: 'Idee',
  };

  $: label = TYPE_LABELS[note.type] || (note.type ? note.type.charAt(0).toUpperCase() + note.type.slice(1) : 'Notiz');
  $: module = note.moduleId ? moduleTitle($appState, note.moduleId) : '';
  $: excerpt = (note.body || '')
    .replace(/\[\[([^\[\]|\n]+)(\|[^\[\]\n]*)?\]\]/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  $: date = formatDate(dateKey(new Date(note.updatedAt || note.createdAt)), 'short');
</script>

<a class="row" class:active href="#{notePath(note.id)}" aria-current={active ? 'page' : undefined}>
  <span class="row-top">
    <span class="row-type">{label}</span>
    {#if module}<span class="module">{module}</span>{/if}
    <span class="date mono">{date}</span>
  </span>
  <span class="title">{note.title || 'Ohne Titel'}</span>
  {#if excerpt}<span class="excerpt">{excerpt}</span>{/if}
</a>

<style>
  .row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-2);
    color: var(--ink);
    text-decoration: none;
    transition: background var(--motion), border-color var(--motion);
  }
  .row:hover {
    background: var(--surface-2);
  }
  .row.active {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .row.active .title {
    color: var(--accent-strong);
  }
  .row-top {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 10px;
    color: var(--ink-3);
    min-width: 0;
  }
  .row-type {
    font-weight: 600;
    flex: none;
  }
  .module {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .date {
    margin-left: auto;
    flex: none;
  }
  .title {
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .excerpt {
    font-family: var(--font-read);
    font-size: var(--text-xs);
    line-height: 1.45;
    color: var(--ink-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
