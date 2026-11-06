<script>
  import { navigate } from '../router.js';
  import { appState, moduleTitle } from '../stores/app.js';
  import { formatDate, relativeDayLabel } from '../data/dates.js';
  import Icon from './Icon.svelte';

  export let deadlines = [];
</script>

{#if deadlines.length}
  <div class="strip">
    {#each deadlines as d (d.kind + d.item.id)}
      <button
        class="deadline"
        class:overdue={d.days !== null && d.days < 0}
        type="button"
        on:click={() => navigate(d.kind === 'exam' ? '/exams' : '/homework')}
      >
        <span class="kind">
          <Icon name={d.kind === 'exam' ? 'exams' : 'homework'} size={13} />
          {d.kind === 'exam' ? 'Prüfung' : 'Hausaufgabe'}
        </span>
        <span class="body">
          <span class="title">{d.item.title}</span>
          {#if d.item.moduleId}<span class="module">{moduleTitle($appState, d.item.moduleId)}</span>{/if}
        </span>
        <span class="meta">
          <span class="date mono">{formatDate(d.date, 'short')}</span>
          <span class="rel">{relativeDayLabel(d.date)}</span>
        </span>
      </button>
    {/each}
  </div>
{:else}
  <p class="muted empty-line">Keine Fristen in den nächsten Tagen.</p>
{/if}

<style>
  .strip {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--rule);
  }
  .deadline {
    display: grid;
    grid-template-columns: 116px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 52px;
    padding: var(--space-2) var(--space-1);
    border: 0;
    border-bottom: 1px solid var(--rule);
    border-radius: 0;
    background: transparent;
    text-align: left;
  }
  .deadline:hover {
    background: var(--surface-2);
    border-radius: var(--radius-1);
  }
  .deadline.overdue .kind,
  .deadline.overdue .rel {
    color: var(--warn);
  }
  .deadline.overdue .rel {
    font-weight: 600;
  }
  .kind {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ink-2);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: var(--text-sm);
    line-height: 1.3;
  }
  .meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: 0.75rem;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .date {
    font-size: 0.75rem;
  }
  .rel {
    color: var(--ink-3);
  }
  .module {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .empty-line {
    padding: var(--space-3) 0;
    font-size: var(--text-sm);
  }
</style>
