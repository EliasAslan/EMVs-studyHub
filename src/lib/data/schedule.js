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

function toMinutes(value) {
  const [hours, minutes] = String(value || '')
    .split(':')
    .map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/** Lesson length in minutes, or 0 for invalid/empty ranges. */
export function lessonDuration(lesson) {
  const start = toMinutes(lesson?.start);
  const end = toMinutes(lesson?.end);
  if (start == null || end == null || end <= start) return 0;
  return end - start;
}

/** True while the lesson's weekday and time slot contain `now`. */
export function isLessonNow(lesson, now = new Date()) {
  if (!lesson) return false;
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
  if (Number(lesson.dayOfWeek) !== dayOfWeek) return false;
  const start = toMinutes(lesson.start);
  const end = toMinutes(lesson.end);
  if (start == null || end == null || end <= start) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= start && minutes < end;
}

/**
 * Lessons on the same day whose time range overlaps `candidate`.
 * Touching ranges (09:00–10:00 and 10:00–11:00) do not conflict.
 */
export function lessonConflicts(lessons, candidate, ignoreId = null) {
  const day = Number(candidate?.dayOfWeek);
  const start = toMinutes(candidate?.start);
  const end = toMinutes(candidate?.end);
  if (!Number.isFinite(day) || start == null || end == null || end <= start) return [];
  return (lessons || []).filter((lesson) => {
    if (!lesson || lesson.id === ignoreId) return false;
    if (Number(lesson.dayOfWeek) !== day) return false;
    const otherStart = toMinutes(lesson.start);
    const otherEnd = toMinutes(lesson.end);
    if (otherStart == null || otherEnd == null || otherEnd <= otherStart) return false;
    return start < otherEnd && end > otherStart;
  });
}

export function daysUntilLesson(lesson, now = new Date()) {
  const next = nextLesson({ lessons: [lesson] }, now);
  if (!next) return null;
  return daysBetween(todayKey(now), next.date);
}
