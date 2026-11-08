<script>
  import { onMount } from 'svelte';
  import { initRouter, route, navigate } from '../router.js';
  import { appState, applyTheme, flush } from '../stores/app.js';
  import { initPomodoro } from '../services/pomodoroEngine.js';
  import Sidebar from './Sidebar.svelte';
  import TabBar from './TabBar.svelte';
  import Palette from './Palette.svelte';
  import QuickCapture from './QuickCapture.svelte';
  import Toast from './Toast.svelte';
  import Icon from './Icon.svelte';
  import { toast } from '../stores/toast.js';
  import { paletteOpen, openPalette, togglePalette, closePalette, rememberRoute } from '../stores/ui.js';
  import { downloadBackup } from '../services/backup.js';

  let captureOpen = false;
  let captureMode = 'note';
  let drawerOpen = false;
  let menuButton = null;
  let pendingG = false;
  let pendingTimer = null;

  export function openCapture(mode = 'note') {
    captureMode = mode;
    captureOpen = true;
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

      // Esc always leaves fullscreen, even if a drawer or dialog is open.
      if (event.key === 'Escape' && document.fullscreenElement) {
        event.preventDefault();
        document.exitFullscreen?.().catch(() => {});
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
      if ($paletteOpen || captureOpen || drawerOpen) return;

      if (event.key === '/') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.key === 'n') {
        event.preventDefault();
        openCapture('note');
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
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopRouter();
      stopRoute();
      desktop.removeEventListener('change', onDesktop);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
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
    aria-label="Navigation schließen"
    on:click={() => closeDrawer({ restoreFocus: true })}
  ></button>
  <Sidebar open={drawerOpen} onClose={() => closeDrawer({ restoreFocus: true })} />

  <div class="main-wrap">
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

  <button class="fab" type="button" on:click={() => openCapture('note')} aria-label="Erfassen">
    <Icon name="plus" size={22} />
  </button>

  <TabBar onMore={toggleDrawer} expanded={drawerOpen} />
</div>

<Palette open={$paletteOpen} on:close={closePalette} on:create={onPaletteCreate} on:action={onPaletteAction} />
<QuickCapture open={captureOpen} initialMode={captureMode} on:close={() => (captureOpen = false)} />

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
    background: rgb(15 23 42 / 38%);
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
  }
</style>
