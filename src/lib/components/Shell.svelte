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
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import { toast } from '../stores/toast.js';
  import { paletteOpen, openPalette, togglePalette, closePalette } from '../stores/ui.js';
  import { initCloud } from '../stores/cloud.js';
  import { downloadBackup } from '../services/backup.js';

  let captureOpen = false;
  let captureMode = 'note';
  let moreOpen = false;
  let pendingG = false;
  let pendingTimer = null;

  export function openCapture(mode = 'note') {
    captureMode = mode;
    captureOpen = true;
  }

  onMount(() => {
    const stopRouter = initRouter();
    applyTheme($appState.settings.theme);
    initPomodoro();
    initCloud().catch(() => {});

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

      if (editable) return;
      if ($paletteOpen || captureOpen || moreOpen) return;

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
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });

    return () => {
      stopRouter();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
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
  <Sidebar />

  <div class="main-wrap">
    <header class="mobile-head">
      <a class="mobile-brand" href="#/" aria-label="Study Hub — Heute">
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

  <TabBar onMore={() => (moreOpen = true)} />
</div>

<Palette open={$paletteOpen} on:close={closePalette} on:create={onPaletteCreate} on:action={onPaletteAction} />
<QuickCapture open={captureOpen} initialMode={captureMode} on:close={() => (captureOpen = false)} />

<Modal open={moreOpen} title="Mehr" on:close={() => (moreOpen = false)}>
  <nav class="more-nav" aria-label="Mehr">
    <a class="more-link" href="#/exams" on:click={() => (moreOpen = false)}><Icon name="exams" /> Prüfungen</a>
    <a class="more-link" href="#/modules" on:click={() => (moreOpen = false)}><Icon name="modules" /> Module</a>
    <a class="more-link" href="#/calendar" on:click={() => (moreOpen = false)}><Icon name="calendar" /> Kalender</a>
    <a class="more-link" href="#/links" on:click={() => (moreOpen = false)}><Icon name="links" /> Links</a>
    <a class="more-link" href="#/focus" on:click={() => (moreOpen = false)}><Icon name="focus" /> Fokus</a>
    <a class="more-link" href="#/settings" on:click={() => (moreOpen = false)}><Icon name="settings" /> Einstellungen</a>
  </nav>
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
    justify-content: space-between;
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
    color: var(--ink);
    text-decoration: none;
    font-weight: 700;
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
  .more-nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .more-link {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 48px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2);
    color: var(--ink);
    text-decoration: none;
    font-weight: 550;
  }
  .more-link:hover {
    background: var(--surface-2);
  }
  @media (min-width: 900px) {
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
