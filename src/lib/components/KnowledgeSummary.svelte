<script>
  import { appState } from '../stores/app.js';
  import { notePath } from '../router.js';
  import { noteStats } from '../data/noteStats.js';

  $: stats = noteStats($appState);
</script>

{#if stats.noteCount}
  <details class="knowledge">
    <summary>
      <span class="summary-title">Wissen</span>
      <span class="summary-stats mono">{stats.noteCount} Notizen · {stats.linkCount} Verweise · {stats.tags.length} Tags</span>
    </summary>
    <div class="body">
      <div class="stats">
        <div class="stat">
          <span class="value mono">{stats.noteCount}</span>
          <span class="label">Notizen</span>
        </div>
        <div class="stat">
          <span class="value mono">{stats.linkCount}</span>
          <span class="label">Verweise</span>
        </div>
        <div class="stat">
          <span class="value mono">{stats.tags.length}</span>
          <span class="label">Tags</span>
        </div>
      </div>

      {#if stats.unresolved.length}
        <p class="line">
          <span class="line-label">Offen</span>
          {stats.unresolved.slice(0, 3).join(' · ')}{#if stats.unresolved.length > 3}<span class="more"> +{stats.unresolved.length - 3}</span>{/if}
        </p>
      {/if}

      {#if stats.orphans.length}
        <div class="line">
          <span class="line-label">{stats.orphans.length} ohne Verbindung</span>
          <div class="chips">
            {#each stats.orphans.slice(0, 4) as note (note.id)}
              <a class="chip orphan" href="#{notePath(note.id)}">{note.title || 'Ohne Titel'}</a>
            {/each}
            {#if stats.orphans.length > 4}<span class="more">+{stats.orphans.length - 4}</span>{/if}
          </div>
        </div>
      {/if}
    </div>
  </details>
{/if}

<style>
  .knowledge {
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
    background: var(--surface);
  }
  summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: '+';
    margin-right: 2px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  details[open] summary::before {
    content: '−';
  }
  .summary-title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-2);
  }
  .summary-stats {
    margin-left: auto;
    font-size: 10px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-3) var(--space-3);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-2);
    border-radius: var(--radius-1);
    background: var(--surface-2);
  }
  .value {
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.1;
  }
  .label {
    font-size: 10px;
    color: var(--ink-3);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .line-label {
    font-weight: 600;
    color: var(--ink-3);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .orphan {
    text-decoration: none;
    background: var(--surface-2);
  }
  .orphan:hover {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .more {
    font-size: 10px;
    color: var(--ink-3);
  }
</style>
