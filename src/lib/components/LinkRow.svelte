<script>
  import { createEventDispatcher } from 'svelte';
  import { appState, moduleTitle } from '../stores/app.js';
  import { defaultLinkColor } from '../data/entities.js';
  import Icon from './Icon.svelte';

  export let link;
  export let showModule = true;
  const dispatch = createEventDispatcher();

  const icons = {
    teams: 'teams',
    onenote: 'onenote',
    website: 'website',
    youtube: 'youtube',
    custom: 'sparkle',
  };

  $: host = (() => {
    try {
      return new URL(link.url).hostname.replace(/^www\./, '');
    } catch {
      return link.url;
    }
  })();
  $: module = link.moduleId ? moduleTitle($appState, link.moduleId) : '';
  $: linkColor = link.color || defaultLinkColor(link.kind);
</script>

<div class="link-row">
  <a class="main" href={link.url} target="_blank" rel="noopener noreferrer">
    <span class="icon" style={`--link-color: ${linkColor}`}><Icon name={icons[link.kind] || 'links'} size={16} /></span>
    <span class="text">
      <span class="label">{link.label}</span>
      <span class="host mono">{host}{#if showModule && module} · {module}{/if}</span>
    </span>
  </a>
  {#if $$slots.actions}
    <div class="actions"><slot name="actions" /></div>
  {/if}
</div>

<style>
  .link-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 52px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2);
  }
  .link-row:hover {
    background: var(--surface-2);
  }
  .main {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    color: var(--ink);
    text-decoration: none;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: var(--radius-1);
    background: color-mix(in srgb, var(--link-color, var(--accent-strong)) 14%, transparent);
    color: var(--link-color, var(--accent-strong));
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .label {
    font-size: var(--text-sm);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .host {
    font-size: 10px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: 2px;
  }
</style>
