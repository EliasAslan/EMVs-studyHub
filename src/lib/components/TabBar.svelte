<script>
  import { route } from '../router.js';
  import Icon from './Icon.svelte';

  export let onMore;

  $: isNotes = $route.name === 'notes' || $route.name === 'note';
  $: isMore = ['exams', 'links', 'focus', 'settings', 'calendar', 'modules', 'module'].includes($route.name);
</script>

<nav class="tabbar" aria-label="Mobile Navigation">
  <a class="tab" class:active={$route.name === 'today'} href="#/" aria-current={$route.name === 'today' ? 'page' : undefined}>
    <Icon name="today" size={20} />
    <span>Heute</span>
  </a>
  <a class="tab" class:active={$route.name === 'homework'} href="#/homework" aria-current={$route.name === 'homework' ? 'page' : undefined}>
    <Icon name="homework" size={20} />
    <span>Hausaufgaben</span>
  </a>
  <a class="tab" class:active={isNotes} href="#/notes" aria-current={isNotes ? 'page' : undefined}>
    <Icon name="notes" size={20} />
    <span>Notizen</span>
  </a>
  <button class="tab" class:active={isMore} type="button" on:click={onMore} aria-haspopup="dialog">
    <Icon name="more" size={20} />
    <span>Mehr</span>
  </button>
</nav>

<style>
  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    height: calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    border-top: 1px solid var(--rule);
    backdrop-filter: blur(12px);
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 0;
    background: transparent;
    color: var(--ink-3);
    font-size: 10px;
    font-weight: 600;
    text-decoration: none;
  }
  .tab.active {
    color: var(--accent-strong);
  }
  @media (min-width: 900px) {
    .tabbar {
      display: none;
    }
  }
</style>
