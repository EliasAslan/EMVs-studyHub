<script>
  import { appState, openHomework, updateSettings } from '../stores/app.js';
  import { route, navigate, modulePath } from '../router.js';
  import Icon from './Icon.svelte';

  $: modules = $appState.modules || [];
  $: programs = $appState.programs || [];
  $: currentProgramId = $appState.settings.currentProgramId;
  $: collapsed = !!$appState.settings.navCollapsed;
  $: openCount = $openHomework.length;

  function isActive(prefix) {
    return $route.path === prefix || $route.path.startsWith(`${prefix}/`);
  }

  function toggleCollapsed() {
    updateSettings({ navCollapsed: !collapsed });
  }

  function programModules(programId) {
    return modules
      .filter((m) => m.programId === programId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }
</script>

<aside class="sidebar" class:collapsed aria-label="Hauptnavigation">
  <a class="brand" href="#/" aria-label="Study Hub — Heute">
    <span class="brand-mark" aria-hidden="true">S</span>
    {#if !collapsed}<span class="brand-text">Study Hub</span>{/if}
  </a>

  <nav class="nav">
    <a class="nav-link" class:active={$route.name === 'today'} href="#/" aria-current={$route.name === 'today' ? 'page' : undefined}>
      <Icon name="today" />
      {#if !collapsed}<span>Heute</span>{/if}
    </a>

    {#if !collapsed}
      <p class="group-label">Module</p>
    {/if}
    {#each programs as program (program.id)}
      {#if !collapsed}
        <p class="program-label" style:--dot={program.accent}>
          <span class="dot" aria-hidden="true"></span>{program.name}
        </p>
      {/if}
      {#each programModules(program.id) as mod (mod.id)}
        <a
          class="nav-link module-link"
          class:active={$route.name === 'module' && $route.id === mod.id}
          href="#{modulePath(mod.id)}"
          aria-current={$route.name === 'module' && $route.id === mod.id ? 'page' : undefined}
          title={collapsed ? `${mod.code} ${mod.title}` : undefined}
        >
          <span class="mod-dot" style:--dot={mod.accent} aria-hidden="true"></span>
          {#if !collapsed}
            <span class="module-text">
              <span class="module-code">{mod.code || '—'}</span>
              <span class="module-title">{mod.title}</span>
            </span>
          {/if}
        </a>
      {/each}
    {/each}

    {#if !collapsed}
      <p class="group-label">Arbeit</p>
    {/if}
    <a class="nav-link" class:active={$route.name === 'homework'} href="#/homework" aria-current={$route.name === 'homework' ? 'page' : undefined}>
      <Icon name="homework" />
      {#if !collapsed}<span>Hausaufgaben</span>{/if}
      {#if openCount > 0}<span class="nav-count" aria-label={`${openCount} offen`}>{openCount}</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'exams'} href="#/exams" aria-current={$route.name === 'exams' ? 'page' : undefined}>
      <Icon name="exams" />
      {#if !collapsed}<span>Prüfungen</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'notes' || $route.name === 'note'} href="#/notes" aria-current={$route.name === 'notes' || $route.name === 'note' ? 'page' : undefined}>
      <Icon name="notes" />
      {#if !collapsed}<span>Notizen</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'calendar'} href="#/calendar" aria-current={$route.name === 'calendar' ? 'page' : undefined}>
      <Icon name="calendar" />
      {#if !collapsed}<span>Kalender</span>{/if}
    </a>
  </nav>

  <div class="foot">
    {#if !collapsed}<p class="group-label">Mehr</p>{/if}
    <a class="nav-link" class:active={$route.name === 'links'} href="#/links" aria-current={$route.name === 'links' ? 'page' : undefined}>
      <Icon name="links" />
      {#if !collapsed}<span>Links</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'focus'} href="#/focus" aria-current={$route.name === 'focus' ? 'page' : undefined}>
      <Icon name="focus" />
      {#if !collapsed}<span>Fokus</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'settings'} href="#/settings" aria-current={$route.name === 'settings' ? 'page' : undefined}>
      <Icon name="settings" />
      {#if !collapsed}<span>Einstellungen</span>{/if}
    </a>
    <button class="nav-link collapse" type="button" on:click={toggleCollapsed} aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}>
      <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} />
      {#if !collapsed}<span>Einklappen</span>{/if}
    </button>
  </div>
</aside>

<style>
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 40;
    display: none;
    flex-direction: column;
    width: var(--sidebar-w);
    padding: var(--space-4) var(--space-3) var(--space-3);
    background: var(--surface);
    border-right: 1px solid var(--rule);
    overflow-y: auto;
    transition: width var(--motion);
  }
  .sidebar.collapsed {
    width: var(--sidebar-w-collapsed);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-4);
    color: var(--ink);
    text-decoration: none;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: var(--text-sm);
    font-weight: 800;
  }
  .nav,
  .foot {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .foot {
    margin-top: auto;
    padding-top: var(--space-4);
  }
  .group-label {
    margin: var(--space-4) var(--space-3) var(--space-1);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .program-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-3) var(--space-3) var(--space-1);
    font-size: var(--text-xs);
    font-weight: 650;
    color: var(--ink-2);
  }
  .program-label .dot {
    background: var(--dot);
  }
  .nav-link {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 38px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-2);
    background: transparent;
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 500;
    text-align: left;
    text-decoration: none;
    width: 100%;
  }
  .nav-link:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .nav-link.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 650;
  }
  .module-link {
    padding-left: var(--space-4);
  }
  .mod-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--dot, var(--accent));
  }
  .module-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }
  .module-code {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-3);
  }
  .module-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nav-count {
    margin-left: auto;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 18px;
  }
  .collapse {
    margin-top: var(--space-2);
    cursor: pointer;
  }
  @media (min-width: 900px) {
    .sidebar {
      display: flex;
    }
  }
</style>
