import { describe, expect, it } from 'vitest';
import {
  POMODORO_DEFAULTS,
  PHASE,
  STATUS,
  createWorkTimer,
  activeElapsedMs,
  remainingMs,
  progressPct,
  formatClock,
  pauseTimerState,
  resumeTimerState,
  tickPomodoro,
  startBreakState,
  startNextWork,
  recommendedBreakType,
  phaseLabel,
  roundLabel,
  normalizeTimerState,
  clampWorkMinutes,
} from '../src/lib/services/pomodoro.js';
import {
  MAX_SESSION_HISTORY,
  addPomodoroSession,
  summarizeSessions,
} from '../src/lib/services/store.js';

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;

describe('pomodoro state machine', () => {
  it('creates a running work timer', () => {
    const timer = createWorkTimer({ minutes: 25, now: T0 });
    expect(timer.phase).toBe(PHASE.work);
    expect(timer.status).toBe(STATUS.running);
    expect(timer.durationMs).toBe(25 * MINUTE);
    expect(remainingMs(timer, T0)).toBe(25 * MINUTE);
    expect(activeElapsedMs(timer, T0)).toBe(0);
    expect(progressPct(timer, T0)).toBe(0);
    expect(formatClock(25 * MINUTE)).toBe('25:00');
  });

  it('pauses and resumes without losing elapsed time', () => {
    const timer = createWorkTimer({ minutes: 25, now: T0 });
    const paused = pauseTimerState(timer, T0 + 5 * MINUTE);
    expect(paused.status).toBe(STATUS.paused);
    expect(remainingMs(paused, T0 + 20 * MINUTE)).toBe(20 * MINUTE);
    const resumed = resumeTimerState(paused, T0 + 20 * MINUTE);
    expect(resumed.status).toBe(STATUS.running);
    expect(remainingMs(resumed, T0 + 25 * MINUTE)).toBe(15 * MINUTE);
  });

  it('finishes a work round and counts the round', () => {
    const timer = createWorkTimer({ minutes: 25, now: T0 });
    const { state, event } = tickPomodoro(timer, T0 + 25 * MINUTE);
    expect(event).toBe('workDone');
    expect(state.status).toBe(STATUS.workDone);
    expect(state.completedRounds).toBe(1);
    expect(remainingMs(state, T0 + 25 * MINUTE)).toBe(0);
  });

  it('starts a break, finishes it and starts the next round', () => {
    const timer = createWorkTimer({ minutes: 25, now: T0 });
    const done = tickPomodoro(timer, T0 + 25 * MINUTE).state;
    const breakTimer = startBreakState(done, 'short', T0 + 26 * MINUTE);
    expect(breakTimer.phase).toBe(PHASE.shortBreak);
    expect(breakTimer.status).toBe(STATUS.running);
    expect(breakTimer.durationMs).toBe(POMODORO_DEFAULTS.shortBreakMinutes * MINUTE);

    const breakDone = tickPomodoro(breakTimer, T0 + 26 * MINUTE + 5 * MINUTE);
    expect(breakDone.event).toBe('breakDone');
    expect(breakDone.state.status).toBe(STATUS.breakDone);

    const next = startNextWork(breakDone.state, T0 + 40 * MINUTE);
    expect(next.phase).toBe(PHASE.work);
    expect(next.status).toBe(STATUS.running);
    expect(next.completedRounds).toBe(1);
  });

  it('recommends a long break every fourth round', () => {
    expect(recommendedBreakType({ completedRounds: 1 })).toBe('short');
    expect(recommendedBreakType({ completedRounds: 3 })).toBe('short');
    expect(recommendedBreakType({ completedRounds: 4 })).toBe('long');
    expect(recommendedBreakType({ completedRounds: 8 })).toBe('long');
  });

  it('labels phases and rounds', () => {
    const timer = createWorkTimer({ minutes: 25, now: T0 });
    expect(phaseLabel(timer)).toBe('Fokus');
    expect(roundLabel(timer)).toBe('Runde 1/4');
    expect(phaseLabel({ ...timer, phase: PHASE.longBreak })).toBe('Lange Pause');
    expect(phaseLabel({ ...timer, status: STATUS.workDone })).toBe('Fokus beendet');
  });

  it('clamps work minutes and normalizes stored state', () => {
    expect(clampWorkMinutes(0)).toBe(1);
    expect(clampWorkMinutes(999)).toBe(480);
    expect(clampWorkMinutes('30')).toBe(30);
    expect(normalizeTimerState(null)).toBeNull();
    expect(normalizeTimerState({ phase: 'nope' })).toBeNull();
    const normalized = normalizeTimerState({
      phase: 'work',
      status: 'running',
      durationMs: 1000,
      accumulatedMs: -5,
      runStartedAt: T0,
      completedRounds: 2.6,
      minutes: 25,
    });
    expect(normalized.status).toBe(STATUS.running);
    expect(normalized.durationMs).toBe(1000);
    expect(normalized.accumulatedMs).toBe(0);
    expect(normalized.completedRounds).toBe(3);
  });
});

describe('pomodoro history', () => {
  const session = (overrides) => ({
    id: String(Math.random()),
    startedAt: T0,
    durationMs: 25 * MINUTE,
    phase: PHASE.work,
    status: STATUS.workDone,
    ...overrides,
  });

  it('summarizes completed rounds, focus minutes and breaks', () => {
    const sessions = [
      session({ durationMs: 25 * MINUTE }),
      session({ durationMs: 20 * MINUTE }),
      session({ phase: PHASE.shortBreak, status: STATUS.breakDone, durationMs: 5 * MINUTE }),
      session({ phase: PHASE.longBreak, status: STATUS.breakDone, durationMs: 15 * MINUTE }),
      // Unfinished sessions must not inflate the numbers.
      session({ status: STATUS.paused }),
      session({ phase: PHASE.shortBreak, status: STATUS.running }),
    ];

    expect(summarizeSessions(sessions)).toEqual({
      workRounds: 2,
      focusMinutes: 45,
      breaks: 2,
      averageDuration: 23,
    });
  });

  it('returns zeroes for an empty history', () => {
    expect(summarizeSessions()).toEqual({
      workRounds: 0,
      focusMinutes: 0,
      breaks: 0,
      averageDuration: 0,
    });
  });

  it('prepends new sessions without mutating the old state and caps the list', () => {
    const original = { sessions: [session({ id: 'old' })], lastSessionId: 'old' };
    const next = addPomodoroSession(original, session({ id: 'new' }));

    expect(original.sessions).toHaveLength(1);
    expect(original.sessions[0].id).toBe('old');
    expect(next.sessions[0].id).toBe('new');
    expect(next.lastSessionId).toBe('new');

    const full = { sessions: Array.from({ length: MAX_SESSION_HISTORY }, (_, i) => session({ id: `s${i}` })) };
    const capped = addPomodoroSession(full, session({ id: 'newest' }));
    expect(capped.sessions).toHaveLength(MAX_SESSION_HISTORY);
    expect(capped.sessions[0].id).toBe('newest');
    expect(capped.sessions.at(-1).id).toBe(`s${MAX_SESSION_HISTORY - 2}`);
  });
});
