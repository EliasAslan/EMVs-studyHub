<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';

  export let items = [];
  const dispatch = createEventDispatcher();

  let newText = '';
  let adding = false;

  function toggle(item) {
    dispatch('toggle', item);
  }

  function add() {
    const value = newText.trim();
    if (!value) return;
    dispatch('add', value);
    newText = '';
    adding = false;
  }
</script>

<div class="checklist">
  {#each items as item (item.id)}
    <div class="item" class:done={item.checked}>
      <button
        class="check"
        type="button"
        aria-pressed={item.checked}
        aria-label={`${item.checked ? 'Erledigt' : 'Offen'}: ${item.text}`}
        on:click={() => toggle(item)}
      >
        {#if item.checked}<Icon name="check" size={14} />{/if}
      </button>
      <span class="text">{item.text}</span>
      {#if item.kind === 'homework'}
        <span class="tag">Hausaufgabe</span>
      {/if}
      {#if item.kind === 'custom'}
        <button class="remove" type="button" aria-label={`${item.text} entfernen`} on:click={() => dispatch('remove', item)}>
          <Icon name="x" size={14} />
        </button>
      {/if}
    </div>
  {/each}

  {#if adding}
    <div class="add-row">
      <input
        class="input"
        bind:value={newText}
        placeholder="Neuer Punkt"
        aria-label="Neuer Checklisten-Punkt"
        on:keydown={(e) => {
          if (e.key === 'Enter') add();
          if (e.key === 'Escape') {
            adding = false;
            newText = '';
          }
        }}
      />
      <button class="btn btn-primary btn-sm" type="button" on:click={add}>Hinzufügen</button>
    </div>
  {:else}
    <button class="add-btn" type="button" on:click={() => (adding = true)}>
      <Icon name="plus" size={14} /> Punkt hinzufügen
    </button>
  {/if}
</div>

<style>
  .checklist {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2);
  }
  .item:hover {
    background: var(--surface-2);
  }
  .check {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: none;
    border: 1.5px solid var(--rule-strong);
    border-radius: 6px;
    background: var(--surface);
    color: var(--accent-ink);
  }
  .item.done .check {
    background: var(--accent);
    border-color: var(--accent);
  }
  .item.done .text {
    color: var(--ink-3);
    text-decoration: line-through;
  }
  .text {
    flex: 1;
    font-size: var(--text-sm);
  }
  .tag {
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: 0.6875rem;
    font-weight: 500;
  }
  .remove {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
  }
  .remove:hover {
    background: var(--surface);
    color: var(--danger);
  }
  .add-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    min-height: 36px;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-2);
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-sm);
  }
  .add-btn:hover {
    color: var(--ink);
    background: var(--surface-2);
  }
  .add-row {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2);
  }
</style>
