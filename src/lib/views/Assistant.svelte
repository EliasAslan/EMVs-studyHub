<script>
  import { onMount, tick } from 'svelte';
  import { appState } from '../stores/app.js';
  import { aiSettings, aiReady } from '../stores/ai.js';
  import { lastNonAssistantRoute } from '../stores/ui.js';
  import { route, navigate } from '../router.js';
  import { getPomodoro } from '../services/pomodoroEngine.js';
  import { checkConnection, chatComplete, describeAiError } from '../services/localAI.js';
  import {
    SYSTEM_PROMPT,
    listContextRefs,
    parseMentions,
    resolveContext,
    resolveDeepLinkRef,
    buildContextBlock,
  } from '../data/aiContext.js';
  import ContextTray from '../components/ContextTray.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  let input = '';
  let messages = [];
  let pinnedRefs = [];
  let streaming = false;
  let errorText = '';
  let lastRequest = null;
  let controller = null;
  let scroller = null;
  let scrollQueued = false;
  let textarea = null;
  let showContext = false;
  let mentionOpen = false;
  let mentionQuery = '';
  let mentionIndex = 0;
  let appliedRef = null;
  let connection = { status: 'idle', models: [], error: '' };

  $: parsedInput = parseMentions(input);
  $: refs = [...new Set([...pinnedRefs, ...parsedInput.refs])];
  $: context = resolveContext($appState, $route, refs, {
    now: new Date(),
    lastRoute: $lastNonAssistantRoute,
    pomodoro: getPomodoro(),
  });

  $: connectionErrorText = connection.status === 'error' ? describeAiError(connection.error) : '';
  $: suggestions = buildSuggestions($lastNonAssistantRoute);
  $: mentionItems = mentionOpen
    ? listContextRefs($appState, $route)
        .filter((item) => {
          const query = fold(mentionQuery);
          return !query || fold(item.token.slice(1)).includes(query) || fold(item.label).includes(query);
        })
        .slice(0, 8)
    : [];
  $: if (mentionIndex >= mentionItems.length) mentionIndex = 0;
  $: if ($route.name === 'assistant') applyDeepLink($route.query?.ref, $route.query?.prompt);

  onMount(() => {
    if ($aiReady) {
      refreshConnection();
      focusComposer();
      tick().then(autoGrow);
    }
  });

  function focusComposer() {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(pointer: fine)').matches) {
      tick().then(() => textarea?.focus());
    }
  }

  /** Composer grows with content, capped at 180px (then scrolls). */
  function autoGrow() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }

  function fold(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ß/g, 'ss');
  }

  function buildSuggestions(lastRoute) {
    switch (lastRoute?.name) {
      case 'exams':
        return [
          { label: 'Welche Prüfung braucht als Nächstes Vorbereitung?', value: '@prüfungen Welche Prüfung braucht als Nächstes Vorbereitung?' },
          { label: 'Was ist diese Woche wichtig?', value: '@hub Was ist diese Woche wichtig?' },
        ];
      case 'homework':
        return [
          { label: 'Was ist zuerst dran?', value: '@hausaufgaben Was ist zuerst dran?' },
          { label: 'Was steht heute an?', value: '@heute Was steht heute an?' },
        ];
      case 'notes':
      case 'note':
        return [
          { label: 'Welche Notiz sollte ich wiederholen?', value: '@notizen Welche Notiz sollte ich wiederholen?' },
          { label: 'Fasse diese Seite zusammen.', value: '@seite Fasse diese Seite zusammen.' },
        ];
      case 'module':
      case 'modules':
        return [
          { label: 'Was ist in diesem Modul offen?', value: '@seite Was ist in diesem Modul offen?' },
          { label: 'Welche Module brauchen Aufmerksamkeit?', value: '@module Welche Module brauchen Aufmerksamkeit?' },
        ];
      default:
        return [
          { label: 'Was steht heute an?', value: '@heute Was steht heute an?' },
          { label: 'Was ist diese Woche wichtig?', value: '@hub Was ist diese Woche wichtig?' },
        ];
    }
  }

  function applyDeepLink(raw, customPrompt) {
    const key = `${raw || ''}|${customPrompt || ''}`;
    if (!raw || key === appliedRef) return;
    appliedRef = key;
    const mapped = resolveDeepLinkRef(raw);
    if (!mapped) return;
    const prompts = {
      heute: 'Was steht heute an?',
      hausaufgaben: 'Was ist zuerst dran? Gib mir eine ruhige Reihenfolge.',
      notizen: 'Fasse meine wichtigsten Notizen in wenigen Sätzen zusammen.',
      prüfungen: 'Welche Prüfung braucht als Nächstes Vorbereitung?',
      hub: 'Was ist diese Woche wichtig?',
      module: 'Welche Module brauchen Aufmerksamkeit?',
      kalender: 'Welche Fristen kommen auf mich zu?',
      fokus: 'Worauf sollte ich mich jetzt fokussieren?',
    };
    let fallback = prompts[mapped] || '';
    if (!fallback && mapped.startsWith('notiz/')) fallback = 'Fasse diese Notiz in 5 Punkten zusammen.';
    if (!fallback && (mapped.startsWith('modul/') || mapped.startsWith('code:'))) {
      fallback = 'Gib mir einen kurzen Überblick über dieses Modul.';
    }
    if (!fallback && mapped.startsWith('prüfung/')) fallback = 'Was sollte ich für diese Prüfung zuerst wiederholen?';
    const nextInput = customPrompt || fallback;
    // Assignments inside the route reactive statement are not flushed until the
    // next interaction, so apply them after the current flush completes.
    queueMicrotask(() => {
      pinnedRefs = [mapped];
      if (nextInput) input = nextInput;
      showContext = false;
    });
  }

  async function refreshConnection(fresh = false) {
    connection = { status: 'checking', models: connection.models, error: '' };
    const result = await checkConnection({ baseUrl: $aiSettings.baseUrl, fresh });
    connection = result.ok
      ? { status: 'ok', models: result.models, error: '' }
      : { status: 'error', models: [], error: result.error };
  }

  function updateMention() {
    const position = textarea?.selectionStart ?? input.length;
    const before = input.slice(0, position);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
    if (!match) {
      mentionOpen = false;
      mentionQuery = '';
      return;
    }
    mentionQuery = match[1];
    mentionOpen = true;
    mentionIndex = 0;
  }

  function insertMention(item) {
    if (!item) return;
    const position = textarea?.selectionStart ?? input.length;
    const before = input.slice(0, position);
    const after = input.slice(position);
    const replaced = before.replace(/@[^\s@]*$/, `${item.token} `);
    let next = replaced + after;
    // When the user only picked a mention, give them a ready-to-send question.
    if (!parseMentions(next).cleanText) {
      next = `${item.token} Erzähl mir mehr dazu.`;
    }
    input = next;
    mentionOpen = false;
    tick().then(() => {
      textarea?.focus();
      const caret = input.length;
      textarea?.setSelectionRange(caret, caret);
    });
  }

  function onKeydown(event) {
    if (mentionOpen && mentionItems.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionItems.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionIndex = (mentionIndex - 1 + mentionItems.length) % mentionItems.length;
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        insertMention(mentionItems[mentionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        mentionOpen = false;
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  function send() {
    if (streaming) return;
    const text = input.trim();
    if (!text) return;
    const parsed = parseMentions(text);
    const sendRefs = [...new Set([...pinnedRefs, ...parsed.refs])];
    const request = {
      question: parsed.cleanText || text,
      context: resolveContext($appState, $route, sendRefs, {
        now: new Date(),
        lastRoute: $lastNonAssistantRoute,
        pomodoro: getPomodoro(),
      }),
      history: messages.slice(-8).map((message) => ({
        role: message.role,
        content: message.role === 'user' ? parseMentions(message.text).cleanText : message.text,
      })),
    };

    messages = [...messages, { role: 'user', text, refs: sendRefs }];
    input = '';
    mentionOpen = false;
    errorText = '';
    lastRequest = request;
    tick().then(autoGrow);
    runRequest(request);
  }

  async function runRequest(request) {
    if (streaming) return;
    streaming = true;
    errorText = '';
    controller = new AbortController();
    const index = messages.length;
    messages = [...messages, { role: 'assistant', text: '', pending: true }];
    scrollToBottom();

    const userContent = request.context.sections.length
      ? `${buildContextBlock(request.context)}\n\n${request.question}`
      : request.question;

    const result = await chatComplete(
      {
        baseUrl: $aiSettings.baseUrl,
        model: $aiSettings.model,
        numCtx: $aiSettings.numCtx,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...request.history,
          { role: 'user', content: userContent },
        ],
        signal: controller.signal,
        onToken: (delta) => {
          messages = messages.map((message, i) =>
            i === index ? { ...message, text: message.text + delta } : message,
          );
          scrollToBottom();
        },
      },
      {},
    );

    streaming = false;
    controller = null;
    if (result.error) {
      messages = messages.slice(0, index);
      errorText = describeAiError(result.error);
      return;
    }
    messages = messages.map((message, i) =>
      i === index ? { ...message, pending: false, aborted: result.aborted } : message,
    );
  }

  function scrollToBottom() {
    if (!scroller || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  }

  function retry() {
    if (!lastRequest || streaming) return;
    runRequest(lastRequest);
  }

  function stop() {
    controller?.abort();
  }

  function newChat() {
    if (streaming) stop();
    messages = [];
    pinnedRefs = [];
    input = '';
    errorText = '';
    lastRequest = null;
    appliedRef = null;
    showContext = false;
    tick().then(autoGrow);
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Lokal</p>
      <h1>Assistent</h1>
    </div>
    {#if $aiReady}
      <div class="head-meta">
        <span class="model mono">{$aiSettings.model}</span>
        <button class="btn btn-sm btn-ghost" type="button" on:click={newChat}>Neu</button>
      </div>
    {/if}
  </header>

  {#if !$aiReady}
    <EmptyState
      title="Lokale KI ist aus."
      text="Der Assistent bleibt verborgen, bis du ihn in den Einstellungen aktivierst. Es wird nichts gesendet."
      actionLabel="In Einstellungen aktivieren"
      action={() => navigate('/settings')}
    />
  {:else}
    <div class="status-line">
      <span class="status-dot" class:ok={connection.status === 'ok'} class:error={connection.status === 'error'} aria-hidden="true"></span>
      <span class="status-label">
        {connection.status === 'checking'
          ? 'prüfe Verbindung…'
          : connection.status === 'ok'
            ? 'Ollama verbunden'
            : connection.status === 'error'
              ? 'Ollama nicht erreichbar'
              : 'Verbindung nicht geprüft'}
      </span>
      {#if connection.status === 'error'}
        <span class="muted small">{connectionErrorText}</span>
        <button class="quiet" type="button" on:click={() => refreshConnection(true)}>Erneut prüfen</button>
      {/if}
    </div>

    <section class="chat" bind:this={scroller} aria-label="Unterhaltung" aria-live="polite">
      {#if !messages.length}
        <div class="empty">
          <p>Frag zu deinen Daten. Tippe <kbd>@</kbd> für eine Seite, ein Modul oder eine Notiz.</p>
          <div class="suggestions">
            {#each suggestions as suggestion (suggestion.value)}
              <button
                class="chip"
                type="button"
                on:click={() => {
                  input = suggestion.value;
                  textarea?.focus();
                  tick().then(autoGrow);
                }}
              >
                {suggestion.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#each messages as message, index (index)}
        <div class="msg {message.role}">
          {#if message.role === 'user'}
            <p class="bubble">{message.text}</p>
            {#if message.refs?.length}
              <div class="msg-refs">
                {#each message.refs as ref (ref)}<span class="ref">{ref}</span>{/each}
              </div>
            {/if}
          {:else}
            <div class="bubble assistant">
              {#if message.text}{message.text}{:else if message.pending}<span class="muted">…</span>{/if}
            </div>
            {#if message.aborted}<span class="muted small">Abgebrochen.</span>{/if}
          {/if}
        </div>
      {/each}

      {#if errorText}
        <div class="error-line" role="alert">
          <p>{errorText}</p>
          {#if lastRequest}<button class="btn btn-sm" type="button" on:click={retry}>Erneut versuchen</button>{/if}
        </div>
      {/if}
    </section>

    <div class="composer-wrap">
      <ContextTray result={context} bind:open={showContext} />

      <div class="composer">
        {#if mentionOpen && mentionItems.length}
          <ul class="mention-menu" id="mention-list" role="listbox" aria-label="Kontext wählen">
            {#each mentionItems as item, index (item.ref)}
              <li>
                <button
                  id={`mention-${index}`}
                  class="mention-item"
                  class:active={index === mentionIndex}
                  type="button"
                  role="option"
                  aria-selected={index === mentionIndex}
                  on:mousedown|preventDefault={() => insertMention(item)}
                >
                  <span class="mention-token mono">{item.token}</span>
                  <span class="mention-label">{item.label}</span>
                  <span class="mention-group">{item.group}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}

        <textarea
          bind:this={textarea}
          bind:value={input}
          class="input composer-input"
          rows="2"
          placeholder="Frage stellen… @ für Kontext"
          aria-label="Frage an den Assistenten"
          aria-autocomplete="list"
          aria-controls={mentionOpen ? 'mention-list' : undefined}
          on:input={(e) => { updateMention(); autoGrow(); }}
          on:click={autoGrow}
          on:keydown={onKeydown}
        ></textarea>

        <div class="composer-foot">
          <span class="muted small">Enter senden · Shift+Enter neue Zeile</span>
          {#if streaming}
            <button class="btn btn-sm" type="button" on:click={stop}>
              <Icon name="stop" size={14} /> Stopp
            </button>
          {:else}
            <button class="btn btn-primary btn-sm" type="button" on:click={send} disabled={!input.trim()}>
              <Icon name="send" size={14} /> Senden
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 820px;
    min-height: calc(100dvh - 150px);
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
  .head-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .model {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-3);
    font-size: 10px;
  }
  .status-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .status-dot.ok {
    background: var(--ok);
  }
  .status-dot.error {
    background: var(--warn);
  }
  .status-label {
    font-weight: 600;
  }
  .quiet {
    border: 0;
    background: transparent;
    color: var(--accent-strong);
    font-size: var(--text-xs);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .chat {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 200px;
    padding: var(--space-2) 0;
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-4);
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-2);
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  kbd {
    padding: 1px 5px;
    border: 1px solid var(--rule-strong);
    border-radius: 4px;
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .chip {
    max-width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    color: var(--ink-2);
    font-size: var(--text-xs);
    text-align: left;
  }
  .chip:hover {
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .msg {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-width: 100%;
  }
  .msg.user {
    align-items: flex-end;
  }
  .bubble {
    max-width: 90%;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2);
    background: var(--surface);
    border: 1px solid var(--rule);
    color: var(--ink);
    font-size: var(--text-sm);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .msg.user .bubble {
    background: var(--accent-soft);
    border-color: transparent;
    color: var(--accent-strong);
  }
  .bubble.assistant {
    align-self: flex-start;
  }
  .msg-refs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .ref {
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .error-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: var(--text-xs);
  }
  .error-line p {
    flex: 1;
    margin: 0;
  }
  .composer-wrap {
    position: sticky;
    bottom: calc(var(--tabbar-h) + 8px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-2);
    background: var(--bg);
  }
  .composer {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
  }
  .composer-input {
    min-height: 56px;
    max-height: 180px;
    overflow-y: auto;
    resize: vertical;
    border: 0;
    background: transparent;
  }
  .composer-input:focus {
    outline: none;
  }
  .composer-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .mention-menu {
    position: absolute;
    inset: auto 0 100% 0;
    z-index: 5;
    max-height: 260px;
    margin: 0 0 var(--space-1);
    padding: var(--space-1);
    overflow: auto;
    list-style: none;
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
    box-shadow: var(--shadow-3);
  }
  .mention-item {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    min-height: 34px;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--ink);
    font-size: var(--text-xs);
    text-align: left;
  }
  .mention-item.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .mention-token {
    flex: none;
    font-size: 10px;
    color: var(--ink-2);
  }
  .mention-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mention-group {
    flex: none;
    font-size: 10px;
    color: var(--ink-3);
  }
  @media (min-width: 900px) {
    .composer-wrap {
      bottom: 0;
    }
  }
  @media (pointer: coarse) {
    .quiet,
    .mention-item {
      min-height: 48px;
    }
  }
</style>
