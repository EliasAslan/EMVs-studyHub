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
  import { todayKey, addDays, parseDateKey } from '../data/dates.js';
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
  let dueDate = defaultDueDate();
  let moduleId = '';
  let recurrence = 'none';
  let recurrenceOpen = false;
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
  $: activeFilterCount =
    ($filters.programId !== 'all' ? 1 : 0) + ($filters.moduleId !== 'all' ? 1 : 0);

  /** Tomorrow, or the next weekday when tomorrow is a weekend. */
  function defaultDueDate() {
    let next = addDays(todayKey(), 1);
    const weekday = parseDateKey(next)?.getDay();
    if (weekday === 6) next = addDays(next, 2);
    else if (weekday === 0) next = addDays(next, 1);
    return next;
  }

  function toggleNoDueDate(event) {
    dueDate = event.target.checked ? '' : defaultDueDate();
  }

  function resetFilters() {
    filters.update((f) => ({ ...f, programId: 'all', moduleId: 'all' }));
  }

  function setFilter(patch) {
    filters.update((f) => ({ ...f, ...patch }));
  }

  function add() {
    if (!title.trim()) return;
    createHomework({
      title,
      dueDate: dueDate || null,
      moduleId: moduleId || null,
      recurrence: recurrenceFromValue(recurrence),
    });
    title = '';
    dueDate = defaultDueDate();
    recurrence = 'none';
    recurrenceOpen = false;
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
    <div class="add-grid">
      <label class="field">
        <span class="field-label">Titel</span>
        <input class="input title-input" bind:value={title} placeholder="z. B. Auftrag 4 lösen" aria-label="Titel der Hausaufgabe" />
      </label>
      <label class="field">
        <span class="field-label">Fällig</span>
        <input class="input date-input" type="date" bind:value={dueDate} aria-label="Fällig am" />
      </label>
      <label class="field">
        <span class="field-label">Modul</span>
        <select class="select module-input" bind:value={moduleId} aria-label="Modul">
          <option value="">Kein Modul</option>
          {#each modules as m (m.id)}
            <option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="add-foot">
      <label class="check-row">
        <input type="checkbox" checked={!dueDate} on:change={toggleNoDueDate} />
        Ohne Datum
      </label>
      <button
        class="disclosure"
        type="button"
        aria-expanded={recurrenceOpen}
        aria-controls="homework-recurrence"
        on:click={() => (recurrenceOpen = !recurrenceOpen)}
      >
        <Icon name="repeat" size={15} />
        Wiederholen
        <Icon name={recurrenceOpen ? 'chevronDown' : 'chevronRight'} size={13} />
      </button>
      <button class="btn btn-primary" type="submit" disabled={!title.trim()}>
        <Icon name="plus" size={16} /> Erfassen
      </button>
    </div>
    {#if recurrenceOpen}
      <div class="recurrence-row" id="homework-recurrence">
        <label class="field">
          <span class="field-label">Wiederholen</span>
          <select class="select recur-input" bind:value={recurrence} aria-label="Wiederholen">
            {#each RECURRENCE_OPTIONS as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
        <p class="hint">Beim Erledigen wird automatisch die nächste Runde angelegt.</p>
      </div>
    {/if}
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
      Erledigte anzeigen
      {#if done.length}<span class="chip-count">{done.length}</span>{/if}
    </button>
    {#if activeFilterCount}
      <button class="chip reset" type="button" on:click={resetFilters}>
        Filter zurücksetzen ({activeFilterCount})
      </button>
    {/if}
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
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
  .add-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
  .field-label {
    display: block;
    margin-bottom: 4px;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-2);
  }
  .add-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .add-foot .btn-primary {
    margin-left: auto;
  }
  .disclosure {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .disclosure:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .disclosure[aria-expanded='true'] {
    color: var(--accent-strong);
  }
  .recurrence-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
  .recurrence-row .field {
    width: min(220px, 100%);
  }
  .hint {
    flex: 1;
    min-width: 180px;
    padding-bottom: 8px;
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .chip-count {
    margin-left: 6px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .chip[aria-pressed='true'] .chip-count {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .chip.reset {
    color: var(--accent-strong);
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
    .add-grid {
      grid-template-columns: minmax(180px, 1fr) 160px 200px;
      align-items: end;
    }
  }
</style>
