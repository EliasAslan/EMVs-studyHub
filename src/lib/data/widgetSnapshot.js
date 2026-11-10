/**
 * Widget snapshot — minimal read-only view of Study Hub data for desktop
 * companions (Rainmeter, future PWA widgets).
 *
 * Pure and DOM-free. Never mutates state and never imports data back, so
 * Study Hub stays the single source of truth.
 *
 * Excludes note bodies, grades, IDs, emails, attachment metadata and any
 * private fields so the export stays safe to write to a plain desktop file.
 *
 * Shape (version 1):
 *   {
 *     version, generatedAt,
 *     startHere: {kind, title, date, days, overdue} | null,
 *     deadlines: [{kind, title, date, days, overdue}],   // max 3
 *     openHomeworkCount: number,
 *     nextExam: {title, date, days, overdue} | null
 *   }
 */

import { pickStartHere, openHomework } from './startHere.js';
import { upcomingDeadlines } from './deadlines.js';
import { todayKey, daysUntil } from './dates.js';

export const SNAPSHOT_VERSION = 1;

const MAX_TITLE = 80;

function cleanTitle(value) {
  if (typeof value !== 'string') return '(ohne Titel)';
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return trimmed || '(ohne Titel)';
}

function sanitizeForText(value) {
  return String(value ?? '')
    .replace(/\|/g, '¦')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectItems(items) {
  return asArray(items).filter((item) => item && typeof item === 'object');
}

/** Return a state view whose collections are safe to hand to the selectors. */
function sanitizedState(state) {
  const s = state && typeof state === 'object' ? state : {};
  return {
    ...s,
    homework: objectItems(s.homework),
    exams: objectItems(s.exams),
  };
}

function startHereEntry(state, now) {
  const picked = pickStartHere(state, now);
  if (!picked) return null;
  const item = picked.item || {};
  const date = picked.kind === 'exam' ? item.date : item.dueDate;
  return {
    kind: picked.kind,
    title: cleanTitle(item.title),
    date: typeof date === 'string' ? date : null,
    days: typeof picked.days === 'number' ? picked.days : null,
    overdue: typeof picked.days === 'number' ? picked.days < 0 : false,
  };
}

function deadlinesEntries(state, now) {
  const entries = upcomingDeadlines(state, {
    now,
    limit: 3,
    includeOverdue: true,
    includePastExams: false,
  });
  return (entries || []).map((entry) => {
    const item = entry.item || {};
    const days = typeof entry.days === 'number' ? entry.days : null;
    return {
      kind: entry.kind,
      title: cleanTitle(item.title),
      date: typeof entry.date === 'string' ? entry.date : null,
      days,
      overdue: days !== null && days < 0,
    };
  });
}

function openHomeworkCount(state) {
  return openHomework(state).length;
}

function nextExam(state, now) {
  const today = todayKey(now);
  const exams = state.exams
    .filter((e) => typeof e.date === 'string' && e.date && e.date >= today)
    .sort((a, b) =>
      a.date < b.date
        ? -1
        : a.date > b.date
          ? 1
          : (a.createdAt || 0) - (b.createdAt || 0),
    );
  const e = exams[0];
  if (!e) return null;
  const days = daysUntil(e.date, now);
  return {
    title: cleanTitle(e.title),
    date: e.date,
    days: typeof days === 'number' ? days : null,
    overdue: false,
  };
}

export function buildSnapshot(state = {}, now = new Date()) {
  const reference = now instanceof Date ? now : new Date();
  const safe = sanitizedState(state);
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: reference.toISOString(),
    startHere: startHereEntry(safe, reference),
    deadlines: deadlinesEntries(safe, reference),
    openHomeworkCount: openHomeworkCount(safe),
    nextExam: nextExam(safe, reference),
  };
}

export function snapshotToJson(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

export function snapshotToText(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const lines = [];
  lines.push(`version=${snapshot.version ?? SNAPSHOT_VERSION}`);
  lines.push(`generatedAt=${sanitizeForText(snapshot.generatedAt ?? '')}`);

  const sh = snapshot.startHere;
  if (sh) {
    lines.push(`startKind=${sh.kind ?? ''}`);
    lines.push(`startTitle=${sanitizeForText(sh.title ?? '')}`);
    lines.push(`startDate=${sanitizeForText(sh.date ?? '')}`);
    lines.push(`startDays=${typeof sh.days === 'number' ? sh.days : ''}`);
    lines.push(`startOverdue=${sh.overdue ? '1' : '0'}`);
  } else {
    lines.push('startTitle=');
  }

  lines.push(
    `openCount=${typeof snapshot.openHomeworkCount === 'number' ? snapshot.openHomeworkCount : 0}`,
  );

  const deadlines = Array.isArray(snapshot.deadlines) ? snapshot.deadlines : [];
  for (let i = 0; i < deadlines.length; i++) {
    const d = deadlines[i] || {};
    const n = i + 1;
    lines.push(`deadline${n}Kind=${d.kind ?? ''}`);
    lines.push(`deadline${n}Title=${sanitizeForText(d.title ?? '')}`);
    lines.push(`deadline${n}Date=${sanitizeForText(d.date ?? '')}`);
    lines.push(`deadline${n}Days=${typeof d.days === 'number' ? d.days : ''}`);
    lines.push(`deadline${n}Overdue=${d.overdue ? '1' : '0'}`);
  }

  const ne = snapshot.nextExam;
  if (ne) {
    lines.push(`nextExamTitle=${sanitizeForText(ne.title ?? '')}`);
    lines.push(`nextExamDate=${sanitizeForText(ne.date ?? '')}`);
    lines.push(`nextExamDays=${typeof ne.days === 'number' ? ne.days : ''}`);
  } else {
    lines.push('nextExamTitle=');
  }

  return lines.join('\n');
}
