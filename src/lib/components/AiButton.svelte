<script>
  import { aiReady } from '../stores/ai.js';
  import { navigate } from '../router.js';
  import Icon from './Icon.svelte';

  export let label = 'KI fragen';
  export let kind = null;
  export let id = null;
  export let ref = '';
  export let prompt = '';
  export let icon = 'sparkle';
  export let iconOnly = false;

  function open() {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    else if (kind && id) params.set('ref', `${kind}:${id}`);
    if (prompt) params.set('prompt', prompt);
    const query = params.toString();
    navigate(`/assistant${query ? `?${query}` : ''}`);
  }
</script>

{#if $aiReady}
  {#if iconOnly}
    <button class="icon-ai" type="button" on:click={open} aria-label={label} title={label}>
      <Icon name={icon} size={15} />
    </button>
  {:else}
    <button class="btn btn-sm btn-ghost ai-btn" type="button" on:click={open}>
      <Icon name={icon} size={14} /> {label}
    </button>
  {/if}
{/if}

<style>
  .icon-ai {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
  }
  .icon-ai:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .icon-ai:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
