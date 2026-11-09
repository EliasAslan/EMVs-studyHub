<script>
  import { parseInline } from '../data/markdown.js';

  /** Plain text with inline markdown-lite tokens. */
  export let text = '';
  /** (target) => entry | null — decides resolved vs. unresolved wiki links. */
  export let resolveEntry = null;
  export let onLink = () => {};
  export let onCreate = () => {};
  export let onTag = () => {};

  $: tokens = parseInline(text);
</script>

{#each tokens as tok, i (i)}{#if tok.type === 'text'}{tok.text}{:else if tok.type === 'link'}{#if resolveEntry && resolveEntry(tok.target)}<button class="wiki" type="button" on:click={() => onLink(tok.target)}>{tok.label}</button>{:else}<button class="wiki unresolved" type="button" title={`Notiz «${tok.target}» erstellen`} on:click={() => onCreate(tok.target)}><span class="wiki-plus" aria-hidden="true">+</span>{tok.label}</button>{/if}{:else if tok.type === 'bold'}<strong>{tok.text}</strong>{:else if tok.type === 'italic'}<em>{tok.text}</em>{:else if tok.type === 'code'}<code>{tok.text}</code>{:else if tok.type === 'tag'}<button class="tag" type="button" on:click={() => onTag(tok.tag)}>#{tok.tag}</button>{/if}{/each}

<style>
  .wiki {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--accent-strong);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .wiki:hover {
    color: var(--accent);
  }
  .wiki.unresolved {
    color: var(--ink-3);
    text-decoration-style: dashed;
  }
  .wiki.unresolved:hover {
    color: var(--accent-strong);
  }
  .wiki-plus {
    margin-right: 3px;
    font-weight: 700;
  }
  .tag {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--accent-strong);
    font: inherit;
    font-size: 0.92em;
    cursor: pointer;
  }
  .tag:hover {
    text-decoration: underline;
  }
  code {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 0.86em;
  }
</style>
