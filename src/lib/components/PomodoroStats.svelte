<script>
  import { onMount } from 'svelte';
  import { subscribePomodoro } from '../services/pomodoroEngine.js';
  import {
    loadPomodoroHistoryState,
    getTodaySessions,
    getLastWeekSessions,
    summarizeSessions,
    clearPomodoroHistory,
  } from '../services/store.js';

  let history = { sessions: [] };
  let visibleCount = 5;

  onMount(() => {
    refresh();
    return subscribePomodoro((detail) => {
      if (['workDone', 'breakDone', 'break-skip', 'init', 'dismiss'].includes(detail.reason)) refresh();
    });
  });

  function refresh() {
    history = loadPomodoroHistoryState();
  }

  $: sessions = history.sessions || [];
  $: today = getTodaySessions(history);
  $: week = getLastWeekSessions(history);
  $: todayStats = summarizeSessions(today);
  $: weekStats = summarizeSessions(week);
  $: recent = week.slice(0, visibleCount);
  $: hasOlder = week.length > visibleCount;

  function phaseName(session) {
    if (session.phase === 'work') return 'Fokus';
    if (session.phase === 'longBreak') return 'Lange Pause';
    if (session.phase === 'shortBreak') return 'Kurze Pause';
    return 'Pause';
  }

  function timeOfDay(timestamp) {
    return new Date(timestamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }

  function minutesLabel(session) {
    if (session.phase === 'work') {
      const minutes = Number(session.minutes) || Math.round((Number(session.durationMs) || 0) / 60_000);
      return `${Math.max(1, minutes)} Min`;
    }
    const minutes = Math.max(1, Math.round((Number(session.durationMs) || 0) / 60_000));
    return `${minutes} Min`;
  }

  function clearAll() {
    if (!sessions.length) return;
    if (!window.confirm('Den Pomodoro-Verlauf wirklich löschen?')) return;
    clearPomodoroHistory();
    refresh();
  }
</script>

<section class="stats card" aria-labelledby="pomodoro-stats-title">
  <div class="stats-head">
    <h2 id="pomodoro-stats-title">Verlauf</h2>
    {#if sessions.length}
      <button class="clear" type="button" on:click={clearAll}>Löschen</button>
    {/if}
  </div>

  <div class="today-grid">
    <div class="stat">
      <span class="value">{todayStats.workRounds}</span>
      <span class="label">Runden heute</span>
    </div>
    <div class="stat">
      <span class="value">{todayStats.focusMinutes}<span class="unit">Min</span></span>
      <span class="label">Fokus heute</span>
    </div>
    <div class="stat">
      <span class="value">{todayStats.breaks}</span>
      <span class="label">Pausen heute</span>
    </div>
  </div>

  {#if week.length}
    <p class="week-line">
      Letzte 7 Tage: <strong>{weekStats.workRounds}</strong>
      {weekStats.workRounds === 1 ? 'Runde' : 'Runden'} ·
      <strong>{weekStats.focusMinutes}</strong> Min Fokus
    </p>

    <ul class="session-list">
      {#each recent as session (session.id)}
        <li class="session" class:is-break={session.phase !== 'work'}>
          <span class="phase">{phaseName(session)}</span>
          <span class="session-time">{timeOfDay(session.startedAt)}</span>
          <span class="duration">{minutesLabel(session)}</span>
        </li>
      {/each}
    </ul>

    {#if hasOlder}
      <button class="more" type="button" on:click={() => (visibleCount += 5)}>Mehr anzeigen</button>
    {/if}
  {:else}
    <p class="empty">Noch keine abgeschlossene Runde. Der Verlauf füllt sich, sobald eine Fokuszeit endet.</p>
  {/if}
</section>

<style>
  .stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
  }
  .stats-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .stats-head h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .clear {
    border: 0;
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .clear:hover {
    color: var(--danger);
  }
  .today-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3);
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .value {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    margin-left: 3px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ink-3);
  }
  .label {
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .week-line {
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .week-line strong {
    color: var(--ink);
    font-weight: 600;
  }
  .session-list {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--rule);
  }
  .session {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 40px;
    border-bottom: 1px solid var(--rule);
    font-size: var(--text-sm);
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .phase::before {
    content: '';
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--accent);
  }
  .session.is-break .phase::before {
    background: var(--ok);
  }
  .session-time {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--ink-2);
  }
  .duration {
    min-width: 52px;
    text-align: right;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .more {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .more:hover {
    color: var(--ink);
  }
  .empty {
    color: var(--ink-3);
    font-size: var(--text-sm);
  }
  @media (max-width: 520px) {
    .stats {
      padding: var(--space-4);
    }
    .value {
      font-size: 1.25rem;
    }
  }
</style>
