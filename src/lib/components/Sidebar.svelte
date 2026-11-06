<script>
  import { appState, openHomework, updateSettings } from '../stores/app.js';
  import { route, navigate, modulePath } from '../router.js';
  import { persistedStore } from '../stores/viewPrefs.js';
  import Icon from './Icon.svelte';

  const modulePrefs = persistedStore('studyhub_sidebar_modules', { collapsed: false });

  let navEl;
  let lastModuleId = null;

  $: modules = $appState.modules || [];
  $: programs = $appState.programs || [];
  $: currentProgramId = $appState.settings.currentProgramId || programs[0]?.id;
  $: collapsed = !!$appState.settings.navCollapsed;
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
</script>

<aside class="sidebar" class:collapsed aria-label="Hauptnavigation">
  <a class="brand" href="#/" aria-label="Study Hub — Heute">
    <span class="brand-mark" aria-hidden="true">S</span>
    {#if !collapsed}<span class="brand-text">Study Hub</span>{/if}
  </a>

  {#if programs.length > 1}
    {#if collapsed}
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

  <nav class="nav-scroll" bind:this={navEl} aria-label="Seiten">
    <a class="nav-link" class:active={$route.name === 'today'} href="#/" aria-current={$route.name === 'today' ? 'page' : undefined}>
      <Icon name="today" />
      {#if !collapsed}<span>Heute</span>{/if}
    </a>

    {#if !collapsed}
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

    {#if !modulesCollapsed || collapsed}
      {#each programModules as mod (mod.id)}
        <a
          class="nav-link module-link"
          class:active={$route.name === 'module' && $route.id === mod.id}
          href="#{modulePath(mod.id)}"
          aria-current={$route.name === 'module' && $route.id === mod.id ? 'page' : undefined}
          title={collapsed ? moduleTitle(mod) : undefined}
        >
          {#if collapsed}
            <span class="rail-code">{mod.code || mod.title?.slice(0, 2)}</span>
          {:else}
            <span class="mod-dot" style:--dot={mod.accent} aria-hidden="true"></span>
            {#if mod.code}<span class="module-code">{mod.code}</span>{/if}
            <span class="module-title">{mod.title}</span>
          {/if}
        </a>
      {/each}

      {#if programModules.length === 0}
        <a class="nav-link module-empty" href="#/modules" title={collapsed ? 'Modul erstellen' : undefined}>
          <Icon name="plus" size={16} />
          {#if !collapsed}<span>Modul erstellen</span>{/if}
        </a>
      {:else if !collapsed}
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

    {#if !collapsed}<p class="group-label">Arbeit</p>{/if}
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
    <a class="nav-link" class:active={$route.name === 'links'} href="#/links" aria-current={$route.name === 'links' ? 'page' : undefined} title={collapsed ? 'Links' : undefined}>
      <Icon name="links" />
      {#if !collapsed}<span>Links</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'focus'} href="#/focus" aria-current={$route.name === 'focus' ? 'page' : undefined} title={collapsed ? 'Fokus' : undefined}>
      <Icon name="focus" />
      {#if !collapsed}<span>Fokus</span>{/if}
    </a>
    <a class="nav-link" class:active={$route.name === 'settings'} href="#/settings" aria-current={$route.name === 'settings' ? 'page' : undefined} title={collapsed ? 'Einstellungen' : undefined}>
      <Icon name="settings" />
      {#if !collapsed}<span>Einstellungen</span>{/if}
    </a>
    <button class="nav-link collapse" type="button" on:click={toggleCollapsed} aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'} title={collapsed ? 'Sidebar ausklappen' : undefined}>
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
    height: 100dvh;
    padding: 14px 10px 12px;
    overflow: hidden;
    background: var(--surface);
    border-right: 1px solid var(--rule);
    transition: width var(--motion);
  }
  .sidebar.collapsed {
    width: var(--sidebar-w-collapsed);
    padding-right: 8px;
    padding-left: 8px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 6px 10px;
    margin-bottom: 12px;
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
    scrollbar-width: thin;
    scrollbar-gutter: stable;
  }
  .nav-scroll::-webkit-scrollbar {
    width: 8px;
  }
  .nav-scroll::-webkit-scrollbar-thumb {
    border: 2px solid var(--surface);
    border-radius: 999px;
    background: var(--rule-strong);
  }
  .nav-link {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-2);
    font-size: 13px;
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
    margin: 12px 10px 4px;
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink-3);
  }
  .module-head {
    display: flex;
    align-items: center;
    margin: 12px 0 3px;
  }
  .module-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-3);
    font-size: 11px;
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
    font-size: 10px;
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
    font-size: 10px;
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
    font-size: 12px;
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
    font-size: 0.5625rem;
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
    margin-top: 4px;
    color: var(--ink-3);
  }
  .collapse:hover {
    color: var(--ink);
  }
  .sidebar.collapsed .brand {
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
      display: flex;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }
  }
</style>
