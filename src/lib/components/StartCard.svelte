<script>
  import Icon from './Icon.svelte';
  import { navigate } from '../router.js';
  import { appState, toggleHomework } from '../stores/app.js';
  import { moduleTitle } from '../stores/app.js';
  import { formatDate, relativeDayLabel } from '../data/dates.js';
  import { toast } from '../stores/toast.js';

  export let entry = null;

  $: item = entry?.item;
  $: kind = entry?.kind;
  $: module = item?.moduleId ? moduleTitle($appState, item.moduleId) : '';
  $: reasonLabel =
    entry?.reason === 'overdue'
      ? 'Überfällig'
      : entry?.reason === 'today'
        ? 'Heute fällig'
        : entry?.reason === 'exam'
          ? 'Nächste Prüfung'
          : item?.dueDate
            ? relativeDayLabel(item.dueDate)
            : '';

  function done() {
    if (!item) return;
    toggleHomework(item.id);
    toast('Erledigt');
  }
</script>

{#if entry}
  <section class="start-card" aria-labelledby="start-title">
    <div class="start-top">
      <p class="eyebrow"><Icon name="today" size={14} /> Hier starten</p>
      <span class="reason" class:overdue={entry.reason === 'overdue'}>{reasonLabel}</span>
    </div>
    <h2 id="start-title">{item.title}</h2>
    <p class="meta">
      {#if kind === 'exam'}
        Prüfung{#if module} · {module}{/if}{#if item.date} · {formatDate(item.date, 'short')}{/if}
      {:else}
        Hausaufgabe{#if module} · {module}{/if}{#if item.dueDate} · fällig {formatDate(item.dueDate, 'short')}{/if}
      {/if}
    </p>
    <div class="actions">
      {#if kind === 'homework'}
        <button class="btn btn-primary" type="button" on:click={done}><Icon name="check" size={16} /> Erledigt</button>
        <button class="btn btn-ghost" type="button" on:click={() => navigate('/homework')}>Alle Hausaufgaben</button>
      {:else}
        <button class="btn btn-primary" type="button" on:click={() => navigate('/exams')}>Prüfung ansehen</button>
      {/if}
    </div>
  </section>
{:else}
  <section class="start-card calm" aria-labelledby="start-title">
    <p class="eyebrow"><Icon name="today" size={14} /> Hier starten</p>
    <h2 id="start-title">Nichts Dringendes.</h2>
    <p class="meta">Wenn du bereit bist: eine Notiz oder eine Hausaufgabe erfassen.</p>
  </section>
{/if}

<style>
  .start-card {
    padding: var(--space-5);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius-3);
    background: linear-gradient(180deg, var(--surface), var(--tint-today));
    box-shadow: var(--shadow-1);
  }
  .start-card.calm {
    border-left-color: var(--rule-strong);
  }
  .start-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .reason {
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-size: var(--text-xs);
    font-weight: 650;
  }
  .reason.overdue {
    background: var(--warn-soft);
    color: var(--warn);
  }
  h2 {
    font-family: var(--font-read);
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin-bottom: var(--space-2);
  }
  .meta {
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
</style>
