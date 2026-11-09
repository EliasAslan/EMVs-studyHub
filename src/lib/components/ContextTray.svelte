<script>
  import { createEventDispatcher } from 'svelte';
  import { buildContextBlock } from '../data/aiContext.js';

  export let result = null;
  export let open = false;

  const dispatch = createEventDispatcher();

  $: sections = result?.sections || [];
  $: totalChars = result?.totalChars || 0;
  $: truncated = !!result?.truncated;
  $: preview = buildContextBlock(result);
</script>

{#if sections.length}
  <div class="tray" role="group" aria-label="Kontext für die Frage">
    <div class="chips">
      {#each sections as section (section.ref)}
        <span class="chip" class:cut={section.truncated}>
          {section.label}{#if section.truncated}<span class="cut-label"> · gekürzt</span>{/if}
        </span>
      {/each}
      <button
        class="toggle"
        type="button"
        aria-expanded={open}
        on:click={() => dispatch('toggle')}
      >
        {open ? 'Kontext ausblenden' : 'Kontext anzeigen'}
      </button>
      <span class="count mono" class:over={truncated}>{totalChars} Zeichen</span>
    </div>
    {#if open}
      <pre class="preview" role="region" aria-label="Genauer Kontext">{preview}</pre>
    {/if}
  </div>
{/if}

<style>
  .tray {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--ink-2);
    font-size: 11px;
    font-weight: 600;
  }
  .chip.cut {
    color: var(--warn);
  }
  .cut-label {
    font-weight: 500;
  }
  .toggle {
    border: 0;
    background: transparent;
    color: var(--accent-strong);
    font-size: 11px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .count {
    margin-left: auto;
    font-size: 10px;
    color: var(--ink-3);
  }
  .count.over {
    color: var(--warn);
  }
  .preview {
    max-height: 260px;
    margin: 0;
    padding: var(--space-3);
    overflow: auto;
    border-radius: var(--radius-1);
    background: var(--surface);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (pointer: coarse) {
    .toggle {
      min-height: 48px;
    }
  }
</style>
