<script>
  import { createEventDispatcher } from 'svelte';
  import { appState, moduleTitle } from '../stores/app.js';
  import { formatDate, relativeDayLabel, daysUntil } from '../data/dates.js';
  import Icon from './Icon.svelte';

  export let hw;
  const dispatch = createEventDispatcher();

  $: days = hw.dueDate ? daysUntil(hw.dueDate) : null;
  $: overdue = !hw.done && days !== null && days < 0;
  $: module = hw.moduleId ? moduleTitle($appState, hw.moduleId) : '';
</script>

<div class="hw-row" class:done={hw.done} class:overdue>
  <button
    class="check"
    type="button"
    aria-pressed={hw.done}
    aria-label={`${hw.done ? 'Erledigt' : 'Offen'}: ${hw.title}`}
    on:click={() => dispatch('toggle', hw)}
  >
    {#if hw.done}<Icon name="check" size={14} />{/if}
  </button>

  <button class="body" type="button" on:click={() => dispatch('edit', hw)}>
    <span class="title">{hw.title}</span>
    <span class="meta">
      {#if module}<span class="module">{module}</span>{/if}
      {#if hw.dueDate}
        <span class="due mono">{formatDate(hw.dueDate, 'short')}</span>
        <span class="rel" class:overdue-text={overdue}>{hw.done ? '' : relativeDayLabel(hw.dueDate)}</span>
      {:else}
        <span class="rel">ohne Datum</span>
      {/if}
    </span>
  </button>

  <button class="icon" type="button" aria-label={`${hw.title} löschen`} on:click={() => dispatch('delete', hw)}>
    <Icon name="trash" size={15} />
  </button>
</div>

<style>
  .hw-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 52px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2);
  }
  .hw-row:hover {
    background: var(--surface-2);
  }
  .check {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    border: 1.5px solid var(--rule-strong);
    border-radius: 7px;
    background: var(--surface);
    color: var(--accent-ink);
  }
  .done .check {
    background: var(--accent);
    border-color: var(--accent);
  }
  .body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: var(--space-1) 0;
    text-align: left;
  }
  .title {
    font-size: var(--text-sm);
    font-weight: 550;
    line-height: 1.3;
  }
  .done .title {
    color: var(--ink-3);
    text-decoration: line-through;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
    font-size: 11px;
    color: var(--ink-3);
  }
  .module {
    color: var(--ink-2);
  }
  .overdue-text {
    color: var(--warn);
    font-weight: 600;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
    opacity: 0;
  }
  .hw-row:hover .icon,
  .icon:focus-visible {
    opacity: 1;
  }
  .icon:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  @media (any-pointer: coarse) {
    .icon {
      opacity: 1;
    }
  }
</style>
