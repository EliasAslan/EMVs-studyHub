<script>
  import {
    appState,
    updateSettings,
    updateProgram,
    createLesson,
    updateLesson,
    deleteLesson,
    exportBackup,
    importBackup,
    resetAll,
  } from '../stores/app.js';
  import { downloadBackup } from '../services/backup.js';
  import { formatDate, dateKey, WEEKDAYS } from '../data/dates.js';
  import { sortedLessons, lessonLabel as lessonTitle } from '../data/schedule.js';
  import { toast } from '../stores/toast.js';
  import { cloud, signIn, signUp, signOut, runSync, loadCloud } from '../stores/cloud.js';
  import { sendDeadlineReminders } from '../services/sendDeadlineReminders.js';
  import Modal from '../components/Modal.svelte';
  import Icon from '../components/Icon.svelte';

  let importInput;
  let resetOpen = false;
  let programEditing = null;
  let programName = '';
  let programCode = '';
  let busy = false;

  let lessonEditing = null;
  let lessonDay = 1;
  let lessonStart = '08:00';
  let lessonEnd = '09:00';
  let lessonModule = '';
  let lessonLabel = '';
  let lessonRoom = '';

  let authEmail = '';
  let authPassword = '';
  let authBusy = false;
  let authMessage = '';
  let authError = '';

  // Backup reminder state
  let reminderDismissed = false;
  let reminderDismissedAtChangeCount = 0;

  // Email reminders state
  let remindersEmail = $appState.settings.email || '';
  let remindersOptIn = $appState.settings.emailReminders || false;
  let remindersDay = 5; // Friday per plan; WEEKDAYS.index from 1=Montag to 7Sonntag
  let remindersContent = 'todo'; // todo, summary, none
  let remindersBusy = false;
  let remindersError = '';

  $: signedIn = !!$cloud.session;
  $: syncStateLabel = $cloud.syncing
    ? 'läuft'
    : $cloud.lastError
      ? 'Fehler'
      : signedIn
        ? 'bereit'
        : 'aus';
  $: settings = $appState.settings;
  $: programs = $appState.programs || [];
  $: modules = $appState.modules || [];
  $: lessons = sortedLessons($appState);
  $: lessonGroups = WEEKDAYS.map((day) => ({
    ...day,
    lessons: lessons.filter((l) => l.dayOfWeek === day.value),
  }));
  $: lastExport = settings.lastExportAt ? formatDate(dateKey(new Date(settings.lastExportAt)), 'long') : 'nie';
  $: remindersOptIn = settings.emailReminders || false;

  async function doExport() {
    busy = true;
    try {
      await downloadBackup();
      toast('Backup gespeichert');
    } catch (e) {
      toast(e.message || 'Export fehlgeschlagen');
    } finally {
      busy = false;
    }
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    busy = true;
    try {
      const text = await file.text();
      const result = importBackup(text);
      if (result.success) toast('Backup importiert');
      else toast(result.error || 'Import fehlgeschlagen');
    } catch {
      toast('Datei konnte nicht gelesen werden');
    } finally {
      busy = false;
    }
  }

  async function doReset() {
    await resetAll();
    resetOpen = false;
    toast('Alles zurückgesetzt');
  }

  function openProgram(program) {
    programEditing = program;
    programName = program.name;
    programCode = program.code || '';
  }

  function saveProgram() {
    if (!programEditing) return;
    updateProgram(programEditing.id, {
      name: programName.trim() || programEditing.name,
      code: programCode.trim() || programName.trim(),
    });
    programEditing = null;
    toast('Programm gespeichert');
  }

  function resetLessonForm() {
    lessonEditing = null;
    lessonDay = 1;
    lessonStart = '08:00';
    lessonEnd = '09:00';
    lessonModule = '';
    lessonLabel = '';
    lessonRoom = '';
  }

  function editLesson(lesson) {
    lessonEditing = lesson;
    lessonDay = lesson.dayOfWeek;
    lessonStart = lesson.start;
    lessonEnd = lesson.end;
    lessonModule = lesson.moduleId || '';
    lessonLabel = lesson.label || '';
    lessonRoom = lesson.room || '';
  }

  function saveLesson() {
    const payload = {
      dayOfWeek: Number(lessonDay),
      start: lessonStart || '08:00',
      end: lessonEnd || '09:00',
      moduleId: lessonModule || null,
      label: lessonLabel.trim(),
      room: lessonRoom.trim(),
    };
    if (payload.end <= payload.start) {
      toast('Ende muss nach dem Start liegen.');
      return;
    }
    if (!payload.moduleId && !payload.label) {
      toast('Modul oder Bezeichnung angeben.');
      return;
    }
    if (lessonEditing) {
      updateLesson(lessonEditing.id, payload);
      toast('Lektion gespeichert');
    } else {
      createLesson(payload);
      toast('Lektion erfasst');
    }
    resetLessonForm();
  }

  function removeLesson(lesson) {
    deleteLesson(lesson.id);
    if (lessonEditing?.id === lesson.id) resetLessonForm();
    toast('Lektion gelöscht');
  }

  function dayLabel(value) {
    return WEEKDAYS.find((d) => d.value === value)?.label || '';
  }

  async function doSignIn() {
    authError = '';
    authMessage = '';
    authBusy = true;
    try {
      await signIn(authEmail.trim(), authPassword);
      authPassword = '';
      authMessage = 'Angemeldet.';
    } catch (e) {
      authError = e?.message || 'Anmeldung fehlgeschlagen.';
    } finally {
      authBusy = false;
    }
  }

  async function doSignUp() {
    authError = '';
    authMessage = '';
    if (authPassword.length < 6) {
      authError = 'Passwort: mindestens 6 Zeichen.';
      return;
    }
    authBusy = true;
    try {
      await signUp(authEmail.trim(), authPassword);
      authPassword = '';
      authMessage = $cloud.message || 'Konto erstellt.';
    } catch (e) {
      authError = e?.message || 'Konto konnte nicht erstellt werden.';
    } finally {
      authBusy = false;
    }
  }

  async function doSignOut() {
    authError = '';
    authBusy = true;
    try {
      await signOut();
      authMessage = 'Abgemeldet. Lokale Daten bleiben.';
    } catch (e) {
      authError = e?.message || 'Abmelden fehlgeschlagen.';
    } finally {
      authBusy = false;
    }
  }

  async function syncNow(upload = true) {
    authError = '';
    try {
      if (upload) await runSync({ reason: 'manual' });
      else await loadCloud();
    } catch {
      // The cloud store already holds the translated error.
    }
  }

  async function sendReminderTest() {
    if (!remindersOptIn) return;
    remindersBusy = true;
    remindersError = '';
    remindersMessage = '';
    try {
      const result = await sendDeadlineReminders();
      if (result?.note) {
        remindersMessage = result.note;
      } else if (result?.error) {
        remindersError = result.error;
      } else if (result?.content) {
        remindersMessage = `E-Mail-Inhalt: ${result.content.slice(0, 100)}...`;
      }
    } catch (e) {
      remindersError = e?.message || 'Fehler beim Senden der Test-E-Mail';
      remindersMessage = '';
    } finally {
      remindersBusy = false;
    }
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Einrichten</p>
      <h1>Einstellungen</h1>
    </div>
  </header>

  <section class="card section" aria-labelledby="programs-title">
    <div class="section-title">
      <h2 id="programs-title">Programme</h2>
      <span class="hint">EMVs und BM</span>
    </div>
    <div class="program-list">
      {#each programs as program (program.id)}
        <div class="program-row">
          <span class="dot" style:--dot={program.accent} aria-hidden="true"></span>
          <span class="program-text">
            <span class="program-name">{program.name}</span>
            <span class="program-code mono">{program.code}</span>
          </span>
          <button class="btn btn-sm btn-ghost" type="button" on:click={() => openProgram(program)}>
            <Icon name="edit" size={14} /> Bearbeiten
          </button>
        </div>
      {/each}
    </div>
  </section>

  <section class="card section" aria-labelledby="theme-title">
    <div class="section-title">
      <h2 id="theme-title">Darstellung</h2>
    </div>
    <div class="segmented" role="group" aria-label="Design wählen">
      {#each [{ value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }, { value: 'system', label: 'System' }] as option (option.value)}
        <button
          class="seg"
          class:active={settings.theme === option.value}
          type="button"
          aria-pressed={settings.theme === option.value}
          on:click={() => updateSettings({ theme: option.value })}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="card section" aria-labelledby="schedule-title">
    <div class="section-title">
      <h2 id="schedule-title">Stundenplan</h2>
      <span class="hint">Nächste Lektion auf Heute</span>
    </div>

    <div class="schedule">
      {#each lessonGroups as group (group.value)}
        <div class="day-block">
          <p class="day-name">{group.short}</p>
          {#if group.lessons.length}
            {#each group.lessons as lesson (lesson.id)}
              <div class="lesson-row">
                <span class="lesson-time mono">{lesson.start}–{lesson.end}</span>
                <button class="lesson-main" type="button" on:click={() => editLesson(lesson)}>
                  <span>{lesson.label || lessonTitle($appState, lesson)}</span>
                  {#if lesson.room}<span class="room">{lesson.room}</span>{/if}
                </button>
                <button class="icon" type="button" aria-label={`${lessonTitle($appState, lesson)} löschen`} on:click={() => removeLesson(lesson)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            {/each}
          {:else}
            <p class="free">frei</p>
          {/if}
        </div>
      {/each}
    </div>

    <form class="lesson-form" on:submit|preventDefault={saveLesson}>
      <p class="form-title">{lessonEditing ? `Lektion · ${dayLabel(lessonEditing.dayOfWeek)}` : 'Neue Lektion'}</p>
      <div class="form-grid">
        <label class="field">
          <span>Tag</span>
          <select class="select" bind:value={lessonDay}>
            {#each WEEKDAYS as day (day.value)}<option value={day.value}>{day.label}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Start</span>
          <input class="input" type="time" bind:value={lessonStart} />
        </label>
        <label class="field">
          <span>Ende</span>
          <input class="input" type="time" bind:value={lessonEnd} />
        </label>
        <label class="field">
          <span>Modul</span>
          <select class="select" bind:value={lessonModule}>
            <option value="">Kein Modul</option>
            {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Bezeichnung</span>
          <input class="input" bind:value={lessonLabel} placeholder="optional" />
        </label>
        <label class="field">
          <span>Raum</span>
          <input class="input" bind:value={lessonRoom} placeholder="optional" />
        </label>
      </div>
      <div class="form-actions">
        {#if lessonEditing}
          <button class="btn btn-ghost" type="button" on:click={resetLessonForm}>Abbrechen</button>
        {/if}
        <button class="btn btn-primary" type="submit">{lessonEditing ? 'Speichern' : 'Hinzufügen'}</button>
      </div>
    </form>
  </section>

  <section class="card section" aria-labelledby="backup-title">
    <div class="section-title">
      <h2 id="backup-title">Backup</h2>
      <span class="hint">Zuletzt: {lastExport}</span>
    </div>
    <p class="muted small">
      JSON enthält alle Daten. Dateien (PDF, Fotos) bleiben lokal auf diesem Gerät.
    </p>
    <div class="button-row">
      <button class="btn btn-primary" type="button" on:click={doExport} disabled={busy}>
        <Icon name="file" size={15} /> Exportieren
      </button>
      <button class="btn" type="button" on:click={() => importInput?.click()} disabled={busy}>
        Importieren
      </button>
      <input class="sr-only" type="file" accept="application/json,.json" bind:this={importInput} on:change={onImport} />
    </div>
    {#if settings.changeCount >= 25 && (reminderDismissed === false || settings.changeCount >= reminderDismissedAtChangeCount)}
      <div class="reminder-banner">
        <p class="reminder">25 Änderungen seit dem letzten Export.</p>
        <button class="btn btn-ghost btn-xs" type="button" on:click={() => { reminderDismissed = true; reminderDismissedAtChangeCount = settings.changeCount + 25; }} aria-label="Erinnerung ausblenden">
          <Icon name="x" size={12} aria-hidden="true" />
        </button>
      </div>
    {/if}
  </section>

  <section class="card section" aria-labelledby="email-title">
    <div class="section-title">
      <h2 id="email-title">Erinnerungen</h2>
      <span class="badge" class:is-on={remindersOptIn} class:is-busy={remindersBusy} class:is-error={!!remindersError}>
        <span class="sync-dot" aria-hidden="true"></span>
        {remindersOptIn ? 'ein' : 'aus'}
      </span>
    </div>

    {#if !signedIn}
      <p class="muted small">Bitte dich zuerst bei Supabase anmelden.</p>
    {:else}
      <div>
        <label class="field">
          <span>E-Mail</span>
          <input class="input" type="email" bind:value={remindersEmail} placeholder="name@beispiel.ch" />
        </label>
        <label class="field">
          <span>Tag</span>
          <select class="select" bind:value={remindersDay}>
            {#each WEEKDAYS as day (day.value)}
              <option value={day.value}>{day.label}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Inhalt</span>
          <select class="select" bind:value={remindersContent}>
            <option value="todo">Als To-Do-Liste (Hausaufgaben + Prüfungen fällig morgen)</option>
            <option value="summary">Als Zusammenfassung</option>
            <option value="none">Kein Inhalt</option>
          </select>
        </label>
        <label class="pref-row">
          <input type="checkbox" bind:checked={remindersOptIn} />
          <span>Erinnerungen aktivieren</span>
        </label>
      </div>
      {#if remindersError}<p class="error small" role="alert">{remindersError}</p>{/if}
      {#if remindersMessage}<p class="muted small">{remindersMessage}</p>{/if}
    {/if}
  </section>

  <section class="card section" aria-labelledby="sync-title">
    <div class="section-title">
      <h2 id="sync-title">Cloud</h2>
      <span class="sync-badge" class:on={signedIn && !$cloud.lastError} class:busy={$cloud.syncing} class:error={!!$cloud.lastError}>
        <span class="sync-dot" aria-hidden="true"></span>
        {syncStateLabel}
      </span>
    </div>

    {#if !$cloud.configured}
      <p class="muted small">Cloud ist nicht konfiguriert.</p>
    {:else if !signedIn}
      <p class="muted small">Gerät ist die Wahrheit. Anmelden schaltet den stillen Sync frei.</p>
      <form class="auth-form" on:submit|preventDefault={doSignIn}>
        <label class="field">
          <span>E-Mail</span>
          <input class="input" type="email" bind:value={authEmail} autocomplete="email" required />
        </label>
        <label class="field">
          <span>Passwort</span>
          <input class="input" type="password" bind:value={authPassword} autocomplete="current-password" minlength="6" required />
        </label>
        <div class="button-row">
          <button class="btn btn-primary" type="submit" disabled={authBusy || !authEmail.trim() || !authPassword}>
            {authBusy ? 'Bitte warten…' : 'Anmelden'}
          </button>
          <button class="btn" type="button" on:click={doSignUp} disabled={authBusy || !authEmail.trim() || !authPassword}>
            Konto erstellen
          </button>
        </div>
      </form>
    {:else}
      <div class="sync-account">
        <span class="muted small">{$cloud.email}</span>
        <span class="muted small">Zuletzt: {$cloud.lastSynced}</span>
      </div>
      <div class="button-row">
        <button class="btn btn-primary" type="button" on:click={() => syncNow(true)} disabled={$cloud.syncing}>
          {$cloud.syncing ? 'Synchronisiert…' : 'Synchronisieren'}
        </button>
        <button class="btn" type="button" on:click={() => syncNow(false)} disabled={$cloud.syncing}>
          Cloud laden
        </button>
        <button class="btn btn-ghost" type="button" on:click={doSignOut} disabled={authBusy}>Abmelden</button>
      </div>
      {#if $cloud.message}<p class="muted small">{$cloud.message}</p>{/if}
      {#if $cloud.lastError}
        <div class="sync-error" role="alert">
          <strong>{$cloud.lastError.title}</strong>
          <span>{$cloud.lastError.action}</span>
          <details>
            <summary>Details ({$cloud.lastError.code})</summary>
            <code>{$cloud.lastError.technical}</code>
          </details>
        </div>
      {/if}
    {/if}

    {#if authMessage}<p class="muted small">{authMessage}</p>{/if}
    {#if authError}<p class="error small" role="alert">{authError}</p>{/if}
  </section>

  <section class="card section danger" aria-labelledby="reset-title">
    <div class="section-title">
      <h2 id="reset-title">Zurücksetzen</h2>
    </div>
    <p class="muted small">Löscht alle Daten und Dateien auf diesem Gerät. Exportiere vorher ein Backup.</p>
    <button class="btn btn-danger" type="button" on:click={() => (resetOpen = true)}>Alles löschen</button>
  </section>
</div>

<Modal open={!!programEditing} title="Programm bearbeiten" on:close={() => (programEditing = null)}>
  <div class="stack">
    <label class="field">
      <span>Name</span>
      <input class="input" bind:value={programName} data-autofocus />
    </label>
    <label class="field">
      <span>Kürzel</span>
      <input class="input" bind:value={programCode} />
    </label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (programEditing = null)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={saveProgram}>Speichern</button>
  </svelte:fragment>
</Modal>

<Modal open={resetOpen} title="Alles löschen" on:close={() => (resetOpen = false)}>
  <p>Alle Module, Notizen, Hausaufgaben, Prüfungen, Links und lokalen Dateien werden entfernt. Das lässt sich nicht rückgängig machen.</p>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (resetOpen = false)}>Abbrechen</button>
    <button class="btn btn-danger" type="button" on:click={doReset}>Löschen</button>
  </svelte:fragment>
</Modal>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 880px;
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .eyebrow {
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    color: var(--ink-2);
  }
  h1 {
    font-size: clamp(1.9rem, 4vw, 2.4rem);
    letter-spacing: -0.03em;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }
  .section.danger {
    border-color: var(--danger);
  }
  .section-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .section-title h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .hint,
  .small {
    font-size: var(--text-xs);
  }
  .program-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .program-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2);
  }
  .program-row:hover {
    background: var(--surface-2);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--dot, var(--accent));
    flex: none;
  }
  .program-text {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex: 1;
  }
  .program-name {
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .program-code {
    font-size: 10px;
    color: var(--ink-3);
  }
  .segmented {
    display: flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .seg {
    flex: 1;
    min-height: 38px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .seg.active {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }
  .schedule {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-2);
  }
  .day-block {
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
    min-height: 84px;
    overflow: hidden;
  }
  .day-name {
    margin-bottom: var(--space-1);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--ink-3);
  }
  .lesson-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'time icon'
      'main icon';
    align-items: start;
    gap: 1px var(--space-1);
    margin-bottom: var(--space-1);
    min-width: 0;
  }
  .lesson-time {
    grid-area: time;
    font-size: 9px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .lesson-main {
    grid-area: main;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font-size: 0.75rem;
    text-align: left;
    line-height: 1.3;
    padding: 0;
  }
  .lesson-main span {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .lesson-main:hover {
    color: var(--accent-strong);
  }
  .room {
    font-size: 9px;
    color: var(--ink-3);
  }
  .free {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
  }
  .lesson-row .icon {
    grid-area: icon;
    align-self: center;
  }
  .icon:hover {
    background: var(--surface);
    color: var(--danger);
  }
  .lesson-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
  .form-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-2);
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .reminder {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-xs);
  }
  .sync-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .sync-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .sync-badge.on .sync-dot {
    background: var(--ok);
  }
  .sync-badge.busy .sync-dot {
    background: var(--accent);
  }
  .sync-badge.error .sync-dot {
    background: var(--warn);
  }
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 420px;
  }
  .sync-account {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .sync-error {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--warn);
    border-radius: var(--radius-2);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-xs);
  }
  .sync-error details {
    color: var(--ink-2);
  }
  .sync-error code {
    display: block;
    margin-top: var(--space-1);
    font-family: var(--font-mono);
    font-size: 10px;
    word-break: break-word;
  }
  .error {
    color: var(--danger);
  }
  .pref-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
  }
  .pref-row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  @media (min-width: 700px) {
    .form-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
