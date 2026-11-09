<script>
  import { appState, createExam, updateExam, deleteExam, restoreEntity } from '../stores/app.js';
  import { todayKey, formatDate, relativeDayLabel } from '../data/dates.js';
  import { toast } from '../stores/toast.js';
  import Modal from '../components/Modal.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  let open = false;
  let editing = null;
  let form = { title: '', moduleId: '', date: todayKey(), notes: '', grade: '', gradeNote: '' };

  $: modules = $appState.modules || [];
  $: exams = [...($appState.exams || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  $: upcoming = exams.filter((e) => e.date && e.date >= todayKey()).sort((a, b) => (a.date < b.date ? -1 : 1));
  $: past = exams.filter((e) => !e.date || e.date < todayKey());

  function openCreate() {
    editing = null;
    form = { title: '', moduleId: '', date: todayKey(), notes: '', grade: '', gradeNote: '' };
    open = true;
  }

  function openEdit(exam) {
    editing = exam;
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
      toast('Note muss zwischen 1 und 6 liegen.');
      return;
    }
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
      <p class="eyebrow">Termine</p>
      <h1>Prüfungen</h1>
    </div>
    <button class="btn btn-primary" type="button" on:click={openCreate}><Icon name="plus" size={16} /> Prüfung</button>
  </header>

  <section aria-labelledby="upcoming-title">
    <div class="section-title">
      <h2 id="upcoming-title">Demnächst</h2>
      <span class="count">{upcoming.length}</span>
    </div>
    {#if upcoming.length}
      <div class="card list">
        {#each upcoming as exam (exam.id)}
          <div class="exam-row">
            <span class="date-block">
              <span class="day mono">{exam.date ? exam.date.slice(8, 10) : '–'}</span>
              <span class="month mono">{exam.date ? exam.date.slice(5, 7) : ''}</span>
            </span>
            <button class="exam-main" type="button" on:click={() => openEdit(exam)}>
              <span class="title">{exam.title}</span>
              <span class="meta">
                {#if exam.moduleId}
                  {@const mod = modules.find((m) => m.id === exam.moduleId)}
                  {#if mod}<span>{mod.code || mod.title}</span>{/if}
                {/if}
                <span>{formatDate(exam.date, 'short')}</span>
                <span class="rel">{relativeDayLabel(exam.date)}</span>
              </span>
            </button>
            <button class="icon" type="button" aria-label={`${exam.title} löschen`} on:click={() => remove(exam)}><Icon name="trash" size={15} /></button>
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
          <div class="exam-row past">
            <span class="date-block">
              <span class="day mono">{exam.date ? exam.date.slice(8, 10) : '–'}</span>
              <span class="month mono">{exam.date ? exam.date.slice(5, 7) : ''}</span>
            </span>
            <button class="exam-main" type="button" on:click={() => openEdit(exam)}>
              <span class="title">{exam.title}</span>
              <span class="meta">
                <span class="past-badge">Vorbei</span>
                <span>{exam.date ? formatDate(exam.date, 'short') : 'ohne Datum'}</span>
                {#if exam.gradeNote}<span class="note">{exam.gradeNote}</span>{/if}
              </span>
            </button>
            {#if typeof exam.grade === 'number'}
              <span class="grade-block" title={`Note ${gradeLabel(exam.grade)} von 6`}>
                <span class="grade mono">{gradeLabel(exam.grade)}</span>
                <span class="grade-scale" aria-hidden="true">
                  {#each [1, 2, 3, 4, 5, 6] as i (i)}
                    <span class="grade-seg {gradeState(exam.grade, i)}"></span>
                  {/each}
                </span>
                <span class="sr-only">Note {gradeLabel(exam.grade)} von 6</span>
              </span>
            {/if}
            <button class="icon" type="button" aria-label={`${exam.title} löschen`} on:click={() => remove(exam)}><Icon name="trash" size={15} /></button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<Modal open={open} title={editing ? 'Prüfung bearbeiten' : 'Neue Prüfung'} on:close={() => (open = false)}>
  <div class="stack">
    <label class="field"><span>Titel</span><input class="input" bind:value={form.title} data-autofocus placeholder="z. B. Prüfung M294" /></label>
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
        <input class="input" type="number" min="1" max="6" step="0.5" bind:value={form.grade} />
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
    max-width: 900px;
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
  .past-badge {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: 10px;
    font-weight: 650;
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
    padding: var(--space-1) 0;
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
    gap: 5px;
    flex: none;
  }
  .grade-scale {
    display: flex;
    gap: 3px;
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
      opacity: 1;
    }
  }
</style>
