/**
 * Overview View - All modules at a glance
 */

import { escapeHtml, formatDate, daysUntil, getNextExam, getWeakestObjective, getModuleStats } from '../utils/helpers.js';
import { partitionOverviewModules, objectiveProgressPercent } from '../utils/dashboard.js';
import { navigate } from './router.js';
import { openModal, closeModal } from '../components/modal.js';
import { generateId, getDemoSeedData } from '../services/store.js';
import { openObjectiveHistory } from './module-objectives.js';
import { openSessionModal } from './module-sessions.js';
import { openModuleModal as openSettingsModuleModal, importBackup } from './settings.js';
import { openPdfImport } from './pdf-import.js';

export function renderOverview(state) {
  const el = document.createElement('div');
  const { visible, demo, hiddenTests } = partitionOverviewModules(state.modules);
  const showTests = el.dataset.showTests === '1';

  if (!visible.length && !demo.length && !hiddenTests.length) {
    el.innerHTML = `
      <div class="eyebrow">Übersicht</div>
      <h1 class="page-title">Dein Studium,<br><em>auf einen Blick.</em></h1>
      <p class="page-lede">Noch keine Module angelegt. Starte leer, importiere ein Backup — oder sieh dir zuerst ein Beispiel an.</p>
      <div class="empty-actions">
        <button class="btn primary" id="create-first-module">＋ Erstes Modul erstellen</button>
        <button class="btn" id="create-from-pdf">Modul aus PDF (lokale KI)</button>
        <button class="btn" id="import-backup">Backup importieren</button>
        <button class="btn" id="explore-sample">Beispielmodul erkunden</button>
      </div>
      <p class="empty-hint">PDFs und Links kannst du später pro Modul unter Material als Ressource ablegen.</p>
    `;
    el.querySelector('#create-first-module').addEventListener('click', () => openModuleModal());
    el.querySelector('#create-from-pdf').addEventListener('click', () => openPdfImport());
    el.querySelector('#import-backup').addEventListener('click', () => importBackup());
    el.querySelector('#explore-sample').addEventListener('click', () => exploreSampleModule());
    return el;
  }

  const cards = visible.map(m => renderModuleCard(state, m)).join('');
  const demoSection = demo.length ? `
    <div class="section-label ov-demo-label">Beispiel · Demo-Daten, bleiben lokal</div>
    <p class="ov-demo-note">Zum Ausprobieren — wird nicht synchronisiert und zählt nicht zu deinem Stand.</p>
    <div class="ov-list">${demo.map(m => renderModuleCard(state, m, true)).join('')}</div>
  ` : '';
  const testNote = hiddenTests.length && !showTests ? `
    <div class="ov-testnote">
      <span>${hiddenTests.length} Testmodul${hiddenTests.length !== 1 ? 'e' : ''} ausgeblendet (z. B. Sync-Tests).</span>
      <button class="btn ghost ov-testnote-btn" id="show-test-modules">Trotzdem anzeigen</button>
    </div>
  ` : '';
  const testCards = hiddenTests.length && showTests ? `
    <div class="section-label ov-demo-label">Testmodule · ausgeblendete Sync-/Testdaten</div>
    <div class="ov-list">${hiddenTests.map(m => renderModuleCard(state, m, true)).join('')}</div>
  ` : '';

  el.innerHTML = `
    <div class="eyebrow">Übersicht</div>
    <h1 class="page-title">Dein Studium,<br><em>auf einen Blick.</em></h1>
    <p class="page-lede">${visible.length} Modul${visible.length !== 1 ? 'e' : ''}. „Weiterlernen“ setzt direkt beim nächsten Ziel an.</p>
    <div class="ov-list">${cards}</div>
    ${demoSection}
    ${testNote}
    ${testCards}
  `;

  wireModuleCards(el);
  el.querySelector('#show-test-modules')?.addEventListener('click', () => {
    el.dataset.showTests = '1';
    const fresh = renderOverview(window.EMVS.getState());
    fresh.dataset.showTests = '1';
    el.replaceWith(fresh);
  });

  return el;
}

function examLine(state, m) {
  const exam = getNextExam(state, m.id);
  if (!exam) return `<span class="ov-countdown ov-countdown-none">Keine Prüfung eingetragen</span>`;
  const cd = daysUntil(exam.date);
  const when = cd === null ? formatDate(exam.date)
    : cd < 0 ? `${formatDate(exam.date)} · überschritten`
    : cd === 0 ? 'heute'
    : cd === 1 ? 'morgen'
    : `in ${cd} Tagen`;
  const urgent = cd !== null && cd >= 0 && cd <= 14;
  return `<span class="ov-countdown${urgent ? ' ov-countdown-urgent' : ''}">${escapeHtml(exam.name)} · ${escapeHtml(formatDate(exam.date))} · ${escapeHtml(when)}</span>`;
}

function renderModuleCard(state, m, isDemo = false) {
  const stats = getModuleStats(state, m.id);
  const weak = getWeakestObjective(state, m.id);
  const pct = objectiveProgressPercent(stats.objectivesDone, stats.objectivesTotal);
  const nextTitle = weak ? weak.title : 'Alle Lernziele gemeistert';
  const nextMeta = weak
    ? `LZ ${weak.number ?? '–'} · Confidence ${weak.confidence ?? 0}/5`
    : 'Zeit für eine Mock-Prüfung';

  return `
    <article class="card ov-item${isDemo ? ' ov-demo' : ''}" data-module="${m.id}" role="link" tabindex="0" aria-label="Modul ${escapeHtml(m.code)}: ${escapeHtml(m.title)} öffnen">
      <div class="ov-head">
        <span class="ov-code">Modul ${escapeHtml(m.code)}${isDemo ? ' · Beispiel' : ''}</span>
        ${examLine(state, m)}
      </div>
      <h2 class="ov-title">${escapeHtml(m.title)}</h2>
      <div class="ov-progress" role="img" aria-label="${stats.objectivesDone} von ${stats.objectivesTotal} Lernzielen gemeistert">
        <span class="ov-progress-fill" style="width: ${pct}%"></span>
      </div>
      <div class="ov-next">
        <span class="ov-next-label">Nächstes Ziel</span>
        ${weak
          ? `<button class="ov-next-open" data-open-objective="${weak.id}" title="Lernziel direkt öffnen: ${escapeHtml(weak.title)}">${escapeHtml(nextTitle.length > 100 ? nextTitle.slice(0, 100) + '…' : nextTitle)}</button>
             <span class="ov-next-meta">${escapeHtml(nextMeta)}</span>`
          : `<span class="ov-next-done">${escapeHtml(nextTitle)}</span>
             <span class="ov-next-meta">${escapeHtml(nextMeta)}</span>`}
      </div>
      <div class="stat-list ov-stats">
        <div class="stat-row">
          <span class="stat-label">Lernziele</span>
          <span class="stat-value">${stats.objectivesDone} <span class="muted">/ ${stats.objectivesTotal}</span></span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Ressourcen</span>
          <span class="stat-value">${stats.resourcesDone} <span class="muted">/ ${stats.resourcesTotal}</span></span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Sitzungen diese Woche</span>
          <span class="stat-value">${stats.sessionsThisWeek} min</span>
        </div>
      </div>
      <div class="ov-actions">
        ${weak
          ? `<button class="btn primary ov-continue" data-continue-objective="${weak.id}" data-continue-module="${m.id}">▶ Weiterlernen</button>`
          : `<button class="btn primary ov-continue" data-open-module="${m.id}">Modul üben →</button>`}
        <button class="btn" data-open-module="${m.id}">Modul öffnen</button>
      </div>
    </article>
  `;
}

function setCurrentModule(id) {
  const st = window.EMVS.getState();
  st.settings.currentModuleId = id;
  if (!window.EMVS.save()) {
    window.EMVS.toast?.show('Speichern fehlgeschlagen — Modulwechsel nur für diese Ansicht');
    return false;
  }
  window.EMVS.renderSidebar();
  return true;
}

function wireModuleCards(root) {
  root.querySelectorAll('.ov-item').forEach(card => {
    const open = () => {
      if (!setCurrentModule(card.dataset.module)) return;
      navigate('module-home');
    };
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      open();
    });
    card.addEventListener('keydown', e => {
      if (e.target.closest('button')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  root.querySelectorAll('[data-open-module]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (!setCurrentModule(b.dataset.openModule)) return;
      navigate('module-home');
    })
  );

  root.querySelectorAll('[data-open-objective]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      const st = window.EMVS.getState();
      const obj = st.learningObjectives.find(o => o.id === b.dataset.openObjective);
      if (!obj) return;
      st.settings.currentModuleId = obj.moduleId;
      window.EMVS.save();
      window.EMVS.renderSidebar();
      openObjectiveHistory(obj.id);
    })
  );

  root.querySelectorAll('[data-continue-objective]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      const st = window.EMVS.getState();
      const obj = st.learningObjectives.find(o => o.id === b.dataset.continueObjective);
      if (!obj) return;
      st.settings.currentModuleId = obj.moduleId;
      window.EMVS.save();
      window.EMVS.renderSidebar();
      openSessionModal(null, obj.moduleId, { linkedObjectiveIds: [obj.id], duration: 25 });
    })
  );
}

/**
 * Sample explorer for new users. Strictly additive: only runs on a truly
 * empty dataset (no modules at all). Never touches existing user data.
 */
function exploreSampleModule() {
  const st = window.EMVS.getState();
  if (st.modules.length) {
    window.EMVS.toast?.show('Du hast bereits Module — das Beispiel ist nur für den leeren Start gedacht');
    return;
  }
  const demo = getDemoSeedData();
  window.EMVS.setState(JSON.parse(JSON.stringify(demo)));
  if (!window.EMVS.save()) {
    window.EMVS.toast?.show('Beispiel konnte nicht gespeichert werden');
    return;
  }
  window.EMVS.renderSidebar();
  navigate('today');
  window.EMVS.toast?.show('Beispielmodul geladen — lösche es jederzeit in den Einstellungen');
}

function openModuleModal() {
  // Single creation flow, shared with settings (code/title/grade editor lives there).
  openSettingsModuleModal();
}
