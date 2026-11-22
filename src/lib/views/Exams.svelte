<script>
  import { appState, createExam, updateExam, deleteExam, restoreEntity } from '../stores/app.js';
  import { todayKey, formatDate, formatDayMonth, relativeDayLabel } from '../data/dates.js';
  import { toast } from '../stores/toast.js';
  import { now as clockNow } from '../stores/clock.js';
  import { hint } from '../actions/hint.js';
  import Modal from '../components/Modal.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  let open = false;
  let editing = null;
  let gradeError = '';
  let gradeInput = null;
  let form = { title: '', moduleId: '', date: todayKey(), notes: '', grade: '', gradeNote: '' };

  $: modules = $appState.modules || [];
  $: dayNow = new Date($clockNow);
  $: today = todayKey(dayNow);
  $: exams = [...($appState.exams || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  $: upcoming = exams.filter((e) => e.date && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  $: past = exams.filter((e) => !e.date || e.date < today);

  function openCreate() {
    editing = null;
    gradeError = '';
    form = { title: '', moduleId: '', date: todayKey(), notes: '', grade: '', gradeNote: '' };
    open = true;
  }

  function openEdit(exam) {
    editing = exam;
    gradeError = '';
    form = {
      title: exam.title,
      moduleId: exam.moduleId || '',
      date: exam.date || '',
      notes: exam.notes || '',
      grade: typeof exam.grade === 'number' ? String(exam.grade) : '',
      gradeNote: exam.gradeNote || '',
    };
    open = true;
  }

  function save() {
    const gradeNumber = form.grade === '' ? null : Number(form.grade);
    if (gradeNumber !== null && (Number.isNaN(gradeNumber) || gradeNumber < 1 || gradeNumber > 6)) {
      gradeError = 'Bitte eine Note zwischen 1 und 6 angeben.';
      gradeInput?.focus();
      return;
    }
    gradeError = '';
    const payload = {
      title: form.title.trim() || 'Prüfung',
      moduleId: form.moduleId || null,
      date: form.date || '',
      notes: form.notes,
      grade: gradeNumber,
      gradeNote: form.gradeNote,
    };
    if (editing) updateExam(editing.id, payload);
    else createExam(payload);
    open = false;
    toast(editing ? 'Prüfung gespeichert' : 'Prüfung erfasst');
  }

  function remove(exam) {
    const snapshot = { ...exam };
    deleteExam(exam.id);
    toast('Prüfung gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => {
          restoreEntity('exams', snapshot);
          toast('Wiederhergestellt');
        },
      },
    });
  }

  function gradeLabel(grade) {
    if (typeof grade !== 'number') return '';
    return Number.isInteger(grade) ? String(grade) : grade.toFixed(1);
  }

  /** 6-segment fill: 1-5 full, 6th segment half when the grade has a .5 */
  function gradeState(grade, index) {
    if (typeof grade !== 'number') return '';
    const full = Math.floor(grade);
    if (index <= full) return 'on';
    if (index === full + 1 && grade % 1 >= 0.5) return 'half';
    return '';
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Prüfungen</h1>
      <p class="sub">Termine im Blick behalten, Noten später ergänzen.</p>
    </div>
    <button class="btn btn-primary" type="button" on:click={openCreate}>
      <Icon name="plus" size={16} /> Prüfung erfassen
    </button>
  </header>

  <section aria-labelledby="upcoming-title">
    <div class="section-title">
      <h2 id="upcoming-title">Demnächst</h2>
      <span class="count" aria-live="polite">{upcoming.length}</span>
    </div>
    {#if upcoming.length}
      <div class="card list">
        {#each upcoming as exam (exam.id)}
          {@const dm = formatDayMonth(exam.date)}
          <div class="exam-row">
            <button
              class="exam-open"
              type="button"
              on:click={() => openEdit(exam)}
              use:hint={{ text: 'Bearbeiten' }}
            >
              <span class="date-block" aria-hidden="true">
                <span class="day mono">{dm.day}</span>
                <span class="month">{dm.month}</span>
              </span>
              <span class="exam-main">
                <span class="title">{exam.title}</span>
                <span class="meta">
                  {#if exam.moduleId}
                    {@const mod = modules.find((m) => m.id === exam.moduleId)}
                    {#if mod}<span>{mod.code || mod.title}</span>{/if}
                  {/if}
                  <span class="rel">{relativeDayLabel(exam.date, dayNow)}</span>
                </span>
              </span>
            </button>
            <button
              class="icon delete"
              type="button"
              aria-label={`${exam.title} löschen`}
              on:click={() => remove(exam)}
              use:hint={{ text: 'Löschen' }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <EmptyState title="Keine Prüfung geplant" text="Datum festhalten, Note später ergänzen." actionLabel="Prüfung erfassen" action={openCreate} />
    {/if}
  </section>

  {#if past.length}
    <section aria-labelledby="past-title">
      <div class="section-title">
        <h2 id="past-title">Vorbei</h2>
        <span class="count">{past.length}</span>
      </div>
      <div class="card list">
        {#each past as exam (exam.id)}
          {@const dm = formatDayMonth(exam.date)}
          <div class="exam-row past">
            <button
              class="exam-open"
              type="button"
              on:click={() => openEdit(exam)}
              use:hint={{ text: 'Bearbeiten' }}
            >
              <span class="date-block" aria-hidden="true">
                <span class="day mono">{dm.day}</span>
                <span class="month">{dm.month}</span>
              </span>
              <span class="exam-main">
                <span class="title">{exam.title}</span>
                <span class="meta">
                  {#if exam.moduleId}
                    {@const mod = modules.find((m) => m.id === exam.moduleId)}
                    {#if mod}<span>{mod.code || mod.title}</span>{/if}
                  {/if}
                  <span>{exam.date ? formatDate(exam.date, 'short') : 'ohne Datum'}</span>
                  {#if exam.gradeNote}<span class="note">{exam.gradeNote}</span>{/if}
                </span>
              </span>
            </button>
            {#if typeof exam.grade === 'number'}
              <span class="grade-block">
                <span class="grade mono">{gradeLabel(exam.grade)}</span>
                <span class="grade-scale" aria-hidden="true">
                  <span class="scale-end">1</span>
                  {#each [1, 2, 3, 4, 5, 6] as i (i)}
                    <span class="grade-seg {gradeState(exam.grade, i)}"></span>
                  {/each}
                  <span class="scale-end">6</span>
                </span>
                <span class="sr-only">Note {gradeLabel(exam.grade)} von 6</span>
              </span>
            {/if}
            <button
              class="icon delete"
              type="button"
              aria-label={`${exam.title} löschen`}
              on:click={() => remove(exam)}
              use:hint={{ text: 'Löschen' }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<Modal open={open} title={editing ? 'Prüfung bearbeiten' : 'Neue Prüfung'} on:close={() => (open = false)}>
  <div class="stack">
    <label class="field"><span>Titel</span><input class="input" bind:value={form.title} data-autofocus placeholder="z. B. Prüfung M294" autocomplete="off" /></label>
    <div class="two">
      <label class="field">
        <span>Modul</span>
        <select class="select" bind:value={form.moduleId}>
          <option value="">Kein Modul</option>
          {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
        </select>
      </label>
      <label class="field"><span>Datum</span><input class="input" type="date" bind:value={form.date} /></label>
    </div>
    <label class="field"><span>Notizen</span><textarea class="textarea" bind:value={form.notes} rows="3"></textarea></label>
    <div class="two">
      <label class="field">
        <span>Note (1–6, halbe Schritte)</span>
        <input
          class="input"
          class:invalid={!!gradeError}
          type="number"
          min="1"
          max="6"
          step="0.5"
          inputmode="decimal"
          bind:value={form.grade}
          bind:this={gradeInput}
          aria-invalid={!!gradeError}
          aria-describedby={gradeError ? 'exam-grade-error' : undefined}
          on:input={() => (gradeError = '')}
        />
        {#if gradeError}
          <span class="field-error" id="exam-grade-error" role="alert">{gradeError}</span>
        {/if}
      </label>
      <label class="field"><span>Notiz zur Note</span><input class="input" bind:value={form.gradeNote} /></label>
    </div>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (open = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={save}>Speichern</button>
  </svelte:fragment>
</Modal>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 960px;
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }
  h1 {
    font-size: clamp(1.9rem, 3.4vw, 2.4rem);
    letter-spacing: -0.035em;
  }
  .sub {
    margin-top: 2px;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .count {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .list {
    padding: var(--space-1);
  }
  .exam-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 64px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2);
  }
  .exam-row:hover {
    background: var(--surface-2);
  }
  .exam-row.past .date-block {
    background: var(--surface-2);
    color: var(--ink-3);
  }
  .exam-row.past .title {
    color: var(--ink-2);
  }
  .exam-row.past .month {
    color: var(--ink-3);
  }
  .field-error {
    margin-top: 2px;
    color: var(--danger);
    font-size: var(--text-xs);
  }
  .input.invalid {
    border-color: var(--danger);
  }
  .date-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: none;
    border-radius: var(--radius-1);
    background: var(--tint-exams);
    color: var(--ink-2);
    font-size: var(--text-xs);
  }
  .day {
    font-size: var(--text-base);
    font-weight: 700;
    line-height: 1;
  }
  .month {
    font-size: 9px;
    color: var(--ink-3);
  }
  .exam-row {
    position: relative;
    cursor: pointer;
  }
  .exam-open {
    position: relative;
    width: 100%;
    min-height: 64px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2);
    background: transparent;
    border: 0;
    text-align: left;
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .exam-row:hover .exam-open {
    background: var(--surface-2);
  }
  .exam-open:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }
  .exam-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    text-align: left;
    padding: 0;
  }
  .title {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: 11px;
    color: var(--ink-3);
  }
  .rel {
    font-weight: 600;
    color: var(--ink-2);
  }
  .note {
    font-style: italic;
  }
  .grade {
    padding: 2px var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--ok-soft);
    color: var(--ok);
    font-weight: 700;
  }
  .grade-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: none;
  }
  .grade-scale {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .scale-end {
    color: var(--ink-3);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  .grade {
    padding: 2px var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--ok-soft);
    color: var(--ok);
    font-weight: 700;
  }
  .grade-seg {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--rule-strong);
  }
  .grade-seg.on {
    background: var(--ok);
    border-color: var(--ok);
  }
  .grade-seg.half {
    background: linear-gradient(90deg, var(--ok) 50%, var(--surface-2) 50%);
    border-color: var(--ok);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
    opacity: 0.45;
  }
  .exam-row:hover .icon,
  .icon:focus-visible {
    opacity: 1;
  }
  .icon:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  @media (pointer: coarse) {
    .icon {
      min-width: 44px;
      min-height: 44px;
      opacity: 1;
    }
    .exam-open {
      min-height: 72px;
    }
  }
  @media (max-width: 560px) {
    .two {
      grid-template-columns: 1fr;
    }
  }
</style>
