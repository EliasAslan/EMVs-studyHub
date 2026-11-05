<script>
  const colors = [
    { name: 'Akzent', token: '--accent' },
    { name: 'Akzent stark', token: '--accent-strong' },
    { name: 'Akzent weich', token: '--accent-soft' },
    { name: 'Hintergrund', token: '--bg' },
    { name: 'Fläche', token: '--surface' },
    { name: 'Fläche 2', token: '--surface-2' },
    { name: 'Text', token: '--ink' },
    { name: 'Text 2', token: '--ink-2' },
    { name: 'Text 3', token: '--ink-3' },
    { name: 'Linie', token: '--rule' },
    { name: 'Heute', token: '--tint-today' },
    { name: 'Hausaufgaben', token: '--tint-homework' },
    { name: 'Prüfungen', token: '--tint-exams' },
    { name: 'Notizen', token: '--tint-notes' },
    { name: 'Okay', token: '--ok' },
    { name: 'Warnung', token: '--warn' },
  ];

  const type = [
    { name: 'Display', cls: 'display' },
    { name: 'Titel', cls: 'title' },
    { name: 'Abschnitt', cls: 'section' },
    { name: 'Fliesstext', cls: 'body' },
    { name: 'Meta', cls: 'meta' },
  ];
</script>

<div class="page">
  <header class="page-head">
    <div>
      <p class="eyebrow">Intern</p>
      <h1>Tokens</h1>
    </div>
  </header>

  <section class="card section" aria-labelledby="color-title">
    <div class="section-title"><h2 id="color-title">Farben</h2></div>
    <div class="swatches">
      {#each colors as color (color.token)}
        <div class="swatch">
          <span class="chip-color" style:background={`var(${color.token})`} aria-hidden="true"></span>
          <span class="swatch-name">{color.name}</span>
          <span class="swatch-token mono">{color.token}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="card section" aria-labelledby="type-title">
    <div class="section-title"><h2 id="type-title">Schrift</h2></div>
    <div class="type-list">
      {#each type as entry (entry.cls)}
        <div class="type-row">
          <span class={`sample ${entry.cls}`}>Study Hub</span>
          <span class="type-name">{entry.name}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="card section" aria-labelledby="controls-title">
    <div class="section-title"><h2 id="controls-title">Bedienelemente</h2></div>
    <div class="row">
      <button class="btn btn-primary" type="button">Primär</button>
      <button class="btn" type="button">Sekundär</button>
      <button class="btn btn-ghost" type="button">Leise</button>
      <button class="btn btn-danger" type="button">Löschen</button>
    </div>
    <div class="row">
      <span class="chip is-active">Aktiv</span>
      <span class="chip">Filter</span>
      <span class="badge">Badge</span>
    </div>
  </section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 880px;
  }
  .eyebrow {
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
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
  }
  .section-title h2 {
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-2);
  }
  .swatch {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-2);
  }
  .chip-color {
    height: 44px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-1);
  }
  .swatch-name {
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .swatch-token {
    font-size: 10px;
    color: var(--ink-3);
  }
  .type-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .type-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--rule);
  }
  .type-name {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .sample.display {
    font-family: var(--font-read);
    font-size: var(--text-3xl);
    font-weight: 600;
  }
  .sample.title {
    font-size: var(--text-2xl);
    font-weight: 650;
  }
  .sample.section {
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .sample.body {
    font-family: var(--font-read);
    font-size: var(--text-lg);
  }
  .sample.meta {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
</style>
