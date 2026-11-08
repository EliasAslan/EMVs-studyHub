<script>
  import {
    appState,
    openHomework,
    doneHomework,
    createHomework,
    updateHomework,
    toggleHomework,
    deleteHomework,
    restoreEntity,
  } from '../stores/app.js';
  import { todayKey } from '../data/dates.js';
  import {
    RECURRENCE_OPTIONS,
    recurrenceFromValue,
    recurrenceValue,
  } from '../data/recurrence.js';
  import { persistedStore } from '../stores/viewPrefs.js';
  import { toast } from '../stores/toast.js';
  import HomeworkRow from '../components/HomeworkRow.svelte';
  import Modal from '../components/Modal.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import AiButton from '../components/AiButton.svelte';

  const filters = persistedStore('studyhub_homework_filters', {
    programId: 'all',
    moduleId: 'all',
    showDone: false,
  });

  let title = '';
  let dueDate = todayKey();
  let moduleId = '';
  let recurrence = 'none';
  let editing = null;
  let editTitle = '';
  let editDue = '';
  let editModule = '';
  let editRecurrence = 'none';
  let editDone = false;

  $: modules = $appState.modules || [];
  $: programs = $appState.programs || [];
  $: visibleModules = modules.filter(
    (m) => $filters.programId === 'all' || m.programId === $filters.programId,
  );
  $: moduleFilterId = $filters.moduleId;
  $: matchesFilter = (hw) =>
    (moduleFilterId === 'all' || hw.moduleId === moduleFilterId) &&
    ($filters.programId === 'all' || visibleModules.some((m) => m.id === hw.moduleId));
  $: open = $openHomework.filter(matchesFilter);
  $: done = $doneHomework.filter(matchesFilter);

  function setFilter(patch) {
    filters.update((f) => ({ ...f, ...patch }));
  }

  function add() {
    if (!title.trim()) return;
    createHomework({
      title,
      dueDate: dueDate || todayKey(),
      moduleId: moduleId || null,
      recurrence: recurrenceFromValue(recurrence),
    });
    title = '';
    dueDate = todayKey();
    recurrence = 'none';
    toast('Hausaufgabe erfasst');
  }

  function toggle(hw) {
    toggleHomework(hw.id);
  }

  function startEdit(hw) {
    editing = hw;
    editTitle = hw.title;
    editDue = hw.dueDate || '';
    editModule = hw.moduleId || '';
    editRecurrence = recurrenceValue(hw.recurrence);
    editDone = !!hw.done;
  }

  function saveEdit() {
    if (!editing) return;
    updateHomework(editing.id, {
      title: editTitle.trim() || editing.title,
      dueDate: editDue || null,
      moduleId: editModule || null,
      recurrence: recurrenceFromValue(editRecurrence, editing.recurrence?.seriesId || editing.id),
      done: editDone,
    });
    editing = null;
    toast('Gespeichert');
  }

  function remove(hw) {
    const snapshot = { ...hw };
    deleteHomework(hw.id);
    toast('Hausaufgabe gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => {
          restoreEntity('homework', snapshot);
          toast('Wiederhergestellt');
        },
      },
    });
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Arbeit</p>
      <h1>Hausaufgaben</h1>
    </div>
    <div class="head-actions">
      <span class="count mono">{open.length} offen</span>
      <AiButton ref="hausaufgaben" prompt="Was ist zuerst dran? Gib mir eine ruhige Reihenfolge." />
    </div>
  </header>

  <form class="add card" on:submit|preventDefault={add}>
    <input class="input title-input" bind:value={title} placeholder="Neue Hausaufgabe" aria-label="Titel der Hausaufgabe" />
    <input class="input date-input" type="date" bind:value={dueDate} aria-label="Fällig am" />
    <select class="select module-input" bind:value={moduleId} aria-label="Modul">
      <option value="">Kein Modul</option>
      {#each modules as m (m.id)}
        <option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>
      {/each}
    </select>
    <select class="select recur-input" bind:value={recurrence} aria-label="Wiederholen">
      {#each RECURRENCE_OPTIONS as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    <button class="btn btn-primary" type="submit" disabled={!title.trim()}>
      <Icon name="plus" size={16} /> Erfassen
    </button>
  </form>

  <div class="filters">
    <select
      class="select"
      value={$filters.programId}
      aria-label="Programm filtern"
      on:change={(e) => setFilter({ programId: e.target.value, moduleId: 'all' })}
    >
      <option value="all">Alle Programme</option>
      {#each programs as p (p.id)}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
    <select
      class="select"
      value={$filters.moduleId}
      aria-label="Modul filtern"
      on:change={(e) => setFilter({ moduleId: e.target.value })}
    >
      <option value="all">Alle Module</option>
      {#each visibleModules as m (m.id)}
        <option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>
      {/each}
    </select>
    <button class="chip" type="button" aria-pressed={$filters.showDone} on:click={() => setFilter({ showDone: !$filters.showDone })}>
      Erledigte {$filters.showDone ? 'ausblenden' : 'anzeigen'}
    </button>
  </div>

  {#if open.length}
    <section class="list card" aria-label="Offene Hausaufgaben">
      {#each open as hw (hw.id)}
        <HomeworkRow {hw} on:toggle={(e) => toggle(e.detail)} on:edit={(e) => startEdit(e.detail)} on:delete={(e) => remove(e.detail)} />
      {/each}
    </section>
  {:else}
    <EmptyState
      title="Nichts offen"
      text="Neue Hausaufgaben erscheinen hier und auf Heute."
      actionLabel="Feld oben nutzen"
      action={() => document.querySelector('.title-input')?.focus()}
    />
  {/if}

  {#if $filters.showDone}
    <section class="done-block" aria-label="Erledigte Hausaufgaben">
      <h2 class="section-label">Erledigt · {done.length}</h2>
      {#if done.length}
        <div class="list card muted-list">
          {#each done as hw (hw.id)}
            <HomeworkRow {hw} on:toggle={(e) => toggle(e.detail)} on:edit={(e) => startEdit(e.detail)} on:delete={(e) => remove(e.detail)} />
          {/each}
        </div>
      {:else}
        <p class="muted small">Noch nichts erledigt.</p>
      {/if}
    </section>
  {/if}
</div>

<Modal open={!!editing} title="Hausaufgabe bearbeiten" on:close={() => (editing = null)}>
  <div class="stack">
    <label class="field">
      <span>Titel</span>
      <input class="input" bind:value={editTitle} data-autofocus />
    </label>
    <label class="field">
      <span>Fällig</span>
      <input class="input" type="date" bind:value={editDue} />
    </label>
    <label class="field">
      <span>Modul</span>
      <select class="select" bind:value={editModule}>
        <option value="">Kein Modul</option>
        {#each modules as m (m.id)}
          <option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span>Wiederholen</span>
      <select class="select" bind:value={editRecurrence}>
        {#each RECURRENCE_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
    <label class="check-row">
      <input type="checkbox" bind:checked={editDone} /> Erledigt
    </label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (editing = null)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={saveEdit}>Speichern</button>
  </svelte:fragment>
</Modal>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 880px;
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .eyebrow {
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    color: var(--ink-2);
  }
  h1 {
    font-size: clamp(1.9rem, 4vw, 2.4rem);
    letter-spacing: -0.03em;
  }
  .count {
    font-size: var(--text-sm);
    color: var(--ink-3);
  }
  .head-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: none;
  }
  .add {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .filters .select {
    width: auto;
    min-width: 150px;
  }
  .list {
    overflow: hidden;
    padding: var(--space-1);
  }
  .muted-list {
    opacity: 0.8;
  }
  .section-label {
    margin-bottom: var(--space-2);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-2);
  }
  .done-block {
    margin-top: var(--space-2);
  }
  .small {
    font-size: var(--text-xs);
  }
  .check-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  @media (min-width: 720px) {
    .add {
      grid-template-columns: minmax(180px, 1fr) 150px 180px 150px auto;
      align-items: center;
    }
  }
</style>
