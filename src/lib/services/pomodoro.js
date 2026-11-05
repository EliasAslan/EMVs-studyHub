/**
 * Pomodoro state machine — pure, DOM-free, storage-free.
 * One timer, manual pause/resume, no task link, no session records.
 */

const MINUTE = 60_000;

export const POMODORO_DEFAULTS = Object.freeze({
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
});

export const PHASE = Object.freeze({
  work: 'work',
  shortBreak: 'shortBreak',
  longBreak: 'longBreak',
});

export const STATUS = Object.freeze({
  running: 'running',
  paused: 'paused',
  workDone: 'workDone',
  breakDone: 'breakDone',
});

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampWorkMinutes(value) {
  const n = num(value, POMODORO_DEFAULTS.workMinutes);
  return Math.min(480, Math.max(1, Math.round(n)));
}

function breakMinutes(type) {
  return type === 'long' ? POMODORO_DEFAULTS.longBreakMinutes : POMODORO_DEFAULTS.shortBreakMinutes;
}

export function createWorkTimer({ minutes = POMODORO_DEFAULTS.workMinutes, completedRounds = 0, now = Date.now() } = {}) {
  const workMinutes = clampWorkMinutes(minutes);
  return {
    version: 3,
    phase: PHASE.work,
    status: STATUS.running,
    durationMs: workMinutes * MINUTE,
    accumulatedMs: 0,
    runStartedAt: now,
    startedAt: now,
    completedRounds: Math.max(0, Math.round(num(completedRounds))),
    minutes: workMinutes,
    updatedAt: now,
  };
}

export function activeElapsedMs(state, now = Date.now()) {
  if (!state) return 0;
  const accumulated = Math.max(0, num(state.accumulatedMs));
  const hasRunStart =
    state.runStartedAt !== null && state.runStartedAt !== undefined && Number.isFinite(Number(state.runStartedAt));
  const running = state.status === STATUS.running && hasRunStart;
  return Math.max(0, accumulated + (running ? Math.max(0, now - Number(state.runStartedAt)) : 0));
}

export function remainingMs(state, now = Date.now()) {
  if (!state) return 0;
  return Math.max(0, num(state.durationMs) - activeElapsedMs(state, now));
}

export function progressPct(state, now = Date.now()) {
  const total = num(state?.durationMs);
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, (1 - remainingMs(state, now) / total) * 100));
}

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(num(ms) / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function pauseTimerState(state, now = Date.now()) {
  if (!state || state.status !== STATUS.running) return state;
  return {
    ...state,
    accumulatedMs: activeElapsedMs(state, now),
    runStartedAt: null,
    status: STATUS.paused,
    updatedAt: now,
  };
}

export function resumeTimerState(state, now = Date.now()) {
  if (!state || state.status !== STATUS.paused) return state;
  return { ...state, runStartedAt: now, status: STATUS.running, updatedAt: now };
}

export function tickPomodoro(state, now = Date.now()) {
  if (!state || state.status !== STATUS.running) return { state, event: null };
  if (remainingMs(state, now) > 0) return { state, event: null };
  if (state.phase === PHASE.work) {
    return {
      state: {
        ...state,
        status: STATUS.workDone,
        accumulatedMs: num(state.durationMs),
        runStartedAt: null,
        completedRounds: Math.max(0, Math.round(num(state.completedRounds))) + 1,
        updatedAt: now,
      },
      event: 'workDone',
    };
  }
  return {
    state: {
      ...state,
      status: STATUS.breakDone,
      accumulatedMs: num(state.durationMs),
      runStartedAt: null,
      updatedAt: now,
    },
    event: 'breakDone',
  };
}

export function startBreakState(state, type, now = Date.now()) {
  if (!state) return state;
  if (state.status !== STATUS.workDone && state.status !== STATUS.breakDone) return state;
  const kind = type === 'long' ? 'long' : 'short';
  return {
    ...state,
    phase: kind === 'long' ? PHASE.longBreak : PHASE.shortBreak,
    status: STATUS.running,
    durationMs: breakMinutes(kind) * MINUTE,
    accumulatedMs: 0,
    runStartedAt: now,
    startedAt: now,
    lastBreak: kind,
    updatedAt: now,
  };
}

export function startNextWork(state, now = Date.now()) {
  if (!state) return state;
  if (state.status !== STATUS.workDone && state.status !== STATUS.breakDone) return state;
  const minutes = clampWorkMinutes(state.minutes);
  return {
    ...state,
    phase: PHASE.work,
    status: STATUS.running,
    durationMs: minutes * MINUTE,
    accumulatedMs: 0,
    runStartedAt: now,
    startedAt: now,
    updatedAt: now,
  };
}

export function recommendedBreakType(state) {
  if (!state) return 'short';
  const rounds = Math.max(0, Math.round(num(state.completedRounds)));
  return rounds > 0 && rounds % POMODORO_DEFAULTS.roundsBeforeLongBreak === 0 ? 'long' : 'short';
}

export function phaseLabel(state) {
  if (!state) return '';
  if (state.phase === PHASE.work) return state.status === STATUS.workDone ? 'Fokus beendet' : 'Fokus';
  return state.phase === PHASE.longBreak ? 'Lange Pause' : 'Kurze Pause';
}

export function roundLabel(state) {
  if (!state) return '';
  if (state.phase === PHASE.work && state.status !== STATUS.workDone) {
    const rounds = Math.max(1, Math.round(num(state.completedRounds)) + 1);
    const inCycle = ((rounds - 1) % POMODORO_DEFAULTS.roundsBeforeLongBreak) + 1;
    return `Runde ${inCycle}/${POMODORO_DEFAULTS.roundsBeforeLongBreak}`;
  }
  return '';
}

export function normalizeTimerState(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Object.values(PHASE).includes(raw.phase)) return null;
  const status = Object.values(STATUS).includes(raw.status) ? raw.status : STATUS.paused;
  const durationMs = Math.max(1000, num(raw.durationMs, POMODORO_DEFAULTS.workMinutes * MINUTE));
  return {
    version: 3,
    phase: raw.phase,
    status,
    durationMs,
    accumulatedMs: Math.max(0, num(raw.accumulatedMs)),
    runStartedAt:
      status === STATUS.running && Number.isFinite(Number(raw.runStartedAt)) ? Number(raw.runStartedAt) : null,
    startedAt: num(raw.startedAt, now),
    completedRounds: Math.max(0, Math.round(num(raw.completedRounds))),
    minutes: clampWorkMinutes(raw.minutes || Math.round(durationMs / MINUTE)),
    lastBreak: raw.lastBreak === 'long' ? 'long' : raw.lastBreak === 'short' ? 'short' : null,
    updatedAt: num(raw.updatedAt, now),
  };
}
