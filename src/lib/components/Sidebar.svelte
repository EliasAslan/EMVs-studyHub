<script>
  import { onMount } from 'svelte';
  import { appState, openHomework, updateSettings } from '../stores/app.js';
  import { aiReady } from '../stores/ai.js';
  import { route, navigate, modulePath } from '../router.js';
  import { persistedStore } from '../stores/viewPrefs.js';
  import Icon from './Icon.svelte';

  /** Drawer visibility on small screens. Ignored on desktop. */
  export let open = false;
  /** Called when a drawer link is used or the close button is pressed. */
  export let onClose = null;

  const modulePrefs = persistedStore('studyhub_sidebar_modules', { collapsed: false });

  let navEl;
  let lastModuleId = null;
  let isDesktop = typeof window === 'undefined' ? true : window.matchMedia('(min-width: 900px)').matches;

  onMount(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    isDesktop = mq.matches;
    const onChange = (event) => (isDesktop = event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  $: modules = $appState.modules || [];
  $: programs = $appState.programs || [];
  $: currentProgramId = $appState.settings.currentProgramId || programs[0]?.id;
  $: collapsed = !!$appState.settings.navCollapsed;
  // The rail only exists on desktop; the mobile drawer always shows full labels.
  $: compact = collapsed && isDesktop;
  $: modulesCollapsed = !!$modulePrefs.collapsed;
  $: openCount = $openHomework.length;
  $: currentProgram = programs.find((p) => p.id === currentProgramId) || programs[0] || null;
  $: programModules = modules
    .filter((m) => m.programId === currentProgramId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  $: activeModuleId = $route.name === 'module' ? $route.id : null;

  // Opening a module from search/Today should bring its program into view.
  $: if (activeModuleId && activeModuleId !== lastModuleId) {
    lastModuleId = activeModuleId;
    const active = modules.find((m) => m.id === activeModuleId);
    if (active && active.programId && active.programId !== currentProgramId) {
      updateSettings({ currentProgramId: active.programId });
    }
  }

  // Keep the active row visible when the nav list scrolls.
  $: if ($route.path && navEl) {
    queueMicrotask(revealActive);
  }

  function revealActive() {
    const active = navEl?.querySelector('.nav-link.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function toggleCollapsed() {
    updateSettings({ navCollapsed: !collapsed });
    // When collapsing the sidebar on desktop, also collapse the module list.
    if (isDesktop) {
      modulePrefs.update((prefs) => ({ ...prefs, collapsed: !prefs.collapsed }));
    }
  }

  function toggleModules() {
    modulePrefs.update((prefs) => ({ ...prefs, collapsed: !prefs.collapsed }));
  }

  function selectProgram(programId) {
    updateSettings({ currentProgramId: programId });
    if ($route.name === 'module') navigate('/modules');
  }

  function cycleProgram() {
    if (programs.length < 2) return;
    const index = programs.findIndex((p) => p.id === currentProgramId);
    const next = programs[(index + 1) % programs.length];
    updateSettings({ currentProgramId: next.id });
  }

  function moduleTitle(mod) {
    return [mod.code, mod.title].filter(Boolean).join(' ');
  }

  // Close the mobile drawer after a navigation link, including links to the
  // page that is already open (no hashchange fires in that case).
  function closeDrawerOnNavigation(node) {
    const handler = (event) => {
      if (isDesktop) return;
      if (event.target instanceof Element && event.target.closest('a')) onClose?.();
    };
    node.addEventListener('click', handler);
    return {
      destroy() {
        node.removeEventListener('click', handler);
      },
    };
  }
</script>

<aside class="sidebar" class:collapsed={compact} class:open aria-label="Hauptnavigation" id="app-sidebar">
  <div class="brand-row">
    <a class="brand" href="#/" aria-label={compact ? 'Study Hub' : undefined} on:click={() => !isDesktop && onClose?.()}>
      <span class="brand-mark" aria-hidden="true">S</span>
      {#if !compact}<span class="brand-text">Study Hub</span>{/if}
    </a>
    {#if isDesktop && !compact}
      <button
        class="collapse"
        type="button"
        on:click={toggleCollapsed}
        aria-label="Sidebar einklappen"
        title="Einklappen"
      >
        <Icon name="chevronLeft" size={18} />
      </button>
    {:else if !isDesktop}
      <button
        class="collapse"
        type="button"
        on:click={() => onClose?.()}
        aria-label="Navigation schliessen"
        title="Schliessen"
      >
        <Icon name="x" size={18} />
      </button>
    {/if}
  </div>

  {#if compact}
    <button
      class="collapse rail-toggle"
      type="button"
      on:click={toggleCollapsed}
      aria-label="Sidebar ausklappen"
      title="Ausklappen"
    >
      <Icon name="chevronRight" size={18} />
    </button>
  {/if}

  {#if programs.length > 1}
    {#if compact}
      <button
        class="program-rail"
        type="button"
        on:click={cycleProgram}
        title={`Programm: ${currentProgram?.name || '—'} — wechseln`}
        aria-label={`Programm wechseln, aktuell ${currentProgram?.name || '—'}`}
      >
        <span class="rail-code">{currentProgram?.code || currentProgram?.name?.slice(0, 2)}</span>
      </button>
    {:else}
      <div class="program-switch" role="group" aria-label="Programm wählen">
        {#each programs as program (program.id)}
          <button
            class="program-option"
            class:active={program.id === currentProgramId}
            type="button"
            aria-pressed={program.id === currentProgramId}
            on:click={() => selectProgram(program.id)}
          >
            <span class="dot" style:--dot={program.accent} aria-hidden="true"></span>
            <span>{program.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}

  <nav class="nav-scroll" bind:this={navEl} aria-label="Seiten" use:closeDrawerOnNavigation>
    <a class="nav-link" class:active={$route.name === 'today'} href="#/" aria-current={$route.name === 'today' ? 'page' : undefined}>
      <Icon name="today" />
      {#if !compact}<span>Heute</span>{/if}
    </a>

    {#if !compact}
      <div class="module-head">
        <button
          class="module-toggle"
          type="button"
          aria-expanded={!modulesCollapsed}
          on:click={toggleModules}
        >
          <span>Module</span>
          <span class="module-count">{programModules.length}</span>
          <Icon name={modulesCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
        </button>
      </div>
    {/if}

    {#if !modulesCollapsed || compact}
      {#each programModules as mod (mod.id)}
        <a
          class="nav-link module-link"
          class:active={$route.name === 'module' && $route.id === mod.id}
          href="#{modulePath(mod.id)}"
          aria-current={$route.name === 'module' && $route.id === mod.id ? 'page' : undefined}
          title={compact ? moduleTitle(mod) : undefined}
        >
          {#if compact}
            <span class="rail-code">{mod.code || mod.title?.slice(0, 2)}</span>
          {:else}
            <span class="mod-dot" style:--dot={mod.accent} aria-hidden="true"></span>
            {#if mod.code}<span class="module-code">{mod.code}</span>{/if}
            <span class="module-title">{mod.title}</span>
          {/if}
        </a>
      {/each}

      {#if programModules.length === 0}
        <a class="nav-link module-empty" href="#/modules" title={compact ? 'Modul erstellen' : undefined}>
          <Icon name="plus" size={16} />
          {#if !compact}<span>Modul erstellen</span>{/if}
        </a>
      {:else if !compact}
        <a class="nav-link all-modules" href="#/modules">
          <span class="all-label">Alle Module</span>
          <Icon name="chevronRight" size={14} />
        </a>
      {:else}
        <a class="nav-link module-link rail-all" href="#/modules" title="Alle Module" aria-label="Alle Module">
          <Icon name="modules" size={16} />
        </a>
      {/if}
    {/if}

    {#if !compact}<p class="group-label">Arbeit</p>{/if}
    <a class="nav-link" class:active={$route.name === 'homework'} href="#/homework" aria-current={$route.name === 'homework' ? 'page' : undefined}>
      <Icon name="homework" />
      {#if !compact}<span>Hausaufgaben</span>{/if}
      {#if openCount > 0}<span class="nav-count" aria-label={`${openCount} offen`}>{openCount}</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'exams'} href="#/exams" aria-current={$route.name === 'exams' ? 'page' : undefined}>
      <Icon name="exams" />
      {#if !compact}<span>Prüfungen</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'notes' || $route.name === 'note'} href="#/notes" aria-current={$route.name === 'notes' || $route.name === 'note' ? 'page' : undefined}>
      <Icon name="notes" />
      {#if !compact}<span>Notizen</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'calendar'} href="#/calendar" aria-current={$route.name === 'calendar' ? 'page' : undefined}>
      <Icon name="calendar" />
      {#if !compact}<span>Kalender</span>{/if}
    </a>
    {#if $aiReady}
      <a class="nav-link" class:active={$route.name === 'assistant'} href="#/assistant" aria-current={$route.name === 'assistant' ? 'page' : undefined} title={compact ? 'Assistent' : undefined}>
        <Icon name="sparkle" />
        {#if !compact}<span>Assistent</span>{/if}
      </a>
    {/if}
  </nav>

  <div class="foot" use:closeDrawerOnNavigation>
    <button
      class="nav-link help-btn"
      type="button"
      on:click={() => window.dispatchEvent(new CustomEvent('studyhub:shortcuts'))}
    >
      <Icon name="help" />
      {#if !compact}<span>Tastaturkürzel</span>{/if}
    </button>
    <a class="nav-link" class:active={$route.name === 'links'} href="#/links" aria-current={$route.name === 'links' ? 'page' : undefined} title={compact ? 'Links' : undefined}>
      <Icon name="links" />
      {#if !compact}<span>Links</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'focus'} href="#/focus" aria-current={$route.name === 'focus' ? 'page' : undefined} title={compact ? 'Fokus' : undefined}>
      <Icon name="focus" />
      {#if !compact}<span>Fokus</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'settings'} href="#/settings" aria-current={$route.name === 'settings' ? 'page' : undefined} title={compact ? 'Einstellungen' : undefined}>
      <Icon name="settings" />
      {#if !compact}<span>Einstellungen</span>{/if}
    </a>
  </div>
</aside>

<style>
  .help-btn {
    border: 0;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
    width: 100%;
  }
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    width: min(var(--sidebar-w), 86vw);
    height: 100dvh;
    padding: 14px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    overflow: hidden;
    background: var(--surface);
    border-right: 1px solid var(--rule);
    box-shadow: var(--shadow-3);
    transform: translateX(-100%);
    visibility: hidden;
    transition:
      transform var(--motion),
      width var(--motion),
      visibility 0s linear var(--motion);
  }
  .sidebar.open {
    transform: translateX(0);
    visibility: visible;
    transition:
      transform var(--motion),
      width var(--motion),
      visibility 0s;
  }
  .sidebar.collapsed {
    width: var(--sidebar-w-collapsed);
    padding-right: 8px;
    padding-left: 8px;
  }
  .brand-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
    margin-bottom: 12px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    border-radius: var(--radius-2);
    color: var(--ink);
    text-decoration: none;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .brand:hover {
    background: var(--surface-2);
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
  .program-switch {
    display: flex;
    flex: none;
    gap: 2px;
    margin: 0 2px 10px;
    padding: 3px;
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .program-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1;
    min-height: 28px;
    padding: 0 6px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--ink-2);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .program-option .dot {
    width: 6px;
    height: 6px;
    background: var(--dot);
  }
  .program-option.active {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }
  .program-rail {
    display: grid;
    place-items: center;
    flex: none;
    width: 38px;
    height: 38px;
    margin: 0 auto 10px;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
  }
  .program-rail:hover {
    background: var(--surface-2);
  }
  .nav-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-height: 0;
    margin: 0 -2px;
    padding: 0 2px 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .nav-scroll::-webkit-scrollbar {
    display: none;
  }
  .nav-link {
    position: relative;
    display: flex;
    align-items: center;
    gap: 11px;
    flex: none;
    width: 100%;
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-2);
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.2;
    text-align: left;
    text-decoration: none;
  }
  .nav-link:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .nav-link.active {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }
  .nav-link.active :global(svg) {
    color: var(--accent-strong);
  }
  .nav-link.active .mod-dot {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--dot) 18%, transparent);
  }
  .group-label {
    margin: 14px 10px 5px;
    font-size: 0.71875rem;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink-3);
  }
  .module-head {
    display: flex;
    align-items: center;
    margin: 14px 0 3px;
  }
  .module-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-3);
    font-size: 12px;
    font-weight: 600;
    text-align: left;
  }
  .module-toggle:hover {
    background: var(--surface-2);
    color: var(--ink-2);
  }
  .module-count {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .module-link {
    gap: 9px;
  }
  .mod-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--dot, var(--accent));
  }
  .module-code {
    flex: none;
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: 0.02em;
    color: var(--ink-3);
  }
  .module-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .all-modules {
    gap: 6px;
    color: var(--ink-3);
    font-size: 12.5px;
  }
  .all-modules .all-label {
    flex: 1;
  }
  .module-empty {
    color: var(--ink-3);
  }
  .rail-all {
    justify-content: center;
    gap: 0;
    color: var(--ink-3);
  }
  .rail-code {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--ink-2);
  }
  .nav-count {
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    margin-left: auto;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1;
  }
  .nav-link.active .nav-count {
    background: var(--surface);
    color: var(--accent-strong);
  }
  .foot {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 1px;
    padding-top: 8px;
    border-top: 1px solid var(--rule);
  }
  .collapse {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-3);
  }
  .collapse:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .rail-toggle {
    width: 100%;
    height: 34px;
    margin-bottom: 10px;
  }
  .sidebar.collapsed .brand-row {
    justify-content: center;
    margin-bottom: 6px;
  }
  .sidebar.collapsed .brand {
    flex: none;
    justify-content: center;
    padding: 6px 0;
  }
  .sidebar.collapsed .nav-link {
    justify-content: center;
    gap: 0;
    padding: 0;
  }
  .sidebar.collapsed .nav-link.active .rail-code {
    color: var(--accent-strong);
  }
  .sidebar.collapsed .nav-count {
    position: absolute;
    top: 5px;
    right: 7px;
    width: 6px;
    min-width: 6px;
    height: 6px;
    padding: 0;
    font-size: 0;
    background: var(--accent);
  }
  @media (min-width: 900px) {
    .sidebar {
      z-index: 40;
      width: var(--sidebar-w);
      padding-bottom: 12px;
      box-shadow: none;
      transform: none;
      visibility: visible;
    }
    .sidebar.collapsed {
      width: var(--sidebar-w-collapsed);
    }
  }
  @media (max-width: 899px) {
    .rail-toggle {
      display: none;
    }
  }
  @media (pointer: coarse) {
    .nav-link {
      min-height: 44px;
    }
    .collapse {
      min-width: 44px;
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }
  }
</style>
