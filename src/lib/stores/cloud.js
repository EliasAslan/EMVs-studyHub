/**
 * Reactive cloud/session state. The UI subscribes here; network work stays in
 * the service modules. Sync never blocks local use.
 */

import { writable, get } from 'svelte/store';
import { getNeonClient, isNeonConfigured } from '../services/neonClient.js';
import {
  syncState,
  uploadMergedData,
  getSessionUserId,
  getLastSyncedUid,
} from '../services/cloudSync.js';
import {
  getSyncStatus,
  recordSyncSuccess,
  recordSyncFailure,
  translateSyncError,
  formatLastSynced,
} from '../services/syncStatus.js';
import { normalizeState } from '../data/entities.js';
import { getState, replaceState, applyTheme, setSyncHandler, markCloudSynced } from './app.js';

const configured = isNeonConfigured();

export const cloud = writable({
  configured,
  ready: false,
  session: null,
  email: null,
  syncing: false,
  lastSynced: formatLastSynced(getSyncStatus()),
  lastError: null,
  message: '',
  accountUid: getLastSyncedUid(),
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  syncPending: false,
});

let client = null;
let started = false;
let authSubscription = null;
let syncTimer = null;
let inFlight = null;
let syncAfterFlight = false;
let autoRetryCount = 0;

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function onNetworkOnline() {
  patch({ online: true });
  if (get(cloud).session && get(cloud).syncPending) scheduleSync(700);
}

function onNetworkOffline() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  patch({ online: false, syncPending: !!get(cloud).session, syncing: false });
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && get(cloud).session && isOnline()) scheduleSync(1200);
}

function patch(updates) {
  cloud.update((state) => ({ ...state, ...updates }));
}

function clientOrThrow() {
  if (!client) client = getNeonClient();
  return client;
}

function applySession(session) {
  const user = session?.user || null;
  patch({
    ready: true,
    session,
    email: user?.email || null,
    accountUid: getLastSyncedUid(),
  });
}

export async function initCloud() {
  if (started) return;
  started = true;
  if (!configured) {
    patch({ ready: true });
    return;
  }

  try {
    client = getNeonClient();
    patch({ online: isOnline() });
    window.addEventListener('online', onNetworkOnline);
    window.addEventListener('offline', onNetworkOffline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    applySession(data.session);
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      if (session) scheduleSync(800);
    });
    authSubscription = listener?.subscription || null;

    // Coalesce rapid edits but push changes soon in the background.
    setSyncHandler(() => scheduleSync(3500));

    if (data.session) {
      patch({ syncPending: true });
      scheduleSync(500);
    }
  } catch (error) {
    patch({ ready: true, lastError: translateSyncError(error), message: '' });
  }
}

export function stopCloud() {
  authSubscription?.unsubscribe?.();
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', onNetworkOnline);
    window.removeEventListener('offline', onNetworkOffline);
  }
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
  authSubscription = null;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
}

export async function signIn(email, password) {
  const neon = clientOrThrow();
  const { error } = await neon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  patch({ message: 'Angemeldet.' });
  scheduleSync(300);
}

export async function signUp(email, password) {
  const neon = clientOrThrow();
  const { data, error } = await neon.auth.signUp({ email, password });
  if (error) throw error;
  patch({
    message: data.session
      ? 'Konto erstellt und angemeldet.'
      : 'Konto erstellt. Bitte E-Mail bestätigen.',
  });
}

export async function resetPassword(email) {
  const neon = clientOrThrow();
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#/settings` : undefined;
  const { error } = await neon.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function signOut() {
  const neon = clientOrThrow();
  const { error } = await neon.auth.signOut();
  if (error) throw error;
  patch({ message: 'Abgemeldet. Lokale Daten bleiben.' });
}

export function scheduleSync(delay = 3500) {
  if (!configured || !get(cloud).session) return;
  patch({ syncPending: true });
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  if (!isOnline()) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (get(cloud).session && isOnline()) runSync({ reason: 'auto' }).catch(() => {});
  }, delay);
}

async function applyMerged(result, { upload }) {
  const merged = normalizeState(result.mergedState);
  replaceState(merged, { saveNow: true });
  applyTheme(merged.settings.theme);
  if (upload) await uploadMergedData(clientOrThrow(), merged);
}

/** Merge cloud + local, apply locally, and upload the merged result. */
export async function runSync({ reason = 'manual', upload = true } = {}) {
  if (!configured) return null;
  if (!isOnline()) {
    patch({ online: false, syncPending: !!get(cloud).session });
    if (reason === 'auto') return null;
    throw Object.assign(new Error('Du bist offline. Die Änderungen warten auf eine Internetverbindung.'), { code: 'OFFLINE' });
  }
  if (inFlight) {
    if (reason === 'auto') syncAfterFlight = true;
    return inFlight;
  }

  inFlight = (async () => {
    patch({ syncing: true, message: '', lastError: null });
    try {
      const neon = clientOrThrow();
      await getSessionUserId(neon);
      const result = await syncState(neon, getState());
      await applyMerged(result, { upload });
      const direction = upload ? 'upload' : 'download';
      const status = recordSyncSuccess(direction);
      markCloudSynced();
      autoRetryCount = 0;
      patch({
        syncing: false,
        online: isOnline(),
        syncPending: false,
        lastError: null,
        lastSynced: formatLastSynced(status),
        accountUid: getLastSyncedUid(),
        message: reason === 'auto' ? '' : 'Synchronisiert.',
      });
      return result;
    } catch (error) {
      const translated = translateSyncError(error);
      recordSyncFailure(error?.code || error?.status?.toString?.() || translated.code);
      const connectivityFailure = translated.code === 'OFFLINE' || translated.code === 'NETWORK';
      patch({
        syncing: false,
        online: isOnline(),
        syncPending: connectivityFailure,
        lastError: translated,
        message: '',
      });
      if (connectivityFailure && isOnline() && autoRetryCount < 5) {
        autoRetryCount += 1;
        scheduleSync(Math.min(5000 * 2 ** (autoRetryCount - 1), 60000));
      }
      throw error;
    } finally {
      inFlight = null;
      if (syncAfterFlight) {
        syncAfterFlight = false;
        scheduleSync(900);
      }
    }
  })();

  return inFlight;
}

/** Cloud-only refresh (merge, apply locally, no upload). */
export function loadCloud() {
  return runSync({ reason: 'manual', upload: false });
}
