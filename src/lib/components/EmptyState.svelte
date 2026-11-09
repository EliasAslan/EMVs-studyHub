<script>
  export let title = '';
  export let text = '';
  export let actionLabel = '';
  export let action = null;
  export let secondaryLabel = '';
  export let secondary = null;
</script>

<div class="empty">
  {#if $$slots.icon}
    <div class="empty-icon" aria-hidden="true">
      <slot name="icon" />
    </div>
  {/if}
  {#if title}<h3>{title}</h3>{/if}
  {#if text}<p class="muted">{text}</p>{/if}
  <div class="row">
    {#if actionLabel && action}
      <button class="btn btn-primary" type="button" on:click={action}>{actionLabel}</button>
    {/if}
    {#if secondaryLabel && secondary}
      <button class="btn btn-ghost" type="button" on:click={secondary}>{secondaryLabel}</button>
    {/if}
  </div>
</div>

<style>
  .empty-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-2);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-size: 20px;
  }
  .empty h3 {
    font-size: var(--text-base);
  }
  .empty p {
    font-size: var(--text-sm);
    max-width: 44ch;
  }
</style>
