<script>
  import { onDestroy, tick } from 'svelte';
  import {
    appState,
    createNote,
    updateNote,
    deleteNote,
    restoreEntity,
    renameNote,
    applyNoteBodies,
  } from '../stores/app.js';
  import { route, navigate, replacePath, notePath, modulePath } from '../router.js';
  import {
    resolveLink,
    backlinks,
    outgoingLinks,
    unlinkedMentions,
    linkFirstMention,
    norm,
  } from '../data/wikiLinks.js';
  import { setTaskChecked } from '../data/markdown.js';
  import { noteLinkIndex } from '../stores/notes.js';
  import { formatDate, dateKey } from '../data/dates.js';
  import { toast } from '../stores/toast.js';
  import AttachmentList from '../components/AttachmentList.svelte';
  import AiButton from '../components/AiButton.svelte';
  import MarkdownBody from '../components/MarkdownBody.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  /** Optional: lets the Notes pane drive which note is open. */
  export let noteId = null;

  let loadedId = null;
  let createdId = null;
  let title = '';
  let body = '';
  let type = 'note';
  let moduleId = '';
  let topicId = '';
  let mode = 'edit';
  let dirty = false;
  let titleDirty = false;
  let saveTimer = null;
  let savedAt = null;

  const TYPE_LABELS = {
    note: 'Notiz',
    mistake: 'Fehler',
    question: 'Frage',
    summary: 'Zusammenfassung',
  };
  function typeLabel(value) {
    return TYPE_LABELS[value] || value;
  }

  /** Everything a wiki link can point at, with its label and icon. */
  const KIND_META = {
    note: { label: 'Notiz', icon: 'notes' },
    module: { label: 'Modul', icon: 'modules' },
    homework: { label: 'Hausaufgabe', icon: 'homework' },
    exam: { label: 'Prüfung', icon: 'exams' },
    link: { label: 'Link', icon: 'links' },
    topic: { label: 'Thema', icon: 'modules' },
  };
  function kindMeta(value) {
    return KIND_META[value] || { label: 'Neu', icon: 'plus' };
  }

  /**
   * Optional starting points. Only offered while the body is empty and
   * only inserted on an explicit click — never on create, never twice.
   */
  const TEMPLATES = [
    {
      key: 'mistake',
      label: 'Fehler',
      hint: 'Was, warum, nächstes Mal',
      body: '## Was ist passiert\n\n\n## Warum ist es passiert\n\n\n## Nächstes Mal\n\n- ',
    },
    {
      key: 'question',
      label: 'Frage',
      hint: 'Frage, Kontext, Antwort',
      body: '## Frage\n\n\n## Kontext\n\n\n## Antwort\n\n',
    },
    {
      key: 'summary',
      label: 'Zusammenfassung',
      hint: 'Kernideen und Details',
      body: '## Kernideen\n\n- \n\n## Details\n\n\n## Offene Fragen\n\n',
    },
  ];

  function applyTemplate(tpl) {
    if (body.trim()) return;
    body = tpl.body;
    if (type === 'note') type = tpl.key;
    const marker = body.indexOf('- ');
    const caret = marker >= 0 ? marker + 2 : Math.max(0, body.indexOf('\n\n') + 2);
    scheduleSave();
    tick().then(() => {
      bodyEl?.focus();
      bodyEl?.setSelectionRange(caret, caret);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Load / draft                                                      */
  /* ---------------------------------------------------------------- */

  $: notes = $appState.notes || [];
  $: id = noteId || $route.id || null;
  $: isNewRoute = id === 'new';
  $: note = isNewRoute ? null : notes.find((n) => n.id === id) || null;
  $: modules = $appState.modules || [];
  $: topics = ($appState.topics || []).filter((t) => !moduleId || t.moduleId === moduleId);
  $: index = $noteLinkIndex;
  $: outgoing = note ? outgoingLinks($appState, note.id, index) : [];
  $: back = note ? backlinks($appState, note.id) : [];
  $: mentions = note ? unlinkedMentions($appState, note.id) : [];
  $: hasConnections = outgoing.length || back.length || mentions.length;

  $: if (isNewRoute && loadedId !== 'new') resetDraft();
  $: if (!isNewRoute && note && note.id !== loadedId) {
    // Leaving a draft by opening another note: keep the draft, don't hijack the URL.
    if (loadedId === 'new' && (title.trim() || body.trim())) ensureCreated({ navigate: false });
    loadNote(note);
  }

  function loadNote(n) {
    loadedId = n.id;
    title = n.title;
    body = n.body;
    type = n.type || 'note';
    moduleId = n.moduleId || '';
    topicId = n.topicId || '';
    dirty = false;
    titleDirty = false;
    savedAt = n.updatedAt || null;
    suggestOpen = false;
    // An existing note opens in reading mode so you can read it first;
    // empty/draft notes stay ready to type in.
    if (String(n.body || '').trim()) mode = 'read';
    else mode = 'edit';
  }

  function resetDraft() {
    loadedId = 'new';
    createdId = null;
    title = '';
    body = '';
    type = 'note';
    moduleId = '';
    topicId = '';
    dirty = false;
    titleDirty = false;
    savedAt = null;
    mode = 'edit';
    suggestOpen = false;
    tick().then(() => titleEl?.focus());
  }

  function fallbackTitle() {
    const line = String(body || '')
      .split('\n')
      .map((l) => l.replace(/^\s*(#{1,3}|[-*]|\d+[.)])\s*/, '').trim())
      .find(Boolean);
    return (line || '').slice(0, 80);
  }

  /** Create the note on first keystroke, then swap /notes/new for its real URL. */
  function ensureCreated({ navigate = true } = {}) {
    if (createdId) return null;
    if (!title.trim() && !body.trim()) return null;
    const finalTitle = title.trim() || fallbackTitle() || 'Notiz';
    const created = createNote({
      title: finalTitle,
      body,
      type,
      moduleId: moduleId || null,
      topicId: topicId || null,
    });
    createdId = created.id;
    loadedId = created.id;
    title = finalTitle;
    titleDirty = false;
    dirty = false;
    savedAt = created.updatedAt;
    if (navigate) replacePath(notePath(created.id));
    return created;
  }

  /* ---------------------------------------------------------------- */
  /* Saving                                                            */
  /* ---------------------------------------------------------------- */

  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 450);
  }

  function save(force = false) {
    if (loadedId === 'new') {
      ensureCreated();
      return;
    }
    if (!note) return;
    if (!dirty && !force) return;
    updateNote(note.id, {
      body,
      type,
      moduleId: moduleId || null,
      topicId: topicId || null,
    });
    dirty = false;
    savedAt = Date.now();
  }

  function commitTitle({ silent = false } = {}) {
    if (loadedId === 'new') {
      if (title.trim() || body.trim()) ensureCreated();
      return;
    }
    if (!note) return;
    if (!titleDirty) {
      title = note.title;
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      title = note.title;
      titleDirty = false;
      return;
    }
    if (norm(trimmed) === norm(note.title)) {
      title = note.title;
      titleDirty = false;
      return;
    }
    const oldTitle = note.title;
    const result = renameNote(note.id, trimmed);
    title = trimmed;
    titleDirty = false;
    savedAt = Date.now();
    const updated = result?.updatedLinks || [];
    if (!silent && updated.length) {
      const before = updated.map((l) => ({ id: l.id, body: l.before }));
      toast(`${updated.length} ${updated.length === 1 ? 'Verweis' : 'Verweise'} aktualisiert`, {
        action: {
          label: 'Rückgängig',
          fn: () => {
            renameNote(note.id, oldTitle);
            applyNoteBodies(before);
            title = oldTitle;
            titleDirty = false;
          },
        },
      });
    }
  }

  function saveNow() {
    clearTimeout(saveTimer);
    commitTitle();
    save(true);
  }

  function onModuleChange() {
    if (topicId && !topics.some((t) => t.id === topicId)) topicId = '';
    scheduleSave();
  }

  /* ---------------------------------------------------------------- */
  /* Links                                                             */
  /* ---------------------------------------------------------------- */

  function openEntry(entry) {
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

  function openLink(target) {
    const entry = resolveLink($appState, target);
    if (entry) openEntry(entry);
  }

  function createFromLink(target) {
    const value = String(target || '').trim();
    if (!value) return;
    const existing = resolveLink($appState, value);
    if (existing) return openEntry(existing);
    const created = createNote({
      title: value,
      moduleId: note?.moduleId || null,
      topicId: note?.topicId || null,
      type: 'note',
    });
    toast(`Notiz «${value}» erstellt`);
    navigate(notePath(created.id));
  }

  function openConnection(item) {
    if (item.entry) openEntry(item.entry);
    else createFromLink(item.target);
  }

  function openTag(tag) {
    navigate(`/notes?tag=${encodeURIComponent(tag)}`);
  }

  function toggleTask(line, checked) {
    const next = setTaskChecked(body, line, checked);
    if (next === body) return;
    body = next;
    if (note) {
      updateNote(note.id, { body: next });
      dirty = false;
      savedAt = Date.now();
    }
  }

  function linkMention(source) {
    if (!note) return;
    const before = source.body || '';
    const after = linkFirstMention(before, note.title);
    if (after === before) {
      toast('Kein Treffer zum Verlinken');
      return;
    }
    applyNoteBodies({ [source.id]: after });
    toast('Verweis gesetzt', {
      action: { label: 'Rückgängig', fn: () => applyNoteBodies({ [source.id]: before }) },
    });
  }

  /* ---------------------------------------------------------------- */
  /* [[ autocomplete                                                   */
  /* ---------------------------------------------------------------- */

  let bodyEl = null;
  let titleEl = null;
  let suggestOpen = false;
  let suggestStart = 0;
  let suggestQuery = '';
  let suggestActive = 0;
  let suggestPos = { top: 0, left: 0 };

  $: suggestions = suggestOpen ? buildSuggestions(suggestQuery) : [];

  function buildSuggestions(rawQuery) {
    const q = norm(rawQuery);
    const currentTitle = note ? norm(note.title) : norm(title);
    const items = [];
    const seen = new Set();
    const push = (kind, label, insert, sub) => {
      const key = `${kind}:${norm(label)}`;
      if (!label || seen.has(key)) return;
      seen.add(key);
      items.push({ kind, label, insert: insert || label, sub });
    };

    const matches = (value) => {
      const n = norm(value);
      return n && (!q || n.includes(q));
    };
    const rank = (value) => {
      const n = norm(value);
      if (!q) return 2;
      if (n.startsWith(q)) return 0;
      return 1;
    };

    // Keep a readable mix of kinds: notes first, then the other collections.
    const noteItems = (notes || [])
      .filter((n) => n.title && norm(n.title) !== currentTitle && matches(n.title))
      .sort((a, b) => rank(a.title) - rank(b.title) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, q ? 6 : 4);
    for (const n of noteItems) push('note', n.title, n.title, kindMeta('note').label);

    const moduleItems = (modules || [])
      .filter((m) => (m.title || m.code) && (matches(m.title) || matches(m.code)))
      .sort((a, b) => rank(a.title || a.code) - rank(b.title || b.code))
      .slice(0, 3);
    for (const m of moduleItems) push('module', m.title || m.code, m.title || m.code, kindMeta('module').label);

    const homeworkItems = ($appState.homework || [])
      .filter((h) => h.title && matches(h.title))
      .sort((a, b) => rank(a.title) - rank(b.title))
      .slice(0, 2);
    for (const h of homeworkItems) push('homework', h.title, h.title, kindMeta('homework').label);

    const examItems = ($appState.exams || [])
      .filter((e) => e.title && matches(e.title))
      .sort((a, b) => rank(a.title) - rank(b.title))
      .slice(0, 2);
    for (const e of examItems) push('exam', e.title, e.title, kindMeta('exam').label);

    const linkItems = ($appState.links || [])
      .filter((l) => l.label && matches(l.label))
      .sort((a, b) => rank(a.label) - rank(b.label))
      .slice(0, 2);
    for (const l of linkItems) push('link', l.label, l.label, kindMeta('link').label);

    const topicItems = ($appState.topics || [])
      .filter((t) => t.name && matches(t.name))
      .sort((a, b) => rank(a.name) - rank(b.name))
      .slice(0, 2);
    for (const t of topicItems) push('topic', t.name, t.name, kindMeta('topic').label);

    const query = String(rawQuery || '').trim();
    const exact = items.some((i) => norm(i.label) === norm(query));
    if (query && !exact) push('new', `Neu: «${query}»`, query, 'Notiz erstellen');

    return items.slice(0, 10);
  }

  function caretPoint(el, value, position) {
    if (!el) return { x: 0, y: 0 };
    const mirror = document.createElement('div');
    const css = getComputedStyle(el);
    const props = [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
      'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'boxSizing', 'width',
    ];
    for (const prop of props) mirror.style[prop] = css[prop];
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top = '0';
    mirror.style.left = '0';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.height = 'auto';
    mirror.textContent = value.slice(0, position);
    const marker = document.createElement('span');
    marker.textContent = value.slice(position) || '.';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const box = mirror.getBoundingClientRect();
    const point = marker.getBoundingClientRect();
    const x = point.left - box.left + el.clientLeft;
    const y = point.top - box.top + el.clientTop;
    document.body.removeChild(mirror);
    const left = Math.max(0, Math.min(x - el.scrollLeft, Math.max(0, el.clientWidth - 280)));
    const top = y - el.scrollTop + 24;
    return { x: left, y: top };
  }

  function updateSuggestions(event) {
    if (mode !== 'edit') return;
    const el = event.target;
    const value = el.value;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const open = before.lastIndexOf('[[');
    if (open < 0) {
      suggestOpen = false;
      return;
    }
    const between = before.slice(open + 2);
    if (between.length > 80 || between.includes(']]') || between.includes('\n') || between.includes('[') || between.includes('|')) {
      suggestOpen = false;
      return;
    }
    suggestStart = open;
    suggestQuery = between;
    suggestActive = 0;
    const list = buildSuggestions(between);
    if (!list.length) {
      suggestOpen = false;
      return;
    }
    const point = caretPoint(el, value, caret);
    suggestPos = { top: point.y, left: point.x };
    suggestOpen = true;
  }

  function insertSuggestion(item) {
    if (!item || !bodyEl) return;
    const caret = bodyEl.selectionStart ?? body.length;
    const next = `${body.slice(0, suggestStart)}[[${item.insert}]]${body.slice(caret)}`;
    const position = suggestStart + item.insert.length + 4;
    body = next;
    suggestOpen = false;
    scheduleSave();
    tick().then(() => {
      bodyEl?.focus();
      bodyEl?.setSelectionRange(position, position);
    });
  }

  function onBodyKeydown(event) {
    if (!suggestOpen) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        saveNow();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      suggestActive = (suggestActive + 1) % suggestions.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      suggestActive = (suggestActive - 1 + suggestions.length) % suggestions.length;
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      insertSuggestion(suggestions[suggestActive]);
    } else if (event.key === 'Escape') {
      // Only dismiss the popover — do not also leave the note via the page handler.
      event.preventDefault();
      event.stopPropagation();
      suggestOpen = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Keyboard + lifecycle                                              */
  /* ---------------------------------------------------------------- */

  function isNarrow() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 1199px)').matches;
  }

  function onKeydown(event) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      if (mode === 'edit') {
        commitTitle();
        save(true);
        mode = 'read';
      } else {
        mode = 'edit';
        tick().then(() => bodyEl?.focus());
      }
      return;
    }
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveNow();
      return;
    }
    if (event.key === 'Escape') {
      if (suggestOpen) {
        suggestOpen = false;
        return;
      }
      if (isNarrow()) {
        event.preventDefault();
        saveNow();
        navigate('/notes');
      }
    }
  }

  function remove() {
    if (!note) {
      navigate('/notes');
      return;
    }
    const snapshot = { ...note, attachments: [...(note.attachments || [])] };
    const idToRestore = note.id;
    deleteNote(idToRestore);
    navigate('/notes');
    toast('Notiz gelöscht', {
      action: {
        label: 'Rückgängig',
        fn: () => {
          restoreEntity('notes', snapshot);
          navigate(notePath(idToRestore));
        },
      },
    });
  }

  onDestroy(() => {
    clearTimeout(saveTimer);
    if (loadedId === 'new') {
      if (title.trim() || body.trim()) ensureCreated({ navigate: false });
      return;
    }
    commitTitle({ silent: true });
    if (dirty) save();
  });
</script>

<!-- Note shortcuts (Ctrl/Cmd+E toggle, Ctrl/Cmd+S save, Esc) live on the
     window: the page div is a plain container, and a keydown handler on it
     would need an ARIA role (a11y_no_static_element_interactions). -->
<svelte:window on:keydown={onKeydown} />

{#if !note && !isNewRoute}
  <div class="page">
    <EmptyState title="Notiz nicht gefunden" text="Vielleicht wurde sie gelöscht." actionLabel="Zu den Notizen" action={() => navigate('/notes')} />
  </div>
{:else}
  <div class="page">
    <nav class="crumbs" aria-label="Brotkrümelnavigation">
      <a href="#/notes">Notizen</a>
      {#if note?.moduleId}
        {@const mod = modules.find((m) => m.id === note.moduleId)}
        {#if mod}
          <span aria-hidden="true">/</span>
          <a href="#{modulePath(mod.id)}">{mod.code || mod.title}</a>
        {/if}
      {/if}
    </nav>

    <div class="note-head">
      <div class="head-meta">
        <span class="type">{typeLabel(type)}</span>
        {#if isNewRoute}
          <span class="saved mono">neu</span>
        {:else if savedAt}
          <span class="saved mono">{dirty || titleDirty ? 'speichert…' : `gespeichert ${formatDate(dateKey(new Date(savedAt)), 'short')}`}</span>
        {/if}
      </div>
      <div class="head-actions">
        {#if note}
          <AiButton label="KI fragen" kind="note" id={note.id} />
          <details class="more-actions">
            <summary class="icon-btn" aria-label="Weitere KI-Aktionen" title="Weitere KI-Aktionen">
              <Icon name="more" size={16} />
            </summary>
            <div class="more-menu">
              <AiButton label="Zusammenfassen" kind="note" id={note.id} prompt="Fasse diese Notiz in 5 Punkten zusammen." />
            </div>
          </details>
        {/if}
        <div class="segmented" role="group" aria-label="Ansicht">
          <button class="seg" class:active={mode === 'edit'} type="button" aria-pressed={mode === 'edit'} on:click={() => (mode = 'edit')}>Schreiben</button>
          <button class="seg" class:active={mode === 'read'} type="button" aria-pressed={mode === 'read'} on:click={() => (mode = 'read')}>Lesen</button>
        </div>
        <button class="icon-btn" type="button" aria-label="Notiz löschen" on:click={remove}><Icon name="trash" size={16} /></button>
      </div>
    </div>

    <div class="meta-grid">
      <label class="field">
        <span>Typ</span>
        <select class="select" bind:value={type} on:change={() => scheduleSave()}>
          <option value="note">Notiz</option>
          <option value="mistake">Fehler</option>
          <option value="question">Frage</option>
          <option value="summary">Zusammenfassung</option>
        </select>
      </label>
      <label class="field">
        <span>Modul</span>
        <select class="select" bind:value={moduleId} on:change={onModuleChange}>
          <option value="">Kein Modul</option>
          {#each modules as m (m.id)}<option value={m.id}>{m.code ? `${m.code} · ` : ''}{m.title}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Thema</span>
        <select class="select" bind:value={topicId} on:change={() => scheduleSave()}>
          <option value="">Kein Thema</option>
          {#each topics as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>
    </div>

    {#if mode === 'edit'}
      <input
        class="title-input"
        bind:this={titleEl}
        bind:value={title}
        placeholder="Titel"
        aria-label="Titel"
        on:input={() => (titleDirty = true)}
        on:blur={() => commitTitle()}
        on:keydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {#if !body.trim()}
        <details class="templates">
          <summary>Vorlage einfügen <span class="optional">optional</span></summary>
          <div class="tpl-chips">
            {#each TEMPLATES as tpl (tpl.key)}
              <button class="chip tpl-chip" type="button" title={tpl.hint} on:click={() => applyTemplate(tpl)}>
                <Icon name="file" size={13} /> {tpl.label}
              </button>
            {/each}
          </div>
        </details>
      {/if}
      <div class="editor-wrap">
        <textarea
          bind:this={bodyEl}
          class="body-input"
          bind:value={body}
          placeholder="Schreib los… [[Andere Notiz]] verlinkt."
          aria-label="Notiztext"
          on:input={(e) => { updateSuggestions(e); scheduleSave(); }}
          on:click={updateSuggestions}
          on:keydown={onBodyKeydown}
          on:blur={() => (suggestOpen = false)}
        ></textarea>

        {#if suggestOpen}
          <div class="suggest" role="listbox" aria-label="Links vorschlagen" style={`top:${suggestPos.top}px; left:${suggestPos.left}px`}>
            {#each suggestions as item, i (item.kind + item.label)}
              <button
                class="suggest-item"
                class:active={i === suggestActive}
                type="button"
                role="option"
                aria-selected={i === suggestActive}
                on:mousedown|preventDefault
                on:mouseenter={() => (suggestActive = i)}
                on:click={() => insertSuggestion(item)}
              >
                <Icon name={kindMeta(item.kind).icon} size={15} />
                <span class="suggest-label">{item.label}</span>
                <span class="suggest-sub">{item.sub}</span>
              </button>
            {/each}
            <div class="suggest-foot"><kbd>↑</kbd><kbd>↓</kbd> wählen · <kbd>↵</kbd> einfügen · <kbd>Esc</kbd></div>
          </div>
        {/if}
      </div>
    {:else}
      <h1 class="read-title">{title || 'Ohne Titel'}</h1>
      <div class="reading note-body">
        {#if body.trim()}
          <MarkdownBody
            {body}
            resolveEntry={(target) => resolveLink($appState, target)}
            onLink={openLink}
            onCreate={createFromLink}
            onTag={openTag}
            onToggleTask={toggleTask}
          />
        {:else}
          <p class="muted">Noch kein Text.</p>
        {/if}
      </div>
    {/if}

    {#if note && hasConnections}
      <section class="connections" aria-label="Verbindungen">
        <div class="section-title"><h2>Verbindungen</h2></div>

        {#if outgoing.length}
          <div class="conn-group">
            <p class="conn-label">Verlinkt zu</p>
            <div class="chips">
              {#each outgoing as item (item.target)}
                <button
                  class:unresolved={!item.entry}
                  class="chip conn-chip"
                  type="button"
                  on:click={() => openConnection(item)}
                  title={item.entry ? `${kindMeta(item.entry.kind).label}: ${item.entry.label}` : 'Notiz erstellen'}
                >
                  {#if !item.entry}
                    <Icon name="plus" size={13} />
                  {:else if item.entry.kind !== 'note'}
                    <Icon name={kindMeta(item.entry.kind).icon} size={13} />
                  {/if}
                  <span>{item.label || item.target}</span>
                  {#if !item.entry}
                    <span class="kind">erstellen</span>
                  {:else if item.entry.kind !== 'note'}
                    <span class="kind">{kindMeta(item.entry.kind).label}</span>
                  {/if}
                  {#if item.count > 1}<span class="count">{item.count}</span>{/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if back.length}
          <div class="conn-group">
            <p class="conn-label">Verlinkt von</p>
            <div class="chips">
              {#each back as source (source.id)}
                <a class="chip back-link" href="#{notePath(source.id)}">
                  <Icon name="notes" size={14} />
                  <span>{source.title || 'Ohne Titel'}</span>
                </a>
              {/each}
            </div>
          </div>
        {/if}

        {#if mentions.length}
          <div class="conn-group">
            <p class="conn-label">Erwähnt in</p>
            <div class="mentions">
              {#each mentions as source (source.id)}
                <div class="mention-row">
                  <a class="mention-title" href="#{notePath(source.id)}">{source.title || 'Ohne Titel'}</a>
                  <button class="btn btn-sm btn-ghost" type="button" on:click={() => linkMention(source)}>verlinken</button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/if}

    {#if note}
      <section class="attachments-block">
        <div class="section-title"><h2>Dateien</h2></div>
        <AttachmentList attachments={note.attachments || []} ownerId={note.id} on:change={(e) => updateNote(note.id, { attachments: e.detail })} />
      </section>
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 860px;
    min-width: 0;
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
  .note-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .head-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 10px;
    color: var(--ink-3);
  }
  .type {
    font-weight: 600;
  }
  .head-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface-2);
  }
  .seg {
    min-height: 30px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink-3);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .seg.active {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-2);
  }
  .icon-btn:hover {
    color: var(--danger);
    background: var(--danger-soft);
  }
  .title-input {
    width: 100%;
    padding: var(--space-2) 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font-family: var(--font-read);
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .title-input:focus-visible,
  .body-input:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 3px;
    border-radius: var(--radius-1);
  }
  .templates {
    border-top: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .templates summary {
    width: fit-content;
    padding: var(--space-2) 0;
    cursor: pointer;
    list-style: none;
  }
  .templates summary::-webkit-details-marker {
    display: none;
  }
  .templates summary::before {
    content: '+';
    margin-right: 4px;
    font-family: var(--font-mono);
  }
  .templates[open] summary::before {
    content: '−';
  }
  .templates summary:hover {
    color: var(--ink);
  }
  .optional {
    margin-left: 2px;
    color: var(--ink-3);
    font-size: 10px;
  }
  .tpl-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
  }
  .tpl-chip {
    cursor: pointer;
    font: inherit;
    font-size: var(--text-xs);
  }
  .tpl-chip:hover {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .editor-wrap {
    position: relative;
  }
  .body-input {
    width: 100%;
    min-height: 320px;
    padding: var(--space-3) 0;
    border: 0;
    border-top: 1px solid var(--rule);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-read);
    font-size: var(--text-lg);
    line-height: 1.7;
    resize: vertical;
  }
  .body-input:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 3px;
    border-radius: var(--radius-1);
  }
  .suggest {
    position: absolute;
    z-index: 40;
    width: 280px;
    max-width: 100%;
    padding: var(--space-1);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-3);
    background: var(--surface);
    box-shadow: var(--shadow-2);
  }
  .suggest-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 36px;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-2);
    background: transparent;
    color: var(--ink);
    font-size: var(--text-sm);
    text-align: left;
  }
  .suggest-item.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .suggest-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .suggest-sub {
    font-size: 10px;
    color: var(--ink-3);
  }
  .suggest-foot {
    padding: var(--space-2);
    border-top: 1px solid var(--rule);
    font-size: 10px;
    color: var(--ink-3);
  }
  kbd {
    padding: 1px 5px;
    border: 1px solid var(--rule-strong);
    border-radius: 4px;
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .read-title {
    font-family: var(--font-read);
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
  }
  .note-body {
    min-height: 200px;
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
  .connections,
  .attachments-block {
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }
  .conn-group + .conn-group {
    margin-top: var(--space-3);
  }
  .conn-label {
    margin-bottom: var(--space-1);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-2);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .conn-chip {
    cursor: pointer;
    font: inherit;
    font-size: var(--text-xs);
  }
  .conn-chip:hover {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .conn-chip.unresolved {
    border-style: dashed;
    border-color: var(--rule-strong);
    background: transparent;
    color: var(--ink-2);
  }
  .conn-chip.unresolved:hover {
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .more-actions {
    position: relative;
  }
  .more-actions summary {
    cursor: pointer;
    list-style: none;
  }
  .more-actions summary::-webkit-details-marker {
    display: none;
  }
  .more-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 30;
    padding: var(--space-1);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    box-shadow: var(--shadow-2);
  }
  .more-menu :global(.ai-btn) {
    white-space: nowrap;
  }
  .conn-chip .kind {
    font-size: 10px;
    color: var(--ink-3);
  }
  .conn-chip .count {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-3);
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    text-decoration: none;
  }
  .mentions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .mention-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
  }
  .mention-title {
    color: var(--ink-2);
    font-size: var(--text-sm);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mention-title:hover {
    color: var(--ink);
    text-decoration: underline;
  }
  @media (min-width: 720px) {
    .meta-grid {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }
</style>
