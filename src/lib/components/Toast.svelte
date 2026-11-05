<script>
  import { toasts, dismissToast } from '../stores/toast.js';
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
  {#each $toasts as t (t.id)}
    <div class="toast" role="status">
      <span>{t.message}</span>
      {#if t.action}
        <button
          class="btn btn-ghost btn-sm"
          type="button"
          on:click={() => {
            t.action.fn();
            dismissToast(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="btn btn-ghost btn-sm close" type="button" on:click={() => dismissToast(t.id)} aria-label="Meldung schliessen">✕</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(var(--tabbar-h) + 20px + env(safe-area-inset-bottom, 0px));
    z-index: 120;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(420px, calc(100vw - 24px));
    transform: translateX(-50%);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--ink);
    color: var(--bg);
    border-radius: var(--radius-2);
    box-shadow: var(--shadow-2);
    font-size: var(--text-sm);
    pointer-events: auto;
  }
  .toast span {
    flex: 1;
  }
  .toast :global(.btn) {
    color: inherit;
  }
  .close {
    padding: 0 var(--space-1);
  }
  @media (min-width: 900px) {
    .toasts {
      bottom: var(--space-5);
    }
  }
</style>
