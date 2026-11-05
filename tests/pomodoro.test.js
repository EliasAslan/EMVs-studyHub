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
