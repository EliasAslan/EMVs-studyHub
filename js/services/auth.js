/**
 * Supabase Auth + explicit manual cloud sync UI for Settings.
 *
 * localStorage remains the app's datastore. Signing in/out never reads,
 * uploads, downloads, replaces, or clears study data — only the explicit
 * "Lokale Daten hochladen" / "Cloud-Daten herunterladen" actions do.
 */
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { confirmDialog } from '../components/modal.js';
import {
  getSyncStatus,
  describeSyncStatus,
  formatLastSynced,
  recordSyncSuccess,
  recordSyncFailure,
  translateSyncError,
} from './syncStatus.js';

let activeSubscription = null;

export function renderAuthPanel(container) {
  if (!container) return;

  activeSubscription?.unsubscribe?.();
  activeSubscription = null;

  container.innerHTML = `
    <div class="field-row" style="align-items:flex-start; flex-direction:column; gap:6px;">
      <div id="supabase-auth-status" role="status" aria-live="polite" style="color:var(--ink-2);">Authentifizierungsstatus wird geladen …</div>
      <div id="supabase-auth-message" role="status" aria-live="polite" style="font-size:13px; color:var(--ink-2);"></div>
    </div>
    <form id="supabase-auth-form" style="display:flex; flex-direction:column; gap:10px; max-width:420px;">
      <label for="supabase-auth-email">E-Mail</label>
      <input id="supabase-auth-email" name="email" type="email" autocomplete="email" required
        style="padding:10px 12px; border:1px solid var(--rule-2); border-radius:4px; background:var(--paper);">
      <label for="supabase-auth-password">Passwort</label>
      <input id="supabase-auth-password" name="password" type="password" autocomplete="current-password"
        minlength="6" required
        style="padding:10px 12px; border:1px solid var(--rule-2); border-radius:4px; background:var(--paper);">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn primary" id="supabase-sign-in" type="submit">Anmelden</button>
        <button class="btn" id="supabase-sign-up" type="button">Konto erstellen</button>
        <button class="btn" id="supabase-sign-out" type="button" hidden>Abmelden</button>
      </div>
    </form>
    <p style="font-size:13px; color:var(--ink-2); max-width:58ch; margin-top:12px;">
      Deine Lerndaten bleiben standardmäßig lokal im Browser. Mit den manuellen Aktionen unten kannst du sie gezielt in Supabase hochladen oder aus der Cloud übernehmen. Anmeldung allein synchronisiert keine Daten.
    </p>
    <div id="supabase-sync-panel" style="margin-top:16px; border-top:1px solid var(--rule-2); padding-top:12px; max-width:560px;" hidden>
      <div class="section-label">Cloud-Synchronisation</div>
      <p style="font-size:13px; color:var(--ink-2); max-width:58ch;">
        localStorage bleibt der Standard. Sync läuft automatisch (Anmeldung, alle 25s nach Speichern, App-Hintergrund, Tab-Wechsel).
        Die Buttons unten sind für manuellen Force-Sync / Recovery.
      </p>
      <div id="supabase-sync-account" role="status" aria-live="polite" style="font-size:13px; color:var(--ink-2); margin-bottom:8px;"></div>
      <div id="supabase-sync-status" role="status" aria-live="polite" style="font-size:13px; color:var(--ink-2); margin-bottom:8px;"></div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px; font-size:13px; color:var(--ink-2);">
        <span id="supabase-sync-last" style="display:inline-flex; align-items:center; gap:6px;">Letzte Sync: <span id="supabase-sync-time">Nie</span></span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn primary" id="cloud-upload" type="button">Force Upload</button>
        <button class="btn" id="cloud-download" type="button">Force Download</button>
      </div>
      <div id="supabase-sync-message" role="status" aria-live="polite" style="font-size:13px; color:var(--ink-2); margin-top:8px;"></div>
    </div>
  `;

  const statusEl = container.querySelector('#supabase-auth-status');
  const messageEl = container.querySelector('#supabase-auth-message');
  const form = container.querySelector('#supabase-auth-form');
  const emailInput = container.querySelector('#supabase-auth-email');
  const passwordInput = container.querySelector('#supabase-auth-password');
  const signInButton = container.querySelector('#supabase-sign-in');
  const signUpButton = container.querySelector('#supabase-sign-up');
  const signOutButton = container.querySelector('#supabase-sign-out');

  const syncPanel = container.querySelector('#supabase-sync-panel');
  const syncAccountEl = container.querySelector('#supabase-sync-account');
  const syncMessageEl = container.querySelector('#supabase-sync-message');
  const uploadButton = container.querySelector('#cloud-upload');
  const downloadButton = container.querySelector('#cloud-download');

  const setSyncMessage = (message, isError = false) => {
    if (!syncMessageEl) return;
    syncMessageEl.textContent = message || '';
    syncMessageEl.style.color = isError ? 'var(--red)' : 'var(--ink-2)';
  };

  // Render a translated sync error: clear German title + next action,
  // technical detail kept collapsible for debugging (sanitized, no secrets).
  const setSyncError = (error) => {
    if (!syncMessageEl) return;
    const t = translateSyncError(error);
    syncMessageEl.innerHTML = '';
    syncMessageEl.style.color = 'var(--red)';
    const title = document.createElement('div');
    title.textContent = t.title;
    const action = document.createElement('div');
    action.textContent = t.action;
    action.style.cssText = 'color:var(--ink-2); margin-top:4px;';
    const details = document.createElement('details');
    details.style.cssText = 'margin-top:4px; font-size:12px; color:var(--ink-2);';
    const summary = document.createElement('summary');
    summary.textContent = `Details (${t.code})`;
    const tech = document.createElement('div');
    tech.textContent = t.technical;
    tech.style.cssText = 'font-family:var(--mono, monospace); word-break:break-word; margin-top:4px;';
    details.appendChild(summary);
    details.appendChild(tech);
    syncMessageEl.append(title, action, details);
  };

  // Persistent sync history: last successful upload/download times and
  // last failure. Written only after verified success/failure, never before.
  const refreshSyncStatus = () => {
    const el = container.querySelector('#supabase-sync-status');
    if (!el) return;
    el.innerHTML = '';
    for (const line of describeSyncStatus(getSyncStatus())) {
      const div = document.createElement('div');
      div.textContent = line;
      el.appendChild(div);
    }
    // Update "last synced" time
    const timeEl = container.querySelector('#supabase-sync-time');
    if (timeEl) timeEl.textContent = formatLastSynced(getSyncStatus());
  };

  const refreshSyncAccount = async () => {
    if (!syncAccountEl || !syncPanel) return;
    try {
      const { getLastSyncedUid } = await import('./cloudSync.js');
      const last = getLastSyncedUid();
      syncAccountEl.textContent = last
        ? `Dieses Gerät ist mit Konto ${last.slice(0, 8)}… verknüpft. Ein anderes Konto wird blockiert, bis du dich entscheidest.`
        : 'Noch keine Kontoverknüpfung auf diesem Gerät.';
    } catch {
      syncAccountEl.textContent = '';
    }
  };

  const showSession = (session) => {
    const user = session?.user;
    statusEl.textContent = user
      ? `Angemeldet als ${user.email || 'E-Mail nicht verfügbar'}`
      : 'Nicht angemeldet';
    form.querySelectorAll('input').forEach(input => {
      input.disabled = Boolean(user);
    });
    signInButton.hidden = Boolean(user);
    signUpButton.hidden = Boolean(user);
    signOutButton.hidden = !user;
    // Explicit sync only: signing in/out never reads, writes, replaces,
    // or clears study data. The panel is merely shown/hidden.
    if (syncPanel) syncPanel.hidden = !user;
    if (!user) setSyncMessage('');
    else {
      refreshSyncAccount();
      refreshSyncStatus();
    }
  };

  const setMessage = (message, isError = false) => {
    messageEl.textContent = message || '';
    messageEl.style.color = isError ? 'var(--red)' : 'var(--ink-2)';
  };

  const setBusy = (busy) => {
    signInButton.disabled = busy;
    signUpButton.disabled = busy;
    signOutButton.disabled = busy;
    if (busy) setMessage('Bitte warten …');
  };

  if (!isSupabaseConfigured()) {
    statusEl.textContent = 'Supabase noch nicht konfiguriert';
    setMessage('Öffne js/services/supabaseClient.js und trage den Publishable Key aus den Supabase-Projekteinstellungen ein.', true);
    form.querySelectorAll('input, button').forEach(control => { control.disabled = true; });
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return;

    setBusy(true);
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMessage('Anmeldung erfolgreich.');
    } catch (error) {
      setMessage(error?.message || 'Anmeldung fehlgeschlagen.', true);
    } finally {
      setBusy(false);
    }
  });

  signUpButton.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      setMessage('Gib zuerst E-Mail und Passwort ein.', true);
      return;
    }
    if (password.length < 6) {
      setMessage('Das Passwort muss mindestens 6 Zeichen lang sein.', true);
      return;
    }

    setBusy(true);
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setMessage(data.session
        ? 'Konto erstellt und angemeldet.'
        : 'Konto erstellt. Prüfe dein E-Mail-Postfach, um die Anmeldung zu bestätigen.');
    } catch (error) {
      setMessage(error?.message || 'Konto konnte nicht erstellt werden.', true);
    } finally {
      setBusy(false);
    }
  });

  signOutButton.addEventListener('click', async () => {
    setBusy(true);
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setMessage('Abgemeldet. Deine lokalen Lerndaten bleiben unverändert.');
    } catch (error) {
      setMessage(error?.message || 'Abmelden fehlgeschlagen.', true);
    } finally {
      setBusy(false);
    }
  });

  uploadButton?.addEventListener('click', async () => {
    setSyncMessage('Sync läuft …');
    uploadButton.disabled = true;
    downloadButton.disabled = true;
    try {
      const supabase = await getSupabaseClient();
      const { syncState, uploadMergedData } = await import('./cloudSync.js');
      const state = window.EMVS?.getState?.();
      if (!state) throw new Error('Lokale Daten sind nicht verfügbar.');

      // Run merge engine
      const { mergedState, erasureCount, needsBackupPrompt } = await syncState(supabase, state);

      // If merge would erase >10 local records, prompt for backup
      if (needsBackupPrompt) {
        const backup = await confirmDialog(
          `Die Synchronisation würde ${erasureCount} lokale Datensätze ersetzen (Cloud gewinnt). ` +
          `Möchtest du vorher ein JSON-Backup der aktuellen lokalen Daten exportieren?`,
          'Backup vor Sync'
        );
        if (backup) window.EMVS?.exportData?.();
      }

      // Upload merged state (including tombstones)
      const result = await uploadMergedData(supabase, mergedState);
      const parts = result.ledger.filter((l) => !l.skipped).map((l) => `${l.table}: ${l.written}`);
      recordSyncSuccess('upload');
      refreshSyncStatus();
      setSyncMessage(`Sync erfolgreich (${parts.join(', ') || 'nichts zu schreiben'}).`);
      window.EMVS?.toast?.show?.('Cloud-Sync erfolgreich');
      refreshSyncAccount();
    } catch (error) {
      recordSyncFailure(error?.code);
      setSyncError(error);
    } finally {
      uploadButton.disabled = false;
      downloadButton.disabled = false;
    }
  });

  downloadButton?.addEventListener('click', async () => {
    setSyncMessage('Sync läuft …');
    uploadButton.disabled = true;
    downloadButton.disabled = true;
    try {
      const supabase = await getSupabaseClient();
      const { syncState, uploadMergedData } = await import('./cloudSync.js');
      const state = window.EMVS?.getState?.();
      if (!state) throw new Error('Lokale Daten sind nicht verfügbar.');

      // Run merge engine
      const { mergedState, erasureCount, needsBackupPrompt } = await syncState(supabase, state);

      // If merge would erase >10 local records, prompt for backup
      if (needsBackupPrompt) {
        const backup = await confirmDialog(
          `Die Synchronisation würde ${erasureCount} lokale Datensätze ersetzen (Cloud gewinnt). ` +
          `Möchtest du vorher ein JSON-Backup der aktuellen lokalen Daten exportieren?`,
          'Backup vor Sync'
        );
        if (backup) window.EMVS?.exportData?.();
      }

      // Apply merged state locally
      const store = await import('./store.js');
      const { commitDownloadReplacement, setLastSyncedUid, getSessionUserId } = await import('./cloudSync.js');
      commitDownloadReplacement(
        {
          getState: () => window.EMVS.getState(),
          setState: (s) => window.EMVS.setState(s),
          save: () => window.EMVS.save(),
          clearStorageError: store.clearStorageError,
          renderSidebar: () => window.EMVS.renderSidebar?.(),
          navigate: (v) => window.EMVS.navigate?.(v),
        },
        mergedState,
      );
      try {
        setLastSyncedUid(await getSessionUserId(supabase));
      } catch {}
      refreshSyncAccount();
      recordSyncSuccess('download');
      refreshSyncStatus();
      setSyncMessage('Sync erfolgreich — lokale Daten mit Cloud zusammengeführt.');
      window.EMVS?.toast?.show?.('Cloud-Sync erfolgreich');
    } catch (error) {
      recordSyncFailure(error?.code);
      setSyncError(error);
    } finally {
      uploadButton.disabled = false;
      downloadButton.disabled = false;
    }
  });

  (async () => {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      showSession(data.session);
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        showSession(session);
      });
      activeSubscription = listener.subscription;
    } catch (error) {
      statusEl.textContent = 'Authentifizierung nicht verfügbar';
      setMessage(error?.message || 'Supabase konnte nicht geladen werden.', true);
    }
  })();
}
