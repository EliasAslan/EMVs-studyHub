<script>
  import { route, navigate } from './lib/router.js';
  import Shell from './lib/components/Shell.svelte';
  import EmptyState from './lib/components/EmptyState.svelte';

  // One chunk per route keeps the first load small; the browser caches each
  // chunk after its first visit.
  const loaders = {
    today: () => import('./lib/views/Today.svelte'),
    homework: () => import('./lib/views/Homework.svelte'),
    modules: () => import('./lib/views/Modules.svelte'),
    module: () => import('./lib/views/ModuleDetail.svelte'),
    // Both routes share the split view; the view itself handles list vs. detail.
    notes: () => import('./lib/views/Notes.svelte'),
    note: () => import('./lib/views/Notes.svelte'),
    exams: () => import('./lib/views/Exams.svelte'),
    calendar: () => import('./lib/views/Calendar.svelte'),
    links: () => import('./lib/views/Links.svelte'),
    focus: () => import('./lib/views/Focus.svelte'),
    settings: () => import('./lib/views/Settings.svelte'),
    assistant: () => import('./lib/views/Assistant.svelte'),
    // Temporary token gallery: development only, never shipped to production.
    ...(import.meta.env.DEV ? { tokens: () => import('./lib/views/Tokens.svelte') } : {}),
  };

  let currentKey = null;
  let viewPromise = null;

  $: key = $route.name;
  $: if (key === 'tokens' && !import.meta.env.DEV) {
    viewPromise = null;
    navigate('/');
  } else if (key !== currentKey) {
    currentKey = key;
    viewPromise = loaders[key] ? loaders[key]() : null;
  }
</script>

<Shell>
  {#if viewPromise}
    {#await viewPromise}
      <div class="route-loading" aria-busy="true" aria-label="Ansicht wird geladen"></div>
    {:then module}
      <svelte:component this={module.default} />
    {:catch}
      <EmptyState
        title="Ansicht nicht geladen"
        text="Bitte lade die Seite neu."
        actionLabel="Zu Heute"
        action={() => navigate('/')}
      />
    {/await}
  {:else}
    <EmptyState
      title="Seite nicht gefunden"
      text="Dieser Ort existiert nicht."
      actionLabel="Zu Heute"
      action={() => navigate('/')}
    />
  {/if}
</Shell>

<style>
  .route-loading {
    min-height: 40vh;
  }
</style>
