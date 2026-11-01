/**
 * Pomodoro rules + entry-point wiring.
 *
 * The timer is intentionally manual: a completed focus round must not start a
 * break, and a completed break must not start the next round. These tests pin
 * that behavior down at the pure state-machine level and check that every
 * session-start surface uses the shared Pomodoro instead of the old log modal.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POMODORO_DEFAULTS,
  PHASE,
  STATUS,
  createWorkTimer,
  remainingMs,
  progressPct,
  formatClock,
  pauseTimerState,
  resumeTimerState,
  tickPomodoro,
  startBreakState,
  startNextWork,
  stopWorkEarly,
  recommendedBreakType,
  normalizeTimerState,
} from '../js/services/pomodoro.js';

const minute = 60_000;
const t0 = 1_700_000_000_000;

// Start state
const timer = createWorkTimer({
  moduleId: 'm1',
  minutes: 25,
  linkedObjectiveIds: ['o1'],
  linkedResourceIds: ['r1'],
  now: t0,
});
assert.equal(timer.phase, PHASE.work);
assert.equal(timer.status, STATUS.running);
assert.equal(timer.durationMs, 25 * minute);
assert.equal(remainingMs(timer, t0), 25 * minute);
assert.equal(formatClock(remainingMs(timer, t0)), '25:00');
assert.equal(Math.round(progressPct(timer, t0)), 0);

// Ticking before the end changes nothing and never advances the phase.
const mid = tickPomodoro(timer, t0 + minute);
assert.equal(mid.state, timer);
assert.equal(mid.event, null);
assert.equal(formatClock(remainingMs(timer, t0 + minute)), '24:00');

// Pause freezes the countdown; resume continues from the same remaining time.
const paused = pauseTimerState(timer, t0 + minute);
assert.equal(paused.status, STATUS.paused);
assert.equal(remainingMs(paused, t0 + 11 * minute), 24 * minute);
const resumed = resumeTimerState(paused, t0 + 12 * minute);
assert.equal(resumed.status, STATUS.running);
assert.equal(remainingMs(resumed, t0 + 12 * minute), 24 * minute);

// Focus completion -> workDone + a pending session. No break starts by itself.
const done = tickPomodoro(resumed, t0 + 36 * minute);
assert.equal(done.event, 'workDone');
assert.equal(done.state.status, STATUS.workDone);
assert.equal(done.state.phase, PHASE.work);
assert.equal(done.state.completedRounds, 1);
assert.equal(done.state.pendingLog.completed, true);
assert.equal(done.state.pendingLog.duration, 25);
assert.deepEqual(done.state.pendingLog.linkedObjectiveIds, ['o1']);
assert.deepEqual(done.state.pendingLog.linkedResourceIds, ['r1']);

// Both break choices are always available, regardless of the round count.
const short = startBreakState(done.state, 'short', t0 + 37 * minute);
assert.equal(short.phase, PHASE.shortBreak);
assert.equal(short.status, STATUS.running);
assert.equal(short.durationMs, POMODORO_DEFAULTS.shortBreakMinutes * minute);
const long = startBreakState(done.state, 'long', t0 + 37 * minute);
assert.equal(long.phase, PHASE.longBreak);
assert.equal(long.status, STATUS.running);
assert.equal(long.durationMs, POMODORO_DEFAULTS.longBreakMinutes * minute);
assert.equal(recommendedBreakType(done.state), 'short');
assert.equal(recommendedBreakType({ ...done.state, completedRounds: 4 }), 'long');

// Break completion -> breakDone. It also does not start the next round.
const breakDone = tickPomodoro(short, t0 + 37 * minute + 5 * minute);
assert.equal(breakDone.event, 'breakDone');
assert.equal(breakDone.state.status, STATUS.breakDone);
assert.equal(breakDone.state.phase, PHASE.shortBreak);

// An unlogged session blocks the next round; after logging, it starts manually.
assert.equal(startNextWork(done.state, t0 + 38 * minute), done.state);
const cleared = { ...breakDone.state, pendingLog: null };
const next = startNextWork(cleared, t0 + 43 * minute);
assert.equal(next.phase, PHASE.work);
assert.equal(next.status, STATUS.running);
assert.equal(next.completedRounds, 1);
assert.equal(remainingMs(next, t0 + 43 * minute), 25 * minute);

// Early stop returns a loggable snapshot and is explicitly not "completed".
const early = stopWorkEarly(timer, t0 + 10 * minute + 30_000);
assert.equal(early.completed, false);
assert.equal(early.endedEarly, true);
assert.equal(early.duration, 11);
assert.equal(early.moduleId, 'm1');

// Persisted legacy count-up timer is migrated into a focus phase.
const legacyRunning = normalizeTimerState({
  moduleId: 'm2',
  plannedMinutes: 30,
  startTime: t0,
  pausedTime: 0,
  running: true,
}, t0 + 5 * minute);
assert.equal(legacyRunning.version, 2);
assert.equal(legacyRunning.phase, PHASE.work);
assert.equal(legacyRunning.status, STATUS.running);
assert.equal(legacyRunning.durationMs, 30 * minute);
assert.equal(remainingMs(legacyRunning, t0 + 5 * minute), 25 * minute);
assert.equal(legacyRunning.context.moduleId, 'm2');

const legacyPaused = normalizeTimerState({
  plannedMinutes: 30,
  startTime: t0,
  pausedTime: 5 * minute,
  running: false,
}, t0 + 20 * minute);
assert.equal(legacyPaused.status, STATUS.paused);
assert.equal(remainingMs(legacyPaused, t0 + 20 * minute), 25 * minute);

assert.equal(normalizeTimerState({ plannedMinutes: 30, pausedTime: 0, running: false }, t0), null);
assert.equal(normalizeTimerState(null, t0), null);

// Clock rounding is friendly at the boundary.
assert.equal(formatClock(0), '00:00');
assert.equal(formatClock(1000), '00:01');
assert.equal(formatClock(59_500), '01:00');

// Entry points that start a session must use the shared Pomodoro.
const views = [
  'js/views/focus.js',
  'js/views/module-home.js',
  'js/views/module-objectives.js',
  'js/views/module-resources.js',
  'js/views/overview.js',
  'js/views/weak-spots.js',
];
for (const file of views) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.ok(src.includes('startPomodoroFor'), `${file}: starts a Pomodoro`);
  assert.ok(!src.includes('openSessionModal'), `${file}: no immediate log modal start`);
}
const today = readFileSync(new URL('../js/views/today.js', import.meta.url), 'utf8');
assert.ok(today.includes('pendingReviewObjectiveId'), 'today carries the review objective');
assert.ok(today.includes("navigate('focus')"), 'today opens the focus room instead of auto-starting');
assert.ok(!today.includes('startPomodoroFor'), 'today never starts a round by itself');
const sharedEntries = [
  'js/components/nav/index.js',
  'js/components/nav/context.js',
  'js/components/palette.js',
  'js/app.js',
];
for (const file of sharedEntries) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.ok(src.includes('startTimer'), `${file}: uses the shared startTimer wrapper`);
}
const router = readFileSync(new URL('../js/views/router.js', import.meta.url), 'utf8');
assert.ok(!router.includes('stopSessionsTimerDisplay'), 'router must not stop the global Pomodoro');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.ok(app.includes('initPomodoroWidget'), 'app mounts the floating widget');
const widget = readFileSync(new URL('../js/components/pomodoroWidget.js', import.meta.url), 'utf8');
assert.ok(widget.includes('data-pomo-open-focus'), 'floating widget can open the focus room');
assert.ok(widget.includes("navigate?.('focus')"), 'widget opens #/fokus');

// The safe stop flow must keep the round until the log is saved.
const engine = readFileSync(new URL('../js/services/pomodoroEngine.js', import.meta.url), 'utf8');
assert.ok(engine.includes('export function beginStopPomodoro'), 'engine pauses before logging');
assert.ok(engine.includes('export function cancelStopPomodoro'), 'engine can restore the paused round');
assert.ok(engine.includes('export function completeStopPomodoro'), 'engine finalizes only after saving');
const sessions = readFileSync(new URL('../js/views/module-sessions.js', import.meta.url), 'utf8');
assert.ok(sessions.includes('cancelStopPomodoro()'), 'canceling the log keeps the round');
assert.ok(sessions.includes('completeStopPomodoro()'), 'saving the log finalizes the round');

// The focus room is a real route, not just a Sessions tab.
assert.ok(router.includes("'/fokus': 'focus'"), 'router maps #/fokus');
const navigation = readFileSync(new URL('../js/utils/navigation.js', import.meta.url), 'utf8');
assert.ok(navigation.includes("'focus': { label: 'Fokus'"), 'focus is a destination');

console.log('ok - Pomodoro state machine and entry points');
