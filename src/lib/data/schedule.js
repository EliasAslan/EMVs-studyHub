/**
 * Weekly mini-grid helpers. Pure and DOM-free.
 */

import { dateKey, daysBetween, todayKey } from './dates.js';

export function lessonsForDay(state, dayOfWeek) {
  return (state.lessons || [])
    .filter((l) => l.dayOfWeek === dayOfWeek)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

export function sortedLessons(state) {
  return [...(state.lessons || [])].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0),
  );
}

function nextOccurrence(lesson, now) {
  const [hours, minutes] = String(lesson.start || '08:00')
    .split(':')
    .map(Number);
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours || 0, minutes || 0, 0, 0);
    const jsDay = d.getDay() === 0 ? 7 : d.getDay();
    if (jsDay !== lesson.dayOfWeek) continue;
    if (d.getTime() <= now.getTime()) continue;
    return d;
  }
  return null;
}

/** Next scheduled lesson from now, across the week boundary. */
export function nextLesson(state, now = new Date()) {
  let best = null;
  for (const lesson of state.lessons || []) {
    const at = nextOccurrence(lesson, now);
    if (!at) continue;
    if (!best || at < best.at) best = { lesson, at, date: dateKey(at) };
  }
  return best;
}

export function lessonLabel(state, lesson) {
  if (!lesson) return '';
  if (lesson.label) return lesson.label;
  const mod = (state.modules || []).find((m) => m.id === lesson.moduleId);
  return mod ? mod.title || mod.code : 'Unterricht';
}

export function daysUntilLesson(lesson, now = new Date()) {
  const next = nextLesson({ lessons: [lesson] }, now);
  if (!next) return null;
  return daysBetween(todayKey(now), next.date);
}
