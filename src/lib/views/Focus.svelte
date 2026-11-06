<script>
  import { onMount } from 'svelte';
  import {
    subscribePomodoro,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    chooseBreak,
    skipBreak,
    startNextRound,
    dismissPomodoro,
    getPomodoroPrefs,
    updatePomodoroPrefs,
    notificationStatus,
    requestNotificationPermission,
    recommendedBreakType,
    POMODORO_DEFAULTS,
    PHASE,
    STATUS,
    remainingMs,
  } from '../services/pomodoroEngine.js';
  import { formatClock, progressPct, phaseLabel, roundLabel } from '../services/pomodoro.js';
  import { toast } from '../stores/toast.js';
  import Icon from '../components/Icon.svelte';

  const presets = [15, 25, 45];

  let state = null;
  let prefs = { sound: true, notificationsAsked: false };
  let minutes = POMODORO_DEFAULTS.workMinutes;
  let custom = '';
  let tick = 0;
  let now = Date.now();

  onMount(() => {
    prefs = getPomodoroPrefs();
    const unsubscribe = subscribePomodoro((detail) => {
      state = detail.state;
      prefs = detail.prefs;
      if (detail.reason === 'tick') tick += 1;
    });
    return unsubscribe;
  });

  $: running = state?.status === STATUS.running;
  $: paused = state?.status === STATUS.paused;
  $: workDone = state?.status === STATUS.workDone;
  $: breakDone = state?.status === STATUS.breakDone;
  $: isWork = state?.phase === PHASE.work;
  $: recommended = state ? recommendedBreakType(state) : 'short';
  $: if (tick >= 0) now = Date.now();
  $: clock = state ? formatClock(remainingMs(state, now)) : formatClock(minutes * 60000);
  $: progress = state ? progressPct(state, now) : 0;
  $: label = state ? phaseLabel(state) : 'Bereit';
  $: round = state ? roundLabel(state) : '';
  $: notification = typeof window !== 'undefined' && 'Notification' in window ? notificationStatus() : 'unsupported';

  const RADIUS = 108;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  function start() {
    const result = startPomodoro({ minutes });
    if (!result.ok) toast('Es läuft bereits eine Runde.');
  }

  function toggle() {
    if (paused) resumePomodoro();
    else if (running) pausePomodoro();
  }

  function next() {
    const result = startNextRound();
    if (!result.ok && result.reason === 'idle') toast('Noch kein Timer.');
  }

  function stop() {
    dismissPomodoro();
    toast('Timer beendet');
  }

  function setMinutes(value) {
    minutes = value;
    custom = '';
  }

  function applyCustom() {
    const value = Number(custom);
    if (!Number.isFinite(value) || value < 1 || value > 480) {
      toast('Bitte 1 bis 480 Minuten.');
      return;
    }
    minutes = Math.round(value);
    custom = '';
  }

  async function askNotifications() {
    const result = await requestNotificationPermission();
    prefs = getPomodoroPrefs();
    if (result === 'granted') toast('Benachrichtigungen aktiv');
    else if (result === 'denied') toast('Benachrichtigungen blockiert');
  }
</script>

<div class="focus-page">
  <header class="focus-head">
    <p class="eyebrow">Fokus</p>
    <h1>Eine Runde. Eine Pause.</h1>
    <p class="lede">Du startest selbst. Danach entscheidest du, wie es weitergeht.</p>
  </header>

  <section class="timer-card" class:is-break={state && !isWork} aria-label="Fokus-Timer">
    <div class="status-row">
      <span class="phase">{label}</span>
      {#if round}<span class="round mono">{round}</span>{/if}
      {#if state && state.completedRounds > 0}
        <span class="rounds mono">{state.completedRounds} {state.completedRounds === 1 ? 'Runde' : 'Runden'}</span>
      {/if}
    </div>

    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 240 240" aria-hidden="true">
        <circle class="ring-track" cx="120" cy="120" r={RADIUS} />
        <circle
          class="ring-progress"
          cx="120"
          cy="120"
          r={RADIUS}
          stroke-dasharray={CIRCUMFERENCE}
          stroke-dashoffset={CIRCUMFERENCE * (1 - progress / 100)}
        />
      </svg>
      <div class="clock-wrap">
        <span class="clock mono" role="timer" aria-live="off">{clock}</span>
        <span class="clock-label">{state && !isWork ? 'Pause' : 'Fokus'}</span>
      </div>
    </div>

    {#if !state}
      <div class="duration" role="group" aria-label="Dauer wählen">
        {#each presets as preset}
          <button
            class="chip"
            class:is-active={minutes === preset}
            type="button"
            aria-pressed={minutes === preset}
            on:click={() => setMinutes(preset)}
          >
            {preset} Min
          </button>
        {/each}
        <div class="custom">
          <input
            class="input custom-input"
            type="number"
            min="1"
            max="480"
            placeholder="Eigene"
            aria-label="Eigene Dauer in Minuten"
            bind:value={custom}
            on:keydown={(e) => e.key === 'Enter' && applyCustom()}
          />
          <button class="btn btn-sm" type="button" on:click={applyCustom} disabled={!custom}>Setzen</button>
        </div>
      </div>
      <button class="btn btn-primary start" type="button" on:click={start}>
        <Icon name="focus" size={18} /> Fokus starten
      </button>
      <p class="hint">{minutes} Minuten. Kein Task, keine Statistik.</p>
    {:else if isWork && !workDone}
      <div class="actions">
        <button class="btn btn-primary" type="button" on:click={toggle}>
          {paused ? 'Fortsetzen' : 'Pausieren'}
        </button>
        <button class="btn btn-ghost" type="button" on:click={stop}>Beenden</button>
      </div>
      <p class="hint">{paused ? 'Pausiert. Du entscheidest, wann es weitergeht.' : 'Läuft. Kein Druck.'}</p>
    {:else if workDone}
      <div class="actions">
        <button class="btn btn-primary" type="button" on:click={() => chooseBreak(recommended)}>
          {recommended === 'long' ? `Lange Pause · ${POMODORO_DEFAULTS.longBreakMinutes} Min` : `Kurze Pause · ${POMODORO_DEFAULTS.shortBreakMinutes} Min`}
        </button>
        <button class="btn" type="button" on:click={next}>Nächste Runde</button>
        <button class="btn btn-ghost" type="button" on:click={stop}>Beenden</button>
      </div>
      <div class="breaks" role="group" aria-label="Andere Pause wählen">
        <button class="chip" class:is-active={recommended === 'short'} type="button" on:click={() => chooseBreak('short')}>
          Kurz · {POMODORO_DEFAULTS.shortBreakMinutes} Min
        </button>
        <button class="chip" class:is-active={recommended === 'long'} type="button" on:click={() => chooseBreak('long')}>
          Lang · {POMODORO_DEFAULTS.longBreakMinutes} Min
        </button>
      </div>
      <p class="hint">Fokus beendet. Pause oder direkt weiter.</p>
    {:else if breakDone}
      <div class="actions">
        <button class="btn btn-primary" type="button" on:click={next}>Nächste Runde</button>
        <button class="btn btn-ghost" type="button" on:click={stop}>Beenden</button>
      </div>
      <div class="breaks" role="group" aria-label="Weitere Pause">
        <button class="chip" type="button" on:click={() => chooseBreak('short')}>Kurz · {POMODORO_DEFAULTS.shortBreakMinutes} Min</button>
        <button class="chip" type="button" on:click={() => chooseBreak('long')}>Lang · {POMODORO_DEFAULTS.longBreakMinutes} Min</button>
      </div>
      <p class="hint">Pause vorbei.</p>
    {:else}
      <div class="actions">
        <button class="btn btn-primary" type="button" on:click={toggle}>
          {paused ? 'Fortsetzen' : 'Pausieren'}
        </button>
        <button class="btn" type="button" on:click={() => skipBreak()}>Pause beenden</button>
        <button class="btn btn-ghost" type="button" on:click={stop}>Beenden</button>
      </div>
      <p class="hint">Die nächste Runde startest du selbst.</p>
    {/if}
  </section>

  <section class="prefs card" aria-labelledby="prefs-title">
    <div class="prefs-head">
      <h2 id="prefs-title">Ruhig bleiben</h2>
    </div>
    <label class="pref-row">
      <input
        type="checkbox"
        checked={prefs.sound}
        on:change={(e) => updatePomodoroPrefs({ sound: e.target.checked })}
      />
      <span>Ton am Ende</span>
    </label>
    <div class="pref-row">
      <span class="pref-label">Benachrichtigungen</span>
      {#if notification === 'granted'}
        <span class="badge">aktiv</span>
      {:else if notification === 'denied'}
        <span class="badge">blockiert</span>
      {:else if notification === 'unsupported'}
        <span class="badge">nicht verfügbar</span>
      {:else}
        <button class="btn btn-sm" type="button" on:click={askNotifications}>Erlauben</button>
      {/if}
    </div>
  </section>
</div>

<style>
  .focus-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 620px;
    margin: 0 auto;
  }
  .focus-head {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .eyebrow {
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    color: var(--ink-2);
  }
  h1 {
    font-family: var(--font-read);
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .lede {
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .timer-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px solid var(--rule);
    border-radius: var(--radius-3);
    background: linear-gradient(180deg, var(--surface), var(--tint-today));
    box-shadow: var(--shadow-1);
  }
  .timer-card.is-break {
    background: linear-gradient(180deg, var(--surface), var(--tint-notes));
  }
  .status-row {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .phase {
    font-weight: 600;
    color: var(--ink-2);
  }
  .round,
  .rounds {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    font-size: 10px;
  }
  .ring-wrap {
    position: relative;
    width: min(240px, 68vw);
    aspect-ratio: 1;
  }
  .ring {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .ring-track {
    fill: none;
    stroke: var(--surface-2);
    stroke-width: 7;
  }
  .ring-progress {
    fill: none;
    stroke: var(--accent);
    stroke-width: 7;
    stroke-linecap: round;
    transition: stroke-dashoffset 900ms linear;
  }
  .clock-wrap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
  }
  .clock {
    font-size: clamp(2.6rem, 9vw, 3.6rem);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .clock-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--ink-3);
  }
  .duration {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .custom {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .custom-input {
    width: 96px;
    min-height: 34px;
  }
  .start {
    min-width: 200px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }
  .breaks {
    display: flex;
    gap: var(--space-2);
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--ink-3);
    text-align: center;
  }
  .prefs {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .prefs-head h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
    margin-bottom: var(--space-1);
  }
  .pref-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 40px;
    font-size: var(--text-sm);
  }
  .pref-row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  .pref-label {
    flex: 1;
  }
  @media (any-pointer: coarse) {
    .custom-input {
      min-height: 48px;
    }
  }
</style>
