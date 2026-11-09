<script>
  import {
    appState,
    openHomework,
    toggleHomework,
    todayChecklist,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    backupReminder,
    recentNotes,
    moduleTitle,
  } from '../stores/app.js';
  import { openPalette } from '../stores/ui.js';
  import {
    todayKey,
    formatDate,
    formatTimeRange,
    relativeDayLabel,
    daysUntil,
    WEEKDAYS,
  } from '../data/dates.js';
  import { nextLesson, lessonLabel } from '../data/schedule.js';
  import Checklist from '../components/Checklist.svelte';
  import NoteCard from '../components/NoteCard.svelte';
  import QuickCapture from '../components/QuickCapture.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import { toast } from '../stores/toast.js';

  let captureOpen = false;
  let captureMode = 'note';

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

  $: today = todayKey();
  $: open = $openHomework;
  $: dueNow = open.filter((hw) => hw.dueDate && daysUntil(hw.dueDate) <= 0);
  $: dueLater = open.filter((hw) => !hw.dueDate || daysUntil(hw.dueDate) > 0);
  $: nextExam =
    ($appState.exams || [])
      .filter((exam) => exam.date && exam.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;
  $: upcoming = nextLesson($appState);
  $: remaining = $todayChecklist.items.filter((item) => !item.checked).length;
  $: recent = $recentNotes.slice(0, 3);

  $: currentProgram = $appState.settings.currentProgramId;
  $: programModules = ($appState.modules || []).filter((m) => m.programId === currentProgram);
  $: shortcuts = ($appState.links || [])
    .filter((link) => !link.moduleId || programModules.some((m) => m.id === link.moduleId))
    .slice(0, 2);

  function openCapture(mode) {
    captureMode = mode;
    captureOpen = true;
  }

  function complete(hw) {
    toggleHomework(hw.id);
    toast('Erledigt');
  }
</script>

<div class="today">
  <header class="page-head">
    <div>
      <h1>Heute</h1>
      <p class="date">{formatDate(today, 'long')}</p>
    </div>
    <div class="head-actions">
      <button class="search-pill" type="button" on:click={openPalette}>
        <Icon name="search" size={15} />
        <span>Suchen</span>
        <kbd>{shortcutLabel}</kbd>
      </button>
    </div>
  </header>

  {#if $backupReminder}
    <a class="backup-note" href="#/settings">
      <span class="dot" aria-hidden="true"></span>
      Backup fällig — kurz exportieren?
    </a>
  {/if}

  <section class="block" aria-labelledby="due-title">
    <div class="section-title">
      <h2 id="due-title">Fällig</h2>
      <a href="#/homework" class="quiet-link">{open.length} offen</a>
    </div>

    {#if dueNow.length}
      <div class="due-list">
        {#each dueNow as hw (hw.id)}
          {@const days = daysUntil(hw.dueDate)}
          <div class="due-row" class:overdue={days < 0}>
            <button
              class="check"
              type="button"
              aria-label={`${hw.title} erledigen`}
              on:click={() => complete(hw)}
            ></button>
            <a class="due-body" href="#/homework">
              <span class="due-title">{hw.title}</span>
              <span class="due-meta">
                {#if hw.moduleId}<span>{moduleTitle($appState, hw.moduleId)}</span>{/if}
                <span>{formatDate(hw.dueDate, 'short')}</span>
                <span class:overdue-text={days < 0}>{days < 0 ? relativeDayLabel(hw.dueDate) : 'heute fällig'}</span>
              </span>
            </a>
            <span class="due-status" class:overdue={days < 0}>{days < 0 ? 'Überfällig' : 'Heute'}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="calm-row">
        <Icon name="check" size={18} />
        <p>Nichts fällig.</p>
        {#if dueLater.length}
          <a href="#/homework" class="quiet-link">{dueLater.length} weitere</a>
        {/if}
      </div>
    {/if}
  </section>

  {#if nextExam}
    <a class="exam-line" href="#/exams">
      <span class="exam-kind"><Icon name="exams" size={16} /> Nächste Prüfung</span>
      <span class="exam-main">
        <strong>{nextExam.title}</strong>
        <span class="exam-meta">
          {#if nextExam.moduleId}{moduleTitle($appState, nextExam.moduleId)} · {/if}
          {formatDate(nextExam.date, 'long')} · {relativeDayLabel(nextExam.date)}
        </span>
      </span>
    </a>
  {/if}

  <section class="block" aria-labelledby="checklist-title">
    <div class="section-title">
      <h2 id="checklist-title">Checkliste</h2>
      <span class="count">{remaining === 0 ? 'alles erledigt' : `${remaining} offen`}</span>
    </div>
    <div class="card pad">
      <Checklist
        items={$todayChecklist.items}
        on:toggle={(e) => toggleChecklistItem(e.detail)}
        on:add={(e) => addChecklistItem(e.detail)}
        on:remove={(e) => deleteChecklistItem(e.detail.id)}
      />
    </div>
  </section>

  {#if upcoming}
    <section class="block" aria-labelledby="lesson-title">
      <div class="section-title">
        <h2 id="lesson-title">Nächste Lektion</h2>
        <a href="#/calendar" class="quiet-link">Stundenplan</a>
      </div>
      <a class="lesson-card" href="#/calendar">
        <span class="lesson-day">{WEEKDAYS.find((d) => d.value === upcoming.lesson.dayOfWeek)?.short}</span>
        <span class="lesson-main">
          <strong>{lessonLabel($appState, upcoming.lesson)}</strong>
          <span class="muted">
            {formatTimeRange(upcoming.lesson.start, upcoming.lesson.end)}{#if upcoming.lesson.room} · {upcoming.lesson.room}{/if}
          </span>
        </span>
        <span class="lesson-date mono">{formatDate(upcoming.date, 'short')}</span>
      </a>
    </section>
  {/if}

  <div class="lower">
    <section class="block" aria-labelledby="notes-title">
      <div class="section-title">
        <h2 id="notes-title">Zuletzt bearbeitet</h2>
        <a href="#/notes" class="quiet-link">Alle Notizen</a>
      </div>
      {#if recent.length}
        <div class="notes-grid">
          {#each recent as note (note.id)}
            <NoteCard {note} />
          {/each}
        </div>
      {:else}
        <EmptyState
          title="Noch keine Notizen"
          text="Eine kurze Notiz reicht."
          actionLabel="Notiz erfassen"
          action={() => openCapture('note')}
        />
      {/if}
    </section>

    <section class="block" aria-labelledby="links-title">
      <div class="section-title">
        <h2 id="links-title">Links</h2>
        <a href="#/links" class="quiet-link">Alle Links</a>
      </div>
      {#if shortcuts.length}
        <div class="link-list">
          {#each shortcuts as link (link.id)}
            <a class="link-row" href={link.url} target="_blank" rel="noopener noreferrer">
              <Icon name={link.kind === 'website' || link.kind === 'custom' ? 'links' : 'file'} size={15} />
              <span>{link.label}</span>
            </a>
          {/each}
        </div>
      {:else}
        <p class="muted small">Noch keine Links. <a href="#/links">Hinzufügen</a></p>
      {/if}
    </section>
  </div>
</div>

<QuickCapture open={captureOpen} initialMode={captureMode} on:close={() => (captureOpen = false)} />

<style>
  .today {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .head-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
  }
  h1 {
    font-size: clamp(1.9rem, 3.4vw, 2.4rem);
    font-weight: 600;
    letter-spacing: -0.035em;
  }
  .date {
    margin-top: 2px;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .search-pill {
    display: none;
    align-items: center;
    gap: var(--space-2);
    min-height: 38px;
    padding: 0 var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--ink-3);
    font-size: var(--text-sm);
  }
  .search-pill:hover {
    color: var(--ink);
    border-color: var(--rule-strong);
  }
  kbd {
    padding: 1px 5px;
    border: 1px solid var(--rule);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .backup-note {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-sm);
    text-decoration: none;
  }
  .backup-note .dot {
    background: currentColor;
  }
  .block {
    min-width: 0;
  }
  .count {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .quiet-link {
    font-size: var(--text-xs);
    color: var(--ink-3);
    text-decoration: none;
  }
  .quiet-link:hover {
    color: var(--accent-strong);
    text-decoration: underline;
  }
  .pad {
    padding: var(--space-3);
  }
  .due-list {
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--surface);
    overflow: hidden;
  }
  .due-row {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 58px;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--rule);
  }
  .due-row:last-child {
    border-bottom: 0;
  }
  .due-row:hover {
    background: var(--surface-2);
  }
  .due-row.overdue {
    box-shadow: inset 3px 0 0 var(--warn);
  }
  .check {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    border: 1.5px solid var(--rule-strong);
    border-radius: 7px;
    background: var(--surface);
    color: var(--accent-ink);
  }
  .check:hover {
    border-color: var(--accent);
  }
  .due-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    color: var(--ink);
    text-decoration: none;
  }
  .due-body:hover {
    color: var(--ink);
  }
  .due-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.3;
  }
  .due-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    color: var(--ink-3);
    font-size: 12px;
  }
  .overdue-text {
    color: var(--warn);
    font-weight: 600;
  }
  .due-status {
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
  }
  .due-status.overdue {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .calm-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--surface);
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .calm-row :global(svg) {
    color: var(--ok);
  }
  .calm-row p {
    flex: 1;
  }
  .exam-line {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--tint-exams);
    color: var(--ink);
    text-decoration: none;
  }
  .exam-line:hover {
    border-color: var(--rule-strong);
  }
  .exam-kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    color: var(--ink-2);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .exam-main {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .exam-main strong {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .exam-meta {
    color: var(--ink-2);
    font-size: 12px;
  }
  .lesson-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
  }
  .lesson-card:hover {
    background: var(--surface-2);
  }
  .lesson-day {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-1);
    background: var(--surface-2);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .lesson-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    font-size: var(--text-sm);
  }
  .lesson-date {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .lower {
    display: grid;
    gap: var(--space-5);
  }
  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }
  .link-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .link-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 36px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-1);
    color: var(--ink-2);
    font-size: var(--text-sm);
    text-decoration: none;
  }
  .link-row:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .small {
    font-size: var(--text-xs);
  }
  @media (min-width: 700px) {
    .search-pill {
      display: inline-flex;
    }
  }
  @container (min-width: 760px) {
    .lower {
      grid-template-columns: minmax(0, 1.5fr) minmax(220px, 1fr);
      align-items: start;
    }
  }
</style>
