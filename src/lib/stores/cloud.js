/**
 * Reactive cloud/session state. The UI subscribes here; network work stays in
 * the service modules. Sync never blocks local use.
 */

import { writable, get } from 'svelte/store';
import { getSupabaseClient, isSupabaseConfigured } from '../services/supabaseClient.js';
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
import { getState, replaceState, applyTheme, setSyncHandler } from './app.js';

const configured = isSupabaseConfigured();

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
});

let client = null;
let started = false;
let authSubscription = null;
let syncTimer = null;
let inFlight = null;

function patch(updates) {
  cloud.update((state) => ({ ...state, ...updates }));
}

function clientOrThrow() {
  if (!client) client = getSupabaseClient();
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
    client = getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    applySession(data.session);
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      if (session) scheduleSync(800);
    });
    authSubscription = listener?.subscription || null;

    // Silent auto-sync: 25 s after the last local change, plus tab return.
    setSyncHandler(() => scheduleSync(25000));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && get(cloud).session) scheduleSync(2000);
    });

    if (data.session) scheduleSync(500);
  } catch (error) {
    patch({ ready: true, lastError: translateSyncError(error), message: '' });
  }
}

export function stopCloud() {
  authSubscription?.unsubscribe?.();
  authSubscription = null;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
}

export async function signIn(email, password) {
  const supabase = clientOrThrow();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  patch({ message: 'Angemeldet.' });
  scheduleSync(300);
}

export async function signUp(email, password) {
  const supabase = clientOrThrow();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  patch({
    message: data.session
      ? 'Konto erstellt und angemeldet.'
      : 'Konto erstellt. Bitte E-Mail bestätigen.',
  });
}

export async function signOut() {
  const supabase = clientOrThrow();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  patch({ message: 'Abgemeldet. Lokale Daten bleiben.' });
}

export function scheduleSync(delay = 25000) {
  if (!configured) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (get(cloud).session) runSync({ reason: 'auto' }).catch(() => {});
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
  if (inFlight) return inFlight;

  inFlight = (async () => {
    patch({ syncing: true, message: '', lastError: null });
    try {
      const supabase = clientOrThrow();
      await getSessionUserId(supabase);
      const result = await syncState(supabase, getState());
      await applyMerged(result, { upload });
      const direction = upload ? 'upload' : 'download';
      const status = recordSyncSuccess(direction);
      patch({
        syncing: false,
        lastSynced: formatLastSynced(status),
        accountUid: getLastSyncedUid(),
        message: reason === 'auto' ? '' : 'Synchronisiert.',
      });
      return result;
    } catch (error) {
      recordSyncFailure(error?.code);
      patch({
        syncing: false,
        lastError: translateSyncError(error),
        message: '',
      });
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Cloud-only refresh (merge, apply locally, no upload). */
export function loadCloud() {
  return runSync({ reason: 'manual', upload: false });
}
