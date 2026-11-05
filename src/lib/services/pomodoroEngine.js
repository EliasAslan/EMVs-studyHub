/**
 * Pomodoro engine — one global ticker, persistence, quiet notifications.
 * The UI subscribes here; it never runs its own timer.
 */

import { loadTimerState, saveTimerState, clearTimerState, loadPomodoroPrefs, savePomodoroPrefs } from './store.js';
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
  remainingMs,
  recommendedBreakType,
} from './pomodoro.js';

let current = null;
let prefs = null;
let intervalId = null;
let audioCtx = null;
let initialized = false;
const subscribers = new Set();

function ensurePrefs() {
  if (!prefs) prefs = loadPomodoroPrefs();
  return prefs;
}

function emit(reason = 'change') {
  const detail = { state: current, prefs: ensurePrefs(), reason };
  for (const fn of [...subscribers]) {
    try {
      fn(detail);
    } catch (e) {
      console.error('Pomodoro subscriber failed:', e);
    }
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

function stopTicking() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startTicking() {
  stopTicking();
  if (!current || current.status !== STATUS.running) return;
  intervalId = setInterval(tickNow, 1000);
}

function tickNow() {
  if (!current) {
    stopTicking();
    return;
  }
  const { state, event } = tickPomodoro(current, Date.now());
  if (state !== current) {
    current = state;
    persist();
    if (event) {
      if (current.status !== STATUS.running) stopTicking();
      announce(event);
      emit(event);
      return;
    }
  }
  emit('tick');
}

function notificationStatus() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (window.Notification.permission !== 'default') return window.Notification.permission;
  try {
    const result = await window.Notification.requestPermission();
    updatePomodoroPrefs({ notificationsAsked: true });
    return result;
  } catch {
    return 'denied';
  }
}

function showNotification(title, body) {
  if (notificationStatus() !== 'granted') return;
  try {
    const n = new window.Notification(title, { body, tag: 'studyhub-pomodoro', silent: false });
    n.onclick = () => {
      try {
        window.focus();
      } catch {}
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
    for (const [freq, offset, duration] of [[880, 0, 0.18], [1174.66, 0.2, 0.28]]) {
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

function announce(event) {
  if (event === 'workDone') {
    showNotification('Fokuszeit vorbei', 'Bereit für eine Pause?');
  } else if (event === 'breakDone') {
    showNotification('Pause vorbei', 'Bereit für die nächste Runde?');
  }
  playChime();
  try {
    navigator.vibrate?.([180, 80, 180]);
  } catch {}
}

function handleWake() {
  if (!current) return;
  tickNow();
  if (current && current.status === STATUS.running) startTicking();
}

export function initPomodoro() {
  if (initialized) return current;
  initialized = true;
  ensurePrefs();
  current = normalizeTimerState(loadTimerState(), Date.now());
  if (current) {
    tickNow();
    if (current.status === STATUS.running) startTicking();
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleWake();
    });
  }
  if (typeof window !== 'undefined') window.addEventListener('focus', handleWake);
  emit('init');
  return current;
}

export function getPomodoro() {
  return current;
}

export function startPomodoro(options = {}) {
  const existing = getPomodoro();
  if (existing?.phase === PHASE.work && (existing.status === STATUS.running || existing.status === STATUS.paused)) {
    return { ok: false, reason: 'running' };
  }
  current = createWorkTimer({
    minutes: options.minutes,
    completedRounds: existing?.completedRounds || 0,
  });
  persist();
  ensureAudio();
  if (notificationStatus() === 'default' && !ensurePrefs().notificationsAsked) {
    requestNotificationPermission().catch(() => {});
  }
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
  if (!current || current.phase === PHASE.work) return false;
  if (current.status !== STATUS.running && current.status !== STATUS.paused) return false;
  current = { ...current, status: STATUS.breakDone, accumulatedMs: current.durationMs, runStartedAt: null, updatedAt: Date.now() };
  persist();
  stopTicking();
  emit('break-skip');
  return true;
}

export function startNextRound() {
  if (!current) return { ok: false, reason: 'idle' };
  if (current.status !== STATUS.workDone && current.status !== STATUS.breakDone) return { ok: false, reason: 'busy' };
  current = startNextWork(current, Date.now());
  persist();
  ensureAudio();
  startTicking();
  emit('next');
  return { ok: true, state: current };
}

export function dismissPomodoro() {
  if (!current) return false;
  current = null;
  persist();
  stopTicking();
  emit('dismiss');
  return true;
}

export function resetPomodoro() {
  current = null;
  persist();
  stopTicking();
  emit('reset');
}

export function subscribePomodoro(fn) {
  subscribers.add(fn);
  try {
    fn({ state: current, prefs: ensurePrefs(), reason: 'subscribe' });
  } catch {}
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

export function sendTestNotification() {
  showNotification('Benachrichtigungen aktiv', 'Du wirst benachrichtigt, wenn eine Fokusrunde oder Pause endet.');
  playChime();
  return notificationStatus();
}

export { notificationStatus, requestNotificationPermission, recommendedBreakType, POMODORO_DEFAULTS, PHASE, STATUS, remainingMs };
