/**
 * Pomodoro state machine — pure, DOM-free, storage-free.
 *
 * The app has exactly one Pomodoro. This module owns the rules:
 *  - focus rounds, short breaks and long breaks
 *  - manual pause / resume (no automatic phase changes)
 *  - a completed focus round leaves a pending session that the UI can log
 *
 * Nothing here starts automatically. The engine (pomodoroEngine.js) ticks
 * this machine once per second; when a countdown reaches zero the state moves
 * to workDone / breakDone and waits for the user to choose what happens next.
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

function uniqueIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(Boolean))];
}

export function clampWorkMinutes(value) {
  const n = num(value, POMODORO_DEFAULTS.workMinutes);
  return Math.min(480, Math.max(1, Math.round(n)));
}

function breakMinutes(type) {
  return type === 'long'
    ? POMODORO_DEFAULTS.longBreakMinutes
    : POMODORO_DEFAULTS.shortBreakMinutes;
}

function phaseMinutes(state) {
  return Math.max(1, Math.round(num(state?.durationMs) / MINUTE));
}

/** Start a fresh focus round. */
export function createWorkTimer({
  moduleId = null,
  minutes = POMODORO_DEFAULTS.workMinutes,
  linkedObjectiveIds = [],
  linkedResourceIds = [],
  reviewObjectiveId = null,
  completedRounds = 0,
  now = Date.now(),
} = {}) {
  const workMinutes = clampWorkMinutes(minutes);
  return {
    version: 2,
    moduleId: moduleId || null,
    phase: PHASE.work,
    status: STATUS.running,
    durationMs: workMinutes * MINUTE,
    accumulatedMs: 0,
    runStartedAt: now,
    startedAt: now,
    completedRounds: Math.max(0, Math.round(num(completedRounds))),
    context: {
      moduleId: moduleId || null,
      minutes: workMinutes,
      linkedObjectiveIds: uniqueIds(linkedObjectiveIds),
      linkedResourceIds: uniqueIds(linkedResourceIds),
      reviewObjectiveId: reviewObjectiveId || null,
    },
    pendingLog: null,
    lastBreak: null,
    updatedAt: now,
  };
}

/** Active (unpaused) milliseconds in the current phase. */
export function activeElapsedMs(state, now = Date.now()) {
  if (!state) return 0;
  const accumulated = Math.max(0, num(state.accumulatedMs));
  const hasRunStart = state.runStartedAt !== null && state.runStartedAt !== undefined
    && Number.isFinite(Number(state.runStartedAt));
  const running = state.status === STATUS.running && hasRunStart;
  return Math.max(0, accumulated + (running ? Math.max(0, now - Number(state.runStartedAt)) : 0));
}

export function remainingMs(state, now = Date.now()) {
  if (!state) return 0;
  return Math.max(0, num(state.durationMs) - activeElapsedMs(state, now));
}

/** 0 at the start of a phase, 100 at the end. */
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
  return {
    ...state,
    runStartedAt: now,
    status: STATUS.running,
    updatedAt: now,
  };
}

function completeWork(state, now) {
  const total = num(state.durationMs);
  const overflow = Math.max(0, activeElapsedMs(state, now) - total);
  const completedAt = now - overflow;
  const minutes = Math.max(1, Math.round(total / MINUTE));
  const context = state.context || {};

  const pendingLog = {
    moduleId: context.moduleId || state.moduleId || null,
    startTime: new Date(completedAt - total).toISOString(),
    duration: minutes,
    plannedMinutes: num(context.minutes, minutes),
    linkedObjectiveIds: uniqueIds(context.linkedObjectiveIds),
    linkedResourceIds: uniqueIds(context.linkedResourceIds),
    reviewObjectiveId: context.reviewObjectiveId || null,
    completed: true,
    endedEarly: false,
    completedAt,
  };

  return {
    ...state,
    status: STATUS.workDone,
    accumulatedMs: total,
    runStartedAt: null,
    completedRounds: Math.max(0, Math.round(num(state.completedRounds))) + 1,
    pendingLog,
    updatedAt: completedAt,
  };
}

function completeBreak(state, now) {
  return {
    ...state,
    status: STATUS.breakDone,
    accumulatedMs: num(state.durationMs),
    runStartedAt: null,
    updatedAt: now,
  };
}

/**
 * Advance a running timer if its countdown reached zero.
 * Returns the same state object while the phase is still running.
 */
export function tickPomodoro(state, now = Date.now()) {
  if (!state || state.status !== STATUS.running) return { state, event: null };
  if (remainingMs(state, now) > 0) return { state, event: null };
  if (state.phase === PHASE.work) {
    return { state: completeWork(state, now), event: 'workDone' };
  }
  return { state: completeBreak(state, now), event: 'breakDone' };
}

/** Begin a short or long break after a focus round. Both are always allowed. */
export function startBreakState(state, type, now = Date.now()) {
  if (!state) return state;
  if (state.status !== STATUS.workDone && state.status !== STATUS.breakDone) return state;
  const kind = type === 'long' ? 'long' : 'short';
  const minutes = breakMinutes(kind);
  return {
    ...state,
    phase: kind === 'long' ? PHASE.longBreak : PHASE.shortBreak,
    status: STATUS.running,
    durationMs: minutes * MINUTE,
    accumulatedMs: 0,
    runStartedAt: now,
    startedAt: now,
    lastBreak: kind,
    updatedAt: now,
  };
}

/** Begin the next focus round. Blocked while a session is still unlogged. */
export function startNextWork(state, now = Date.now()) {
  if (!state) return state;
  if (state.status !== STATUS.workDone && state.status !== STATUS.breakDone) return state;
  if (state.pendingLog) return state;
  const minutes = clampWorkMinutes(state.context?.minutes);
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

/**
 * Snapshot an early stop so the UI can offer the normal log form.
 * Returns null when the timer is not in a stoppable focus phase.
 */
export function stopWorkEarly(state, now = Date.now()) {
  if (!state || state.phase !== PHASE.work) return null;
  if (state.status !== STATUS.running && state.status !== STATUS.paused) return null;
  const elapsed = activeElapsedMs(state, now);
  const minutes = Math.max(1, Math.round(elapsed / MINUTE));
  const context = state.context || {};
  return {
    moduleId: context.moduleId || state.moduleId || null,
    startTime: new Date(now - minutes * MINUTE).toISOString(),
    duration: minutes,
    plannedMinutes: num(context.minutes, POMODORO_DEFAULTS.workMinutes),
    linkedObjectiveIds: uniqueIds(context.linkedObjectiveIds),
    linkedResourceIds: uniqueIds(context.linkedResourceIds),
    reviewObjectiveId: context.reviewObjectiveId || null,
    completed: false,
    endedEarly: true,
    completedAt: now,
  };
}

/** Long break is recommended after four completed rounds, never forced. */
export function recommendedBreakType(state) {
  if (!state) return 'short';
  const rounds = Math.max(0, Math.round(num(state.completedRounds)));
  return rounds > 0 && rounds % POMODORO_DEFAULTS.roundsBeforeLongBreak === 0
    ? 'long'
    : 'short';
}

export function phaseLabel(state) {
  if (!state) return '';
  if (state.phase === PHASE.work) {
    return state.status === STATUS.workDone ? 'Fokus beendet' : 'Fokus';
  }
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

export function timerMinutes(state) {
  return phaseMinutes(state);
}

/**
 * Normalize persisted state. Handles the v2 shape and migrates the old
 * `{ moduleId, plannedMinutes, startTime, pausedTime, running }` timer.
 */
export function normalizeTimerState(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.phase && Object.values(PHASE).includes(raw.phase)) {
    const status = Object.values(STATUS).includes(raw.status)
      ? raw.status
      : (raw.running ? STATUS.running : STATUS.paused);
    const durationMs = Math.max(1000, num(raw.durationMs, num(raw.plannedMinutes, POMODORO_DEFAULTS.workMinutes) * MINUTE));
    const context = raw.context && typeof raw.context === 'object' ? raw.context : {};
    const pending = raw.pendingLog && typeof raw.pendingLog === 'object'
      ? {
          moduleId: raw.pendingLog.moduleId || null,
          startTime: raw.pendingLog.startTime || new Date(now).toISOString(),
          duration: Math.max(1, Math.round(num(raw.pendingLog.duration, Math.round(durationMs / MINUTE)))),
          plannedMinutes: num(raw.pendingLog.plannedMinutes, Math.round(durationMs / MINUTE)),
          linkedObjectiveIds: uniqueIds(raw.pendingLog.linkedObjectiveIds),
          linkedResourceIds: uniqueIds(raw.pendingLog.linkedResourceIds),
          reviewObjectiveId: raw.pendingLog.reviewObjectiveId || null,
          completed: raw.pendingLog.completed !== false,
          endedEarly: raw.pendingLog.endedEarly === true,
          completedAt: num(raw.pendingLog.completedAt, now),
        }
      : null;
    const runStartedAt = status === STATUS.running
      ? (raw.runStartedAt !== null && raw.runStartedAt !== undefined
          && Number.isFinite(Number(raw.runStartedAt)) ? Number(raw.runStartedAt) : now)
      : null;
    return {
      version: 2,
      moduleId: raw.moduleId || context.moduleId || null,
      phase: raw.phase,
      status,
      durationMs,
      accumulatedMs: Math.max(0, num(raw.accumulatedMs)),
      runStartedAt,
      startedAt: num(raw.startedAt, now),
      completedRounds: Math.max(0, Math.round(num(raw.completedRounds))),
      context: {
        moduleId: context.moduleId || raw.moduleId || null,
        minutes: clampWorkMinutes(context.minutes || Math.round(durationMs / MINUTE)),
        linkedObjectiveIds: uniqueIds(context.linkedObjectiveIds),
        linkedResourceIds: uniqueIds(context.linkedResourceIds),
        reviewObjectiveId: context.reviewObjectiveId || null,
      },
      pendingLog: pending,
      lastBreak: raw.lastBreak === 'long' ? 'long' : (raw.lastBreak === 'short' ? 'short' : null),
      updatedAt: num(raw.updatedAt, now),
    };
  }

  // Legacy timer (pre-v2): elapsed count-up state.
  const planned = num(raw.plannedMinutes);
  const startTime = num(raw.startTime);
  const pausedTime = Math.max(0, num(raw.pausedTime));
  if (!planned && !startTime && !pausedTime) return null;
  const running = raw.running === true;
  if (!running && pausedTime <= 0) return null;
  const minutes = clampWorkMinutes(planned || POMODORO_DEFAULTS.workMinutes);
  return {
    version: 2,
    moduleId: raw.moduleId || null,
    phase: PHASE.work,
    status: running ? STATUS.running : STATUS.paused,
    durationMs: minutes * MINUTE,
    accumulatedMs: pausedTime,
    runStartedAt: running ? (startTime || now) : null,
    startedAt: startTime || now,
    completedRounds: 0,
    context: {
      moduleId: raw.moduleId || null,
      minutes,
      linkedObjectiveIds: [],
      linkedResourceIds: [],
      reviewObjectiveId: null,
    },
    pendingLog: null,
    lastBreak: null,
    updatedAt: now,
  };
}
