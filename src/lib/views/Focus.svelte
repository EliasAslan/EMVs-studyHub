<script>
  import { onMount, tick } from 'svelte';
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
  import NumberStepper from '../components/NumberStepper.svelte';
  import PomodoroStats from '../components/PomodoroStats.svelte';
  import { hint } from '../actions/hint.js';

  const presets = [15, 25, 45];

  let state = null;
  let prefs = { sound: true, notificationsAsked: false };
  let minutes = POMODORO_DEFAULTS.workMinutes;
  let custom = '';
  let engineTick = 0;
  let now = Date.now();
  let focusMode = false;
  let pageRoot = null;
  let timerCard = null;
  let focusToggle = null;
  let previousOverflow = '';

  onMount(() => {
    prefs = getPomodoroPrefs();
    const saved = Number(prefs.workMinutes);
    if (Number.isFinite(saved) && saved >= 1 && saved <= 480) minutes = Math.round(saved);
    const unsubscribe = subscribePomodoro((detail) => {
      state = detail.state;
      prefs = detail.prefs;
      if (detail.reason === 'tick') engineTick += 1;
    });
    const onFullscreen = () => {
      // Leaving fullscreen (Esc or the browser UI) must also leave focus mode.
      if (!document.fullscreenElement && focusMode) setFocusMode(false);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape' && focusMode) {
        event.preventDefault();
        setFocusMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('keydown', onKeydown);
    return () => {
      unsubscribe();
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('keydown', onKeydown);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      document.body.classList.remove('pomodoro-immersive');
      document.body.style.overflow = previousOverflow;
    };
  });

  $: running = state?.status === STATUS.running;
  $: paused = state?.status === STATUS.paused;
  $: workDone = state?.status === STATUS.workDone;
  $: breakDone = state?.status === STATUS.breakDone;
  $: isWork = state?.phase === PHASE.work;
  $: recommended = state ? recommendedBreakType(state) : 'short';
  $: if (engineTick >= 0) now = Date.now();
  $: clock = state ? formatClock(remainingMs(state, now)) : formatClock(minutes * 60000);
  $: progress = state ? progressPct(state, now) : 0;
  $: label = state ? phaseLabel(state) : 'Bereit';
  $: round = state ? roundLabel(state) : '';
  $: notification = prefs && typeof window !== 'undefined' && 'Notification' in window ? notificationStatus() : 'unsupported';
  $: remainingPercent = Math.max(0, Math.ceil(remainingMs(state, now) / 60000));
  $: timerStatus = !state ? 'Wähle eine Dauer und starte deine erste Runde.' : paused ? 'Pausiert. Setze fort, wenn du bereit bist.' : workDone ? 'Runde geschafft. Gönn dir eine Pause.' : breakDone ? 'Pause vorbei. Starte die nächste Runde.' : isWork ? 'Eine Aufgabe, ein Tab, ein Schritt nach dem anderen.' : 'Lass den Bildschirm kurz hinter dir.';

  const RADIUS = 108;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  async function setFocusMode(enabled) {
    if (enabled === focusMode) return;
    focusMode = enabled;
    document.body.classList.toggle('pomodoro-immersive', enabled);

    if (enabled) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        // Fullscreen can be blocked; the overlay still works without it.
      }
      await tick();
      timerCard?.focus?.();
    } else {
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement) {
        await document.exitFullscreen?.().catch(() => {});
      }
      await tick();
      focusToggle?.focus?.();
    }
  }

  function start() {
    updatePomodoroPrefs({ workMinutes: minutes });
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
    if (focusMode) setFocusMode(false);
    dismissPomodoro();
    toast('Timer beendet');
  }

  function setMinutes(value) {
    minutes = value;
    custom = '';
    updatePomodoroPrefs({ workMinutes: value });
  }

  function applyCustom() {
    if (custom === '' || custom == null) return;
    const value = Number(custom);
    if (!Number.isFinite(value) || value < 1 || value > 480) {
      toast('Bitte 1 bis 480 Minuten.');
      return;
    }
    minutes = Math.round(value);
    updatePomodoroPrefs({ workMinutes: minutes });
  }

  async function askNotifications() {
    const result = await requestNotificationPermission();
    prefs = getPomodoroPrefs();
    if (result === 'granted') toast('Benachrichtigungen aktiv');
    else if (result === 'denied') toast('Benachrichtigungen blockiert');
  }
</script>

<div class="focus-page" class:focus-mode={focusMode} bind:this={pageRoot}>
  {#if focusMode}
    <button
      class="focus-exit"
      type="button"
      on:click={() => setFocusMode(false)}
      use:hint={{ text: 'Esc-Taste' }}
      aria-label="Fokusmodus beenden"
    >
      <Icon name="x" size={16} /> Beenden
    </button>
  {/if}
  <header class="focus-head">
    <div>
      <h1>Fokus</h1>
      <p class="focus-intro">Arbeite in klaren Intervallen. Pausen und dein Verlauf bleiben automatisch gespeichert.</p>
    </div>
    <button
      class="btn btn-ghost focus-toggle"
      type="button"
      aria-pressed={focusMode}
      on:click={() => setFocusMode(!focusMode)}
      bind:this={focusToggle}
      use:hint={{ text: focusMode ? 'Fokusmodus beenden' : 'Fokusmodus starten', shortcut: 'Esc' }}
    >
      <Icon name={focusMode ? 'x' : 'focus'} size={16} /> {focusMode ? 'Ansicht verlassen' : 'Vollbild'}
    </button>
  </header>

  <section class="timer-card" class:is-break={state && !isWork} aria-label="Fokus-Timer" tabindex="-1" bind:this={timerCard}>
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
        <span class="clock mono" role="timer" aria-live="off" aria-label={`${clock} verbleibend`}>{clock}</span>
        <span class="clock-label">{state && !isWork ? 'Pause' : 'Fokus'}</span>
      </div>
    </div>

    {#if state}
      <div class="timer-context">
        <p>{timerStatus}</p>
        <span class="remaining-label">{remainingPercent} Min verbleibend</span>
      </div>
    {/if}

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
          <NumberStepper
            bind:value={custom}
            min={1}
            max={480}
            step={1}
            fallback={minutes}
            label="Eigene Dauer in Minuten"
            unit="Min"
            placeholder="—"
            on:change={applyCustom}
          />
        </div>
      </div>
      <button class="btn btn-primary start" type="button" on:click={start}>
        <Icon name="focus" size={18} /> Fokus starten
      </button>
      <p class="hint">Deine Zeit bleibt gespeichert, auch wenn du zu einer anderen Seite wechselst.</p>
    {:else if isWork && !workDone}
      <div class="actions">
        <button class="btn btn-primary" type="button" on:click={toggle}>
          {paused ? 'Fortsetzen' : 'Pausieren'}
        </button>
        <button class="btn btn-ghost" type="button" on:click={stop}>Beenden</button>
      </div>
      <p class="hint">{paused ? 'Pausiert' : 'Läuft'}</p>
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
      <p class="hint">Fokus beendet</p>
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
      <p class="hint">{paused ? 'Pause · Pausiert' : 'Pause · Läuft'}</p>
    {/if}
  </section>

  {#if prefs.showStatistics !== false}
    <PomodoroStats />
  {/if}

  <section class="prefs card" aria-labelledby="prefs-title">
    <div class="prefs-head">
      <div><h2 id="prefs-title">Timer-Einstellungen</h2></div>
      <p class="prefs-subtitle">Passe den Klang, Hinweise und deinen Lernverlauf an.</p>
    </div>
    <label class="pref-row check-row">
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
    <label class="pref-row check-row">
      <input
        type="checkbox"
        checked={prefs.showStatistics !== false}
        on:change={(e) => updatePomodoroPrefs({ showStatistics: e.target.checked })}
      />
      <span>Verlauf anzeigen</span>
    </label>
  </section>
</div>

<style>
  .focus-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 720px;
    margin: 0 auto;
  }
  .focus-head { display:flex; align-items:flex-end; justify-content:space-between; gap:var(--space-4); text-align:left; }
  :global(body.pomodoro-immersive .mobile-head), :global(body.pomodoro-immersive .tabbar), :global(body.pomodoro-immersive .fab) { visibility:hidden; }
  :global(body.pomodoro-immersive #main) { width:100%; max-width:none; height:100dvh; padding:0; }
  :global(body.pomodoro-immersive .toasts), :global(body.pomodoro-immersive .fab-menu), :global(body.pomodoro-immersive .fab-scrim) { display:none !important; }
  :global(body.pomodoro-immersive .scrim) { display:none !important; }
  :global(body.pomodoro-immersive #app-sidebar) { display:none; }

  .focus-intro { margin-top:var(--space-2); max-width:52ch; color:var(--ink-2); font-size:var(--text-sm); }
  .focus-toggle { flex:none; }
  .focus-mode .focus-head, .focus-mode .prefs, .focus-mode :global(.pomodoro-stats) { display:none; }
  .focus-mode {
    position:fixed; inset:0; z-index:1000; width:100vw; height:100dvh; max-width:none;
    margin:0;
    padding:
      max(64px, calc(env(safe-area-inset-top, 0px) + 48px))
      max(16px, env(safe-area-inset-right, 0px))
      max(24px, env(safe-area-inset-bottom, 0px))
      max(16px, env(safe-area-inset-left, 0px));
    overflow:auto; overscroll-behavior:contain;
    background:var(--bg); color:var(--ink);
  }
  .focus-mode .timer-card {
    width:min(100%, 860px); min-height:0; margin:auto;
    border:0; border-radius:0; box-shadow:none; background:transparent;
  }
  .focus-mode .timer-card:focus { outline:none; }
  .focus-mode .ring-wrap { width:min(44vh, 400px, 72vw); }
  .focus-mode .clock { font-size:clamp(3.5rem, 10vw, 7rem); }
  .focus-mode .hint, .focus-mode .remaining-label { display:none; }
  .focus-exit {
    position:fixed;
    top:max(16px, env(safe-area-inset-top, 0px));
    right:max(16px, env(safe-area-inset-right, 0px));
    z-index:1005;
    display:inline-flex; align-items:center; gap:6px;
    min-height:40px; padding:var(--space-2) var(--space-3);
    border:1px solid var(--rule); border-radius:var(--radius-2);
    background:var(--surface); color:var(--ink-2);
    box-shadow:var(--shadow-1);
    opacity:.7;
    transition:opacity var(--motion), background var(--motion), color var(--motion);
  }
  .focus-exit:hover, .focus-exit:focus-visible { opacity:1; color:var(--ink); background:var(--surface-2); }
  @media (pointer: coarse) { .focus-exit { opacity:1; } }

  h1 {
    font-family: var(--font-read);
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .timer-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: clamp(var(--space-5), 6vw, var(--space-7));
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--rule));
    border-radius: var(--radius-3);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  .timer-card.is-break {
    border-color: color-mix(in srgb, var(--ok) 34%, var(--rule));
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
    font-weight: 700;
    color: var(--accent-strong);
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
    width: min(280px, 72vw);
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
    font-size: clamp(2.8rem, 9.5vw, 3.9rem);
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
  .duration .chip {
    min-height: 40px;
    padding: 0 14px;
  }
  .custom {
    display: flex;
    align-items: center;
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
    max-width: 44ch;
    font-size: var(--text-xs);
    color: var(--ink-3);
    text-align: center;
  }
  .timer-context { max-width:48ch; text-align:center; }
  .timer-context p { color:var(--ink-2); font-size:var(--text-sm); }
  .remaining-label { display:inline-block; margin-top:var(--space-1); color:var(--ink-3); font-family:var(--font-mono); font-size:10px; }

  .prefs {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .prefs-head { display:flex; flex-direction:column; gap:var(--space-1); margin-bottom:var(--space-2); }
  .prefs-subtitle { color:var(--ink-3); font-size:var(--text-xs); }
  .prefs :global(.badge[title]) { cursor:help; text-decoration:underline dotted; text-underline-offset:3px; }
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
  .check-row {
    justify-content: flex-start;
    gap: var(--space-2);
    cursor: pointer;
  }
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
  .pref-row input[type='checkbox']:checked {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .pref-row input[type='checkbox']:checked::before {
    background: var(--accent);
    transform: translateX(14px);
  }
  .pref-row input[type='checkbox']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pref-row input[type='checkbox'],
    .pref-row input[type='checkbox']::before {
      transition: none;
    }
  }
  .pref-label {
    flex: 1;
  }
  @media (max-width: 600px) {
    .focus-head { align-items:flex-start; flex-direction:column; }
    .timer-card { padding:var(--space-4); }
    .breaks { flex-wrap:wrap; justify-content:center; }
  }
  @media (min-width: 700px) {
    .ring-wrap {
      width: 320px;
    }
  }
  @media (max-height: 620px) {
    .focus-mode {
      padding-top: max(56px, calc(env(safe-area-inset-top, 0px) + 40px));
    }
    .focus-mode .ring-wrap { width: min(36vh, 300px, 64vw); }
    .focus-mode .clock { font-size: clamp(2.8rem, 8vw, 5rem); }
    .focus-mode .timer-card { gap: var(--space-3); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring-progress {
      transition: none;
    }
  }
</style>
