<script>
  import { route, navigate } from './lib/router.js';
  import Shell from './lib/components/Shell.svelte';
  import Today from './lib/views/Today.svelte';
  import Homework from './lib/views/Homework.svelte';
  import Modules from './lib/views/Modules.svelte';
  import ModuleDetail from './lib/views/ModuleDetail.svelte';
  import Notes from './lib/views/Notes.svelte';
  import NoteDetail from './lib/views/NoteDetail.svelte';
  import Exams from './lib/views/Exams.svelte';
  import Calendar from './lib/views/Calendar.svelte';
  import Links from './lib/views/Links.svelte';
  import Focus from './lib/views/Focus.svelte';
  import Settings from './lib/views/Settings.svelte';
  import Tokens from './lib/views/Tokens.svelte';
  import EmptyState from './lib/components/EmptyState.svelte';
</script>

<Shell>
  {#if $route.name === 'today'}
    <Today />
  {:else if $route.name === 'homework'}
    <Homework />
  {:else if $route.name === 'modules'}
    <Modules />
  {:else if $route.name === 'module'}
    <ModuleDetail />
  {:else if $route.name === 'notes'}
    <Notes />
  {:else if $route.name === 'note'}
    <NoteDetail />
  {:else if $route.name === 'exams'}
    <Exams />
  {:else if $route.name === 'calendar'}
    <Calendar />
  {:else if $route.name === 'links'}
    <Links />
  {:else if $route.name === 'focus'}
    <Focus />
  {:else if $route.name === 'settings'}
    <Settings />
  {:else if $route.name === 'tokens'}
    <Tokens />
  {:else}
    <EmptyState
      title="Seite nicht gefunden"
      text="Dieser Ort existiert nicht."
      actionLabel="Zu Heute"
      action={() => navigate('/')}
    />
  {/if}
</Shell>
