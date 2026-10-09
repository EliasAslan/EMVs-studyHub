/**
 * Supabase Auth + explicit manual cloud sync UI for Settings.
 *
 * localStorage remains the app's datastore. Signing in/out never reads,
 * uploads, downloads, replaces, or clears study data — only the explicit
 * "Lokale Daten hochladen" / "Cloud-Daten herunterladen" actions do.
 */
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { confirmDialog } from '../components/modal.js';

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
      In dieser Phase dient das Konto nur zur Anmeldung. Deine Lerndaten bleiben lokal;
      Anmeldung synchronisiert oder überschreibt nichts.
    </p>
    <div id="supabase-sync-panel" style="margin-top:16px; border-top:1px solid var(--rule-2); padding-top:12px; max-width:560px;" hidden>
      <div class="section-label">Cloud-Synchronisation (manuell)</div>
      <p style="font-size:13px; color:var(--ink-2); max-width:58ch;">
        localStorage bleibt der Standard. Nichts geschieht automatisch — nur die
        Aktionen unten schreiben oder ersetzen Daten.
      </p>
      <div id="supabase-sync-account" role="status" aria-live="polite" style="font-size:13px; color:var(--ink-2); margin-bottom:8px;"></div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn primary" id="cloud-upload" type="button">Lokale Daten hochladen</button>
        <button class="btn" id="cloud-download" type="button">Cloud-Daten herunterladen</button>
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
    else refreshSyncAccount();
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
    setSyncMessage('Upload läuft …');
    uploadButton.disabled = true;
    downloadButton.disabled = true;
    try {
      const supabase = await getSupabaseClient();
      const { uploadLocalData, getSessionUserId, checkAccountBinding } = await import('./cloudSync.js');
      const { isEmptyDataset, countDataset } = await import('./cloudMap.js');
      const state = window.EMVS?.getState?.();
      if (!state) throw new Error('Lokale Daten sind nicht verfügbar.');
      const uid = await getSessionUserId(supabase);
      const binding = checkAccountBinding(uid, state);
      if (binding.status === 'mismatch') {
        const keep = await confirmDialog(
          `Dieses Gerät hält lokale Daten, die zuletzt mit Konto ${String(binding.lastUid).slice(0, 8)}… verknüpft waren. ` +
          `Du bist als neues Konto angemeldet. Exportiere zuerst ein JSON-Backup, bevor du fortfährst. Jetzt Backup exportieren?`,
          'Anderes Konto erkannt',
        );
        if (keep) window.EMVS?.exportData?.();
        setSyncMessage('Upload blockiert: Kontenfrage zuerst klären (Backup angeboten). Lokale Daten unverändert.', true);
        return;
      }
      if (isEmptyDataset(state)) {
        setSyncMessage('Lokale Daten sind leer — es gibt nichts hochzuladen. Cloud bleibt unverändert.', true);
        return;
      }
      const counts = countDataset(state);
      const ok = await confirmDialog(
        `Wirklich ${counts.total} lokale Datensätze in deine Cloud hochladen? Cloud-Zeilen werden nur ergänzt/aktualisiert, nie gelöscht.`,
        'Upload bestätigen',
      );
      if (!ok) {
        setSyncMessage('Upload abgebrochen. Nichts wurde verändert.');
        return;
      }
      const result = await uploadLocalData(supabase, state);
      const parts = result.ledger.filter((l) => !l.skipped).map((l) => `${l.table}: ${l.written}`);
      setSyncMessage(`Upload erfolgreich (${parts.join(', ') || 'nichts zu schreiben'}). Lokale Daten bleiben aktiv.`);
      window.EMVS?.toast?.show?.('Cloud-Upload erfolgreich');
      refreshSyncAccount();
    } catch (error) {
      setSyncMessage(error?.message || 'Upload fehlgeschlagen. Lokale Daten unverändert.', true);
    } finally {
      uploadButton.disabled = false;
      downloadButton.disabled = false;
    }
  });

  downloadButton?.addEventListener('click', async () => {
    setSyncMessage('Download läuft …');
    uploadButton.disabled = true;
    downloadButton.disabled = true;
    try {
      const supabase = await getSupabaseClient();
      const { downloadCloudData, downloadReplacementCheck } = await import('./cloudSync.js');
      const { isEmptyDataset, countDataset } = await import('./cloudMap.js');
      const local = window.EMVS?.getState?.();
      if (!local) throw new Error('Lokale Daten sind nicht verfügbar.');
      const { state: cloud } = await downloadCloudData(supabase);
      const check = downloadReplacementCheck(local, cloud);
      const cloudCounts = countDataset(cloud);
      if (check.needsDecision) {
        const backup = await confirmDialog(
          'Das Ersetzen lokaler Daten kann nicht rückgängig gemacht werden. Zuerst ein JSON-Backup der aktuellen lokalen Daten exportieren?',
          'Backup vor Download',
        );
        if (backup) window.EMVS?.exportData?.();
        const reason = check.reason === 'cloud-empty'
          ? 'Die Cloud ist leer, deine lokalen Daten sind es nicht. Herunterladen würde lokale Daten durch Leere ersetzen.'
          : `Lokale (${check.conflict.localCounts.total}) und Cloud-Daten (${cloudCounts.total}) sind beide nicht leer. Herunterladen ersetzt lokale Daten — nichts wird zusammengeführt.`;
        const ok = await confirmDialog(`${reason} Wirklich fortfahren?`, 'Download bestätigen');
        if (!ok) {
          setSyncMessage('Download abgebrochen. Lokale Daten unverändert.');
          return;
        }
      } else if (!isEmptyDataset(local)) {
        const ok = await confirmDialog(
          `Cloud-Daten (${cloudCounts.total} Datensätze) laden und lokale Daten ersetzen? Zuerst ein Backup exportieren wird empfohlen.`,
          'Download bestätigen',
        );
        if (!ok) {
          setSyncMessage('Download abgebrochen. Lokale Daten unverändert.');
          return;
        }
      }
      const { clearStorageError } = await import('./store.js');
      clearStorageError();
      window.EMVS.setState(cloud);
      const saved = window.EMVS.save();
      if (!saved) throw new Error('Lokales Speichern nach Download fehlgeschlagen.');
      window.EMVS.renderSidebar?.();
      window.EMVS.navigate?.('today');
      const { setLastSyncedUid, getSessionUserId } = await import('./cloudSync.js');
      try {
        setLastSyncedUid(await getSessionUserId(supabase));
      } catch {}
      refreshSyncAccount();
      setSyncMessage(`Download erfolgreich (${cloudCounts.total} Datensätze übernommen).`);
      window.EMVS?.toast?.show?.('Cloud-Daten übernommen');
    } catch (error) {
      setSyncMessage((error?.message || 'Download fehlgeschlagen.') + ' Lokale Daten unverändert.', true);
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
