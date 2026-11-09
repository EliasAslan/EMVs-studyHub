<script>
  import { parseMarkdown } from '../data/markdown.js';
  import InlineText from './InlineText.svelte';

  export let body = '';
  export let resolveEntry = null;
  export let onLink = () => {};
  export let onCreate = () => {};
  export let onTag = () => {};
  /** Optional: (lineIndex, checked) => void. Omit for read-only tasks. */
  export let onToggleTask = null;

  $: blocks = parseMarkdown(body);
</script>

<div class="md">
  {#each blocks as block, b (b)}
    {#if block.type === 'heading'}
      <svelte:element this={`h${Math.min(block.level + 1, 4)}`} class="md-heading">
        <InlineText text={block.text} {resolveEntry} {onLink} {onCreate} {onTag} />
      </svelte:element>
    {:else if block.type === 'paragraph'}
      <p class="md-p">
        <InlineText text={block.text} {resolveEntry} {onLink} {onCreate} {onTag} />
      </p>
    {:else if block.type === 'list'}
      <svelte:element this={block.ordered ? 'ol' : 'ul'} class="md-list">
        {#each block.items as item, i (i)}
          <li><InlineText text={item.text} {resolveEntry} {onLink} {onCreate} {onTag} /></li>
        {/each}
      </svelte:element>
    {:else if block.type === 'task'}
      <label class="md-task" class:done={block.checked}>
        <input
          type="checkbox"
          checked={block.checked}
          disabled={!onToggleTask}
          on:change={(e) => onToggleTask?.(block.line, e.currentTarget.checked)}
        />
        <span><InlineText text={block.text} {resolveEntry} {onLink} {onCreate} {onTag} /></span>
      </label>
    {:else if block.type === 'quote'}
      <blockquote class="md-quote">
        <InlineText text={block.text} {resolveEntry} {onLink} {onCreate} {onTag} />
      </blockquote>
    {:else if block.type === 'code'}
      <pre class="md-code"><code>{block.code}</code></pre>
    {:else if block.type === 'hr'}
      <hr class="md-hr" />
    {/if}
  {/each}
</div>

<style>
  .md {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .md > :global(*:first-child) {
    margin-top: 0;
  }
  .md-heading {
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  h2.md-heading {
    font-size: var(--text-xl);
  }
  h3.md-heading {
    font-size: var(--text-lg);
  }
  h4.md-heading {
    font-size: var(--text-base);
  }
  .md-p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .md-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-left: 1.25em;
    list-style: disc;
  }
  ol.md-list {
    list-style: decimal;
  }
  .md-list li {
    padding-left: 0.15em;
  }
  .md-task {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    cursor: pointer;
  }
  .md-task input {
    margin-top: 0.35em;
    width: 15px;
    height: 15px;
    flex: none;
    accent-color: var(--accent);
  }
  .md-task.done span {
    color: var(--ink-3);
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }
  .md-quote {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid var(--rule-strong);
    color: var(--ink-2);
    white-space: pre-wrap;
  }
  .md-code {
    margin: 0;
    padding: var(--space-3);
    overflow-x: auto;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.55;
  }
  .md-hr {
    width: 100%;
    margin: var(--space-2) 0;
    border: 0;
    border-top: 1px solid var(--rule);
  }
</style>
