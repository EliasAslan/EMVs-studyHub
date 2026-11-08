<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from './Modal.svelte';

  export let open = false;
  export let title = 'KI-Entwurf';
  export let text = '';
  export let busy = false;
  export let error = '';
  export let applyLabel = 'Übernehmen';

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }
</script>

<Modal {open} {title} on:close={close}>
  <div class="stack">
    {#if error}
      <p class="error" role="alert">{error}</p>
      <button class="btn btn-sm" type="button" on:click={() => dispatch('retry')} disabled={busy}>
        Erneut versuchen
      </button>
    {:else if busy}
      <p class="muted small" aria-live="polite">Der Entwurf wird erstellt…</p>
    {:else}
      <pre class="draft" role="region" aria-label="Entwurf">{text}</pre>
    {/if}
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={close}>Verwerfen</button>
    <button class="btn btn-primary" type="button" on:click={() => dispatch('apply')} disabled={busy || !!error || !text}>
      {applyLabel}
    </button>
  </svelte:fragment>
</Modal>

<style>
  .draft {
    max-height: 50vh;
    margin: 0;
    padding: var(--space-3);
    overflow: auto;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
    color: var(--ink);
    font-family: var(--font-read, var(--font-body));
    font-size: var(--text-sm);
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .error {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-sm);
  }
</style>
