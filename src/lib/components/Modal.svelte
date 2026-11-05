<script>
  import { createEventDispatcher } from 'svelte';
  export let open = false;
  export let title = '';
  export let wide = false;
  const dispatch = createEventDispatcher();

  let dialog;
  let previousFocus = null;

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  export function close() {
    dispatch('close');
  }

  $: if (open && dialog && !previousFocus) {
    previousFocus = document.activeElement;
    queueMicrotask(() => {
      const target = dialog.querySelector('[data-autofocus]') || dialog.querySelector('button, input, textarea, select, a[href]');
      target?.focus?.();
    });
  }
  $: if (!open && previousFocus) {
    previousFocus.focus?.();
    previousFocus = null;
  }
</script>

{#if open}
  <div class="overlay" role="presentation" on:click|self={close}>
    <div
      class="modal"
      class:wide
      bind:this={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
      tabindex="-1"
      on:keydown={onKeydown}
    >
      {#if title}
        <header class="modal-head">
          <h2>{title}</h2>
          <button class="btn btn-ghost btn-sm" type="button" on:click={close} aria-label="Schliessen">
            <span aria-hidden="true">✕</span>
          </button>
        </header>
      {/if}
      <div class="modal-body">
        <slot />
      </div>
      {#if $$slots.footer}
        <footer class="modal-foot">
          <slot name="footer" />
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: var(--space-4);
    background: rgb(20 22 28 / 0.35);
    backdrop-filter: blur(3px);
  }
  .modal {
    width: min(560px, 100%);
    max-height: min(86vh, 760px);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    box-shadow: var(--shadow-3);
    overflow: hidden;
  }
  .modal.wide {
    width: min(820px, 100%);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--rule);
  }
  .modal-head h2 {
    font-size: var(--text-lg);
  }
  .modal-body {
    padding: var(--space-5);
    overflow: auto;
  }
  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--rule);
    background: var(--surface);
  }
  @media (min-width: 640px) {
    .overlay {
      align-items: center;
    }
  }
</style>
