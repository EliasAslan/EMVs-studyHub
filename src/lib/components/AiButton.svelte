<script>
  import { aiReady } from '../stores/ai.js';
  import { navigate } from '../router.js';
  import Icon from './Icon.svelte';

  export let label = 'KI fragen';
  export let kind = null;
  export let id = null;
  export let prompt = '';
  export let icon = 'sparkle';

  function open() {
    const params = new URLSearchParams();
    if (kind && id) params.set('ref', `${kind}:${id}`);
    if (prompt) params.set('prompt', prompt);
    const query = params.toString();
    navigate(`/assistant${query ? `?${query}` : ''}`);
  }
</script>

{#if $aiReady}
  <button class="btn btn-sm btn-ghost ai-btn" type="button" on:click={open}>
    <Icon name={icon} size={14} /> {label}
  </button>
{/if}
