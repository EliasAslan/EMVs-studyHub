<script>
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  let available = false;
  let active = false;

  function sync() {
    active = !!document.fullscreenElement;
  }

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browsers may block fullscreen (permissions, iOS, iframes). Stay quiet.
    }
    sync();
  }

  onMount(() => {
    available = document.fullscreenEnabled === true;
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  });
</script>

{#if available}
  <button
    class="fullscreen-toggle"
    type="button"
    on:click={toggle}
    aria-label={active ? 'Vollbild verlassen' : 'Vollbild'}
    aria-pressed={active}
    title={active ? 'Vollbild verlassen (Esc)' : 'Vollbild'}
  >
    <Icon name={active ? 'compress' : 'expand'} size={16} />
  </button>
{/if}

<style>
  .fullscreen-toggle {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-3);
  }
  .fullscreen-toggle:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .fullscreen-toggle[aria-pressed='true'] {
    background: var(--surface-2);
    color: var(--accent-strong);
  }
  @media (any-pointer: coarse) {
    .fullscreen-toggle {
      width: 48px;
      height: 48px;
    }
  }
</style>
