/**
 * Pomodoro engine — persistence, one global ticker, notifications and sound.
 *
 * The UI never runs its own timer. Every surface (floating widget, Sessions
 * tab) subscribes here, so the countdown, pause state and pending log can
 * never disagree. State is timestamp-based, so a reload or a throttled
 * background tab catches up correctly.
 */

import {
  loadTimerState,
  saveTimerState,
  clearTimerState,
  loadPomodoroPrefs,
  savePomodoroPrefs,
} from './store.js';
import {
  POMODORO_DEFAULTS,
  PHASE,
  STATUS,
  createWorkTimer,
  normalizeTimerState,
  tickPomodoro,
  pauseTimerState,
  resumeTimerState,
  startBreakState,
  startNextWork,
  stopWorkEarly,
  remainingMs,
} from './pomodoro.js';

let current = null;
let prefs = null;
let intervalId = null;
let completionTimer = null;
let audioCtx = null;
let initialized = false;
let stopDraft = null;
const subscribers = new Set();

function ensurePrefs() {
  if (!prefs) prefs = loadPomodoroPrefs();
  return prefs;
}

function emit(reason = 'change') {
  const detail = { state: current, prefs: ensurePrefs(), reason };
  for (const fn of [...subscribers]) {
    try { fn(detail); } catch (e) { console.error('Pomodoro subscriber failed:', e); }
  }
}

function persist() {
  try {
    if (current) saveTimerState(current);
    else clearTimerState();
  } catch (e) {
    console.error('Failed to persist Pomodoro state:', e);
  }
}

function tickNow() {
  if (!current) { stopTicking(); return; }
  const before = current;
  const { state, event } = tickPomodoro(current, Date.now());
  if (state !== before) {
    current = state;
    persist();
    if (event) {
      if (current.status !== STATUS.running) stopTicking();
      announcePhase(event, current);
      emit(event);
      return;
    }
  }
  emit('tick');
}

function startTicking() {
  stopTicking();
  if (!current || current.status !== STATUS.running) return;
  intervalId = setInterval(tickNow, 1000);
  scheduleCompletion();
}

function stopTicking() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (completionTimer) { clearTimeout(completionTimer); completionTimer = null; }
}

function scheduleCompletion() {
  if (!current || current.status !== STATUS.running) return;
  if (completionTimer) clearTimeout(completionTimer);
  const delay = Math.max(0, remainingMs(current, Date.now()) + 60);
  // Long delays are safe; the interval keeps the UI moving.
  completionTimer = setTimeout(tickNow, Math.min(delay, 2_147_000_000));
}

function handleWake() {
  if (!current) return;
  tickNow();
  if (current && current.status === STATUS.running) startTicking();
}

function toast(message) {
  try { window.EMVS?.toast?.show?.(message); } catch {}
}

function notificationStatus() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

async function requestNotificationPermission(force = false) {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (window.Notification.permission !== 'default') return window.Notification.permission;
  if (!force && ensurePrefs().notificationsAsked) return window.Notification.permission;
  try {
    const result = await window.Notification.requestPermission();
    updatePomodoroPrefs({ notificationsAsked: true });
    emit('notifications');
    return result;
  } catch {
    return 'denied';
  }
}

function maybeRequestNotifications() {
  if (ensurePrefs().notificationsAsked) return;
  // The first manual start is a user gesture, so this prompt is intentional.
  requestNotificationPermission(true)
    .catch(() => {})
    .finally(() => {
      if (!ensurePrefs().notificationsAsked) {
        updatePomodoroPrefs({ notificationsAsked: true });
      }
    });
}

function showNotification(title, body) {
  if (notificationStatus() !== 'granted') return;
  try {
    const n = new window.Notification(title, {
      body,
      tag: 'emvs-pomodoro',
      renotify: true,
      silent: false,
    });
    n.onclick = () => {
      try { window.focus(); } catch {}
      try { window.EMVS?.navigate?.('focus'); } catch {}
      n.close();
    };
  } catch {}
}

function ensureAudio() {
  if (typeof window === 'undefined') return null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

function playChime() {
  if (!ensurePrefs().sound) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + 0.02;
    const tones = [[880, 0, 0.18], [1174.66, 0.2, 0.28]];
    for (const [freq, offset, duration] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + duration + 0.03);
    }
  } catch {}
}

function vibrate() {
  if (!ensurePrefs().sound) return;
  try { navigator.vibrate?.([180, 80, 180]); } catch {}
}

function announcePhase(event, state) {
  if (event === 'workDone') {
    const minutes = state?.pendingLog?.duration || Math.round((state?.durationMs || 0) / 60000);
    showNotification('Fokuszeit vorbei', `${minutes} Min geschafft. Sitzung loggen und Pause wählen.`);
    toast('Fokuszeit vorbei — Sitzung loggen und Pause wählen');
  } else if (event === 'breakDone') {
    showNotification('Pause vorbei', 'Bereit für die nächste Runde?');
    toast('Pause vorbei — bereit für die nächste Runde?');
  }
  playChime();
  vibrate();
}

export function initPomodoro() {
  if (initialized) return current;
  initialized = true;
  ensurePrefs();
  const stored = loadTimerState();
  current = normalizeTimerState(stored, Date.now());
  if (!current && stored) clearTimerState();
  if (current) {
    const before = current;
    const { state, event } = tickPomodoro(current, Date.now());
    if (state !== before) {
      current = state;
      persist();
      if (event) announcePhase(event, current);
    }
    if (current.status === STATUS.running) startTicking();
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleWake();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWake);
  }
  emit('init');
  return current;
}

export function getPomodoro() {
  if (!current && initialized) {
    // Another tab may have written a timer; pick it up lazily.
    const stored = normalizeTimerState(loadTimerState(), Date.now());
    if (stored) current = stored;
  }
  return current;
}

export function hasPomodoro() {
  return !!getPomodoro();
}

export function startPomodoro(options = {}) {
  ensurePrefs();
  const existing = getPomodoro();
  if (existing?.pendingLog) {
    return { ok: false, reason: 'pendingLog', pendingLog: existing.pendingLog };
  }
  if (existing?.phase === PHASE.work
      && (existing.status === STATUS.running || existing.status === STATUS.paused)) {
    return { ok: false, reason: 'running' };
  }
  current = createWorkTimer({
    ...options,
    completedRounds: existing?.completedRounds || 0,
  });
  stopDraft = null;
  // A manual start should present the timer, even if it was minimized or hidden.
  if (ensurePrefs().minimized || ensurePrefs().hidden) {
    updatePomodoroPrefs({ minimized: false, hidden: false });
  }
  persist();
  ensureAudio();
  maybeRequestNotifications();
  startTicking();
  emit('start');
  return { ok: true, state: current };
}

export function pausePomodoro() {
  if (!current || current.status !== STATUS.running) return false;
  current = pauseTimerState(current, Date.now());
  persist();
  stopTicking();
  emit('pause');
  return true;
}

export function resumePomodoro() {
  if (!current || current.status !== STATUS.paused) return false;
  current = resumeTimerState(current, Date.now());
  persist();
  ensureAudio();
  startTicking();
  emit('resume');
  return true;
}

export function chooseBreak(type) {
  if (!current) return false;
  if (current.status !== STATUS.workDone && current.status !== STATUS.breakDone) return false;
  current = startBreakState(current, type, Date.now());
  persist();
  ensureAudio();
  startTicking();
  emit('break');
  return true;
}

export function skipBreak() {
  if (!current) return false;
  if (current.phase === PHASE.work) return false;
  if (current.status !== STATUS.running && current.status !== STATUS.paused) return false;
  current = {
    ...current,
    status: STATUS.breakDone,
    accumulatedMs: current.durationMs,
    runStartedAt: null,
    updatedAt: Date.now(),
  };
  persist();
  stopTicking();
  toast('Pause übersprungen');
  emit('break-skip');
  return true;
}

export function startNextRound() {
  if (!current) return { ok: false, reason: 'idle' };
  if (current.status !== STATUS.workDone && current.status !== STATUS.breakDone) {
    return { ok: false, reason: 'busy' };
  }
  if (current.pendingLog) {
    return { ok: false, reason: 'pendingLog', pendingLog: current.pendingLog };
  }
  current = startNextWork(current, Date.now());
  persist();
  ensureAudio();
  startTicking();
  emit('next');
  return { ok: true, state: current };
}

/**
 * Begin an early stop without losing the round.
 *
 * The timer pauses and a draft snapshot is handed to the log form. Saving the
 * form finalizes it; dismissing the form puts the user back into the paused
 * round instead of silently throwing the elapsed time away.
 */
export function beginStopPomodoro() {
  if (!current) return null;
  const snapshot = stopWorkEarly(current, Date.now());
  if (!snapshot) return null;
  const wasRunning = current.status === STATUS.running;
  if (wasRunning) {
    current = pauseTimerState(current, Date.now());
    persist();
    stopTicking();
  }
  snapshot.wasRunning = wasRunning;
  stopDraft = { snapshot, wasRunning };
  emit('stop-begin');
  return snapshot;
}

/** Cancel the log form and keep the paused round. */
export function cancelStopPomodoro() {
  if (!stopDraft) return false;
  const wasRunning = stopDraft.wasRunning;
  stopDraft = null;
  if (wasRunning && current?.status === STATUS.paused) {
    current = resumeTimerState(current, Date.now());
    persist();
    ensureAudio();
    startTicking();
  }
  emit('stop-cancel');
  return true;
}

/** Finalize an early stop after the session has been saved. */
export function completeStopPomodoro() {
  if (!stopDraft) return false;
  stopDraft = null;
  current = null;
  persist();
  stopTicking();
  emit('stop-complete');
  return true;
}

export function hasStopDraft() {
  return !!stopDraft;
}

/** Backwards-compatible alias: stopping now begins the safe stop flow. */
export function stopPomodoro() {
  return beginStopPomodoro();
}

export function getPendingLog() {
  return current?.pendingLog || null;
}

export function clearPendingLog() {
  if (!current?.pendingLog) return false;
  current = { ...current, pendingLog: null, updatedAt: Date.now() };
  persist();
  emit('pending-clear');
  return true;
}

/** Discard the whole timer. Refuses to lose an unlogged session unless forced. */
export function dismissPomodoro(force = false) {
  if (!current) return false;
  if (current.pendingLog && !force) return false;
  current = null;
  stopDraft = null;
  persist();
  stopTicking();
  emit('dismiss');
  return true;
}

/** Reset on app data reset. */
export function resetPomodoro() {
  current = null;
  stopDraft = null;
  persist();
  stopTicking();
  emit('reset');
}

export function subscribePomodoro(fn) {
  subscribers.add(fn);
  try { fn({ state: current, prefs: ensurePrefs(), reason: 'subscribe' }); } catch {}
  return () => subscribers.delete(fn);
}

export function getPomodoroPrefs() {
  return { ...ensurePrefs() };
}

export function updatePomodoroPrefs(patch = {}) {
  prefs = { ...ensurePrefs(), ...patch };
  savePomodoroPrefs(prefs);
  emit('prefs');
  return { ...prefs };
}

export { notificationStatus, requestNotificationPermission };

export function sendTestNotification() {
  showNotification(
    'Pomodoro-Benachrichtigungen aktiv',
    'Du wirst benachrichtigt, wenn eine Fokusrunde oder Pause endet.'
  );
  playChime();
  return notificationStatus();
}

export { POMODORO_DEFAULTS };
