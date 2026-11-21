<script>
  import { onMount, tick } from 'svelte';
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
  import {
    downloadWidgetSnapshotJson,
    downloadWidgetSnapshotText,
  } from '../services/widgetSnapshot.js';
  import { formatDate, dateKey, WEEKDAYS } from '../data/dates.js';
  import {
    sortedLessons,
    lessonLabel as lessonTitle,
    lessonConflicts,
    lessonDuration,
    isLessonNow,
  } from '../data/schedule.js';
  import { toast } from '../stores/toast.js';
  import { cloud, signIn, signUp, signOut, resetPassword, runSync, loadCloud } from '../stores/cloud.js';
  import { sendDeadlineReminders } from '../services/sendDeadlineReminders.js';
  import { aiSettings, saveAiSettings } from '../stores/ai.js';
  import { checkConnection, describeAiError } from '../services/localAI.js';
  import { isLoopbackUrl, normalizeBaseUrl } from '../data/aiConfig.js';
  import Modal from '../components/Modal.svelte';
  import Icon from '../components/Icon.svelte';

  let importInput;
  let resetOpen = false;
  let programEditing = null;
  let programName = '';
  let programCode = '';
  let busy = false;
  let widgetBusy = false;
  let widgetAutoSave = $appState.settings.widgetAutoSave || false;

  let lessonEditing = null;
  let lessonDay = 1;
  let lessonStart = '08:00';
  let lessonEnd = '09:00';
  let lessonModule = '';
  let lessonLabel = '';
  let lessonRoom = '';
  let formEl;
  let formTouched = false;
  let now = new Date();

  let authEmail = '';
  let authPassword = '';
  let authBusy = false;
  let authMode = 'signin';
  let showAuthPassword = false;
  let authMessage = '';
  let authError = '';

  function setAuthMode(mode) {
    authMode = mode;
    authError = '';
    authMessage = '';
  }

  function explainAuthError(error, fallback) {
    const raw = String(error?.message || '').toLowerCase();
    if (/invalid.*(credential|password)|incorrect.*password|user.*not found|invalid email or password/.test(raw)) {
      return 'E-Mail oder Passwort stimmt nicht. Prüfe deine Angaben oder setze dein Passwort zurück.';
    }
    if (/already.*(registered|exists)|user already/.test(raw)) {
      return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.';
    }
    if (/password.*(short|length)|at least.*characters/.test(raw)) {
      return 'Wähle ein Passwort mit mindestens 8 Zeichen.';
    }
    if (/email.*(invalid|valid)/.test(raw)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (/rate limit|too many requests/.test(raw)) return 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.';
    if (/failed to fetch|network|offline|timeout/.test(raw)) return 'Keine Verbindung. Prüfe dein Internet und versuche es erneut.';
    return fallback;
  }

  async function requestPasswordReset() {
    authError = '';
    authMessage = '';
    const email = authEmail.trim();
    if (!email) {
      authError = 'Gib zuerst deine E-Mail-Adresse ein.';
      return;
    }
    authBusy = true;
    try {
      await resetPassword(email);
      authMessage = 'Falls ein Konto zu dieser Adresse gehört, erhältst du eine E-Mail mit dem Link zum Zurücksetzen.';
    } catch (e) {
      authError = explainAuthError(e, 'Die E-Mail konnte gerade nicht gesendet werden. Versuche es später erneut.');
    } finally {
      authBusy = false;
    }
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
      authError = explainAuthError(e, 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      authBusy = false;
    }
  }

  async function doSignUp() {
    authError = '';
    authMessage = '';
    if (authPassword.length < 8) {
      authError = 'Wähle ein Passwort mit mindestens 8 Zeichen.';
      return;
    }
    authBusy = true;
    try {
      await signUp(authEmail.trim(), authPassword);
      authPassword = '';
      authMessage = $cloud.message || 'Konto erstellt.';
    } catch (e) {
      authError = explainAuthError(e, 'Konto konnte nicht erstellt werden. Bitte versuche es erneut.');
    } finally {
      authBusy = false;
    }
  }

  // Backup reminder state
  let reminderDismissed = false;
  let reminderDismissedAtChangeCount = 0;

  // Email reminders state (persisted via updateSettings)
  let remindersEmail = $appState.settings.email || '';
  let remindersOptIn = $appState.settings.emailReminders || false;
  let remindersDay = Number($appState.settings.remindersDay) || 5; // Friday per plan; WEEKDAYS.index from 1=Montag to 7Sonntag
  let remindersContent = ['todo', 'summary', 'none'].includes($appState.settings.remindersContent)
    ? $appState.settings.remindersContent
    : 'todo'; // todo, summary, none
  let remindersBusy = false;
  let remindersError = '';
  let remindersMessage = '';

  function saveReminders() {
    updateSettings({
      email: remindersEmail.trim(),
      emailReminders: remindersOptIn,
      remindersDay: Number(remindersDay) || 5,
      remindersContent,
    });
  }

  // Local AI settings (device only).
  let aiBase = $aiSettings.baseUrl;
  let aiModel = $aiSettings.model;
  let aiNumCtx = $aiSettings.numCtx;
  let aiModels = [];
  let aiStatus = '';
  let aiStatusKind = '';
  let aiBusy = false;
  let aiRefreshing = false;
  let aiProbed = false;

  $: signedIn = !!$cloud.session;
  $: syncStateLabel = $cloud.syncing
    ? 'Synchronisiert…'
    : $cloud.lastError
      ? 'Fehler'
      : signedIn
        ? 'Verbunden · bereit'
        : 'Nicht verbunden';
  $: settings = $appState.settings;
  $: programs = $appState.programs || [];
  $: modules = $appState.modules || [];
  $: lessons = sortedLessons($appState);
  $: lessonGroups = WEEKDAYS.map((day) => ({
    ...day,
    lessons: lessons.filter((l) => l.dayOfWeek === day.value),
  }));
  $: lessonsByDay = new Map(lessonGroups.map((group) => [group.value, group.lessons]));
  // Keep the week compact: weekends only appear once they have lessons or are today.
  $: scheduleDays = lessonGroups.filter(
    (group) => group.value <= 5 || group.lessons.length > 0 || group.value === todayDow,
  );
  $: todayDow = now.getDay() === 0 ? 7 : now.getDay();
  $: formActive = !!lessonEditing || formTouched;
  $: formConflicts = lessonConflicts(
    lessons,
    { dayOfWeek: Number(lessonDay), start: lessonStart, end: lessonEnd },
    lessonEditing?.id,
  );
  $: lastExport = settings.lastExportAt ? formatDate(dateKey(new Date(settings.lastExportAt)), 'long') : 'nie';
  $: ai = $aiSettings;
  $: aiModelOptions = [...new Set([aiModel, ...aiModels].filter(Boolean))];
  $: aiIsLocal = isLoopbackUrl(normalizeBaseUrl(aiBase));
  $: if (ai.enabled && !aiProbed) {
    aiProbed = true;
    probeAi();
  }

  onMount(() => {
    const timer = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(timer);
  });

  function moduleFor(lesson) {
    return modules.find((m) => m.id === lesson.moduleId) || null;
  }

  function shiftTime(time, minutes) {
    const [hours, mins] = String(time || '08:00')
      .split(':')
      .map(Number);
    const total = Math.min((hours || 0) * 60 + (mins || 0) + minutes, 23 * 60 + 59);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  async function revealForm() {
    await tick();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    formEl?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }

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

  async function downloadWidgetJson() {
    widgetBusy = true;
    try {
      downloadWidgetSnapshotJson();
      toast('Widget-Snapshot gespeichert (JSON)');
    } catch (e) {
      toast(e.message || 'Widget-Export fehlgeschlagen');
    } finally {
      widgetBusy = false;
    }
  }

  async function downloadWidgetText() {
    widgetBusy = true;
    try {
      downloadWidgetSnapshotText();
      toast('Widget-Snapshot gespeichert (TXT)');
    } catch (e) {
      toast(e.message || 'Widget-Export fehlgeschlagen');
    } finally {
      widgetBusy = false;
    }
  }

  function saveWidgetAutoSave() {
    updateSettings({ widgetAutoSave });
  }

  function openShortcuts() {
    window.dispatchEvent(new CustomEvent('studyhub:shortcuts'));
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

  function toggleAi(event) {
    const next = saveAiSettings({ enabled: event.target.checked });
    if (next.enabled) {
      aiProbed = true;
      probeAi();
    } else {
      aiStatus = '';
      aiStatusKind = '';
    }
  }

  async function probeAi() {
    if (aiRefreshing) return;
    aiRefreshing = true;
    const result = await checkConnection({ baseUrl: aiBase, fresh: true });
    aiRefreshing = false;
    if (result.ok) {
      aiModels = result.models;
      aiStatus = result.models.length ? `Verbunden · ${result.models.length} Modelle` : 'Verbunden';
      aiStatusKind = 'ok';
    } else {
      aiModels = [];
      aiStatus = describeAiError(result.error);
      aiStatusKind = 'error';
    }
  }

  async function testAiConnection() {
    aiBusy = true;
    aiStatus = '';
    aiStatusKind = '';
    await probeAi();
    aiBusy = false;
  }

  function saveAiBase() {
    saveAiSettings({ baseUrl: aiBase });
    aiBase = normalizeBaseUrl(aiBase);
    aiProbed = true;
    probeAi();
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
    formTouched = false;
  }

  function editLesson(lesson) {
    lessonEditing = lesson;
    lessonDay = lesson.dayOfWeek;
    lessonStart = lesson.start;
    lessonEnd = lesson.end;
    lessonModule = lesson.moduleId || '';
    lessonLabel = lesson.label || '';
    lessonRoom = lesson.room || '';
    formTouched = false;
    revealForm();
  }

  function addLessonOn(day) {
    resetLessonForm();
    lessonDay = day;
    const dayLessons = lessonsByDay.get(day) || [];
    const last = dayLessons[dayLessons.length - 1];
    lessonStart = last?.end || '08:00';
    lessonEnd = shiftTime(lessonStart, 60);
    revealForm();
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
    // Keep the day so the next lesson can be added quickly.
    const day = payload.dayOfWeek;
    resetLessonForm();
    lessonDay = day;
  }

  function removeLesson(lesson) {
    const snapshot = { ...lesson };
    deleteLesson(lesson.id);
    if (lessonEditing?.id === lesson.id) resetLessonForm();
    toast('Lektion gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => {
          createLesson(snapshot);
          toast('Lektion wiederhergestellt');
        },
      },
    });
  }

  function dayLabel(value) {
    return WEEKDAYS.find((d) => d.value === value)?.label || '';
  }

  function setAuthMode(mode) {
    authMode = mode;
    authError = '';
    authMessage = '';
  }

  function explainAuthError(error, fallback) {
    const raw = String(error?.message || '').toLowerCase();
    if (/invalid.*(credential|password)|incorrect.*password|user.*not found|invalid email or password/.test(raw)) {
      return 'E-Mail oder Passwort stimmt nicht. Prüfe deine Angaben oder setze dein Passwort zurück.';
    }
    if (/already.*(registered|exists)|user already/.test(raw)) {
      return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.';
    }
    if (/password.*(short|length)|at least.*characters/.test(raw)) {
      return 'Wähle ein Passwort mit mindestens 8 Zeichen.';
    }
    if (/email.*(invalid|valid)/.test(raw)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (/rate limit|too many requests/.test(raw)) return 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.';
    if (/failed to fetch|network|offline|timeout/.test(raw)) return 'Keine Verbindung. Prüfe dein Internet und versuche es erneut.';
    return fallback;
  }

  async function requestPasswordReset() {
    authError = '';
    authMessage = '';
    const email = authEmail.trim();
    if (!email) {
      authError = 'Gib zuerst deine E-Mail-Adresse ein.';
      return;
    }
    authBusy = true;
    try {
      await resetPassword(email);
      authMessage = 'Falls ein Konto zu dieser Adresse gehört, erhältst du eine E-Mail mit dem Link zum Zurücksetzen.';
    } catch (e) {
      authError = explainAuthError(e, 'Die E-Mail konnte gerade nicht gesendet werden. Versuche es später erneut.');
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

  <nav class="subnav" aria-label="Einstellungsbereiche">
    <a href="#settings-programs" on:click|preventDefault={() => document.getElementById('settings-programs')?.scrollIntoView({ block: 'start' })}>Programme</a>
    <a href="#settings-theme" on:click|preventDefault={() => document.getElementById('settings-theme')?.scrollIntoView({ block: 'start' })}>Darstellung</a>
    <a href="#settings-shortcuts" on:click|preventDefault={() => document.getElementById('settings-shortcuts')?.scrollIntoView({ block: 'start' })}>Tastatur</a>
    <a href="#settings-ai" on:click|preventDefault={() => document.getElementById('settings-ai')?.scrollIntoView({ block: 'start' })}>KI</a>
    <a href="#settings-schedule" on:click|preventDefault={() => document.getElementById('settings-schedule')?.scrollIntoView({ block: 'start' })}>Stundenplan</a>
    <a href="#settings-data" on:click|preventDefault={() => document.getElementById('settings-data')?.scrollIntoView({ block: 'start' })}>Daten</a>
  </nav>

  <section class="card section" id="settings-programs" aria-labelledby="programs-title">
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

  <section class="card section" id="settings-theme" aria-labelledby="theme-title">
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

  <section class="card section" id="settings-shortcuts" aria-labelledby="shortcuts-title">
    <div class="section-title">
      <h2 id="shortcuts-title">Tastaturkürzel</h2>
      <span class="hint">Schneller navigieren</span>
    </div>
    <p class="muted small">Suche, Erfassen und Seitenwechsel ohne Maus.</p>
    <div class="button-row">
      <button class="btn" type="button" on:click={openShortcuts}>
        <Icon name="help" size={15} /> Kürzel anzeigen
      </button>
    </div>
  </section>

  <section class="card section" id="settings-ai" aria-labelledby="ai-title">
    <div class="section-title">
      <h2 id="ai-title">Lokale KI</h2>
      <span class="hint">optional</span>
    </div>
    <label class="check-row">
      <input type="checkbox" checked={ai.enabled} on:change={toggleAi} />
      Lokale KI verwenden
    </label>
    {#if !ai.enabled}
      <p class="muted small">Die KI bleibt aus, bis du sie hier aktivierst. Es wird nichts gesendet.</p>
    {:else}
      <div class="ai-grid">
        <label class="field">
          <span>Adresse</span>
          <input class="input" bind:value={aiBase} on:change={saveAiBase} placeholder="http://localhost:11434" />
        </label>
        <label class="field">
          <span>Modell</span>
          <select class="select" bind:value={aiModel} on:change={() => saveAiSettings({ model: aiModel })}>
            {#each aiModelOptions as name (name)}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Kontextfenster</span>
          <input
            class="input"
            type="number"
            min="1024"
            max="32768"
            step="1024"
            bind:value={aiNumCtx}
            on:change={() => saveAiSettings({ numCtx: Number(aiNumCtx) })}
          />
        </label>
      </div>
      {#if !aiIsLocal}
        <p class="ai-warn">Nicht lokal — Daten gehen an dieses Gerät im Netzwerk.</p>
      {/if}
      <div class="ai-actions">
        <button class="btn btn-sm" type="button" on:click={testAiConnection} disabled={aiBusy || aiRefreshing}>
          {aiBusy || aiRefreshing ? 'Prüfe…' : 'Verbindung testen'}
        </button>
        <button class="btn btn-sm btn-ghost" type="button" on:click={() => { aiProbed = true; probeAi(); }} disabled={aiBusy || aiRefreshing}>
          Modelle aktualisieren
        </button>
      </div>
      {#if aiStatus}
        <p class="ai-status" class:ok={aiStatusKind === 'ok'} class:error={aiStatusKind === 'error'} role="status">{aiStatus}</p>
      {/if}
      <p class="muted small">Diese Einstellungen bleiben auf diesem Gerät.</p>
    {/if}
  </section>

  <section class="card section" id="settings-schedule" aria-labelledby="schedule-title">
    <div class="section-title">
      <h2 id="schedule-title">Stundenplan</h2>
      <span class="hint">{lessons.length} {lessons.length === 1 ? 'Lektion' : 'Lektionen'} pro Woche</span>
    </div>

    <div class="schedule">
      {#each scheduleDays as group (group.value)}
        <div class="day-block" class:today={group.value === todayDow}>
          <div class="day-head">
            <p class="day-name">
              {group.short}
              {#if group.value === todayDow}<span class="day-badge">Heute</span>{/if}
            </p>
            <div class="day-tools">
              {#if group.lessons.length}<span class="day-count">{group.lessons.length}</span>{/if}
              <button
                class="icon add"
                type="button"
                aria-label={`Lektion am ${group.label} erfassen`}
                title="Lektion erfassen"
                on:click={() => addLessonOn(group.value)}
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
          </div>
          {#if group.lessons.length}
            {#each group.lessons as lesson (lesson.id)}
              {@const mod = moduleFor(lesson)}
              <div class="lesson-row" class:editing={lessonEditing?.id === lesson.id}>
                <button class="lesson-main" type="button" on:click={() => editLesson(lesson)}>
                  <span class="lesson-line">
                    {#if mod}<span class="mod-dot" style:--dot={mod.accent} aria-hidden="true"></span>{/if}
                    <span class="lesson-name">{lessonTitle($appState, lesson)}</span>
                  </span>
                  <span class="lesson-meta mono">
                    <span>{lesson.start}–{lesson.end}{#if lessonDuration(lesson)} · {lessonDuration(lesson)} Min{/if}</span>
                    {#if isLessonNow(lesson, now)}<span class="now-badge">Jetzt</span>{/if}
                    {#if lesson.room}<span class="lesson-room">{lesson.room}</span>{/if}
                  </span>
                </button>
                <button class="icon" type="button" aria-label={`${lessonTitle($appState, lesson)} löschen`} on:click={() => removeLesson(lesson)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            {/each}
          {:else}
            <button class="free" type="button" on:click={() => addLessonOn(group.value)}>
              <Icon name="plus" size={12} /> Lektion erfassen
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <form
      class="lesson-form"
      bind:this={formEl}
      on:submit|preventDefault={saveLesson}
      on:input={() => (formTouched = true)}
    >
      <p class="form-title">{lessonEditing ? 'Lektion bearbeiten' : 'Neue Lektion'} · {dayLabel(lessonDay)}</p>
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
      {#if formActive && formConflicts.length}
        <p class="conflict" role="status">
          Überschneidet sich mit
          {formConflicts.map((l) => `${lessonTitle($appState, l)} (${l.start}–${l.end})`).join(', ')}.
        </p>
      {/if}
      <div class="form-actions">
        {#if lessonEditing}
          <button class="btn btn-ghost" type="button" on:click={resetLessonForm}>Abbrechen</button>
        {/if}
        <button class="btn btn-primary" type="submit">{lessonEditing ? 'Speichern' : 'Erfassen'}</button>
      </div>
    </form>
  </section>

  <section class="card section" id="settings-data" aria-labelledby="backup-title">
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
      <input
        class="sr-only"
        type="file"
        accept="application/json,.json"
        aria-label="Datensicherung importieren"
        tabindex="-1"
        bind:this={importInput}
        on:change={onImport}
      />
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

  <section class="card section" id="settings-desktop-widgets" aria-labelledby="desktop-widgets-title">
    <div class="section-title">
      <h2 id="desktop-widgets-title">Desktop-Widget</h2>
      <span class="hint">Rainmeter · Windows Desktop</span>
    </div>
    <p class="muted small">
      Snapshot für Desktop-Widgets. Keine Notiztexte, Noten, E-Mails oder IDs. Der Inhalt ist rein lesbar.
    </p>
    <div class="button-row">
      <button class="btn btn-primary" type="button" on:click={downloadWidgetJson} disabled={widgetBusy}>
        <Icon name="file" size={15} /> JSON herunterladen
      </button>
      <button class="btn" type="button" on:click={downloadWidgetText} disabled={widgetBusy}>
        <Icon name="file" size={15} /> TXT für Rainmeter
      </button>
    </div>
    <p class="muted small">
      JSON ist für zukünftige Widgets vorgesehen. Die TXT-Datei ist im einfachen
      key=value-Format und lässt sich mit Rainmeter WebParser einlesen.
    </p>
    <label class="pref-row">
      <input type="checkbox" bind:checked={widgetAutoSave} on:change={saveWidgetAutoSave} />
      <span>Snapshot automatisch speichern</span>
    </label>
    <p class="muted small">
      Aktiviere das Widget-Snapshot für automatische Updates: Study Hub schreibt
      dann bei Änderungen an Hausaufgaben und Prüfungen die TXT-Datei in deinen
      ausgewählten Speicherort. Die Desktop-Widgets (Rainmeter) lesen die Datei beim
      nächsten Refresh.
    </p>
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
          <input class="input" type="email" bind:value={remindersEmail} placeholder="name@beispiel.ch" on:change={saveReminders} />
        </label>
        <label class="field">
          <span>Tag</span>
          <select class="select" bind:value={remindersDay} on:change={saveReminders}>
            {#each WEEKDAYS as day (day.value)}
              <option value={day.value}>{day.label}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Inhalt</span>
          <select class="select" bind:value={remindersContent} on:change={saveReminders}>
            <option value="todo">Als To-Do-Liste (Hausaufgaben + Prüfungen fällig morgen)</option>
            <option value="summary">Als Zusammenfassung</option>
            <option value="none">Kein Inhalt</option>
          </select>
        </label>
        <label class="pref-row">
          <input type="checkbox" bind:checked={remindersOptIn} on:change={saveReminders} />
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
      <p class="auth-intro">Melde dich an, um deine Daten mit Neon auf mehreren Geräten zu synchronisieren. Study Hub funktioniert auch ohne Konto weiter.</p>
      <div class="auth-card">
        <div class="auth-tabs" role="group" aria-label="Kontoaktion">
          <button class:active={authMode === 'signin'} type="button" aria-pressed={authMode === 'signin'} on:click={() => setAuthMode('signin')}>Anmelden</button>
          <button class:active={authMode === 'signup'} type="button" aria-pressed={authMode === 'signup'} on:click={() => setAuthMode('signup')}>Konto erstellen</button>
        </div>
        {#if authMode === 'signup'}
          <p class="auth-note">Erstelle ein neues Neon-Konto. Frühere Supabase-Konten funktionieren hier nicht; deine Daten auf diesem Gerät bleiben erhalten.</p>
        {/if}
        <form class="auth-form" on:submit|preventDefault={authMode === 'signin' ? doSignIn : doSignUp}>
          <label class="field">
            <span>E-Mail-Adresse</span>
            <input class="input" type="email" bind:value={authEmail} autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required />
          </label>
          <label class="field">
            <span>Passwort</span>
            <div class="password-control">
              <input class="input" type={showAuthPassword ? 'text' : 'password'} bind:value={authPassword} autocomplete={authMode === 'signin' ? 'current-password' : 'new-password'} minlength={authMode === 'signup' ? 8 : 1} required />
              <button type="button" class="password-toggle" aria-label={showAuthPassword ? 'Passwort verbergen' : 'Passwort anzeigen'} aria-pressed={showAuthPassword} on:click={() => (showAuthPassword = !showAuthPassword)}>{showAuthPassword ? 'Verbergen' : 'Anzeigen'}</button>
            </div>
            {#if authMode === 'signup'}<span class="auth-help">Mindestens 8 Zeichen.</span>{/if}
          </label>
          <button class="btn btn-primary auth-submit" type="submit" disabled={authBusy || !authEmail.trim() || !authPassword}>
            {authBusy ? 'Bitte warten…' : authMode === 'signin' ? 'Anmelden' : 'Konto erstellen'}
          </button>
        </form>
        {#if authMode === 'signin'}
          <button class="text-button" type="button" on:click={requestPasswordReset} disabled={authBusy || !authEmail.trim()}>Passwort vergessen?</button>
        {/if}
      </div>
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
  .subnav {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
  }
  .subnav a {
    flex: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-1);
    color: var(--ink-2);
    font-size: var(--text-xs);
    font-weight: 600;
    text-decoration: none;
  }
  .subnav a:hover {
    background: var(--surface-2);
    color: var(--ink);
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
    scroll-margin-top: 110px;
  }
  .auth-intro {
    max-width: 58ch;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .auth-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 460px;
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--surface-2);
  }
  .auth-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-1);
    padding: 3px;
    border-radius: var(--radius-2);
    background: var(--surface);
  }
  .auth-tabs button {
    min-height: 40px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .auth-tabs button.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .auth-note, .auth-help { color: var(--ink-2); font-size: var(--text-xs); }
  .auth-form { display: flex; flex-direction: column; gap: var(--space-3); }
  .password-control { position: relative; display: flex; align-items: center; }
  .password-control .input { padding-right: 88px; }
  .password-toggle {
    position: absolute;
    right: var(--space-2);
    min-height: 36px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .auth-submit { width: 100%; }
  .text-button {
    align-self: flex-start;
    padding: var(--space-1) 0;
    border: 0;
    background: transparent;
    color: var(--accent-strong);
    font-size: var(--text-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .text-button:disabled { opacity: .5; cursor: not-allowed; }
  .auth-intro {
    max-width: 58ch;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .auth-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 460px;
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: var(--surface-2);
  }
  .auth-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-1);
    padding: 3px;
    border-radius: var(--radius-2);
    background: var(--surface);
  }
  .auth-tabs button {
    min-height: 40px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .auth-tabs button.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .auth-note, .auth-help {
    color: var(--ink-2);
    font-size: var(--text-xs);
  }
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: none;
  }
  .password-control {
    position: relative;
    display: flex;
    align-items: center;
  }
  .password-control .input {
    padding-right: 88px;
  }
  .password-toggle {
    position: absolute;
    right: var(--space-2);
    min-height: 36px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .auth-submit {
    width: 100%;
  }
  .text-button {
    align-self: flex-start;
    padding: var(--space-1) 0;
    border: 0;
    background: transparent;
    color: var(--accent-strong);
    font-size: var(--text-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .text-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
  .check-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 32px;
    font-size: var(--text-sm);
  }
  .ai-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
  .ai-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .ai-warn {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-1);
    background: var(--warn-soft, var(--surface-2));
    color: var(--ink-2);
    font-size: var(--text-xs);
  }
  .ai-status {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .ai-status.ok {
    color: var(--ok);
  }
  .ai-status.error {
    color: var(--warn);
  }
  .schedule {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-2);
  }
  .day-block {
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
    min-height: 84px;
    overflow: hidden;
  }
  .day-block.today {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--rule));
    background: color-mix(in srgb, var(--accent) 6%, var(--surface-2));
  }
  .day-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    margin-bottom: var(--space-1);
  }
  .day-name {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--ink-3);
  }
  .day-block.today .day-name {
    color: var(--accent-strong);
  }
  .day-badge {
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .day-tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .day-count {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--ink-3);
  }
  .lesson-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 1px;
    margin-bottom: var(--space-1);
    padding: 1px;
    border-radius: var(--radius-1);
    min-width: 0;
  }
  .lesson-row.editing {
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .lesson-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: 2px 3px;
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink);
    text-align: left;
    line-height: 1.25;
  }
  .lesson-main:hover {
    background: var(--surface);
  }
  .lesson-line {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 100%;
  }
  .lesson-name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 0.78125rem;
    font-weight: 550;
  }
  .lesson-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 5px;
    max-width: 100%;
    font-size: 9.5px;
    color: var(--ink-3);
  }
  .lesson-room {
    overflow-wrap: anywhere;
  }
  .now-badge {
    flex: none;
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--ok) 16%, transparent);
    color: var(--ok);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .free {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    min-height: 30px;
    margin-top: 2px;
    padding: 0 4px;
    border: 1px dashed var(--rule);
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
    font-size: 9.5px;
  }
  .free:hover {
    border-color: var(--accent);
    background: var(--surface);
    color: var(--accent-strong);
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
  .icon.add {
    width: 20px;
    height: 20px;
  }
  .lesson-row .icon {
    align-self: center;
  }
  .icon:hover {
    background: var(--surface);
    color: var(--danger);
  }
  .icon.add:hover {
    color: var(--accent-strong);
  }
  .conflict {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-1);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-xs);
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
  @media (max-width: 899px) {
    .schedule {
      grid-template-columns: 1fr;
    }
    .day-block {
      min-height: 0;
    }
  }
  @media (min-width: 700px) {
    .form-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
