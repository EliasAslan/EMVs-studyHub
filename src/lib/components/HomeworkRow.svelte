<script>
  import { createEventDispatcher } from 'svelte';
  import { appState, moduleTitle } from '../stores/app.js';
  import { formatDate, relativeDayLabel, daysUntil } from '../data/dates.js';
  import { describeRecurrence } from '../data/recurrence.js';
  import { hint } from '../actions/hint.js';
  import Icon from './Icon.svelte';

  export let hw;
  /** Shared clock value so due labels roll over at midnight. */
  export let now = new Date();
  const dispatch = createEventDispatcher();

  $: days = hw.dueDate ? daysUntil(hw.dueDate, now) : null;
  $: overdue = !hw.done && days !== null && days < 0;
  $: module = hw.moduleId ? moduleTitle($appState, hw.moduleId) : '';
  $: recurrenceLabel = describeRecurrence(hw.recurrence);
</script>

<div class="hw-row" class:done={hw.done} class:overdue>
  <button
    class="check"
    type="button"
    aria-pressed={hw.done}
    aria-label={`${hw.done ? 'Erledigt' : 'Offen'}: ${hw.title}`}
    on:click={() => dispatch('toggle', hw)}
    use:hint={{ text: hw.done ? 'Wieder öffnen' : 'Als erledigt markieren' }}
  >
    <span class="box" aria-hidden="true">
      {#if hw.done}<Icon name="check" size={14} />{/if}
    </span>
  </button>

  <button
    class="body"
    type="button"
    on:click={() => dispatch('edit', hw)}
    use:hint={{ text: 'Bearbeiten' }}
  >
    <span class="title">{hw.title}</span>
    <span class="meta">
      {#if module}<span class="module">{module}</span>{/if}
      {#if hw.dueDate}
        <span class="due mono">{formatDate(hw.dueDate, 'short')}</span>
        <span class="rel" class:overdue-text={overdue}>{hw.done ? '' : relativeDayLabel(hw.dueDate, now)}</span>
      {:else}
        <span class="rel">ohne Datum</span>
      {/if}
      {#if recurrenceLabel}<span class="recur">{recurrenceLabel}</span>{/if}
    </span>
  </button>

  <button
    class="icon edit"
    type="button"
    aria-label={`${hw.title} bearbeiten`}
    on:click={() => dispatch('edit', hw)}
    use:hint={{ text: 'Bearbeiten' }}
  >
    <Icon name="edit" size={15} />
  </button>
  <button
    class="icon delete"
    type="button"
    aria-label={`${hw.title} löschen`}
    on:click={() => dispatch('delete', hw)}
    use:hint={{ text: 'Löschen' }}
  >
    <Icon name="trash" size={15} />
  </button>
</div>

<style>
  .hw-row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 56px;
    padding: 2px var(--space-1);
    border-radius: var(--radius-2);
  }
  .hw-row:hover {
    background: var(--surface-2);
  }
  .check {
    display: grid;
    place-items: center;
    width: 40px;
    height: 44px;
    flex: none;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent-ink);
  }
  .box {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1.5px solid var(--rule-strong);
    border-radius: 7px;
    background: var(--surface);
    transition: background var(--motion), border-color var(--motion);
  }
  .check:hover .box {
    border-color: var(--accent);
  }
  .done .box {
    background: var(--accent);
    border-color: var(--accent);
  }
  .body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    flex: 1;
    min-width: 0;
    min-height: 44px;
    border: 0;
    background: transparent;
    padding: var(--space-1) var(--space-1);
    text-align: left;
  }
  .title {
    font-size: var(--text-sm);
    font-weight: 550;
    line-height: 1.3;
    overflow-wrap: anywhere;
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
    font-size: var(--text-xs);
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
    width: 36px;
    height: 40px;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
    opacity: 0.45;
  }
  .hw-row:hover .icon,
  .icon:focus-visible {
    opacity: 1;
  }
  .icon:hover {
    background: var(--surface);
    color: var(--ink);
  }
  .delete:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  @media (pointer: coarse) {
    .icon {
      width: 44px;
      height: 44px;
      opacity: 1;
    }
  }
  @media (max-width: 420px) {
    .edit {
      display: none;
    }
  }
</style>
