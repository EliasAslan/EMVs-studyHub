/**
 * Supabase Auth UI for Settings.
 *
 * This phase only authenticates users. It does not read, upload, download,
 * replace, or clear EMVS study data. localStorage remains the app's datastore.
 */
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';

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
  `;

  const statusEl = container.querySelector('#supabase-auth-status');
  const messageEl = container.querySelector('#supabase-auth-message');
  const form = container.querySelector('#supabase-auth-form');
  const emailInput = container.querySelector('#supabase-auth-email');
  const passwordInput = container.querySelector('#supabase-auth-password');
  const signInButton = container.querySelector('#supabase-sign-in');
  const signUpButton = container.querySelector('#supabase-sign-up');
  const signOutButton = container.querySelector('#supabase-sign-out');

  const setMessage = (message, isError = false) => {
    messageEl.textContent = message || '';
    messageEl.style.color = isError ? 'var(--red)' : 'var(--ink-2)';
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
