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
  import { calendarPrefs } from '../stores/viewPrefs.js';
  import { cloud, signIn, signUp, signOut, resetPassword, runSync, loadCloud } from '../stores/cloud.js';
  import { sendDeadlineReminders } from '../services/sendDeadlineReminders.js';
  import { aiSettings, saveAiSettings } from '../stores/ai.js';
  import { checkConnection, describeAiError } from '../services/localAI.js';
  import { isLoopbackUrl, normalizeBaseUrl } from '../data/aiConfig.js';
  import Modal from '../components/Modal.svelte';
  import Icon from '../components/Icon.svelte';
  import NumberStepper from '../components/NumberStepper.svelte';

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

  const sectionLinks = [
    ['settings-programs', 'Programme'],
    ['settings-theme', 'Darstellung'],
    ['settings-shortcuts', 'Tastatur'],
    ['settings-ai', 'KI'],
    ['settings-schedule', 'Stundenplan'],
    ['settings-data', 'Backups'],
    ['settings-desktop-widgets', 'Widgets'],
    ['settings-email', 'E-Mail'],
    ['settings-cloud', 'Cloud'],
  ];
  const sectionIds = sectionLinks.map(([id]) => id);
  let activeSection = sectionIds[0];
  let scheduleOpen = true;
  let lessonFormOpen = false;
  let widgetsOpen = false;
  let remindersOpen = false;

  function goToSection(id) {
    activeSection = id;
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

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
    const message = String(error?.message || error?.error?.message || error?.cause?.message || '').trim();
    const raw = message.toLowerCase();
    if (/invalid.*(credential|password)|incorrect.*password|user.*not found|invalid email or password/.test(raw)) {
      return 'E-Mail oder Passwort stimmt nicht. Prüfe deine Angaben oder setze dein Passwort zurück.';
    }
    if (/already.*(registered|exists)|user already/.test(raw)) {
      return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.';
    }
    if (/signup_not_allowed|sign.?up.*(disabled|not allowed)/.test(raw)) {
      return 'Die Kontoerstellung ist in Neon Auth deaktiviert. Bitte kontaktiere die Administration.';
    }
    if (/invalid.*domain|origin.*not.*allowed|trusted.*origin/.test(raw)) {
      return 'Diese App-Adresse ist in Neon Auth nicht freigegeben. Füge die Website-Adresse zu den erlaubten Neon Auth Domains hinzu.';
    }
    if (/password.*(short|length)|at least.*characters/.test(raw)) {
      return 'Wähle ein Passwort mit mindestens 8 Zeichen.';
    }
    if (/email.*(invalid|valid)/.test(raw)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (/rate limit|too many requests/.test(raw)) return 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.';
    if (/failed to fetch|network|offline|timeout/.test(raw)) return 'Keine Verbindung. Prüfe dein Internet und versuche es erneut.';
    return message ? `${fallback} (Neon: ${message})` : fallback;
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
  $: syncStateLabel = !$cloud.online
    ? 'Offline · wartet auf Internet'
    : $cloud.syncing
      ? 'Synchronisiert…'
      : $cloud.lastError
        ? 'Aktion nötig'
        : signedIn
          ? $cloud.syncPending ? 'Sync ausstehend' : 'Aktuell'
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
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) activeSection = visible[0].target.id;
      },
      { rootMargin: '-110px 0px -65% 0px' },
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      clearInterval(timer);
      observer.disconnect();
    };
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

  function setLessonDuration(minutes) {
    lessonEnd = shiftTime(lessonStart, minutes);
  }

  async function revealForm() {
    lessonFormOpen = true;
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
    lessonFormOpen = false;
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
    {#each sectionLinks as [id, label] (id)}
      <a
        href={`#${id}`}
        class:active={activeSection === id}
        aria-current={activeSection === id ? 'location' : undefined}
        on:click|preventDefault={() => goToSection(id)}
      >{label}</a>
    {/each}
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
        <Icon name="keyboard" size={15} /> Kürzel anzeigen
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
          <NumberStepper
            bind:value={aiNumCtx}
            min={1024}
            max={32768}
            step={1024}
            label="Kontextfenster"
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
      <button
        class="section-toggle"
        type="button"
        aria-expanded={scheduleOpen}
        aria-controls="settings-schedule-body"
        aria-label={scheduleOpen ? 'Stundenplan einklappen' : 'Stundenplan ausklappen'}
        on:click={() => (scheduleOpen = !scheduleOpen)}
      >
        <Icon name={scheduleOpen ? 'chevronDown' : 'chevronRight'} size={14} />
      </button>
    </div>

    {#if scheduleOpen}
    <div id="settings-schedule-body" class="section-body">
    <label class="pref-row pref-select">
      <span>Kalender-Ansicht</span>
      <select
        class="select"
        value={$calendarPrefs.agenda}
        on:change={(e) => calendarPrefs.update((prefs) => ({ ...prefs, agenda: e.target.value }))}
      >
        <option value="list">Liste</option>
        <option value="grid">Raster</option>
      </select>
    </label>

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

      <button class="form-toggle" type="button" aria-expanded={lessonFormOpen} on:click={() => (lessonFormOpen = !lessonFormOpen)}>
        <Icon name={lessonFormOpen ? 'chevronDown' : 'plus'} size={14} />
        {lessonFormOpen ? 'Formular schliessen' : 'Lektion hinzufügen'}
      </button>
      {#if lessonFormOpen}
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
        <div class="time-group">
          <span class="group-caption">Zeit</span>
          <div class="time-row">
            <label class="field">
              <span>Start</span>
              <input class="input" type="time" bind:value={lessonStart} />
            </label>
            <label class="field">
              <span>Ende</span>
              <input class="input" type="time" bind:value={lessonEnd} />
            </label>
          </div>
          <div class="duration-presets" role="group" aria-label="Dauer wählen">
            {#each [45, 60, 90] as mins (mins)}
              <button class="chip" type="button" on:click={() => setLessonDuration(mins)}>{mins} Min</button>
            {/each}
          </div>
        </div>
        <label class="field">
          <span>Modul</span>
          <select class="select" bind:value={lessonModule}>
            <option value="">Kein Modul</option>
            {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
          </select>
          {#if lessonModule}
            {@const selectedModule = modules.find((m) => m.id === lessonModule)}
            {#if selectedModule}
              <span class="module-preview">
                <span class="mod-dot" style:--dot={selectedModule.accent} aria-hidden="true"></span>
                {selectedModule.code || selectedModule.title}
              </span>
            {/if}
          {/if}
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
      {/if}
    </div>
    {/if}
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
      <span class="hint">Rainmeter · Windows</span>
      <button
        class="section-toggle"
        type="button"
        aria-expanded={widgetsOpen}
        aria-controls="settings-widgets-body"
        aria-label={widgetsOpen ? 'Desktop-Widget einklappen' : 'Desktop-Widget ausklappen'}
        on:click={() => (widgetsOpen = !widgetsOpen)}
      >
        <Icon name={widgetsOpen ? 'chevronDown' : 'chevronRight'} size={14} />
      </button>
    </div>
    {#if widgetsOpen}
      <div id="settings-widgets-body" class="section-body">
        <p class="muted small">Lesbarer Snapshot ohne Notiztexte, Noten oder E-Mails.</p>
        <div class="button-row">
          <button class="btn btn-primary" type="button" on:click={downloadWidgetJson} disabled={widgetBusy}>
            <Icon name="file" size={15} /> JSON
          </button>
          <button class="btn" type="button" on:click={downloadWidgetText} disabled={widgetBusy}>
            <Icon name="file" size={15} /> TXT für Rainmeter
          </button>
        </div>
        <label class="pref-row">
          <input type="checkbox" bind:checked={widgetAutoSave} on:change={saveWidgetAutoSave} />
          <span>Snapshot automatisch speichern</span>
        </label>
      </div>
    {/if}
  </section>

  <section class="card section" id="settings-email" aria-labelledby="email-title">
    <div class="section-title">
      <h2 id="email-title">Erinnerungen</h2>
      <span class="badge" class:is-on={remindersOptIn} class:is-busy={remindersBusy} class:is-error={!!remindersError}>
        <span class="sync-dot" aria-hidden="true"></span>
        {remindersOptIn ? 'ein' : 'aus'}
      </span>
      <button
        class="section-toggle"
        type="button"
        aria-expanded={remindersOpen}
        aria-controls="settings-reminders-body"
        aria-label={remindersOpen ? 'Erinnerungen einklappen' : 'Erinnerungen ausklappen'}
        on:click={() => (remindersOpen = !remindersOpen)}
      >
        <Icon name={remindersOpen ? 'chevronDown' : 'chevronRight'} size={14} />
      </button>
    </div>

    {#if remindersOpen}
    <div id="settings-reminders-body" class="section-body">
    <div class="setup-notice" role="status">
      <span class="notice-mark" aria-hidden="true">i</span>
      <div><strong>E-Mail-Versand noch nicht verfügbar.</strong><p>Diese Einstellungen werden gespeichert, aber aktuell werden keine Erinnerungs-E-Mails versendet.</p></div>
    </div>

    {#if !signedIn}
      <p class="muted small">Bitte melde dich zuerst bei Study Hub an.</p>
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
    </div>
    {/if}
  </section>

  <section class="card section" id="settings-cloud" aria-labelledby="sync-title">
    <div class="section-title">
      <h2 id="sync-title">Cloud</h2>
      <span class="sync-badge" class:on={signedIn && !$cloud.lastError} class:busy={$cloud.syncing} class:error={!!$cloud.lastError} class:pending={$cloud.syncPending && !$cloud.syncing}>
        <span class="sync-dot" aria-hidden="true"></span>
        {syncStateLabel}
      </span>
    </div>

    {#if !$cloud.configured}
      <div class="setup-notice" role="status">
        <span class="notice-mark" aria-hidden="true">i</span>
        <div><strong>Cloud ist noch nicht eingerichtet.</strong><p>Lokale Daten funktionieren weiterhin wie gewohnt.</p></div>
      </div>
    {:else if !signedIn}
      <div class="auth-layout">
        <div class="auth-card">
          <div class="auth-card-heading">
            <h3>{authMode === 'signin' ? 'Anmelden' : 'Konto erstellen'}</h3>
          </div>
          <form class="auth-form" on:submit|preventDefault={authMode === 'signin' ? doSignIn : doSignUp}>
            <label class="field">
              <span>E-Mail</span>
              <input class="input" type="email" bind:value={authEmail} autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="name@beispiel.ch" required />
            </label>
            <label class="field">
              <span>Passwort</span>
              <div class="password-control">
                <input class="input" type={showAuthPassword ? 'text' : 'password'} bind:value={authPassword} autocomplete={authMode === 'signin' ? 'current-password' : 'new-password'} minlength={authMode === 'signup' ? 8 : 1} placeholder={authMode === 'signup' ? 'Mindestens 8 Zeichen' : 'Passwort'} required />
                <button type="button" class="password-toggle" aria-label={showAuthPassword ? 'Passwort verbergen' : 'Passwort anzeigen'} aria-pressed={showAuthPassword} on:click={() => (showAuthPassword = !showAuthPassword)}>{showAuthPassword ? 'Verbergen' : 'Anzeigen'}</button>
              </div>
            </label>
            <button class="btn btn-primary auth-submit" type="submit" disabled={authBusy || !authEmail.trim() || !authPassword}>
              {authBusy ? 'Bitte warten…' : authMode === 'signin' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>
          {#if authMode === 'signin'}
            <button class="text-button" type="button" on:click={requestPasswordReset} disabled={authBusy || !authEmail.trim()}>Passwort vergessen?</button>
            <button class="text-button auth-switch" type="button" on:click={() => setAuthMode('signup')}>Konto erstellen</button>
          {:else}
            <button class="text-button auth-switch" type="button" on:click={() => setAuthMode('signin')}>Schon ein Konto? Anmelden</button>
          {/if}
        </div>
      </div>    {:else}
      <div class="sync-dashboard">
        <div class="sync-identity">
          <span class="account-avatar" aria-hidden="true">{($cloud.email || 'S').slice(0, 1).toUpperCase()}</span>
          <div class="identity-copy"><strong>{$cloud.email}</strong><span>Dein Study-Hub-Konto</span></div>
        </div>
        <div class="sync-details">
          <div><span class="detail-label">Letzte Synchronisierung</span><strong>{$cloud.lastSynced}</strong></div>
          <div><span class="detail-label">Verbindung</span><strong>{$cloud.online ? 'Internet verfügbar' : 'Offline'}</strong></div>
        </div>
        <div class="sync-actions">
          <button class="btn btn-primary" type="button" on:click={() => syncNow(true)} disabled={$cloud.syncing || !$cloud.online}>
            {$cloud.syncing ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
          </button>
          <button class="btn" type="button" on:click={() => syncNow(false)} disabled={$cloud.syncing || !$cloud.online}>
            Cloud-Daten laden
          </button>
          <button class="btn btn-ghost" type="button" on:click={doSignOut} disabled={authBusy}>Abmelden</button>
        </div>
        <p class="sync-background-note">
          <span class="background-dot" aria-hidden="true"></span>
          {#if !$cloud.online}Änderungen bleiben auf diesem Gerät und werden bei Internetverbindung automatisch synchronisiert.
          {:else if $cloud.syncPending}Änderungen warten auf die nächste Synchronisierung.
          {:else}Änderungen werden automatisch im Hintergrund synchronisiert.{/if}
        </p>
      </div>
      {#if $cloud.message}<p class="muted small auth-feedback success" role="status">{$cloud.message}</p>{/if}
      {#if $cloud.lastError}
        <div class="sync-error" role="alert">
          <strong>{$cloud.lastError.title}</strong>
          <span>{$cloud.lastError.action}</span>
          <details>
            <summary>Technische Details ({$cloud.lastError.code})</summary>
            <code>{$cloud.lastError.technical}</code>
          </details>
        </div>
      {/if}
    {/if}

    {#if authMessage}<p class="auth-feedback success" role="status">{authMessage}</p>{/if}
    {#if authError}<p class="auth-feedback error" role="alert">{authError}</p>{/if}
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

  /* Settings page polish */
  .page {
    width: min(100%, 960px);
    gap: clamp(14px, 2vw, 20px);
  }
  .page-head {
    padding: 8px 2px 2px;
  }
  .page-head .eyebrow {
    margin-bottom: 4px;
    color: var(--accent-strong);
    font-size: 0.7rem;
    font-weight: 750;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  .page-head h1 {
    letter-spacing: -0.045em;
  }
  .subnav {
    top: 6px;
    gap: 3px;
    padding: 4px;
    border-color: var(--rule);
    border-radius: 11px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: none;
    backdrop-filter: blur(10px);
    scrollbar-width: none;
  }
  .subnav::-webkit-scrollbar {
    display: none;
  }
  .subnav a {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    border-radius: 7px;
    color: var(--ink-3);
    font-size: 11px;
    white-space: nowrap;
    transition: color var(--motion), background var(--motion);
  }
  .subnav a:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .subnav a.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 650;
  }
  .section {
    position: relative;
    gap: 16px;
    padding: clamp(17px, 2.8vw, 26px);
    border-color: color-mix(in srgb, var(--rule) 78%, var(--accent-soft));
    border-radius: 18px;
    background: linear-gradient(145deg, var(--surface), color-mix(in srgb, var(--surface) 91%, var(--accent-soft)));
    box-shadow: var(--shadow-1);
    transition: border-color var(--motion), box-shadow var(--motion);
  }
  .section:hover {
    border-color: color-mix(in srgb, var(--rule-strong) 72%, var(--accent));
    box-shadow: var(--shadow-2);
  }
  .section-title {
    align-items: center;
    margin-bottom: 2px;
  }
  .section-title h2 {
    font-size: 1rem;
    letter-spacing: -0.02em;
  }
  .hint {
    color: var(--ink-3);
  }
  .program-row {
    min-height: 50px;
    padding: 6px 10px;
    border: 1px solid transparent;
    transition: background var(--motion), border-color var(--motion);
  }
  .program-row:hover {
    border-color: var(--rule);
    background: var(--surface);
  }
  .program-name {
    letter-spacing: -0.01em;
  }
  .segmented {
    max-width: 500px;
    padding: 4px;
    border-radius: 12px;
  }
  .seg {
    min-height: 42px;
    border-radius: 9px;
    transition: background var(--motion), color var(--motion), box-shadow var(--motion);
  }
  .check-row,
  .pref-row {
    padding: 9px 11px;
    border: 1px solid var(--rule);
    border-radius: 11px;
    background: color-mix(in srgb, var(--surface) 80%, transparent);
  }
  .ai-grid,
  .form-grid {
    gap: 14px;
  }
  .input,
  .select,
  .textarea {
    border-radius: 11px;
    background: var(--surface);
  }
  .btn {
    min-height: 42px;
    border-radius: 11px;
    font-weight: 620;
  }
  .btn-primary {
    box-shadow: 0 5px 14px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .auth-intro {
    max-width: 65ch;
    line-height: 1.65;
  }
  .auth-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.04fr) minmax(320px, 0.96fr);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--rule));
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow-2);
  }
  .auth-story {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 19px;
    min-height: 430px;
    padding: clamp(25px, 4vw, 42px);
    background:
      radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--accent) 17%, transparent), transparent 63%),
      linear-gradient(145deg, color-mix(in srgb, var(--accent-soft) 83%, var(--surface)), var(--surface-2));
  }
  .auth-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    color: var(--accent-strong);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.14em;
  }
  .status-pip {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok) 15%, transparent);
  }
  .auth-story > h3 {
    max-width: 12ch;
    font-size: clamp(2rem, 4vw, 2.7rem);
    line-height: 1.06;
    letter-spacing: -0.055em;
  }
  .auth-story > h3 em {
    color: var(--accent-strong);
    font-style: normal;
  }
  .auth-lede {
    max-width: 40ch;
    color: var(--ink-2);
    font-size: var(--text-base);
    line-height: 1.7;
  }
  .auth-benefits {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 3px;
  }
  .auth-benefits > div {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .benefit-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--rule));
    border-radius: 11px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    color: var(--accent-strong);
    font-size: 1.05rem;
    font-weight: 700;
  }
  .auth-benefits strong,
  .auth-benefits small {
    display: block;
  }
  .auth-benefits strong {
    font-size: var(--text-sm);
    font-weight: 680;
  }
  .auth-benefits small {
    margin-top: 2px;
    color: var(--ink-2);
    font-size: var(--text-xs);
  }
  .auth-card {
    justify-content: center;
    gap: 17px;
    max-width: none;
    padding: clamp(22px, 3.4vw, 34px);
    border: 0;
    border-left: 1px solid var(--rule);
    border-radius: 0;
    background: var(--surface);
  }
  .auth-card-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .auth-card-heading h3 {
    font-size: 1.38rem;
    letter-spacing: -0.035em;
  }
  .auth-card-heading p,
  .auth-note {
    color: var(--ink-2);
    font-size: var(--text-sm);
    line-height: 1.55;
  }
  .auth-note {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--rule));
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent-soft) 48%, var(--surface));
  }
  .auth-tabs {
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--rule);
    border-radius: 12px;
    background: var(--surface-2);
  }
  .auth-tabs button {
    min-height: 42px;
    border-radius: 9px;
    transition: color var(--motion), background var(--motion), box-shadow var(--motion);
  }
  .auth-tabs button.active {
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  .auth-form {
    gap: 15px;
    max-width: none;
  }
  .auth-form .field {
    gap: 7px;
  }
  .auth-form .field > span:first-child {
    color: var(--ink);
    font-size: var(--text-xs);
    font-weight: 680;
  }
  .auth-form .input {
    min-height: 47px;
    border-radius: 11px;
    background: var(--surface);
  }
  .auth-form .input::placeholder {
    color: var(--ink-3);
    opacity: 0.72;
  }
  .password-toggle {
    min-height: 34px;
    right: 6px;
    border-radius: 8px;
  }
  .password-toggle:hover {
    background: var(--accent-soft);
  }
  .auth-help {
    margin-top: -2px;
    color: var(--ink-3);
  }
  .auth-submit {
    min-height: 48px;
    margin-top: 2px;
    border-radius: 12px;
    font-size: var(--text-sm);
  }
  .text-button {
    width: fit-content;
    color: var(--accent-strong);
    font-weight: 600;
    text-decoration: none;
  }
  .text-button:hover {
    text-decoration: underline;
  }
  .auth-footnote {
    display: flex;
    align-items: center;
    gap: 7px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: 0.7rem;
  }
  .auth-footnote span {
    color: var(--ok);
  }
  .auth-feedback {
    max-width: 720px;
    margin: 0;
    padding: 11px 13px;
    border: 1px solid var(--rule);
    border-radius: 11px;
    background: var(--surface);
    font-size: var(--text-sm);
    line-height: 1.55;
  }
  .auth-feedback.success {
    border-color: color-mix(in srgb, var(--ok) 36%, var(--rule));
    background: var(--ok-soft);
    color: var(--ok);
  }
  .auth-feedback.error {
    border-color: color-mix(in srgb, var(--danger) 40%, var(--rule));
    background: var(--danger-soft);
    color: var(--danger);
  }
  .setup-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 620px;
    padding: 15px;
    border: 1px solid var(--rule);
    border-radius: 13px;
    background: var(--surface-2);
  }
  .setup-notice p {
    margin-top: 3px;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .notice-mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 800;
  }
  .sync-dashboard {
    overflow: hidden;
    border: 1px solid var(--rule);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  .sync-identity {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 17px 18px;
  }
  .account-avatar {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex: none;
    border-radius: 14px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-size: 1rem;
    font-weight: 750;
  }
  .identity-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    flex: 1;
  }
  .identity-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--text-sm);
  }
  .identity-copy span,
  .detail-label {
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .sync-badge {
    flex: none;
    padding: 7px 10px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-2);
    font-weight: 650;
  }
  .sync-badge.on {
    border-color: color-mix(in srgb, var(--ok) 25%, var(--rule));
    background: var(--ok-soft);
    color: var(--ok);
  }
  .sync-badge.pending {
    border-color: color-mix(in srgb, var(--warn) 30%, var(--rule));
    background: var(--warn-soft);
    color: var(--warn);
  }
  .sync-badge.error {
    border-color: color-mix(in srgb, var(--danger) 35%, var(--rule));
    background: var(--danger-soft);
    color: var(--danger);
  }
  .sync-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 0 18px 16px 72px;
  }
  .sync-details > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sync-details strong {
    font-size: var(--text-sm);
  }
  .sync-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    padding: 14px 18px;
    border-top: 1px solid var(--rule);
    background: var(--surface-2);
  }
  .sync-background-note {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 18px;
    color: var(--ink-2);
    font-size: var(--text-xs);
  }
  .background-dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--ok);
  }
  .sync-error {
    max-width: 820px;
    padding: 15px;
    border-radius: 13px;
    line-height: 1.55;
  }
  .sync-error strong {
    color: var(--danger);
    font-size: var(--text-sm);
  }
  .sync-error > span {
    color: var(--ink);
    font-size: var(--text-sm);
  }
  .sync-error details {
    margin-top: 4px;
  }
  .section.danger {
    border-color: color-mix(in srgb, var(--danger) 28%, var(--rule));
    background: linear-gradient(145deg, var(--surface), color-mix(in srgb, var(--danger-soft) 45%, var(--surface)));
  }
  @media (max-width: 760px) {
    .auth-layout {
      grid-template-columns: 1fr;
    }
    .auth-story {
      min-height: 0;
      gap: 13px;
      padding: 23px;
    }
    .auth-story > h3 {
      max-width: none;
      font-size: 1.9rem;
    }
    .auth-lede {
      max-width: none;
    }
    .auth-benefits {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .auth-benefits > div {
      align-items: flex-start;
    }
    .auth-card {
      border-top: 1px solid var(--rule);
      border-left: 0;
    }
  }
  @media (max-width: 560px) {
    .page-head {
      align-items: flex-start;
    }
    .section {
      padding: 16px;
      border-radius: 15px;
    }
    .auth-benefits {
      grid-template-columns: 1fr;
    }
    .auth-card {
      padding: 19px;
    }
    .sync-identity {
      flex-wrap: wrap;
      padding: 14px;
    }
    .sync-details {
      padding: 0 14px 14px;
    }
    .sync-actions {
      padding: 13px 14px;
    }
    .sync-background-note {
      align-items: flex-start;
      padding: 11px 14px;
    }
    .button-row .btn,
    .sync-actions .btn {
      flex: 1 1 auto;
    }
  }

  #settings-cloud {
    background: var(--surface);
    border-color: var(--rule);
    box-shadow: none;
  }
  .auth-layout {
    display: block;
    max-width: 460px;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .auth-card {
    gap: var(--space-3);
    max-width: none;
    padding: 0;
    border: 0;
    background: transparent;
  }
  .auth-card-heading h3 {
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .auth-tabs {
    background: var(--surface-2);
    border-color: var(--rule);
  }
  .auth-tabs button.active {
    background: var(--surface);
    color: var(--ink);
  }
  .auth-form {
    gap: var(--space-3);
  }
  .auth-form .input {
    min-height: 42px;
  }
  .auth-submit {
    min-height: 42px;
    margin-top: var(--space-1);
    box-shadow: none;
  }
  .password-toggle {
    color: var(--ink-2);
    font-weight: 500;
  }
  .auth-footnote,
  .auth-story,
  .auth-note {
    display: none;
  }

  /* Quieter utility sections */
  #settings-shortcuts,
  #settings-desktop-widgets {
    gap: 10px;
    padding: 14px 16px;
    border-color: var(--rule);
    background: var(--surface);
    box-shadow: none;
  }
  #settings-shortcuts .section-title h2,
  #settings-desktop-widgets .section-title h2 {
    font-size: 0.9375rem;
  }
  #settings-shortcuts .button-row .btn,
  #settings-desktop-widgets .button-row .btn {
    min-height: 34px;
    padding: 0 10px;
    font-size: var(--text-xs);
  }
  #settings-desktop-widgets .btn-primary {
    border-color: var(--rule);
    background: var(--surface-2);
    box-shadow: none;
    color: var(--ink);
  }
  #settings-desktop-widgets .btn-primary:hover {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .pref-select {
    justify-content: space-between;
    min-height: 32px;
    padding: 4px 2px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .pref-select .select {
    width: auto;
    min-width: 96px;
    min-height: 30px;
    font-size: var(--text-xs);
  }

  /* Checkboxes as compact switches */
  .check-row input[type='checkbox'],
  .pref-row input[type='checkbox'] {
    position: relative;
    flex: none;
    width: 34px;
    height: 20px;
    margin: 0;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    appearance: none;
    cursor: pointer;
    transition: background var(--motion), border-color var(--motion);
  }
  .check-row input[type='checkbox']::before,
  .pref-row input[type='checkbox']::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ink-3);
    transition: transform var(--motion), background var(--motion);
  }
  .check-row input[type='checkbox']:checked,
  .pref-row input[type='checkbox']:checked {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .check-row input[type='checkbox']:checked::before,
  .pref-row input[type='checkbox']:checked::before {
    background: var(--accent);
    transform: translateX(14px);
  }
  .check-row input[type='checkbox']:focus-visible,
  .pref-row input[type='checkbox']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .check-row input[type='checkbox'],
    .check-row input[type='checkbox']::before,
    .pref-row input[type='checkbox'],
    .pref-row input[type='checkbox']::before {
      transition: none;
    }
  }

  /* Collapsible sections and lesson form affordances */
  .section-toggle {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: none;
    margin-left: auto;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink-3);
  }
  .section-toggle:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .section-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .form-toggle {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    min-height: 30px;
    padding: 0 10px;
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .form-toggle:hover {
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .time-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--rule);
    border-radius: 11px;
    background: color-mix(in srgb, var(--surface) 80%, transparent);
  }
  .group-caption {
    color: var(--ink-3);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .time-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .duration-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .module-preview {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .module-preview .mod-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dot, var(--accent));
  }
</style>
