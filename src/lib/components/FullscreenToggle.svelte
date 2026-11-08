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
    <Icon name={active ? 'compress' : 'expand'} size={15} />
  </button>
{/if}

<style>
  .fullscreen-toggle {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-2);
    background: transparent;
    color: var(--ink-3);
    opacity: 0.55;
    transition: opacity var(--motion), background var(--motion), color var(--motion);
  }
  .fullscreen-toggle:hover,
  .fullscreen-toggle:focus-visible {
    background: var(--surface-2);
    color: var(--ink);
    opacity: 1;
  }
  .fullscreen-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .fullscreen-toggle[aria-pressed='true'] {
    background: transparent;
    color: var(--ink-3);
    opacity: 0.2;
    transition: opacity 300ms ease;
  }
  .fullscreen-toggle[aria-pressed='true']:hover {
    background: var(--surface-2);
    color: var(--ink);
    opacity: 0.85;
  }
  .fullscreen-toggle[aria-pressed='true']:focus-visible {
    background: var(--surface-2);
    color: var(--ink);
    opacity: 1;
  }
  @media (any-pointer: coarse) {
    .fullscreen-toggle {
      width: 48px;
      height: 48px;
    }
  }
</style>
