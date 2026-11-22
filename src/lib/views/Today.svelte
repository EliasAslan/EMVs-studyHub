<script>
  import { onMount } from 'svelte';
  import {
    appState,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    toggleHomework,
    backupReminder,
    recentNotes,
    moduleTitle,
  } from '../stores/app.js';
  import { openPalette } from '../stores/ui.js';
  import { navigate } from '../router.js';
  import {
    subscribePomodoro,
    getPomodoroPrefs,
    startPomodoro,
    resumePomodoro,
    startNextRound,
    POMODORO_DEFAULTS,
    STATUS,
    PHASE,
    remainingMs,
  } from '../services/pomodoroEngine.js';
  import { formatClock, progressPct, roundLabel } from '../services/pomodoro.js';
  import { pickStartHere } from '../data/startHere.js';
  import { checklistForDay } from '../data/checklist.js';
  import { now as clockNow } from '../stores/clock.js';
  import { toast } from '../stores/toast.js';
  import { preferences } from '../services/appearance.js';
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

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

  $: dayNow = new Date($clockNow);
  $: today = todayKey(dayNow);
  $: timerClock = timerState ? formatClock(remainingMs(timerState, timerNow)) : formatClock((Number(timerPrefs.workMinutes) || 25) * 60000);
  $: timerRound = timerState ? (roundLabel(timerState) || (timerState.phase === PHASE.work ? 'Fokus-Runde' : 'Pause')) : `${Number(timerPrefs.workMinutes) || 25} min Fokus · ${POMODORO_DEFAULTS.shortBreakMinutes} min Pause`;
  $: timerProgress = timerState ? progressPct(timerState, timerNow) : 0;
  $: timerHeadline = !timerState ? 'Fokuszeit' : timerState.status === STATUS.paused ? 'Pausiert' : timerState.status === STATUS.workDone ? 'Runde geschafft' : timerState.status === STATUS.breakDone ? 'Pause vorbei' : timerState.phase === PHASE.work ? 'Fokus läuft' : 'Pause läuft';
  $: timerStatus = !timerState ? 'Bereit für eine fokussierte Runde?' : timerState.status === STATUS.paused ? 'Mach weiter, wenn du bereit bist.' : timerState.status === STATUS.workDone ? 'Stark gemacht. Zeit für eine Pause.' : timerState.status === STATUS.breakDone ? 'Bereit für die nächste Runde?' : timerState.phase === PHASE.work ? 'Du bist gerade in deiner Fokusrunde.' : 'Deine Pause läuft gerade.';
  $: timerActionLabel = !timerState ? 'Fokus starten' : timerState.status === STATUS.paused ? 'Fortsetzen' : timerState.status === STATUS.workDone ? 'Pause wählen' : timerState.status === STATUS.breakDone ? 'Nächste Runde' : timerState.phase === PHASE.work ? 'Öffnen' : 'Pause öffnen';
  $: nextExam =
    ($appState.exams || [])
      .filter((exam) => exam.date && exam.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] || null;
  $: upcoming = nextLesson($appState, dayNow);
  $: checklist = checklistForDay($appState, dayNow, $preferences.checklistHorizon, $preferences.includeOverdue);
  $: remaining = checklist.items.filter((item) => !item.checked).length;
  $: hero = pickStartHere($appState, dayNow);
  $: recent = $recentNotes.slice(0, 3);

  $: currentProgram = $appState.settings.currentProgramId;
  $: programModules = ($appState.modules || []).filter((m) => m.programId === currentProgram);
  $: shortcuts = ($appState.links || [])
    .filter((link) => !link.moduleId || programModules.some((m) => m.id === link.moduleId))
    .slice(0, 2);

  onMount(() => {
    timerPrefs = getPomodoroPrefs();
    return subscribePomodoro(({ state, prefs, reason }) => {
      timerState = state;
      timerPrefs = prefs;
      if (reason === 'tick') timerNow = Date.now();
    });
  });

  function handleTimerAction() {
    if (!timerState) {
      startPomodoro({ minutes: Number(timerPrefs.workMinutes) || 25 });
    } else if (timerState.status === STATUS.paused) {
      resumePomodoro();
    } else if (timerState.status === STATUS.breakDone) {
      startNextRound();
    }
    navigate('/focus');
  }

  function completeHero() {
    if (!hero || hero.kind !== 'homework') return;
    toggleHomework(hero.item.id);
    toast('Erledigt');
  }

  function heroReasonLabel(pick) {
    if (!pick) return '';
    if (pick.kind === 'exam') {
      if (pick.days === 0) return 'Prüfung heute';
      if (pick.days === 1) return 'Prüfung morgen';
      return `Prüfung in ${pick.days} Tagen`;
    }
    if (pick.reason === 'overdue') return `${Math.abs(pick.days)} Tage überfällig`;
    if (pick.reason === 'today') return 'Heute fällig';
    if (pick.days === 1) return 'Morgen fällig';
    if (pick.days === 0) return 'Heute fällig';
    return `Fällig in ${pick.days} Tagen`;
  }

  function heroDueLabel(pick) {
    if (!pick) return '';
    if (pick.kind === 'exam') return formatDate(pick.item.date, 'short');
    return pick.item.dueDate ? formatDate(pick.item.dueDate, 'short') : 'Ohne Datum';
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

  {#if hero}
    <section class="hero card" class:overdue={hero.reason === 'overdue'} aria-labelledby="hero-title">
      <div class="hero-copy">
        <span class="hero-kind">{hero.kind === 'exam' ? 'Nächste Prüfung' : hero.reason === 'overdue' ? 'Überfällig' : 'Nächste Aufgabe'}</span>
        <h2 id="hero-title">{hero.item.title}</h2>
        <span class="hero-meta">
          {#if hero.item.moduleId}{moduleTitle($appState, hero.item.moduleId)} · {/if}
          {heroDueLabel(hero)} · <strong>{heroReasonLabel(hero)}</strong>
        </span>
      </div>
      <div class="hero-actions">
        {#if hero.kind === 'homework'}
          <button class="btn btn-primary" type="button" on:click={completeHero}>Erledigen</button>
          <a class="btn btn-ghost" href="#/homework">Öffnen</a>
        {:else}
          <a class="btn btn-primary" href="#/exams">Prüfung öffnen</a>
        {/if}
      </div>
    </section>
  {/if}

  {#if nextExam && (!hero || hero.kind !== 'exam' || hero.item.id !== nextExam.id)}
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

  <section class="focus-compact" aria-label="Fokus-Timer">
    <div class="focus-compact-copy">
      <strong>{timerHeadline}</strong>
      <span>{timerState ? timerStatus : timerRound}</span>
    </div>
    <span class="focus-compact-clock mono">{timerClock}</span>
    <button class="focus-compact-action" type="button" on:click={handleTimerAction}>
      {timerActionLabel} <Icon name="chevronRight" size={15} />
    </button>
    {#if timerState}
      <span class="focus-compact-track" aria-hidden="true">
        <span style={`transform: scaleX(${Math.max(0, Math.min(1, timerProgress / 100))})`}></span>
      </span>
    {/if}
  </section>

  <section class="block" aria-labelledby="checklist-title">
    <div class="section-title">
      <h2 id="checklist-title">Aufgaben</h2>
      <span class="count" aria-live="polite">{remaining === 0 ? 'alles erledigt' : `${remaining} offen`}</span>
    </div>
    <div class="card pad">
      <Checklist
        items={checklist.items}
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
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-left: 3px solid var(--accent);
  }
  .hero.overdue {
    border-left-color: var(--warn);
  }
  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .hero-kind {
    color: var(--ink-3);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .hero h2 {
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .hero-meta {
    color: var(--ink-2);
    font-size: var(--text-xs);
  }
  .hero-meta strong {
    color: var(--warn);
    font-weight: 600;
  }
  .hero-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
  }
  @media (max-width: 600px) {
    .hero {
      align-items: flex-start;
      flex-direction: column;
      padding: var(--space-4);
    }
    .hero-actions {
      width: 100%;
    }
    .hero-actions .btn {
      flex: 1;
    }
  }
  .focus-compact {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: min(100%, 720px);
    padding: var(--space-3) var(--space-4);
    border-block: 1px solid var(--rule);
    color: var(--ink);
  }
  .focus-compact-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:2px; }
  .focus-compact-copy strong { font-size:var(--text-sm); font-weight:650; }
  .focus-compact-copy span { color:var(--ink-3); font-size:var(--text-xs); line-height:1.3; }
  .focus-compact-clock { color:var(--accent-strong); font-size:var(--text-lg); font-weight:650; }
  .focus-compact-action { display:inline-flex; align-items:center; gap:4px; min-height:40px; padding:0 var(--space-2); border:0; border-radius:var(--radius-1); background:transparent; color:var(--accent-strong); font-size:var(--text-sm); font-weight:600; }
  .focus-compact-action:hover { background:var(--accent-soft); }
  .focus-compact-track {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 2px;
    overflow: hidden;
    background: var(--rule);
  }
  .focus-compact-track span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left center;
    transition: transform 900ms linear;
  }
  @media (max-width: 480px) {
    .focus-compact { gap:var(--space-2); padding-inline:var(--space-2); }
    .focus-compact-clock { font-size:var(--text-base); }
    .focus-compact-action { font-size:var(--text-xs); }
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
    border-left-color: var(--warn);
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
    min-height: 44px;
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
