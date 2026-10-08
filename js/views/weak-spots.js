/**
 * Weak Spots View — one ranked list of "things you are probably wrong about".
 *
 * The ranking is a transparent estimate, not exact science: every card shows
 * its weakness score AND the reasons behind it (low confidence, poor exam
 * diagnosis, staleness, missing reviews, low study time vs. exam weight,
 * repeated mistakes/captures). Each card leads directly to an action:
 * review the objective, start a session, inspect related resources, or
 * inspect mistakes/captures.
 */

import {
  escapeHtml, getWeakSpots, formatLastTouched, formatNextReview,
  linkedResourceCount, resourcesForObjective, capturesForObjective,
  getResourceUsage,
} from '../utils/helpers.js';
import { navigate } from './router.js';
import { openObjectiveHistory } from './module-objectives.js';
import { openSessionModal } from './module-sessions.js';
import { openResourceHistory } from './module-resources.js';
import { openQuickCapture } from './captures.js';

const LEVEL_LABELS = { hoch: 'Hohe Schwäche', mittel: 'Mittlere Schwäche', niedrig: 'Leichte Schwäche' };

export function renderWeakSpots(state) {
  const modules = state.modules;
  const el = document.createElement('div');

  el.innerHTML = `
    <div class="eyebrow">Diagnose · alle Module</div>
    <h1 class="page-title">Schwachstellen</h1>
    <p class="page-lede">Wonach du wahrscheinlich falsch liegst — als Rangliste mit Begründung. Nützliche Schätzung, keine exakte Wissenschaft: Die Schwäche summiert Confidence, Prüfungsdiagnose, Berührung, Reviews, Lernzeit und festgehaltene Fehler.</p>
    <div class="res-filters" role="group" aria-label="Modul filtern" id="ws-modules"></div>
    <div class="ws-list" id="ws-list"></div>
  `;

  const filterHost = el.querySelector('#ws-modules');
  let activeModule = null;

  const paintFilters = () => {
    filterHost.innerHTML =
      `<button class="badge filter-btn ${!activeModule ? 'active' : ''}" data-wsmod="">Alle Module</button>` +
      modules.map(m => `<button class="badge filter-btn ${activeModule === m.id ? 'active' : ''}" data-wsmod="${m.id}">Modul ${escapeHtml(m.code)}</button>`).join('');
    filterHost.querySelectorAll('[data-wsmod]').forEach(b => b.addEventListener('click', () => {
      activeModule = b.dataset.wsmod || null;
      paintFilters();
      paintList();
    }));
  };

  const paintList = () => {
    const spots = getWeakSpots(state, { moduleId: activeModule, limit: 20 });
    const total = state.learningObjectives.filter(o => !activeModule || o.moduleId === activeModule).length;
    const host = el.querySelector('#ws-list');
    if (!spots.length) {
      host.innerHTML = total
        ? `<div class="card empty-state"><div class="icon">🌱</div><h3>Keine Schwachstellen</h3><p>Alles im Rhythmus — kein Ziel zeigt derzeit ein Warnsignal.</p></div>`
        : `<div class="card empty-state"><div class="icon">🌱</div><h3>Noch keine Lernziele</h3><p>Lege zuerst Lernziele an — danach rechnet diese Liste.</p></div>`;
      return;
    }
    host.innerHTML = spots.map(({ objective, breakdown }, i) => renderSpot(objective, breakdown, i + 1, state)).join('');
    host.querySelectorAll('.ws-card').forEach(card => bindSpot(card, state));
  };

  paintFilters();
  paintList();
  return el;
}

function spotContext(obj, state) {
  const bits = [
    `Confidence ${obj.confidence ?? 0}/5`,
    `berührt ${formatLastTouched(obj)}`,
    `${obj.totalStudyTime || 0} Min`,
    `${linkedResourceCount(state, obj)} Ressourcen`,
  ];
  const next = obj.reviewSchedule?.nextReview ? `Review: ${formatNextReview(obj)}` : null;
  if (next) bits.push(next);
  return bits;
}

function renderSpot(obj, breakdown, rank, state) {
  const m = state.modules.find(x => x.id === obj.moduleId);
  const resources = resourcesForObjective(state, obj);
  const caps = capturesForObjective(state, obj).filter(c => c.type === 'mistake' || c.type === 'question');
  return `
    <div class="ws-card ws-${breakdown.level}" data-id="${obj.id}">
      <div class="ws-head">
        <span class="ws-rank">#${rank}</span>
        <span class="badge ws-level ws-level-${breakdown.level}">${LEVEL_LABELS[breakdown.level]}</span>
        <span class="ws-score" title="Summe aller Warnsignale — Schätzung, kein Messwert">Schwäche ${breakdown.score}</span>
      </div>
      <div class="ws-title">${escapeHtml(obj.title)}</div>
      <div class="ws-meta">LZ ${escapeHtml(String(obj.number ?? '–'))}${m ? ` · Modul ${escapeHtml(m.code)}` : ''}${obj.status === 'done' ? ' · verstanden' : ''} · ${spotContext(obj, state).map(escapeHtml).join(' · ')}</div>
      <div class="ws-why">
        ${breakdown.signals.map(s => `<div class="ws-signal"><span>${escapeHtml(s.label)}</span><span class="ws-points">+${s.points}</span></div>`).join('')}
        ${breakdown.stabilizers.map(s => `<div class="ws-stabil">${escapeHtml(s)}</div>`).join('')}
      </div>
      <div class="timer-actions ws-actions">
        <button class="btn primary" data-act="review">Verlauf / Review</button>
        <button class="btn" data-act="session">▶ Session</button>
        <button class="btn" data-act="resources" ${resources.length ? '' : 'disabled'}>Ressourcen (${resources.length})</button>
        <button class="btn" data-act="captures" ${caps.length ? '' : 'disabled'}>Fehler & Fragen (${caps.length})</button>
      </div>
      <div class="ws-detail" hidden></div>
    </div>
  `;
}

function bindSpot(card, state) {
  const id = card.dataset.id;
  const obj = state.learningObjectives.find(o => o.id === id);
  if (!obj) return;
  const detail = card.querySelector('.ws-detail');

  const closeDetail = () => {
    detail.hidden = true;
    detail.innerHTML = '';
    card.querySelectorAll('[data-act="resources"], [data-act="captures"]').forEach(b => b.classList.remove('active'));
  };

  card.querySelector('[data-act="review"]')?.addEventListener('click', () => openObjectiveHistory(id));

  card.querySelector('[data-act="session"]')?.addEventListener('click', () => {
    const st = window.EMVS.getState();
    st.settings.currentModuleId = obj.moduleId;
    window.EMVS.save();
    window.EMVS.renderSidebar();
    openSessionModal(null, obj.moduleId, { linkedObjectiveIds: [id], duration: 25 });
  });

  card.querySelector('[data-act="resources"]')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!detail.hidden && detail.dataset.kind === 'resources') { closeDetail(); return; }
    const list = resourcesForObjective(window.EMVS.getState(), obj);
    detail.dataset.kind = 'resources';
    detail.hidden = false;
    detail.innerHTML = `
      <div class="section-label" style="margin: 4px 0 8px;">Verknüpfte Ressourcen · ${list.length}</div>
      ${list.map(r => {
        const u = getResourceUsage(window.EMVS.getState(), r);
        return `<div class="obj-hist-res-row">
          <span class="badge">${escapeHtml(r.type || 'Material')}</span>
          <span class="obj-hist-res-name">${escapeHtml(r.name.length > 60 ? r.name.slice(0, 60) + '…' : r.name)}</span>
          <span class="muted" style="font-size:12px;">${u.totalUses}× benutzt · ${r.understood ? 'verstanden ✓' : 'offen'}</span>
          <button class="btn ghost" data-res="${r.id}" style="min-height:28px;font-size:12px;">Öffnen →</button>
        </div>`;
      }).join('')}`;
    card.querySelectorAll('[data-act="resources"], [data-act="captures"]').forEach(b => b.classList.toggle('active', b === btn));
    detail.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => openResourceHistory(b.dataset.res)));
  });

  card.querySelector('[data-act="captures"]')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!detail.hidden && detail.dataset.kind === 'captures') { closeDetail(); return; }
    const st = window.EMVS.getState();
    const list = capturesForObjective(st, obj).filter(c => c.type === 'mistake' || c.type === 'question');
    const icons = { mistake: '⚠️', question: '❓' };
    detail.dataset.kind = 'captures';
    detail.hidden = false;
    detail.innerHTML = `
      <div class="section-label" style="margin: 4px 0 8px;">Fehler & Fragen · ${list.length}</div>
      ${list.map(c => `<div class="obj-hist-res-row">
        <span>${icons[c.type] || '✎'}</span>
        <span class="obj-hist-res-name">${escapeHtml((c.content || '').length > 100 ? c.content.slice(0, 100) + '…' : c.content || '')}</span>
        <span class="muted" style="font-size:12px;">${new Date(c.timestamp).toLocaleDateString('de-CH')}</span>
      </div>`).join('')}
      <div class="timer-actions" style="margin-top:8px;">
        <button class="btn ghost" data-act="capture-new" style="min-height:28px;font-size:12px;">⚡ Dazu festhalten</button>
        <button class="btn ghost" data-act="capture-all" style="min-height:28px;font-size:12px;">Alle Erfassungen →</button>
      </div>`;
    card.querySelectorAll('[data-act="resources"], [data-act="captures"]').forEach(b => b.classList.toggle('active', b === btn));
    detail.querySelector('[data-act="capture-new"]')?.addEventListener('click', () =>
      openQuickCapture({ moduleId: obj.moduleId, objectiveId: id }));
    detail.querySelector('[data-act="capture-all"]')?.addEventListener('click', () => navigate('captures'));
  });
}
