<script>
  import {
    appState,
    modulesByProgram,
    createModule,
    updateModule,
    deleteModule,
    snapshotModule,
    restoreModuleSnapshot,
  } from '../stores/app.js';
  import { navigate, modulePath } from '../router.js';
  import { toast } from '../stores/toast.js';
  import Modal from '../components/Modal.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import AiButton from '../components/AiButton.svelte';

  let modalOpen = false;
  let editing = null;
  let programId = 'program-emvs';
  let code = '';
  let title = '';
  let accent = '#4f46e5';
  let confirmDelete = null;

  $: programs = $appState.programs || [];
  $: grouped = $modulesByProgram;

  const accents = ['#4f46e5', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#0369a1', '#4d7c0f', '#9a3412'];

  function openCreate() {
    editing = null;
    programId = $appState.settings.currentProgramId || programs[0]?.id || 'program-emvs';
    code = '';
    title = '';
    accent = accents[(($appState.modules || []).length || 0) % accents.length];
    modalOpen = true;
  }

  function openEdit(mod) {
    editing = mod;
    programId = mod.programId;
    code = mod.code || '';
    title = mod.title || '';
    accent = mod.accent || '#4f46e5';
    modalOpen = true;
  }

  function save() {
    if (!title.trim() && !code.trim()) return;
    if (editing) {
      updateModule(editing.id, { programId, code: code.trim(), title: title.trim(), accent });
      toast('Modul gespeichert');
    } else {
      const mod = createModule({ programId, code, title, accent });
      toast('Modul erstellt');
      navigate(modulePath(mod.id));
    }
    modalOpen = false;
  }

  function remove(mod) {
    confirmDelete = mod;
  }

  function doDelete() {
    if (!confirmDelete) return;
    const mod = confirmDelete;
    const snapshot = snapshotModule(mod.id);
    deleteModule(mod.id);
    confirmDelete = null;
    toast('Modul gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => {
          restoreModuleSnapshot(snapshot);
          toast('Wiederhergestellt');
        },
      },
    });
  }

  function counts(mod) {
    return {
      homework: ($appState.homework || []).filter((h) => h.moduleId === mod.id && !h.done).length,
      notes: ($appState.notes || []).filter((n) => n.moduleId === mod.id).length,
      exams: ($appState.exams || []).filter((e) => e.moduleId === mod.id).length,
    };
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Struktur</p>
      <h1>Module</h1>
    </div>
    <button class="btn btn-primary" type="button" on:click={openCreate}><Icon name="plus" size={16} /> Modul</button>
  </header>

  {#if ($appState.modules || []).length === 0}
    <EmptyState
      title="Noch keine Module"
      text="Ein Modul bündelt Notizen, Hausaufgaben, Prüfungen, Links und Dateien."
      actionLabel="Modul erstellen"
      action={openCreate}
    />
  {:else}
    {#each programs as program (program.id)}
      {@const mods = grouped.get(program.id) || []}
      {#if mods.length}
        <section class="program-block" aria-labelledby={`program-${program.id}`}>
          <div class="program-head">
            <h2 id={`program-${program.id}`}>{program.name}</h2>
            <span class="count">{mods.length}</span>
          </div>
          <div class="module-grid">
            {#each mods as mod (mod.id)}
              {@const c = counts(mod)}
              <article class="module-card" style:--mod={mod.accent}>
                <a class="module-link" href="#{modulePath(mod.id)}">
                  <span class="mod-code mono">{mod.code || '—'}</span>
                  <h3>{mod.title || 'Ohne Titel'}</h3>
                  {#if c.homework || c.notes || c.exams}
                    <span class="stats">
                      {#if c.homework}<span>{c.homework} offen</span>{/if}
                      {#if c.notes}<span>{c.notes} {c.notes === 1 ? 'Notiz' : 'Notizen'}</span>{/if}
                      {#if c.exams}<span>{c.exams} {c.exams === 1 ? 'Prüfung' : 'Prüfungen'}</span>{/if}
                    </span>
                  {/if}
                </a>
                <div class="card-actions">
                  <AiButton kind="module" id={mod.id} label="KI fragen" iconOnly />
                  <button class="icon" type="button" aria-label={`${mod.title} bearbeiten`} on:click={() => openEdit(mod)}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button class="icon" type="button" aria-label={`${mod.title} löschen`} on:click={() => remove(mod)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  {/if}
</div>

<Modal open={modalOpen} title={editing ? 'Modul bearbeiten' : 'Neues Modul'} on:close={() => (modalOpen = false)}>
  <div class="stack">
    <label class="field">
      <span>Programm</span>
      <select class="select" bind:value={programId}>
        {#each programs as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </label>
    <div class="two">
      <label class="field">
        <span>Kürzel</span>
        <input class="input" bind:value={code} placeholder="z. B. M294" data-autofocus />
      </label>
      <label class="field">
        <span>Farbe</span>
        <div class="swatches">
          {#each accents as color}
            <button
              class="swatch"
              class:active={accent === color}
              type="button"
              style:--swatch={color}
              aria-label={`Farbe ${color}`}
              aria-pressed={accent === color}
              on:click={() => (accent = color)}
            ></button>
          {/each}
        </div>
      </label>
    </div>
    <label class="field">
      <span>Titel</span>
      <input class="input" bind:value={title} placeholder="z. B. Datenbanken" />
    </label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (modalOpen = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={save} disabled={!title.trim() && !code.trim()}>
      {editing ? 'Speichern' : 'Erstellen'}
    </button>
  </svelte:fragment>
</Modal>

<Modal open={!!confirmDelete} title="Modul löschen" on:close={() => (confirmDelete = null)}>
  <p>
    «{confirmDelete?.title || confirmDelete?.code}» und alle zugehörigen Notizen, Hausaufgaben, Prüfungen und Links werden entfernt.
    Hochgeladene Dateien werden endgültig gelöscht und lassen sich nicht wiederherstellen.
  </p>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (confirmDelete = null)}>Abbrechen</button>
    <button class="btn btn-danger" type="button" on:click={doDelete}>Löschen</button>
  </svelte:fragment>
</Modal>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 1000px;
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
  .program-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .program-head h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .count {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .module-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--space-3);
  }
  .module-card {
    position: relative;
    display: flex;
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--surface);
    overflow: hidden;
  }
  .module-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--mod);
  }
  .module-link {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    padding: var(--space-4);
    color: var(--ink);
    text-decoration: none;
  }
  .mod-code {
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
  }
  .module-link h3 {
    font-size: var(--text-base);
    font-weight: 650;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: 10px;
    color: var(--ink-3);
  }
  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2);
    opacity: 0.5;
  }
  .module-card:hover .card-actions,
  .card-actions:focus-within {
    opacity: 1;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
  }
  .icon:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-height: 40px;
    align-items: center;
  }
  .swatch {
    width: 24px;
    height: 24px;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--swatch);
  }
  .swatch.active {
    outline: 2px solid var(--swatch);
    outline-offset: 2px;
  }
  @media (pointer: coarse) {
    .card-actions {
      opacity: 1;
    }
  }
</style>
