<script>
import { onMount, onDestroy } from 'svelte';
import { derived, writable } from 'svelte/store';
import { loadPomodoroHistoryState, getSessionStats, getTodaySessions, getLastWeekSessions } from '../services/store.js';
import { formatTimeRange } from '../data/dates.js';
import { WEEKDAYS } from '../data/dates.js';

import { createWorkTimer, tickPomodoro, STATUS, PHASE } from '../services/pomodoro.js';
import { initPomodoro, startPomodoro, pausePomodoro, resumePomodoro, skipBreak, getPomodoro, subscribePomodoro } from '../services/pomodoroEngine.js';

let isMounted = false;
let startTime = 0;
let sessionHistory = [];

onMount(() => {
  isMounted = true;
  // Initialize the pomodoro engine
  initPomodoro();
  // Load existing session history from storage
  const stored = loadPomodoroHistoryState();
  sessionHistory = stored.sessions || [];
});

onDestroy(() => {
  isMounted = false;
});

// Store for session history
const historyStore = writable({
  sessions: sessionHistory,
  lastSessionId: null
});

// Derived: current pomodoro state from the engine
const pomodoro = derived(
  getPomodoro(),
  (state) => state || null,
  { equality: (a, b) => a && b && a.id === b.id }
);

// Derived: session stats from history
const stats = derived(
  [historyStore],
  ([$historyStore]) => {
    const sessions = $historyStore.sessions || [];
    if (sessions.length === 0) return { total: 0, completedWorkMinutes: 0, completedBreaks: 0, averageDuration: 0 };
    const total = sessions.length;
    const completedWorkMinutes = sessions
      .filter((s) => s.phase === 'work' && s.status === 'workDone')
      .reduce((sum, s) => sum + (s.durationMs || 0), 0) / (60_000);
    const completedBreaks = sessions.filter((s) => s.phase === 'break' && s.status === 'breakDone').length;
    const averageDuration = total > 0 ? completedWorkMinutes / total : 0;
    return { total, completedWorkMinutes: Math.round(completedWorkMinutes), completedBreaks, averageDuration: Math.round(averageDuration) };
  }
);

const todayStats = derived(
  [historyStore],
  ([$historyStore]) => {
    const sessions = ($historyStore.sessions || []).filter((s) => new Date(s.startedAt).toDateString() === new Date().toDateString());
    return sessions;
  }
);

const lastWeekStats = derived(
  [historyStore],
  ([$historyStore]) => {
    const sessions = $historyStore.sessions || [];
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return sessions.filter((s) => s.startedAt >= weekAgo);
  }
);

// Helper: format remaining time as MM:SS
function formatRemaining($pomodoro) {
  if (!$pomodoro || $pomodoro.status !== 'running') return '';
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, $pomodoro.durationMs - elapsed);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Helper: format session duration
function formatSessionDuration(ms) {
  if (!ms) return '';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins} min ${secs} sec`;
}

// Start pomodoro
function startNewPomodoro(minutes = 25) {
  const timer = createWorkTimer({ minutes });
  startTime = Date.now();
  // Store the initial session
  sessionHistory.unshift({
    id: Date.now().toString(),
    startedAt: Date.now(),
    durationMs: timer.durationMs,
    phase: PHASE.work,
    status: STATUS.running,
    completedRounds: 0,
    minutes: timer.minutes,
    timer
  });
  // Save history
  historyStore.set({ sessions: sessionHistory, lastSessionId: sessionHistory[0].id });
  startPomodoro({ minutes });
}

// Pause pomodoro
function pausePomodoroHandler() {
  pausePomodoro();
}

// Resume pomodoro
function resumePomodoroHandler() {
  resumePomodoro();
}

// Skip break
function skipBreakHandler() {
  skipBreak();
  // Mark break as done in history
  if (pomodoro.status === 'breakDone') {
    sessionHistory.unshift({
      id: Date.now().toString(),
      startedAt: Date.now(),
      durationMs: pomodoro.durationMs,
      phase: 'break',
      status: 'breakDone',
      completedRounds: pomodoro.completedRounds,
      minutes: pomodoro.minutes
    });
    historyStore.set({ sessions: sessionHistory, lastSessionId: sessionHistory[0].id });
  }
}

// Subscribe to pomodoro changes for session tracking
subscribePomodoro((detail) => {
  if (!isMounted) return;
  
  const { state, event } = detail;
  if (event === 'workDone' || event === 'breakDone') {
    // Save the completed session
    const session = {
      id: Date.now().toString(),
      startedAt: state.startedAt || Date.now(),
      durationMs: state.durationMs,
      phase: state.phase,
      status: state.status,
      completedRounds: state.completedRounds,
      minutes: state.minutes
    };
    sessionHistory.unshift(session);
    // Keep only last 50 sessions
    if (sessionHistory.length > 50) sessionHistory.pop();
    historyStore.set({ sessions: sessionHistory, lastSessionId: sessionHistory[0]?.id });
    // Persist to storage
    const historyJson = JSON.stringify({ sessions: sessionHistory });
    try {
      // @ts-ignore
      activeAdapter.setItem('studyhub_pomodoro_history_v1', historyJson);
    } catch (e) {
      console.error('Failed to save pomodoro history:', e);
    }
  }
});
</script>

<div class="pomodoro-stats" aria-label="Pomodoro Statistiken">

  {#if !isMounted}
    <p>Seite laden...</p>
  {:else if !pomodoro}
    <p class="muted small">Pomodoro-Timer nicht gestartet.</p>
    <button class="btn btn-primary">Fokus starten</button>
  {:else}
    <div class="pomodoro-header">
      <h2>Pomodoro Fokus</h2>
      <span class="phase-{pomodoro.phase}">{pomodoro.phase === 'work' ? 'Fokus' : pomodoro.phase === 'longBreak' ? 'Lange Pause' : 'Kurze Pause'}</span>
    </div>

    <div class="pomodoro-timer">
      <div class="timer-display">
        {formatRemaining(pomodoro)}
      </div>
      <div class="timer-phase">
        {pomodoro.status === 'running' ? 'Fokus läuft' : pomodoro.status === 'workDone' ? 'Fokus beendet' : pomodoro.status === 'breakDone' ? 'Pause beendet' : ''}
      </div>
    </div>

    <!-- Statistics -->
    <div class="pomodoro-stats-section">
      <h3>Statistik</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">{stats.total}</div>
          <div class="stat-label">Sitzungen gesamt</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{stats.completedWorkMinutes} min</div>
          <div class="stat-label">Fokuszeit gesamt</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{stats.completedBreaks}</div>
          <div class="stat-label">Pausen abgeschlossen</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{stats.averageDuration} min Ø</div>
          <div class="stat-label">Ø Dauer pro Sitzung</div>
        </div>
      </div>
    </div>

    <!-- Today's Sessions -->
    {#if todayStats.length > 0}
      <div class="pomodoro-section">
        <h3>Heute ({todayStats.length} Sitzung{ todayStats.length > 1 ? 'en' : '' })</h3>
        <ul class="session-list">
          {#each todayStats as session}
            <li class="session-item">
              <div class="session-info">
                <span class="session-phase">{session.phase === 'work' ? 'Fokus' : 'Pause'}</span>
                <span class="session-duration">{formatSessionDuration(session.durationMs)}</span>
              </div>
              <div class="session-meta">
                <span class="session-rounds">Runde {session.completedRounds}</span>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="muted small">Heute noch keine Sitzungen.</p>
    {/if}

    <!-- Last Week -->
    {#if lastWeekStats.length > 0}
      <div class="pomodoro-section">
        <h3>Letzte Woche ({lastWeekStats.length} Sitzung{ lastWeekStats.length > 1 ? 'en' : '' })</h3>
        <ul class="session-list">
          {#each lastWeekStats as session}
            <li class="session-item">
              <div class="session-info">
                <span class="session-phase">{session.phase === 'work' ? 'Fokus' : 'Pause'}</span>
                <span class="session-duration">{formatSessionDuration(session.durationMs)}</span>
              </div>
              <div class="session-meta">
                <span class="session-rounds">Runde {session.completedRounds}</span>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="muted small">Letzte Woche noch keine Sitzungen.</p>
    {/if}

    <!-- Controls -->
    <div class="pomodoro-controls">
      <button class="btn {pomodoro.status === 'running' ? 'btn-secondary' : 'btn-primary'}" on:click="{() => import('../services/pomodoroEngine.js').then(m => m.startPomodoro())}">
        {pomodoro.status === 'running' ? 'Pause' : 'Fokus starten'}
      </button>
      {#if pomodoro.status === 'running'}
        <button class="btn btn-ghost" on:click="{() => import('../services/pomodoroEngine.js').then(m => m.pausePomodoro())}">Pause</button>
        <button class="btn btn-ghost" on:click="{() => import('../services/pomodoroEngine.js').then(m => m.resumePomodoro())}">Fortsetzen</button>
      {:else if pomodoro.status === 'paused'}
        <button class="btn btn-ghost" on:click="{() => import('../services/pomodoroEngine.js').then(m => m.resumePomodoro())}">Fortsetzen</button>
      {/if}
      <button class="btn btn-ghost" on:click="{() => import('../services/pomodoroEngine.js').then(m => m.skipBreak())}">Pause überspringen</button>
    </div>
  {/if}
</div>

<style>
.pomodoro-stats {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
}

.pomodoro-header {
  text-align: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
  min-height: 48px;
}

.pomodoro-header h2 {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--accent-indigo);
  margin: 0;
}

.pomodoro-header .phase-work,
.pomodoro-header .phase-break {
  display: inline-block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-left: 0.5rem;
}

.pomodoro-timer {
  text-align: center;
  margin: 2rem 0;
}

.timer-display {
  font-family: var(--font-display);
  font-size: 3rem;
  color: var(--accent-indigo);
  margin: 1rem 0;
}

.timer-phase {
  font-size: 0.875rem;
  color: var(--ink-2);
  margin-top: 0.5rem;
}

.pomodoro-stats-section {
  margin: 2rem 0;
}

.pomodoro-stats-section h3 {
  font-size: 1.125rem;
  color: var(--accent-indigo);
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.stat-item {
  background: var(--card-background);
  padding: 1rem;
  border-radius: var(--radius);
  text-align: center;
  border: 1px solid var(--border-color);
}

.stat-value {
  font-size: 1.75rem;
  font-weight: bold;
  color: var(--accent-indigo);
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--ink-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pomodoro-section {
  margin: 2rem 0;
}

.pomodoro-section h3 {
  font-size: 1.125rem;
  color: var(--accent-indigo);
  margin-bottom: 0.75rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--border-color);
}

.session-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.session-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  padding: 0.5rem;
  background: var(--card-background);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  margin-bottom: 0.5rem;
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.session-phase {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent-indigo);
}

.session-duration {
  font-size: 0.875rem;
  color: var(--ink-3);
}

.session-meta {
  font-size: 0.7rem;
  color: var(--ink-3);
  text-align: right;
  white-space: nowrap;
}

.pomodoro-controls {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.btn {
  font-family: inherit;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  background: var(--button-background);
  color: var(--button-foreground);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  --button-background: var(--accent-indigo);
  --button-foreground: var(--ink-0);
}

.btn-secondary {
  --button-background: var(--ink-200);
  --button-foreground: var(--ink-800);
}

.btn-ghost {
  --button-background: transparent;
  --button-foreground: var(--accent-indigo);
  border-color: var(--accent-indigo);
}

.btn:hover {
  opacity: 0.9;
}

.muted {
  color: var(--ink-3);
}

.small {
  font-size: 0.75rem;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .timer-display {
    animation: none;
  }
}
</style>