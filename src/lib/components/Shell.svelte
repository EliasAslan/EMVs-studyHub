<script>
  import { onMount } from 'svelte';
  import { initRouter, route, navigate } from '../router.js';
  import { appState, applyTheme, flush } from '../stores/app.js';
  import { initPomodoro } from '../services/pomodoroEngine.js';
  import Sidebar from './Sidebar.svelte';
  import TabBar from './TabBar.svelte';
  import Palette from './Palette.svelte';
  import QuickCapture from './QuickCapture.svelte';
  import Modal from './Modal.svelte';
  import Toast from './Toast.svelte';
  import Icon from './Icon.svelte';
  import { toast } from '../stores/toast.js';
  import { paletteOpen, openPalette, togglePalette, closePalette, rememberRoute } from '../stores/ui.js';
  import { downloadBackup } from '../services/backup.js';

  let captureOpen = false;
  let captureMode = 'note';
  let captureMenuOpen = false;
  let fabMenu;
  let fabButton;
  let switcherOpen = false;
  let helpOpen = false;
  let drawerOpen = false;
  let menuButton = null;
  let pendingG = false;
  let pendingTimer = null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

  export function openCapture(mode = 'note') {
    captureMenuOpen = false;
    captureMode = mode;
    captureOpen = true;
  }

  function toggleCaptureMenu() {
    captureMenuOpen = !captureMenuOpen;
  }

  function closeCaptureMenu() {
    captureMenuOpen = false;
    fabButton?.focus();
  }

  $: if (captureMenuOpen) {
    queueMicrotask(() => fabMenu?.querySelector('.fab-item')?.focus());
  }

  function trapMenuFocus(event) {
    const items = [...(fabMenu?.querySelectorAll('.fab-item') || [])].filter(
      (el) => el.getClientRects().length > 0,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !fabMenu.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openDrawer() {
    if (drawerOpen) return;
    drawerOpen = true;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      document.querySelector('#app-sidebar .collapse')?.focus();
    });
  }

  function closeDrawer({ restoreFocus = false } = {}) {
    if (!drawerOpen) return;
    drawerOpen = false;
    document.body.style.overflow = '';
    if (restoreFocus) menuButton?.focus();
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer({ restoreFocus: true });
    else openDrawer();
  }

  // Keep Tab inside the open drawer until it is closed.
  function trapDrawerFocus(event) {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;
    const focusables = [...sidebar.querySelectorAll('a[href], button:not([disabled])')].filter(
      (el) => el.getClientRects().length > 0
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (!sidebar.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    const stopRouter = initRouter();
    applyTheme($appState.settings.theme);
    initPomodoro();

    // The drawer is a mobile-only surface: close it when the hash changes or
    // when the viewport grows past the drawer breakpoint.
    const stopRoute = route.subscribe((next) => {
      rememberRoute(next);
      closeDrawer();
    });
    const desktop = window.matchMedia('(min-width: 900px)');
    const onDesktop = (event) => {
      if (event.matches) closeDrawer();
    };
    desktop.addEventListener('change', onDesktop);

    // Cloud code (and the Supabase client) is a separate chunk. Start it
    // quietly after the first paint so the app stays usable immediately.
    const startCloud = () => import('../stores/cloud.js').then((m) => m.initCloud()).catch(() => {});
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(startCloud, { timeout: 3000 });
    } else {
      setTimeout(startCloud, 1500);
    }

    const onKey = (event) => {
      const target = event.target;
      const editable =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePalette();
        return;
      }

      // Obsidian-style quick note switcher.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        switcherOpen = !switcherOpen;
        return;
      }

      // Esc always leaves fullscreen, even if a drawer or dialog is open.
      if (event.key === 'Escape' && document.fullscreenElement) {
        event.preventDefault();
        document.exitFullscreen?.().catch(() => {});
        return;
      }

      if (event.key === 'Escape' && captureMenuOpen) {
        event.preventDefault();
        closeCaptureMenu();
        return;
      }

      if (captureMenuOpen && event.key === 'Tab') {
        trapMenuFocus(event);
        return;
      }

      if (event.key === 'Escape' && drawerOpen) {
        event.preventDefault();
        closeDrawer({ restoreFocus: true });
        return;
      }

      if (drawerOpen && event.key === 'Tab') {
        trapDrawerFocus(event);
        return;
      }

      if (editable) return;
      if ($paletteOpen || switcherOpen || captureOpen || drawerOpen || captureMenuOpen) return;

      if (event.key === '?') {
        event.preventDefault();
        helpOpen = true;
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.key === 'n') {
        event.preventDefault();
        // Inside the notes section, create inline instead of opening capture.
        if ($route.name === 'notes' || $route.name === 'note') navigate('/notes/new');
        else openCapture('note');
        return;
      }
      if (event.key === 'h') {
        event.preventDefault();
        openCapture('homework');
        return;
      }
      if (event.key === 'g') {
        pendingG = true;
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => (pendingG = false), 1200);
        return;
      }
      if (pendingG) {
        const map = { h: '/', a: '/homework', n: '/notes', p: '/exams', k: '/calendar', m: '/modules' };
        if (map[event.key]) {
          event.preventDefault();
          navigate(map[event.key]);
          pendingG = false;
          clearTimeout(pendingTimer);
        }
      }
    };

    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onHelpShortcut = () => {
      helpOpen = true;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('studyhub:shortcuts', onHelpShortcut);

    return () => {
      stopRouter();
      stopRoute();
      desktop.removeEventListener('change', onDesktop);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('studyhub:shortcuts', onHelpShortcut);
      document.body.style.overflow = '';
    };
  });

  function onPaletteCreate(event) {
    openCapture(event.detail);
  }

  async function onPaletteAction(event) {
    if (event.detail === 'export') {
      try {
        await downloadBackup();
        toast('Backup gespeichert');
      } catch (e) {
        toast(e.message || 'Export fehlgeschlagen');
      }
    }
  }
</script>

<a class="skip-link" href="#main">Zum Inhalt springen</a>

<div class="app" class:collapsed={$appState.settings.navCollapsed}>
  <button
    class="scrim"
    class:open={drawerOpen}
    type="button"
    tabindex="-1"
    aria-label="Navigation schliessen"
    on:click={() => closeDrawer({ restoreFocus: true })}
  ></button>
  <div inert={captureMenuOpen}>
    <Sidebar open={drawerOpen} onClose={() => closeDrawer({ restoreFocus: true })} />
  </div>

  <div class="main-wrap" inert={drawerOpen || captureMenuOpen}>
    <header class="mobile-head">
      <button
        class="icon-btn"
        type="button"
        bind:this={menuButton}
        on:click={openDrawer}
        aria-label="Navigation öffnen"
        aria-expanded={drawerOpen}
        aria-controls="app-sidebar"
      >
        <Icon name="menu" />
      </button>
      <a class="mobile-brand" href="#/">
        <span class="brand-mark" aria-hidden="true">S</span>
        <span>Study Hub</span>
      </a>
      <button class="icon-btn" type="button" on:click={openPalette} aria-label="Suchen">
        <Icon name="search" />
      </button>
    </header>

    <main id="main" tabindex="-1">
      <slot />
    </main>
  </div>

  {#if captureMenuOpen}
    <button class="fab-scrim" type="button" tabindex="-1" aria-label="Erfassen schliessen" on:click={closeCaptureMenu}></button>
    <div class="fab-menu" bind:this={fabMenu} role="menu" aria-label="Was möchtest du erfassen?">
      <p class="fab-menu-title">Neu erfassen</p>
      <button class="fab-item" type="button" role="menuitem" on:click={() => openCapture('note')}>
        <Icon name="notes" size={18} /><span>Notiz</span>
      </button>
      <button class="fab-item" type="button" role="menuitem" on:click={() => openCapture('photo')}>
        <Icon name="photo" size={18} /><span>Foto</span>
      </button>
      <button class="fab-item" type="button" role="menuitem" on:click={() => openCapture('homework')}>
        <Icon name="homework" size={18} /><span>Hausaufgabe</span>
      </button>
      <button class="fab-item" type="button" role="menuitem" on:click={() => openCapture('exam')}>
        <Icon name="exams" size={18} /><span>Prüfung</span>
      </button>
      <button class="fab-item" type="button" role="menuitem" on:click={() => openCapture('module')}>
        <Icon name="modules" size={18} /><span>Modul</span>
      </button>
      <button class="fab-item" type="button" role="menuitem" on:click={() => openCapture('link')}>
        <Icon name="links" size={18} /><span>Link</span>
      </button>
    </div>
  {/if}

  <button
    class="fab"
    type="button"
    bind:this={fabButton}
    on:click={toggleCaptureMenu}
    aria-label={captureMenuOpen ? 'Erfassen schliessen' : 'Erfassen'}
    aria-haspopup="menu"
    aria-expanded={captureMenuOpen}
  >
    <Icon name={captureMenuOpen ? 'x' : 'plus'} size={22} />
  </button>

  <div inert={drawerOpen || captureMenuOpen}>
    <TabBar onMore={toggleDrawer} expanded={drawerOpen} />
  </div>
</div>

<Palette open={$paletteOpen} on:close={closePalette} on:create={onPaletteCreate} on:action={onPaletteAction} />
<Palette open={switcherOpen} mode="notes" on:close={() => (switcherOpen = false)} />
<QuickCapture open={captureOpen} initialMode={captureMode} on:close={() => (captureOpen = false)} />

<Modal open={helpOpen} title="Tastaturkürzel" on:close={() => (helpOpen = false)}>
  <div class="shortcut-list">
    <div class="shortcut-row"><span><kbd>/</kbd> oder <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd></span><span>Suche öffnen</span></div>
    <div class="shortcut-row"><span><kbd>{isMac ? '⌘O' : 'Ctrl O'}</kbd></span><span>Notiz öffnen</span></div>
    <div class="shortcut-row"><span><kbd>N</kbd></span><span>Neue Notiz</span></div>
    <div class="shortcut-row"><span><kbd>H</kbd></span><span>Neue Hausaufgabe</span></div>
    <div class="shortcut-row"><span><kbd>G</kbd> dann <kbd>H</kbd></span><span>Zu Hausaufgaben</span></div>
    <div class="shortcut-row"><span><kbd>G</kbd> dann <kbd>N</kbd></span><span>Zu Notizen</span></div>
    <div class="shortcut-row"><span><kbd>G</kbd> dann <kbd>P</kbd></span><span>Zu Prüfungen</span></div>
    <div class="shortcut-row"><span><kbd>G</kbd> dann <kbd>K</kbd></span><span>Zu Kalender</span></div>
    <div class="shortcut-row"><span><kbd>G</kbd> dann <kbd>M</kbd></span><span>Zu Modulen</span></div>
    <div class="shortcut-row"><span><kbd>?</kbd></span><span>Diese Hilfe</span></div>
    <div class="shortcut-row"><span><kbd>Esc</kbd></span><span>Schliessen</span></div>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-primary" type="button" on:click={() => (helpOpen = false)}>Schliessen</button>
  </svelte:fragment>
</Modal>

<Toast />

<style>
  .app {
    min-height: 100vh;
  }
  .main-wrap {
    padding-bottom: calc(var(--tabbar-h) + 24px + env(safe-area-inset-bottom, 0px));
  }
  main {
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: var(--space-4);
  }
  main:focus {
    outline: none;
  }
  .mobile-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--rule);
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 30;
  }
  .mobile-brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    color: var(--ink);
    text-decoration: none;
    font-weight: 700;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: var(--overlay);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--motion),
      visibility var(--motion);
  }
  .scrim.open {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: var(--text-xs);
    font-weight: 800;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-2);
  }
  .fab {
    position: fixed;
    right: var(--space-4);
    bottom: calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom, 0px));
    z-index: 60;
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: var(--shadow-2);
  }
  .fab:active {
    transform: scale(0.97);
  }
  .fab-scrim {
    position: fixed;
    inset: 0;
    z-index: 55;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: var(--overlay);
    backdrop-filter: blur(2px);
  }
  .fab-menu {
    position: fixed;
    right: var(--space-4);
    bottom: calc(var(--tabbar-h) + 82px + env(safe-area-inset-bottom, 0px));
    z-index: 65;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: min(240px, calc(100vw - 32px));
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--surface);
    box-shadow: var(--shadow-3);
  }
  .fab-menu-title {
    padding: var(--space-1) var(--space-3) var(--space-2);
    color: var(--ink-3);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .fab-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 42px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-2);
    background: transparent;
    color: var(--ink);
    font-size: var(--text-sm);
    text-align: left;
  }
  .fab-item:hover {
    background: var(--surface-2);
  }
  .fab-item :global(svg) {
    color: var(--ink-3);
  }
  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .shortcut-row kbd {
    padding: 1px 5px;
    border: 1px solid var(--rule-strong);
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  @media (min-width: 900px) {
    .scrim {
      display: none;
    }
    .main-wrap {
      margin-left: var(--sidebar-w);
      padding-bottom: var(--space-6);
      transition: margin-left var(--motion);
    }
    .app.collapsed .main-wrap {
      margin-left: var(--sidebar-w-collapsed);
    }
    .mobile-head {
      display: none;
    }
    main {
      padding: var(--space-6) var(--space-6) var(--space-8);
    }
    .fab {
      bottom: var(--space-6);
      right: var(--space-6);
    }
    .fab-menu {
      bottom: calc(var(--space-6) + 66px);
      right: var(--space-6);
    }
  }
</style>
