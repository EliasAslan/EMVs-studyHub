<script>
  import { route } from '../router.js';
  import Icon from './Icon.svelte';

  export let onMore;
  export let expanded = false;

  $: isMore =
    expanded ||
    ['links', 'settings', 'calendar', 'modules', 'module', 'tokens', 'assistant'].includes($route.name);
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
  <a class="tab" class:active={$route.name === 'focus'} href="#/focus" aria-current={$route.name === 'focus' ? 'page' : undefined} title="Pomodoro-Timer">
    <Icon name="focus" size={20} />
    <span>Fokus</span>
  </a>
  <a class="tab" class:active={$route.name === 'exams'} href="#/exams" aria-current={$route.name === 'exams' ? 'page' : undefined}>
    <Icon name="exams" size={20} />
    <span>Prüfungen</span>
  </a>
  <button
    class="tab"
    class:active={isMore}
    type="button"
    on:click={onMore}
    aria-expanded={expanded}
    aria-controls="app-sidebar"
  >
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
    grid-template-columns: repeat(5, 1fr);
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
    gap: 3px;
    border: 0;
    background: transparent;
    color: var(--ink-3);
    font-size: 11px;
    font-weight: 600;
    text-decoration: none;
  }
  .tab.active {
    color: var(--accent-strong);
    box-shadow: inset 0 2px 0 var(--accent);
  }
  .tab:hover { background: color-mix(in srgb, var(--accent-soft) 50%, transparent); color:var(--accent-strong); }
  .tab :global(svg) { transition: transform var(--motion); }
  .tab.active :global(svg) { transform:translateY(-1px); }
  @media (min-width: 900px) {
    .tabbar {
      display: none;
    }
  }
</style>
