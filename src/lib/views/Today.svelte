<script>
  import {
    appState,
    startHere,
    todayChecklist,
    deadlines,
    recentNotes,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    updateSettings,
    backupReminder,
  } from '../stores/app.js';
  import { openPalette } from '../stores/ui.js';
  import { todayKey, formatDate, formatTimeRange, WEEKDAYS } from '../data/dates.js';
  import { nextLesson, lessonLabel } from '../data/schedule.js';
  import StartCard from '../components/StartCard.svelte';
  import Checklist from '../components/Checklist.svelte';
  import DeadlineStrip from '../components/DeadlineStrip.svelte';
  import NoteCard from '../components/NoteCard.svelte';
  import QuickCapture from '../components/QuickCapture.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import AiButton from '../components/AiButton.svelte';

  let captureOpen = false;
  let captureMode = 'note';

  $: today = todayKey();
  $: currentProgram = $appState.settings.currentProgramId;
  $: programs = $appState.programs || [];
  $: programModules = ($appState.modules || []).filter((m) => m.programId === currentProgram);
  $: shortcuts = ($appState.links || []).filter(
    (l) => !l.moduleId || programModules.some((m) => m.id === l.moduleId),
  );
  $: upcoming = nextLesson($appState);
  $: remaining = $todayChecklist.items.filter((i) => !i.checked).length;

  function openCapture(mode) {
    captureMode = mode;
    captureOpen = true;
  }
</script>

<div class="today">
  <header class="page-head">
    <div>
      <p class="eyebrow">{formatDate(today, 'long')}</p>
      <h1>Heute</h1>
    </div>
    <div class="head-actions">
      <AiButton ref="heute" prompt="Was steht heute an?" />
      <button class="search-pill" type="button" on:click={openPalette}>
        <Icon name="search" size={15} />
        <span>Suchen</span>
        <kbd>⌘K</kbd>
      </button>
    </div>
  </header>

  {#if $backupReminder}
    <a class="backup-note" href="#/settings">
      <span class="dot" aria-hidden="true"></span>
      Backup fällig — kurz exportieren?
    </a>
  {/if}

  <div class="columns">
    <div class="main-col">
      <StartCard entry={$startHere} />

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

      <section class="block" aria-labelledby="deadlines-title">
        <div class="section-title">
          <h2 id="deadlines-title">Fristen</h2>
          <a href="#/calendar" class="quiet-link">Kalender</a>
        </div>
        <DeadlineStrip deadlines={$deadlines} />
      </section>

      <section class="block" aria-labelledby="notes-title">
        <div class="section-title">
          <h2 id="notes-title">Zuletzt bearbeitet</h2>
          <a href="#/notes" class="quiet-link">Alle Notizen</a>
        </div>
        {#if $recentNotes.length}
          <div class="notes-grid">
            {#each $recentNotes as note (note.id)}
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
    </div>

    <aside class="side-col">
      <section class="block" aria-labelledby="capture-title">
        <div class="section-title">
          <h2 id="capture-title">Erfassen</h2>
        </div>
        <div class="capture-grid">
          <button class="capture" type="button" on:click={() => openCapture('note')}>
            <Icon name="notes" />
            <span>Notiz</span>
          </button>
          <button class="capture" type="button" on:click={() => openCapture('photo')}>
            <Icon name="photo" />
            <span>Foto</span>
          </button>
          <button class="capture" type="button" on:click={() => openCapture('homework')}>
            <Icon name="homework" />
            <span>Hausaufgabe</span>
          </button>
        </div>
      </section>

      <section class="block" aria-labelledby="program-title">
        <div class="section-title">
          <h2 id="program-title">Programm</h2>
        </div>
        <div class="segmented" role="group" aria-label="Programm wählen">
          {#each programs as program (program.id)}
            <button
              class="seg"
              class:active={program.id === currentProgram}
              type="button"
              aria-pressed={program.id === currentProgram}
              on:click={() => updateSettings({ currentProgramId: program.id })}
            >
              {program.name}
            </button>
          {/each}
        </div>
        <div class="module-chips">
          {#each programModules as mod (mod.id)}
            <a class="chip" href="#/module/{mod.id}">
              <span class="dot" style:--dot={mod.accent} aria-hidden="true"></span>
              {mod.code || mod.title}
            </a>
          {/each}
          {#if programModules.length === 0}
            <a class="chip" href="#/modules">Modul erstellen</a>
          {/if}
        </div>
      </section>

      {#if upcoming}
        <section class="block" aria-labelledby="lesson-title">
          <div class="section-title">
            <h2 id="lesson-title">Nächste Lektion</h2>
          </div>
          <a class="lesson-card" href="#/calendar">
            <span class="lesson-day">{WEEKDAYS.find((d) => d.value === upcoming.lesson.dayOfWeek)?.short}</span>
            <span class="lesson-main">
              <strong>{lessonLabel($appState, upcoming.lesson)}</strong>
              <span class="muted">{formatTimeRange(upcoming.lesson.start, upcoming.lesson.end)}{#if upcoming.lesson.room} · {upcoming.lesson.room}{/if}</span>
            </span>
            <span class="lesson-date mono">{formatDate(upcoming.date, 'short')}</span>
          </a>
        </section>
      {/if}

      <section class="block" aria-labelledby="links-title">
        <div class="section-title">
          <h2 id="links-title">Links</h2>
          <a href="#/links" class="quiet-link">Mehr</a>
        </div>
        {#if shortcuts.length}
          <div class="link-list">
            {#each shortcuts.slice(0, 6) as link (link.id)}
              <a class="link-row" href={link.url} target="_blank" rel="noopener noreferrer">
                <Icon name={link.kind === 'youtube' ? 'focus' : link.kind === 'website' ? 'links' : 'file'} size={15} />
                <span>{link.label}</span>
              </a>
            {/each}
          </div>
        {:else}
          <p class="muted small">Noch keine Links. <a href="#/links">Hinzufügen</a></p>
        {/if}
      </section>
    </aside>
  </div>
</div>

<QuickCapture open={captureOpen} initialMode={captureMode} on:close={() => (captureOpen = false)} />

<style>
  .today {
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
  .eyebrow {
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    color: var(--ink-2);
  }
  h1 {
    font-size: clamp(1.9rem, 3.4vw, 2.4rem);
    font-weight: 600;
    letter-spacing: -0.035em;
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
  .columns {
    display: grid;
    gap: var(--space-6);
  }
  .main-col,
  .side-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }
  .block {
    min-width: 0;
  }
  .count {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .pad {
    padding: var(--space-3);
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
  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }
  .capture-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .capture {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 66px;
    padding: var(--space-2);
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--ink-2);
    font-size: 0.75rem;
    font-weight: 500;
  }
  .capture:hover {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }
  .segmented {
    display: flex;
    gap: 2px;
    padding: 3px;
    border: 0;
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .seg {
    flex: 1;
    min-height: 32px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 500;
  }
  .seg.active {
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
    box-shadow: var(--shadow-1);
  }
  .module-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: var(--space-3);
  }
  .chip {
    text-decoration: none;
  }
  .chip .dot {
    background: var(--dot);
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
    font-size: 0.75rem;
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
  @media (min-width: 1060px) {
    .columns {
      grid-template-columns: minmax(0, 1.9fr) minmax(280px, 1fr);
      align-items: start;
    }
    .side-col {
      position: sticky;
      top: var(--space-5);
    }
  }
</style>
