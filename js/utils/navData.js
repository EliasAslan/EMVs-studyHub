/**
 * Navigation data builders — pure, DOM-free (safe for plain Node tests).
 *
 * Feeds the Tree layout (subjects → chapters → topics) and the Bento
 * launchpad (subjects, upcoming exams, recent activity). Read-only
 * aggregation over the existing state model; nothing here mutates state.
 */

import { TREE_CHAPTERS, formatCountdown } from './navigation.js';
import { objectiveProgressPercent } from './dashboard.js';
import { getDueObjectives } from './helpers.js';

const MAX_TOPICS = 60;

function clip(text, max = 60) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** Progress of one module: mastered objectives / all objectives. */
export function getModuleProgress(state, moduleId) {
  const objs = (state.learningObjectives || []).filter(o => o.moduleId === moduleId);
  const done = objs.filter(o => o.status === 'done').length;
  return { done, total: objs.length, pct: objectiveProgressPercent(done, objs.length) };
}

/**
 * Tree model: subject (module) → chapter (module tab) → topic.
 * Topics: learning objectives under "Lernziele", resources under
 * "Material", open plan items under "Plan". Other chapters are leaves.
 *
 * Node: { id, type, label, children?, ... } — ids are stable so expanded
 * state survives re-renders.
 */
export function buildNavTree(state) {
  const objectives = state.learningObjectives || [];
  const resources = state.resources || [];
  const planItems = state.planItems || [];
  const sessions = state.studySessions || [];

  return (state.modules || []).map(m => {
    const prog = getModuleProgress(state, m.id);
    const chapterNodes = TREE_CHAPTERS.map(ch => {
      const base = { id: `mod:${m.id}:${ch.tab}`, type: 'chapter', label: ch.label, moduleId: m.id, tab: ch.tab };
      if (ch.tab === 'ziele') {
        const items = objectives.filter(o => o.moduleId === m.id)
          .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
        return { ...base, count: items.length, children: items.slice(0, MAX_TOPICS).map(o => ({
          id: `obj:${o.id}`, type: 'topic', kind: 'objective', targetId: o.id, moduleId: m.id,
          label: `${o.number != null ? o.number + '. ' : ''}${clip(o.title)}`,
          status: o.status || 'todo',
        })), more: Math.max(0, items.length - MAX_TOPICS) };
      }
      if (ch.tab === 'material') {
        const items = resources.filter(r => r.moduleId === m.id);
        return { ...base, count: items.length, children: items.slice(0, MAX_TOPICS).map(r => ({
          id: `res:${r.id}`, type: 'topic', kind: 'resource', targetId: r.id, moduleId: m.id,
          label: clip(r.name || 'Ressource'),
        })), more: Math.max(0, items.length - MAX_TOPICS) };
      }
      if (ch.tab === 'plan') {
        const items = planItems.filter(p => p.moduleId === m.id && !p.done && !p.dropped);
        return { ...base, count: items.length, children: items.slice(0, MAX_TOPICS).map(p => ({
          id: `plan:${p.id}`, type: 'topic', kind: 'plan', targetId: p.id, moduleId: m.id,
          label: clip(p.text || p.title || 'Aufgabe'),
        })), more: Math.max(0, items.length - MAX_TOPICS) };
      }
      if (ch.tab === 'sessions') {
        return { ...base, count: sessions.filter(s => s.moduleId === m.id).length, children: [] };
      }
      return { ...base, children: [] };
    });
    return {
      id: `mod:${m.id}`, type: 'subject', moduleId: m.id,
      label: `${m.code}${m.title ? ' — ' + clip(m.title, 28) : ''}`,
      code: m.code, accent: m.accent || null, pct: prog.pct,
      children: chapterNodes,
    };
  });
}

/**
 * Upcoming exams (today or later), soonest first, with countdown text.
 * Exams with missing or invalid dates are skipped.
 */
export function getUpcomingExams(state, { limit = 4, nowMs = Date.now() } = {}) {
  const mods = new Map((state.modules || []).map(m => [m.id, m]));
  return (state.exams || [])
    .map(e => ({ e, cd: formatCountdown(e.date, nowMs) }))
    .filter(x => x.cd && x.cd.days >= 0)
    .sort((a, b) => a.cd.days - b.cd.days)
    .slice(0, Math.max(0, limit))
    .map(({ e, cd }) => ({
      id: e.id, name: e.name || 'Prüfung', moduleId: e.moduleId || null,
      moduleCode: mods.get(e.moduleId)?.code || '', days: cd.days, text: cd.text, urgent: cd.urgent,
    }));
}

function toMs(v) {
  if (typeof v === 'number') return v;
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Recent activity across study sessions, captures and reviews,
 * newest first. Each entry: { kind, title, at, moduleId }.
 */
export function getRecentActivity(state, { limit = 5 } = {}) {
  const out = [];
  for (const s of state.studySessions || []) {
    const at = toMs(s.startTime || s.createdAt);
    if (at) out.push({ kind: 'session', title: `Sitzung · ${s.duration || 0} Min${s.note ? ' — ' + clip(s.note, 40) : ''}`, at, moduleId: s.moduleId || null });
  }
  for (const c of state.captures || []) {
    const text = String(c?.content || '').trim();
    const at = toMs(c?.timestamp || c?.createdAt);
    if (text && at) out.push({ kind: 'capture', title: clip(text, 56), at, moduleId: c.moduleId || null });
  }
  for (const o of state.learningObjectives || []) {
    const last = o.reviewHistory && o.reviewHistory.length ? o.reviewHistory[o.reviewHistory.length - 1] : null;
    if (last && last.timestamp) out.push({ kind: 'review', title: `Review · ${clip(o.title, 44)}`, at: toMs(last.timestamp), moduleId: o.moduleId || null });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, Math.max(0, limit));
}

/** Everything the Bento launchpad shows, in one call. */
export function getBentoData(rawState, { nowMs = Date.now() } = {}) {
  // Tolerate partial state (fresh install, imports): missing lists are empty.
  const state = { ...rawState, learningObjectives: (rawState && rawState.learningObjectives) || [] };
  const subjects = (state.modules || []).map(m => {
    const prog = getModuleProgress(state, m.id);
    return {
      id: m.id, code: m.code, title: m.title || '', accent: m.accent || null,
      pct: prog.pct, done: prog.done, total: prog.total,
      due: getDueObjectives(state, m.id, nowMs).length,
    };
  });
  return {
    subjects,
    dueCount: getDueObjectives(state, null, nowMs).length,
    exams: getUpcomingExams(state, { nowMs }),
    activity: getRecentActivity(state),
    openTasks: (state.planItems || []).filter(p => !p.done && !p.dropped).length,
  };
}

/** "vor 2 Std." style label for activity rows. */
export function relativeTime(at, nowMs = Date.now()) {
  const diff = Math.max(0, nowMs - at);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'gestern';
  if (d < 30) return `vor ${d} Tagen`;
  return `vor ${Math.floor(d / 30)} Mon.`;
}
