<script>
  import { createEventDispatcher } from 'svelte';
  import { appState } from '../stores/app.js';
  import { searchAll, totalResults } from '../data/search.js';
  import { navigate, notePath, modulePath } from '../router.js';
  import Icon from './Icon.svelte';

  export let open = false;
  const dispatch = createEventDispatcher();

  let query = '';
  let activeIndex = 0;
  let inputEl;
  let wasOpen = false;

  const navigation = [
    { id: 'nav-today', label: 'Heute', group: 'Gehen', icon: 'today', href: '#/' },
    { id: 'nav-homework', label: 'Hausaufgaben', group: 'Gehen', icon: 'homework', href: '#/homework' },
    { id: 'nav-modules', label: 'Module', group: 'Gehen', icon: 'modules', href: '#/modules' },
    { id: 'nav-notes', label: 'Notizen', group: 'Gehen', icon: 'notes', href: '#/notes' },
    { id: 'nav-exams', label: 'Prüfungen', group: 'Gehen', icon: 'exams', href: '#/exams' },
    { id: 'nav-calendar', label: 'Kalender', group: 'Gehen', icon: 'calendar', href: '#/calendar' },
    { id: 'nav-links', label: 'Links', group: 'Gehen', icon: 'links', href: '#/links' },
    { id: 'nav-focus', label: 'Fokus', group: 'Gehen', icon: 'focus', href: '#/focus' },
    { id: 'nav-settings', label: 'Einstellungen', group: 'Gehen', icon: 'settings', href: '#/settings' },
  ];

  const creates = [
    { id: 'new-note', label: 'Neue Notiz', group: 'Erstellen', icon: 'notes', create: 'note', keys: 'n' },
    { id: 'new-homework', label: 'Neue Hausaufgabe', group: 'Erstellen', icon: 'homework', create: 'homework', keys: 'h' },
    { id: 'new-exam', label: 'Neue Prüfung', group: 'Erstellen', icon: 'exams', create: 'exam' },
    { id: 'new-module', label: 'Neues Modul', group: 'Erstellen', icon: 'modules', create: 'module' },
    { id: 'new-link', label: 'Neuer Link', group: 'Erstellen', icon: 'links', create: 'link' },
  ];

  const actions = [{ id: 'export', label: 'JSON exportieren', group: 'Einstellungen', icon: 'file', action: 'export' }];

  $: if (open && !wasOpen) {
    wasOpen = true;
    query = '';
    activeIndex = 0;
    queueMicrotask(() => inputEl?.focus());
  }
  $: if (!open) wasOpen = false;

  function norm(v) {
    return String(v || '').toLowerCase();
  }

  $: q = norm(query);
  $: commandItems = [...navigation, ...creates, ...actions].filter((item) => !q || norm(item.label).includes(q) || norm(item.group).includes(q));
  $: results = q ? searchAll($appState, query, 5) : { notes: [], homework: [], modules: [], exams: [], links: [] };
  $: resultItems = [
    ...results.notes.map((n) => ({ id: `note-${n.id}`, label: n.title || 'Ohne Titel', group: 'Notizen', icon: 'notes', href: `#${notePath(n.id)}` })),
    ...results.homework.map((h) => ({ id: `hw-${h.id}`, label: h.title, group: 'Hausaufgaben', icon: 'homework', href: '#/homework' })),
    ...results.modules.map((m) => ({ id: `mod-${m.id}`, label: `${m.code ? m.code + ' · ' : ''}${m.title}`, group: 'Module', icon: 'modules', href: `#${modulePath(m.id)}` })),
    ...results.exams.map((e) => ({ id: `exam-${e.id}`, label: e.title, group: 'Prüfungen', icon: 'exams', href: '#/exams' })),
    ...results.links.map((l) => ({ id: `link-${l.id}`, label: l.label, group: 'Links', icon: 'links', href: '#/links' })),
  ];
  $: items = q ? [...commandItems, ...resultItems] : [...creates, ...navigation, ...actions];
  $: if (activeIndex >= items.length) activeIndex = Math.max(0, items.length - 1);

  function close() {
    dispatch('close');
  }

  function run(item) {
    if (!item) return;
    close();
    if (item.href) navigate(item.href.replace(/^#/, ''));
    else if (item.create) dispatch('create', item.create);
    else if (item.action) dispatch('action', item.action);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = items.length ? (activeIndex + 1) % items.length : 0;
      scrollActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = items.length ? (activeIndex - 1 + items.length) % items.length : 0;
      scrollActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(items[activeIndex]);
    }
  }

  function scrollActive() {
    queueMicrotask(() => {
      document.getElementById(`palette-item-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    });
  }
</script>

{#if open}
  <div class="overlay" role="presentation" on:click|self={close}>
    <div class="palette" role="dialog" aria-modal="true" aria-label="Befehlspalette" tabindex="-1" on:keydown={onKeydown}>
      <div class="search-row">
        <Icon name="search" />
        <input
          bind:this={inputEl}
          bind:value={query}
          class="search-input"
          type="text"
          placeholder="Suchen oder Befehl…"
          aria-label="Suchen oder Befehl"
          aria-controls="palette-list"
          aria-activedescendant={items[activeIndex] ? `palette-item-${activeIndex}` : undefined}
          autocomplete="off"
        />
        <kbd>Esc</kbd>
      </div>

      <div class="results" id="palette-list" role="listbox" aria-label="Ergebnisse">
        {#if items.length === 0}
          <p class="none">Nichts gefunden.</p>
        {:else}
          {#each items as item, i (item.id)}
            {#if i === 0 || items[i - 1].group !== item.group}
              <p class="group">{item.group}</p>
            {/if}
            <button
              id={`palette-item-${i}`}
              class="item"
              class:active={i === activeIndex}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              on:mouseenter={() => (activeIndex = i)}
              on:click={() => run(item)}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
              {#if item.keys}<kbd>{item.keys}</kbd>{/if}
            </button>
          {/each}
        {/if}
      </div>

      <footer class="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> wählen</span>
        <span><kbd>↵</kbd> öffnen</span>
        <span class="muted">{q ? `${totalResults(results)} Treffer` : ''}</span>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 130;
    display: flex;
    justify-content: center;
    padding: min(14vh, 120px) var(--space-4) var(--space-4);
    background: rgb(20 22 28 / 0.4);
    backdrop-filter: blur(4px);
  }
  .palette {
    width: min(620px, 100%);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    box-shadow: var(--shadow-3);
    overflow: hidden;
  }
  .search-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--rule);
    color: var(--ink-3);
  }
  .search-input {
    flex: 1;
    min-height: 40px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font-size: var(--text-lg);
    outline: none;
  }
  .results {
    padding: var(--space-2);
    overflow: auto;
  }
  .group {
    padding: var(--space-3) var(--space-3) var(--space-1);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 40px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-2);
    background: transparent;
    color: var(--ink);
    font-size: var(--text-sm);
    text-align: left;
  }
  .item span {
    flex: 1;
  }
  .item.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  kbd {
    padding: 1px 5px;
    border: 1px solid var(--rule-strong);
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .none {
    padding: var(--space-5);
    text-align: center;
    color: var(--ink-3);
  }
  .palette-foot {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--rule);
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
</style>
