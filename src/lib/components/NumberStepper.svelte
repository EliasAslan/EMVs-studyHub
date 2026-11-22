<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';

  export let value = '';
  export let min = 0;
  export let max = 100;
  export let step = 1;
  export let fallback = undefined;
  export let label = 'Wert';
  export let shortLabel = '';
  export let unit = '';
  export let placeholder = '';
  export let invalid = false;
  export let describedBy = undefined;
  export let inputEl = null;

  const dispatch = createEventDispatcher();
  $: stepLabel = shortLabel || String(label).split(' ')[0];

  function commit(next) {
    const clamped = Math.min(max, Math.max(min, next));
    const snapped = Math.round((clamped - min) / step) * step + min;
    value = Number.isInteger(step) ? Math.round(snapped) : Number(snapped.toFixed(2));
    dispatch('input', value);
    dispatch('change', value);
  }

  function nudge(delta) {
    const base = value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
      ? (fallback ?? min)
      : Number(value);
    commit(base + delta * step);
  }

  function onInput() {
    dispatch('input', value);
  }

  function onChange() {
    if (value === '' || value === null || value === undefined) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    commit(numeric);
  }
</script>

<div class="number-stepper">
  <button class="step" type="button" aria-label={`${stepLabel} verringern`} on:click={() => nudge(-1)}>
    <Icon name="minus" size={14} />
  </button>
  <span class="value">
    <input
      class="input"
      class:invalid
      type="number"
      {min}
      {max}
      {step}
      {placeholder}
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      bind:value
      bind:this={inputEl}
      on:input={onInput}
      on:change={onChange}
      on:keydown={(event) => event.key === 'Enter' && onChange()}
    />
    {#if unit}<span class="unit">{unit}</span>{/if}
  </span>
  <button class="step" type="button" aria-label={`${stepLabel} erhöhen`} on:click={() => nudge(1)}>
    <Icon name="plus" size={14} />
  </button>
</div>

<style>
  .number-stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    width: 100%;
    height: 40px;
    padding: 3px;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-pill);
    background: var(--surface);
    transition: border-color var(--motion), box-shadow var(--motion);
  }
  .number-stepper:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .step {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--ink-2);
  }
  .step:hover {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .step:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .value {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 3px;
    flex: 1;
    min-width: 0;
    padding: 0 2px;
  }
  .value input {
    width: 5ch;
    min-width: 34px;
    min-height: 32px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 650;
    text-align: center;
    appearance: textfield;
  }
  .value input::-webkit-inner-spin-button {
    appearance: none;
    margin: 0;
  }
  .unit {
    color: var(--ink-3);
    font-size: 11px;
  }
  @media (prefers-reduced-motion: reduce) {
    .number-stepper {
      transition: none;
    }
  }
</style>
