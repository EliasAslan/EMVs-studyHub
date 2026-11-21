<script>
  import { onMount } from 'svelte';
  import {
    appState,
    todayChecklist,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    backupReminder,
    recentNotes,
    moduleTitle,
  } from '../stores/app.js';
  import { openPalette } from '../stores/ui.js';
  import { navigate } from '../router.js';
  import { subscribePomodoro, getPomodoroPrefs, startPomodoro, STATUS, PHASE, remainingMs } from '../services/pomodoroEngine.js';
  import { formatClock, progressPct, roundLabel } from '../services/pomodoro.js';
  import {
    todayKey,
    formatDate,
    formatTimeRange,
    relativeDayLabel,
    WEEKDAYS,
  } from '../data/dates.js';
  import { nextLesson, lessonLabel } from '../data/schedule.js';
  import Checklist from '../components/Checklist.svelte';
  import NoteCard from '../components/NoteCard.svelte';
  import QuickCapture from '../components/QuickCapture.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  let captureOpen = false;
  let captureMode = 'note';
  let timerState = null;
  let timerPrefs = { workMinutes: 25 };
  let timerNow = Date.now();
  let timerTick = 0;

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

  $: today = todayKey();
  $: timerClock = timerState ? formatClock(remainingMs(timerState, timerNow)) : formatClock((Number(timerPrefs.workMinutes) || 25) * 60000);
  $: timerRound = timerState ? (roundLabel(timerState) || (timerState.phase === PHASE.work ? 'Fokus-Runde' : 'Pause')) : `${Number(timerPrefs.workMinutes) || 25} min Fokus · 5 min Pause`;
  $: timerProgress = timerState ? progressPct(timerState, timerNow) : 0;
  $: timerStatus = !timerState ? 'Bereit für eine fokussierte Runde?' : timerState.status === STATUS.paused ? 'Pausiert — mach weiter, wenn du bereit bist.' : timerState.status === STATUS.workDone ? 'Stark gemacht. Zeit für eine Pause.' : timerState.status === STATUS.breakDone ? 'Pause vorbei. Bereit für die nächste Runde?' : timerState.phase === PHASE.work ? 'Du bist gerade in deiner Fokusrunde.' : 'Deine Pause läuft gerade.';
  $: timerActionLabel = !timerState ? 'Fokus starten' : timerState.status === STATUS.paused ? 'Timer fortsetzen' : timerState.status === STATUS.workDone ? 'Pause auswählen' : timerState.status === STATUS.breakDone ? 'Nächste Runde' : timerState.phase === PHASE.work ? 'Weiter fokussieren' : 'Pause fortsetzen';
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

  onMount(() => {
    timerPrefs = getPomodoroPrefs();
    const unsubscribe = subscribePomodoro(({ state, prefs }) => {
      timerState = state;
      timerPrefs = prefs;
    });
    const interval = setInterval(() => {
      timerTick += 1;
      timerNow = Date.now();
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  });

  $: if (timerTick >= 0) timerNow = Date.now();

  function goToFocus() {
    navigate('/focus');
  }

  function startFromHome() {
    if (!timerState) {
      startPomodoro({ minutes: Number(timerPrefs.workMinutes) || 25 });
    }
    navigate('/focus');
  }

  function openCapture(mode) {
    captureMode = mode;
    captureOpen = true;
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

  <section class="focus-hero" aria-label="Fokus-Timer">
    <div class="focus-copy">
      <span class="focus-kicker"><Icon name="focus" size={15} /> DEIN FOKUS</span>
      <h2>{timerState?.phase === PHASE.work ? 'Eine Sache nach der anderen.' : 'Mach Raum für konzentriertes Lernen.'}</h2>
      <p>{timerStatus}</p>
      <div class="focus-meta">
        <span>{timerRound}</span>
        {#if timerState?.completedRounds}
          <span class="meta-dot">·</span><span>{timerState.completedRounds} {timerState.completedRounds === 1 ? 'Runde geschafft' : 'Runden geschafft'}</span>
        {/if}
      </div>
      <button class="btn focus-cta" type="button" on:click={startFromHome} title="Zum Pomodoro-Timer">
        {#if timerState}<span class="hero-clock mono">{timerClock}</span>{/if}
        {timerActionLabel}<Icon name="chevronRight" size={16} />
      </button>
    </div>
    <button class="focus-orbit" type="button" on:click={goToFocus} aria-label="Pomodoro-Timer öffnen" title="Pomodoro-Timer öffnen">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="orbit-track" cx="50" cy="50" r="43" />
        <circle class="orbit-progress" cx="50" cy="50" r="43" stroke-dasharray="270.18" stroke-dashoffset={270.18 * (1 - timerProgress / 100)} />
      </svg>
      <span class="orbit-time mono">{timerClock}</span>
      <span class="orbit-caption">{timerState?.phase === PHASE.work ? 'FOKUS' : timerState ? 'PAUSE' : 'START'}</span>
    </button>
    <a class="focus-more" href="#/focus" title="Timer, Pausen und Verlauf öffnen">Pomodoro öffnen <Icon name="arrowUpRight" size={14} /></a>
  </section>

  <section class="block" aria-labelledby="checklist-title">
    <div class="section-title">
      <h2 id="checklist-title">Aufgaben &amp; Checkliste</h2>
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
    gap: clamp(var(--space-5), 3vw, var(--space-6));
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
  .focus-hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
    min-height: 214px;
    padding: clamp(var(--space-5), 4vw, var(--space-7));
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--rule));
    border-radius: 20px;
    background: radial-gradient(ellipse at 90% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 48%), linear-gradient(125deg, var(--surface), color-mix(in srgb, var(--accent-soft) 60%, var(--surface)));
    box-shadow: var(--shadow-1);
  }
  .focus-copy { position: relative; z-index: 1; min-width: 0; }
  .focus-kicker { display: inline-flex; align-items: center; gap: 7px; margin-bottom: var(--space-2); color: var(--accent-strong); font-size: 10px; font-weight: 800; letter-spacing: .12em; }
  .focus-copy h2 { max-width: 28ch; font-family: var(--font-read); font-size: clamp(1.45rem, 3vw, 2rem); letter-spacing: -.025em; }
  .focus-copy p { margin-top: var(--space-2); color: var(--ink-2); font-size: var(--text-sm); }
  .focus-meta { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; margin-top: var(--space-3); color: var(--ink-3); font-size: var(--text-xs); }
  .focus-cta { margin-top: var(--space-4); min-height: 44px; border-radius: var(--radius-2); background: var(--accent-strong); border-color: var(--accent-strong); color: #fff; }
  .focus-cta:hover { background: var(--accent); border-color: var(--accent); }
  .hero-clock { padding-right: var(--space-2); border-right: 1px solid rgb(255 255 255 / 35%); font-weight: 700; }
  .focus-orbit { position: relative; display: grid; place-items: center; width: clamp(92px, 14vw, 142px); aspect-ratio: 1; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--ink); transition: transform var(--motion); }
  .focus-orbit:hover { transform: scale(1.04); }
  .focus-orbit svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
  .orbit-track, .orbit-progress { fill: none; stroke-width: 3; }
  .orbit-track { stroke: color-mix(in srgb, var(--accent) 18%, var(--rule)); }
  .orbit-progress { stroke: var(--accent); stroke-linecap: round; transition: stroke-dashoffset 900ms linear; }
  .orbit-time { font-size: clamp(1rem, 2vw, 1.35rem); font-weight: 700; }
  .orbit-caption { position: absolute; top: 62%; color: var(--ink-3); font-size: 8px; font-weight: 800; letter-spacing: .12em; }
  .focus-more { position: absolute; right: var(--space-4); bottom: var(--space-3); display: inline-flex; align-items: center; gap: 4px; color: var(--ink-3); font-size: 11px; text-decoration: none; }
  .focus-more:hover { color: var(--accent-strong); }
  @media (max-width: 480px) { .focus-hero { grid-template-columns: minmax(0, 1fr) 76px; padding: var(--space-4); } .focus-orbit { width: 76px; } .orbit-time { font-size: .9rem; } .orbit-caption { font-size: 7px; } .focus-copy h2 { font-size: 1.35rem; } }
  @media (prefers-reduced-motion: reduce) { .focus-orbit, .orbit-progress { transition: none; } }
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
  .exam-line {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--surface);
    border-left: 3px solid var(--warn);
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
    background: var(--accent-soft);
    color: var(--accent-strong);
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
