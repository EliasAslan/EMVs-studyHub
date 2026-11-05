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
        <span class="title">{d.item.title}</span>
        <span class="meta">
          <span class="date mono">{formatDate(d.date, 'short')}</span>
          <span class="rel">{relativeDayLabel(d.date)}</span>
        </span>
        {#if d.item.moduleId}<span class="module">{moduleTitle($appState, d.item.moduleId)}</span>{/if}
      </button>
    {/each}
  </div>
{:else}
  <p class="muted empty-line">Keine Fristen in den nächsten Tagen.</p>
{/if}

<style>
  .strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(190px, 1fr);
    gap: var(--space-3);
    overflow-x: auto;
    padding-bottom: var(--space-2);
    scrollbar-width: thin;
  }
  .deadline {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    min-height: 110px;
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    text-align: left;
  }
  .deadline:hover {
    border-color: var(--rule-strong);
    background: var(--surface-2);
  }
  .deadline.overdue {
    border-color: var(--warn);
    background: var(--warn-soft);
  }
  .kind {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .title {
    font-weight: 600;
    font-size: var(--text-sm);
    line-height: 1.3;
  }
  .meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-top: auto;
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .date {
    font-size: var(--text-xs);
  }
  .rel {
    color: var(--ink-3);
  }
  .module {
    font-size: 10px;
    color: var(--ink-3);
  }
  .empty-line {
    padding: var(--space-3) 0;
    font-size: var(--text-sm);
  }
</style>
