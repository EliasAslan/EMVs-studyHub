<script>
  import {
    appState,
    createTopic,
    deleteTopic,
    createNote,
    createHomework,
    createExam,
    updateExam,
    deleteExam,
    createLink,
    updateLink,
    deleteLink,
    updateModule,
    deleteModule,
    snapshotModule,
    restoreModuleSnapshot,
    updateHomework,
    toggleHomework,
    deleteHomework,
    restoreEntity,
    createOverviewNote,
    updateNote,
  } from '../stores/app.js';
  import { route, navigate, modulePath, notePath } from '../router.js';
  import { todayKey, formatDate, relativeDayLabel, daysUntil } from '../data/dates.js';
  import { bodySegments, resolveLink } from '../data/wikiLinks.js';
  import {
    RECURRENCE_OPTIONS,
    recurrenceFromValue,
    recurrenceValue,
  } from '../data/recurrence.js';
  import { aiSettings, aiReady } from '../stores/ai.js';
  import { chatComplete, describeAiError } from '../services/localAI.js';
  import { SYSTEM_PROMPT, buildContextBlock, resolveContext } from '../data/aiContext.js';
  import { toast } from '../stores/toast.js';
  import NoteCard from '../components/NoteCard.svelte';
  import HomeworkRow from '../components/HomeworkRow.svelte';
  import LinkRow from '../components/LinkRow.svelte';
  import AttachmentList from '../components/AttachmentList.svelte';
  import AiButton from '../components/AiButton.svelte';
  import AiDraft from '../components/AiDraft.svelte';
  import Modal from '../components/Modal.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  const tabs = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'notes', label: 'Notizen' },
    { id: 'homework', label: 'Hausaufgaben' },
    { id: 'exams', label: 'Prüfungen' },
    { id: 'links', label: 'Links' },
    { id: 'files', label: 'Dateien' },
  ];

  const accents = ['#4f46e5', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#0369a1', '#4d7c0f', '#9a3412'];

  let tab = 'overview';
  let topicName = '';

  let noteOpen = false;
  let noteTitle = '';
  let noteBody = '';
  let noteType = 'note';
  let noteTopic = '';

  let hwTitle = '';
  let hwDue = todayKey();
  let hwRecurrence = 'none';
  let hwEditing = null;
  let hwEditTitle = '';
  let hwEditDue = '';
  let hwEditRecurrence = 'none';
  let hwEditDone = false;

  let examOpen = false;
  let examTitle = '';
  let examDate = todayKey();
  let examEditing = null;
  let examEdit = {};

  let linkOpen = false;
  let linkLabel = '';
  let linkUrl = '';
  let linkKind = 'custom';
  let linkEditing = null;

  let editModuleOpen = false;
  let editCode = '';
  let editTitle = '';
  let editAccent = '#4f46e5';
  let deleteOpen = false;

  let aiDraftOpen = false;
  let aiDraftText = '';
  let aiDraftBusy = false;
  let aiDraftError = '';

  $: mod = ($appState.modules || []).find((m) => m.id === $route.id) || null;
  $: if (mod && $route.tab && tabs.some((t) => t.id === $route.tab)) tab = $route.tab;
  $: program = mod ? ($appState.programs || []).find((p) => p.id === mod.programId) : null;
  $: topics = ($appState.topics || []).filter((t) => t.moduleId === mod?.id);
  $: notes = ($appState.notes || []).filter((n) => n.moduleId === mod?.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  $: homework = ($appState.homework || []).filter((h) => h.moduleId === mod?.id).sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
  $: openHw = homework.filter((h) => !h.done);
  $: exams = ($appState.exams || []).filter((e) => e.moduleId === mod?.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  $: links = ($appState.links || []).filter((l) => l.moduleId === mod?.id);
  $: overviewNote = mod?.overviewNoteId
    ? ($appState.notes || []).find((n) => n.id === mod.overviewNoteId) || null
    : null;
  $: overviewSegments = overviewNote ? bodySegments(overviewNote.body || '') : [];

  function openOverview() {
    if (!mod) return;
    const note = createOverviewNote(mod.id);
    if (note) navigate(notePath(note.id));
  }

  function openOverviewLink(target) {
    const entry = resolveLink($appState, target);
    if (!entry) return;
    if (entry.kind === 'note') navigate(notePath(entry.id));
    else if (entry.kind === 'module') navigate(modulePath(entry.id));
    else if (entry.kind === 'topic') {
      if (entry.moduleId) navigate(modulePath(entry.moduleId));
      else navigate('/modules');
    } else if (entry.kind === 'homework') navigate('/homework');
    else if (entry.kind === 'exam') navigate('/exams');
    else if (entry.kind === 'link') navigate('/links');
  }

  function setTab(id) {
    tab = id;
    if (mod) navigate(modulePath(mod.id, id));
  }

  function addTopic() {
    if (!topicName.trim() || !mod) return;
    createTopic(mod.id, topicName);
    topicName = '';
  }

  function addNote() {
    if (!noteTitle.trim() && !noteBody.trim()) return;
    const note = createNote({
      moduleId: mod.id,
      topicId: noteTopic || null,
      title: noteTitle.trim() || 'Notiz',
      body: noteBody,
      type: noteType,
    });
    noteOpen = false;
    noteTitle = '';
    noteBody = '';
    noteType = 'note';
    noteTopic = '';
    toast('Notiz gespeichert');
    navigate(notePath(note.id));
  }

  function addHomework() {
    if (!hwTitle.trim() || !mod) return;
    createHomework({
      moduleId: mod.id,
      title: hwTitle,
      dueDate: hwDue || todayKey(),
      recurrence: recurrenceFromValue(hwRecurrence),
    });
    hwTitle = '';
    hwDue = todayKey();
    hwRecurrence = 'none';
  }

  function startHwEdit(hw) {
    hwEditing = hw;
    hwEditTitle = hw.title;
    hwEditDue = hw.dueDate || '';
    hwEditRecurrence = recurrenceValue(hw.recurrence);
    hwEditDone = !!hw.done;
  }

  function saveHwEdit() {
    if (!hwEditing) return;
    updateHomework(hwEditing.id, {
      title: hwEditTitle.trim() || hwEditing.title,
      dueDate: hwEditDue || null,
      recurrence: recurrenceFromValue(
        hwEditRecurrence,
        hwEditing.recurrence?.seriesId || hwEditing.id,
      ),
      done: hwEditDone,
    });
    hwEditing = null;
  }

  function removeHw(hw) {
    const snapshot = { ...hw };
    deleteHomework(hw.id);
    toast('Hausaufgabe gelöscht', {
      action: { label: 'Rückgängig', fn: () => restoreEntity('homework', snapshot) },
    });
  }

  function openExamCreate() {
    examEditing = null;
    examTitle = '';
    examDate = todayKey();
    examOpen = true;
  }

  function openExamEdit(exam) {
    examEditing = exam;
    examEdit = { ...exam };
    examOpen = true;
  }

  function saveExam() {
    if (examEditing) {
      updateExam(examEditing.id, {
        title: examEdit.title?.trim() || examEditing.title,
        date: examEdit.date || '',
        notes: examEdit.notes || '',
        grade: examEdit.grade === '' || examEdit.grade === null ? null : Number(examEdit.grade),
        gradeNote: examEdit.gradeNote || '',
      });
      toast('Prüfung gespeichert');
    } else {
      if (!examTitle.trim()) return;
      createExam({ moduleId: mod.id, title: examTitle, date: examDate });
      toast('Prüfung erfasst');
    }
    examOpen = false;
  }

  function removeExam(exam) {
    const snapshot = { ...exam };
    deleteExam(exam.id);
    toast('Prüfung gelöscht', {
      action: { label: 'Rückgängig', fn: () => restoreEntity('exams', snapshot) },
    });
  }

  function openLinkCreate() {
    linkEditing = null;
    linkLabel = '';
    linkUrl = '';
    linkKind = 'custom';
    linkOpen = true;
  }

  function openLinkEdit(link) {
    linkEditing = link;
    linkLabel = link.label;
    linkUrl = link.url;
    linkKind = link.kind;
    linkOpen = true;
  }

  function saveLink() {
    const label = linkLabel.trim();
    const url = linkUrl.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast('Bitte eine vollständige URL angeben (https://…)');
      return;
    }
    if (linkEditing) updateLink(linkEditing.id, { label, url, kind: linkKind });
    else createLink({ moduleId: mod.id, label, url, kind: linkKind });
    linkOpen = false;
    toast('Link gespeichert');
  }

  function removeLink(link) {
    const snapshot = { ...link };
    deleteLink(link.id);
    toast('Link gelöscht', {
      action: { label: 'Rückgängig', fn: () => restoreEntity('links', snapshot) },
    });
  }

  function openModuleEdit() {
    editCode = mod.code || '';
    editTitle = mod.title || '';
    editAccent = mod.accent || '#4f46e5';
    editModuleOpen = true;
  }

  function saveModule() {
    updateModule(mod.id, { code: editCode.trim(), title: editTitle.trim(), accent: editAccent });
    editModuleOpen = false;
    toast('Modul gespeichert');
  }

  function doDeleteModule() {
    const id = mod.id;
    const snapshot = snapshotModule(id);
    deleteModule(id);
    deleteOpen = false;
    navigate('/modules');
    toast('Modul gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => {
          restoreModuleSnapshot(snapshot);
          toast('Wiederhergestellt');
        },
      },
    });
  }

  function gradeLabel(grade) {
    if (typeof grade !== 'number') return '';
    return Number.isInteger(grade) ? String(grade) : grade.toFixed(1);
  }

  async function draftOverview() {
    if (!mod || aiDraftBusy) return;
    aiDraftOpen = true;
    aiDraftError = '';
    aiDraftText = '';
    aiDraftBusy = true;
    const context = resolveContext($appState, $route, [`modul/${mod.id}`], { now: new Date() });
    const result = await chatComplete({
      baseUrl: $aiSettings.baseUrl,
      model: $aiSettings.model,
      numCtx: $aiSettings.numCtx,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${buildContextBlock(context)}\n\nEntwirf einen kurzen Überblick über dieses Modul: 3–5 ruhige Sätze auf Deutsch, ausschließlich aus dem Kontext.`,
        },
      ],
    });
    aiDraftBusy = false;
    if (result.error) {
      aiDraftError = describeAiError(result.error);
      return;
    }
    aiDraftText = result.text.trim();
    if (!aiDraftText) aiDraftError = 'Kein Entwurf erhalten.';
  }

  function applyOverviewDraft() {
    if (!mod || !aiDraftText) return;
    const note = createOverviewNote(mod.id);
    if (note) updateNote(note.id, { body: aiDraftText });
    aiDraftOpen = false;
    aiDraftText = '';
    toast('Überblick übernommen');
  }
</script>

{#if !mod}
  <div class="page">
    <EmptyState title="Modul nicht gefunden" text="Vielleicht wurde es gelöscht." actionLabel="Zu den Modulen" action={() => navigate('/modules')} />
  </div>
{:else}
  <div class="page">
    <nav class="crumbs" aria-label="Brotkrümelnavigation">
      <a href="#/modules">Module</a>
      <span aria-hidden="true">/</span>
      <span>{program?.name || ''}</span>
    </nav>

    <header class="module-head" style:--mod={mod.accent}>
      <div class="head-text">
        <p class="code mono">{mod.code || '—'}</p>
        <h1>{mod.title || 'Ohne Titel'}</h1>
        <p class="stats">
          <span>{openHw.length} offen</span>
          <span>{notes.length} Notizen</span>
          <span>{exams.length} Prüfungen</span>
          <span>{links.length} Links</span>
        </p>
      </div>
      <div class="head-actions">
        <AiButton label="KI fragen" kind="module" id={mod.id} />
        <button class="btn btn-sm" type="button" on:click={openModuleEdit}><Icon name="edit" size={14} /> Bearbeiten</button>
        <button class="icon-btn" type="button" aria-label="Modul löschen" on:click={() => (deleteOpen = true)}><Icon name="trash" size={16} /></button>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Modulbereiche">
      {#each tabs as t (t.id)}
        <button class="tab" class:active={tab === t.id} type="button" role="tab" aria-selected={tab === t.id} on:click={() => setTab(t.id)}>
          {t.label}
        </button>
      {/each}
    </div>

    {#if tab === 'overview'}
      <div class="overview">
        <section class="card pad overview-card" aria-labelledby="overview-title">
          <div class="section-title">
            <h2 id="overview-title">Überblick</h2>
            <div class="overview-actions">
              {#if $aiReady && (notes.length || homework.length)}
                <button class="quiet" type="button" on:click={draftOverview} disabled={aiDraftBusy}>
                  Überblick entwerfen
                </button>
              {/if}
              {#if overviewNote}
                <button class="quiet" type="button" on:click={openOverview}>Bearbeiten</button>
              {/if}
            </div>
          </div>
          {#if overviewNote}
            <div class="overview-body reading">
              {#if overviewNote.body.trim()}
                {#each overviewSegments as segment, i (i)}
                  {#if segment.type === 'text'}
                    <span>{segment.text}</span>
                  {:else}
                    {@const entry = resolveLink($appState, segment.target)}
                    {#if entry}
                      <button class="wiki" type="button" on:click={() => openOverviewLink(segment.target)}>{segment.label || segment.target}</button>
                    {:else}
                      <span class="wiki unresolved" title="Kein Ziel gefunden">{segment.label || segment.target}</span>
                    {/if}
                  {/if}
                {/each}
              {:else}
                <p class="muted small">Noch kein Text. <button class="quiet" type="button" on:click={openOverview}>Jetzt schreiben</button></p>
              {/if}
            </div>
          {:else}
            <div class="overview-empty">
              <p class="muted small">Ein kurzer Überblick: Was zählt in diesem Modul?</p>
              <button class="btn btn-sm" type="button" on:click={openOverview}>Überblick erstellen</button>
            </div>
          {/if}
        </section>

        <section class="card pad" aria-labelledby="topics-title">
          <div class="section-title">
            <h2 id="topics-title">Themen</h2>
          </div>
          <div class="topics">
            {#each topics as topic (topic.id)}
              <span class="chip">
                {topic.name}
                <button class="chip-x" type="button" aria-label={`${topic.name} entfernen`} on:click={() => deleteTopic(topic.id)}>✕</button>
              </span>
            {/each}
            <form class="topic-add" on:submit|preventDefault={addTopic}>
              <input class="input" bind:value={topicName} placeholder="Thema" aria-label="Neues Thema" />
              <button class="btn btn-sm" type="submit" disabled={!topicName.trim()}>Hinzufügen</button>
            </form>
          </div>
        </section>

        <section class="card pad" aria-labelledby="next-hw-title">
          <div class="section-title">
            <h2 id="next-hw-title">Nächste Hausaufgaben</h2>
            <button class="quiet" type="button" on:click={() => setTab('homework')}>Alle</button>
          </div>
          {#if openHw.length}
            {#each openHw.slice(0, 3) as hw (hw.id)}
              <HomeworkRow {hw} on:toggle={(e) => toggleHomework(e.detail.id)} on:edit={(e) => startHwEdit(e.detail)} on:delete={(e) => removeHw(e.detail)} />
            {/each}
          {:else}
            <p class="muted small">Nichts offen.</p>
          {/if}
        </section>

        <section class="card pad" aria-labelledby="next-exam-title">
          <div class="section-title">
            <h2 id="next-exam-title">Nächste Prüfung</h2>
            <button class="quiet" type="button" on:click={() => setTab('exams')}>Alle</button>
          </div>
          {#if exams.filter((e) => e.date >= todayKey()).length}
            {@const exam = exams.filter((e) => e.date >= todayKey())[0]}
            <button class="exam-mini" type="button" on:click={() => openExamEdit(exam)}>
              <span class="exam-title">{exam.title}</span>
              <span class="exam-meta mono">{formatDate(exam.date, 'short')} · {relativeDayLabel(exam.date)}</span>
            </button>
          {:else}
            <p class="muted small">Keine Prüfung geplant.</p>
          {/if}
        </section>

        <section class="card pad" aria-labelledby="recent-notes-title">
          <div class="section-title">
            <h2 id="recent-notes-title">Notizen</h2>
            <button class="quiet" type="button" on:click={() => setTab('notes')}>Alle</button>
          </div>
          {#if notes.length}
            <div class="notes-grid">
              {#each notes.slice(0, 3) as note (note.id)}
                <NoteCard {note} showModule={false} />
              {/each}
            </div>
          {:else}
            <p class="muted small">Noch keine Notiz.</p>
          {/if}
        </section>
      </div>
    {/if}

    {#if tab === 'notes'}
      <section class="section">
        <div class="section-title">
          <h2>Notizen</h2>
          <button class="btn btn-primary btn-sm" type="button" on:click={() => (noteOpen = true)}><Icon name="plus" size={14} /> Notiz</button>
        </div>
        {#if notes.length}
          <div class="notes-grid wide">
            {#each notes as note (note.id)}
              <NoteCard {note} showModule={false} />
            {/each}
          </div>
        {:else}
          <EmptyState title="Noch keine Notizen" text="Text, Foto oder beides." actionLabel="Notiz erfassen" action={() => (noteOpen = true)} />
        {/if}
      </section>
    {/if}

    {#if tab === 'homework'}
      <section class="section">
        <form class="inline-add card" on:submit|preventDefault={addHomework}>
          <input class="input" bind:value={hwTitle} placeholder="Neue Hausaufgabe" aria-label="Titel" />
          <input class="input" type="date" bind:value={hwDue} aria-label="Fällig" />
          <select class="select" bind:value={hwRecurrence} aria-label="Wiederholen">
            {#each RECURRENCE_OPTIONS as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
          <button class="btn btn-primary" type="submit" disabled={!hwTitle.trim()}>Erfassen</button>
        </form>
        {#if homework.length}
          <div class="card list">
            {#each homework as hw (hw.id)}
              <HomeworkRow {hw} on:toggle={(e) => toggleHomework(e.detail.id)} on:edit={(e) => startHwEdit(e.detail)} on:delete={(e) => removeHw(e.detail)} />
            {/each}
          </div>
        {:else}
          <p class="muted small">Noch keine Hausaufgabe.</p>
        {/if}
      </section>
    {/if}

    {#if tab === 'exams'}
      <section class="section">
        <div class="section-title">
          <h2>Prüfungen</h2>
          <button class="btn btn-primary btn-sm" type="button" on:click={openExamCreate}><Icon name="plus" size={14} /> Prüfung</button>
        </div>
        {#if exams.length}
          <div class="card list">
            {#each exams as exam (exam.id)}
              <div class="exam-row">
                <button class="exam-main" type="button" on:click={() => openExamEdit(exam)}>
                  <span class="exam-title">{exam.title}</span>
                  <span class="exam-meta">
                    <span class="mono">{exam.date ? formatDate(exam.date, 'short') : 'ohne Datum'}</span>
                    {#if exam.date}<span class="muted">{relativeDayLabel(exam.date)}</span>{/if}
                    {#if typeof exam.grade === 'number'}<span class="grade mono">{gradeLabel(exam.grade)}</span>{/if}
                  </span>
                </button>
                <button class="icon-btn" type="button" aria-label={`${exam.title} löschen`} on:click={() => removeExam(exam)}><Icon name="trash" size={15} /></button>
              </div>
            {/each}
          </div>
        {:else}
          <EmptyState title="Keine Prüfungen" text="Datum festhalten, Note später ergänzen." actionLabel="Prüfung erfassen" action={openExamCreate} />
        {/if}
      </section>
    {/if}

    {#if tab === 'links'}
      <section class="section">
        <div class="section-title">
          <h2>Links</h2>
          <button class="btn btn-primary btn-sm" type="button" on:click={openLinkCreate}><Icon name="plus" size={14} /> Link</button>
        </div>
        {#if links.length}
          <div class="card list">
            {#each links as link (link.id)}
              <LinkRow {link} showModule={false}>
                <svelte:fragment slot="actions">
                  <button class="icon-btn sm" type="button" aria-label={`${link.label} bearbeiten`} on:click={() => openLinkEdit(link)}><Icon name="edit" size={14} /></button>
                  <button class="icon-btn sm" type="button" aria-label={`${link.label} löschen`} on:click={() => removeLink(link)}><Icon name="trash" size={14} /></button>
                </svelte:fragment>
              </LinkRow>
            {/each}
          </div>
        {:else}
          <EmptyState title="Keine Links" text="Teams, OneNote, Website, YouTube." actionLabel="Link hinzufügen" action={openLinkCreate} />
        {/if}
      </section>
    {/if}

    {#if tab === 'files'}
      <section class="section">
        <div class="section-title">
          <h2>Dateien</h2>
          <span class="hint">PDF und Bilder</span>
        </div>
        <div class="card pad">
          <AttachmentList attachments={mod.attachments || []} ownerId={mod.id} on:change={(e) => updateModule(mod.id, { attachments: e.detail })} />
        </div>
      </section>
    {/if}
  </div>
{/if}

<!-- Note creation -->
<Modal open={noteOpen} title="Neue Notiz" on:close={() => (noteOpen = false)}>
  <div class="stack">
    <label class="field"><span>Titel</span><input class="input" bind:value={noteTitle} data-autofocus placeholder="Kurz und klar" /></label>
    <label class="field"><span>Text</span><textarea class="textarea" bind:value={noteBody} rows="6"></textarea></label>
    <div class="two">
      <label class="field">
        <span>Typ</span>
        <select class="select" bind:value={noteType}>
          <option value="note">Notiz</option>
          <option value="mistake">Fehler</option>
          <option value="question">Frage</option>
          <option value="summary">Zusammenfassung</option>
        </select>
      </label>
      <label class="field">
        <span>Thema</span>
        <select class="select" bind:value={noteTopic}>
          <option value="">Kein Thema</option>
          {#each topics as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>
    </div>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (noteOpen = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={addNote}>Speichern</button>
  </svelte:fragment>
</Modal>

<!-- AI overview draft -->
<AiDraft
  open={aiDraftOpen}
  title="Überblick entwerfen"
  text={aiDraftText}
  busy={aiDraftBusy}
  error={aiDraftError}
  applyLabel="Übernehmen"
  on:close={() => (aiDraftOpen = false)}
  on:apply={applyOverviewDraft}
  on:retry={draftOverview}
/>

<!-- Homework edit -->
<Modal open={!!hwEditing} title="Hausaufgabe bearbeiten" on:close={() => (hwEditing = null)}>
  <div class="stack">
    <label class="field"><span>Titel</span><input class="input" bind:value={hwEditTitle} data-autofocus /></label>
    <label class="field"><span>Fällig</span><input class="input" type="date" bind:value={hwEditDue} /></label>
    <label class="field">
      <span>Wiederholen</span>
      <select class="select" bind:value={hwEditRecurrence}>
        {#each RECURRENCE_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
    <label class="check-row"><input type="checkbox" bind:checked={hwEditDone} /> Erledigt</label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (hwEditing = null)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={saveHwEdit}>Speichern</button>
  </svelte:fragment>
</Modal>

<!-- Exam create/edit -->
<Modal open={examOpen} title={examEditing ? 'Prüfung bearbeiten' : 'Neue Prüfung'} on:close={() => (examOpen = false)}>
  <div class="stack">
    {#if examEditing}
      <label class="field"><span>Titel</span><input class="input" bind:value={examEdit.title} data-autofocus /></label>
      <label class="field"><span>Datum</span><input class="input" type="date" bind:value={examEdit.date} /></label>
      <label class="field"><span>Notizen</span><textarea class="textarea" bind:value={examEdit.notes} rows="3"></textarea></label>
      <div class="two">
        <label class="field"><span>Note (1–6)</span><input class="input" type="number" min="1" max="6" step="0.5" bind:value={examEdit.grade} /></label>
        <label class="field"><span>Notiz zur Note</span><input class="input" bind:value={examEdit.gradeNote} /></label>
      </div>
    {:else}
      <label class="field"><span>Titel</span><input class="input" bind:value={examTitle} data-autofocus /></label>
      <label class="field"><span>Datum</span><input class="input" type="date" bind:value={examDate} /></label>
    {/if}
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (examOpen = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={saveExam}>Speichern</button>
  </svelte:fragment>
</Modal>

<!-- Link create/edit -->
<Modal open={linkOpen} title={linkEditing ? 'Link bearbeiten' : 'Neuer Link'} on:close={() => (linkOpen = false)}>
  <div class="stack">
    <label class="field"><span>Bezeichnung</span><input class="input" bind:value={linkLabel} data-autofocus placeholder="z. B. Teams" /></label>
    <label class="field"><span>URL</span><input class="input" bind:value={linkUrl} placeholder="https://…" /></label>
    <label class="field">
      <span>Art</span>
      <select class="select" bind:value={linkKind}>
        <option value="teams">Teams</option>
        <option value="onenote">OneNote</option>
        <option value="website">Website</option>
        <option value="youtube">YouTube</option>
        <option value="custom">Andere</option>
      </select>
    </label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (linkOpen = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={saveLink} disabled={!linkLabel.trim() || !linkUrl.trim()}>Speichern</button>
  </svelte:fragment>
</Modal>

<!-- Module edit -->
<Modal open={editModuleOpen} title="Modul bearbeiten" on:close={() => (editModuleOpen = false)}>
  <div class="stack">
    <label class="field"><span>Kürzel</span><input class="input" bind:value={editCode} /></label>
    <label class="field"><span>Titel</span><input class="input" bind:value={editTitle} data-autofocus /></label>
    <label class="field">
      <span>Farbe</span>
      <div class="swatches">
        {#each accents as color}
          <button
            class="swatch"
            class:active={editAccent === color}
            type="button"
            style:--swatch={color}
            aria-label={`Farbe ${color}`}
            aria-pressed={editAccent === color}
            on:click={() => (editAccent = color)}
          ></button>
        {/each}
      </div>
    </label>
  </div>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (editModuleOpen = false)}>Abbrechen</button>
    <button class="btn btn-primary" type="button" on:click={saveModule}>Speichern</button>
  </svelte:fragment>
</Modal>

<Modal open={deleteOpen} title="Modul löschen" on:close={() => (deleteOpen = false)}>
  <p>«{mod?.title || mod?.code}» und alle zugehörigen Inhalte werden entfernt. Hochgeladene Dateien werden endgültig gelöscht.</p>
  <svelte:fragment slot="footer">
    <button class="btn btn-ghost" type="button" on:click={() => (deleteOpen = false)}>Abbrechen</button>
    <button class="btn btn-danger" type="button" on:click={doDeleteModule}>Löschen</button>
  </svelte:fragment>
</Modal>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 1000px;
  }
  .crumbs {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .crumbs a {
    color: var(--ink-3);
    text-decoration: none;
  }
  .crumbs a:hover {
    color: var(--accent-strong);
    text-decoration: underline;
  }
  .module-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--mod);
    border-radius: var(--radius-3);
    background: var(--surface);
  }
  .code {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  h1 {
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    letter-spacing: -0.03em;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .head-actions {
    display: flex;
    gap: var(--space-2);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-2);
  }
  .icon-btn:hover {
    background: var(--surface-2);
  }
  .icon-btn.sm {
    width: 30px;
    height: 30px;
    border: 0;
  }
  .tabs {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    border-bottom: 1px solid var(--rule);
  }
  .tab {
    min-height: 42px;
    padding: 0 var(--space-3);
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
  }
  .tab.active {
    color: var(--accent-strong);
    border-bottom-color: var(--accent);
  }
  .overview {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }
  .overview-card {
    grid-column: 1 / -1;
  }
  .overview-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .overview-body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-read);
    font-size: var(--text-sm);
    line-height: 1.7;
    color: var(--ink);
  }
  .overview-body .wiki {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--accent-strong);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .overview-body .wiki.unresolved {
    color: var(--ink-3);
    text-decoration-style: dashed;
    cursor: default;
  }
  .overview-empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .pad {
    padding: var(--space-4);
  }
  .section-title {
    margin-bottom: var(--space-3);
  }
  .hint {
    font-size: 10px;
    color: var(--ink-3);
  }
  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .chip-x {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font-size: 9px;
  }
  .chip-x:hover {
    background: var(--surface);
  }
  .topic-add {
    display: flex;
    gap: var(--space-1);
  }
  .topic-add .input {
    width: 130px;
    min-height: 32px;
  }
  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }
  .notes-grid.wide {
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  }
  .list {
    padding: var(--space-1);
  }
  .exam-mini,
  .exam-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    min-height: 44px;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink);
    text-align: left;
  }
  .exam-mini:hover,
  .exam-main:hover {
    background: var(--surface-2);
  }
  .exam-title {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .exam-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: 11px;
    color: var(--ink-3);
  }
  .grade {
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--ok-soft);
    color: var(--ok);
    font-weight: 700;
  }
  .exam-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .exam-row .exam-main {
    flex: 1;
  }
  .inline-add {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .check-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  .quiet {
    border: 0;
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .quiet:hover {
    color: var(--accent-strong);
    text-decoration: underline;
  }
  .small {
    font-size: var(--text-xs);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-height: 40px;
    align-items: center;
  }
  .swatch {
    width: 24px;
    height: 24px;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--swatch);
  }
  .swatch.active {
    outline: 2px solid var(--swatch);
    outline-offset: 2px;
  }
  @media (min-width: 720px) {
    .inline-add {
      flex-direction: row;
    }
    .inline-add .input[type='date'] {
      width: 160px;
    }
    .overview {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
