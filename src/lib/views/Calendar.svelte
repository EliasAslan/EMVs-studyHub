<script>
  import { appState, createHomework, createExam, openHomework } from '../stores/app.js';
  import { monthModel } from '../data/calendar.js';
  import { monthRange, formatMonth, formatDate, todayKey, weekdayShort, relativeDayLabel } from '../data/dates.js';
  import { upcomingDeadlines } from '../data/deadlines.js';
  import { toast } from '../stores/toast.js';
  import Modal from '../components/Modal.svelte';
  import Icon from '../components/Icon.svelte';

  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth();
  let selected = todayKey();

  let addOpen = false;
  let addKind = 'homework';
  let addTitle = '';
  let addModule = '';
  let addDate = selected;

  $: weeks = monthModel(year, month, $appState);
  $: range = monthRange(year, month);
  $: selectedHomework = ($appState.homework || []).filter((h) => h.dueDate === selected);
  $: selectedExams = ($appState.exams || []).filter((e) => e.date === selected);
  $: deadlines = upcomingDeadlines($appState, { limit: 6 });
  $: weekdayLabels = weeks[0].map((d) => weekdayShort(new Date(d.key + 'T00:00:00')));

  function shift(delta) {
    const d = new Date(year, month + delta, 1);
    year = d.getFullYear();
    month = d.getMonth();
  }

  function goToday() {
    const d = new Date();
    year = d.getFullYear();
    month = d.getMonth();
    selected = todayKey();
  }

  function openAdd(kind = 'homework') {
    addKind = kind;
    addTitle = '';
    addModule = '';
    addDate = selected;
    addOpen = true;
  }

  function addEntry() {
    if (!addTitle.trim()) return;
    const payload = {
      title: addTitle,
      date: addDate || selected,
      dueDate: addDate || selected,
      moduleId: addModule || null,
    };
    if (addKind === 'exam') {
      createExam(payload);
      toast('Prüfung erfasst');
    } else {
      createHomework(payload);
      toast('Hausaufgabe erfasst');
    }
    addOpen = false;
  }

  function isInMonth(key) {
    return key.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`;
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Zeit</p>
      <h1>Kalender</h1>
    </div>
    <button class="btn btn-primary" type="button" on:click={() => openAdd()}><Icon name="plus" size={16} /> Eintrag</button>
  </header>

  <div class="calendar card">
    <div class="cal-head">
      <button class="nav-btn" type="button" aria-label="Vorheriger Monat" on:click={() => shift(-1)}><Icon name="chevronLeft" size={18} /></button>
      <h2>{formatMonth(year, month)}</h2>
      <div class="cal-actions">
        <button class="btn btn-sm" type="button" on:click={goToday}>Heute</button>
        <button class="nav-btn" type="button" aria-label="Nächster Monat" on:click={() => shift(1)}><Icon name="chevronRight" size={18} /></button>
      </div>
    </div>

    <div class="weekdays" aria-hidden="true">
      {#each weekdayLabels as label}<span>{label}</span>{/each}
    </div>

    <div class="grid">
      {#each weeks as week, wi (wi)}
        {#each week as day (day.key)}
          <button
            class="day"
            class:out={!isInMonth(day.key)}
            class:today={day.isToday}
            class:selected={selected === day.key}
            type="button"
            aria-pressed={selected === day.key}
            on:click={() => (selected = day.key)}
          >
            <span class="sr-only">
              {`${formatDate(day.key, 'long')}${day.homework.length ? `, ${day.homework.length} Hausaufgaben` : ''}${day.exams.length ? `, ${day.exams.length} Prüfungen` : ''}`}
            </span>
            <span class="num mono" aria-hidden="true">{Number(day.key.slice(8, 10))}</span>
            <span class="marks" aria-hidden="true">
              {#if day.homework.length}<span class="mark hw" title={`${day.homework.length} Hausaufgaben`}><span class="mark-letter">H</span>{day.homework.length}</span>{/if}
              {#if day.exams.length}<span class="mark exam" title={`${day.exams.length} Prüfungen`}><span class="mark-letter">P</span>{day.exams.length}</span>{/if}
            </span>
          </button>
        {/each}
      {/each}
    </div>
  </div>

  <section class="day-panel" aria-labelledby="day-title">
    <div class="section-title">
      <h2 id="day-title">{formatDate(selected, 'long')}</h2>
      <span class="muted small">{relativeDayLabel(selected)}</span>
    </div>

    {#if selectedHomework.length || selectedExams.length}
      <div class="card list">
        {#each selectedExams as exam (exam.id)}
          <a class="item" href="#/exams">
            <span class="badge exam">Prüfung</span>
            <span class="item-title">{exam.title}</span>
          </a>
        {/each}
        {#each selectedHomework as hw (hw.id)}
          <a class="item" href="#/homework" class:done={hw.done}>
            <span class="badge hw">Hausaufgabe</span>
            <span class="item-title">{hw.title}</span>
            {#if hw.done}<span class="muted small">erledigt</span>{/if}
          </a>
        {/each}
      </div>
    {:else}
      <div class="empty-day">
        <p class="muted">Nichts an diesem Tag.</p>
        <div class="empty-actions">
          <button class="btn btn-sm" type="button" on:click={() => openAdd('homework')}>Hausaufgabe</button>
          <button class="btn btn-sm" type="button" on:click={() => openAdd('exam')}>Prüfung</button>
        </div>
      </div>
    {/if}
  </section>

  <section aria-labelledby="deadlines-title">
    <div class="section-title">
      <h2 id="deadlines-title">Nächste Fristen</h2>
    </div>
    {#if deadlines.length}
      <div class="card list">
        {#each deadlines as d (d.kind + d.item.id)}
          <a class="item" href={d.kind === 'exam' ? '#/exams' : '#/homework'}>
            <span class="badge" class:exam={d.kind === 'exam'} class:hw={d.kind === 'homework'}>{d.kind === 'exam' ? 'Prüfung' : 'Hausaufgabe'}</span>
            <span class="item-title">{d.item.title}</span>
            <span class="muted small mono">{formatDate(d.date, 'short')}</span>
            <span class="rel small" class:overdue={d.days < 0}>{relativeDayLabel(d.date)}</span>
          </a>
        {/each}
      </div>
    {:else}
      <p class="muted small">Keine offenen Fristen.</p>
    {/if}
  </section>
</div>

<Modal open={addOpen} title={addKind === 'exam' ? 'Neue Prüfung' : 'Neue Hausaufgabe'} on:close={() => (addOpen = false)}>
  <div class="stack">
    <div class="segmented" role="group" aria-label="Art des Eintrags">
      <button class="seg" class:active={addKind === 'homework'} type="button" aria-pressed={addKind === 'homework'} on:click={() => (addKind = 'homework')}>Hausaufgabe</button>
      <button class="seg" class:active={addKind === 'exam'} type="button" aria-pressed={addKind === 'exam'} on:click={() => (addKind = 'exam')}>Prüfung</button>
    </div>
    <label class="field"><span>Titel</span><input class="input" bind:value={addTitle} data-autofocus placeholder="Was ist zu tun?" /></label>
    <label class="field"><span>{addKind === 'exam' ? 'Datum' : 'Fällig'}</span><input class="input" type="date" bind:value={addDate} /></label>
    <label class="field">
      <span>Modul</span>
      <select class="select" bind:value={addModule}>
        <option value="">Kein Modul</option>
        {#each $appState.modules || [] as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
      </select>
    </label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (addOpen = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={addEntry} disabled={!addTitle.trim()}>{addKind === 'exam' ? 'Prüfung erfassen' : 'Hausaufgabe erfassen'}</button>
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
  .calendar {
    overflow: hidden;
  }
  .cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--rule);
  }
  .cal-head h2 {
    font-size: var(--text-base);
    font-weight: 650;
  }
  .cal-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .nav-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-2);
  }
  .nav-btn:hover {
    background: var(--surface-2);
  }
  .weekdays,
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  .weekdays {
    padding: var(--space-2) var(--space-2) 0;
  }
  .weekdays span {
    padding: var(--space-1);
    text-align: center;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--ink-3);
  }
  .grid {
    padding: var(--space-2);
    gap: 2px;
  }
  .day {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 64px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink);
    text-align: left;
  }
  .day:hover {
    background: var(--surface-2);
  }
  .day.out {
    color: var(--ink-3);
  }
  .day.today .num {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-left: -3px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
  }
  .day.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .num {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .marks {
    display: flex;
    gap: 3px;
    margin-top: auto;
  }
  .mark {
    display: grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    border-radius: var(--radius-pill);
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 700;
  }
  .mark.hw {
    background: var(--tint-homework);
    color: var(--ink-2);
  }
  .mark.exam {
    background: var(--tint-exams);
    color: var(--warn);
  }
  .list {
    padding: var(--space-1);
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-1);
    color: var(--ink);
    text-decoration: none;
  }
  .item:hover {
    background: var(--surface-2);
  }
  .item.done .item-title {
    color: var(--ink-3);
    text-decoration: line-through;
  }
  .item-title {
    flex: 1;
    font-size: var(--text-sm);
  }
  .badge {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    font-size: 10px;
    font-weight: 650;
    background: var(--surface-2);
    color: var(--ink-2);
  }
  .badge.exam {
    background: var(--tint-exams);
    color: var(--warn);
  }
  .badge.hw {
    background: var(--tint-homework);
    color: var(--ink-2);
  }
  .rel {
    color: var(--ink-3);
  }
  .rel.overdue {
    color: var(--warn);
    font-weight: 600;
  }
  .empty-day {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-2);
  }
  .small {
    font-size: var(--text-xs);
  }
  .mark-letter {
    font-size: 8px;
    line-height: 1;
    opacity: 0.85;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .seg {
    flex: 1;
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .seg.active {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }
  @media (min-width: 700px) {
    .day {
      min-height: 84px;
    }
  }
</style>
