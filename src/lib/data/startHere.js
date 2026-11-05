/**
 * "Start here" — the one action the Heute page leads with.
 * Pure and DOM-free.
 */

import { daysUntil, todayKey } from './dates.js';

function dueSort(a, b) {
  const ad = a.dueDate || '9999-12-31';
  const bd = b.dueDate || '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

/**
 * @returns {{kind:'homework'|'exam', item:object, reason:string, days:number|null}|null}
 */
export function pickStartHere(state, now = new Date()) {
  const open = (state.homework || []).filter((h) => !h.done);
  if (open.length) {
    const item = [...open].sort(dueSort)[0];
    const days = item.dueDate ? daysUntil(item.dueDate, now) : null;
    let reason = 'upcoming';
    if (days !== null && days < 0) reason = 'overdue';
    else if (days === 0) reason = 'today';
    return { kind: 'homework', item, reason, days };
  }

  const today = todayKey(now);
  const exams = (state.exams || [])
    .filter((e) => e.date && e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));

  if (exams.length) {
    const item = exams[0];
    const days = daysUntil(item.date, now);
    if (days !== null && days <= 14) {
      return { kind: 'exam', item, reason: 'exam', days };
    }
  }

  return null;
}

/** Open homework sorted by due date; overdue first naturally by date. */
export function openHomework(state) {
  return (state.homework || []).filter((h) => !h.done).sort(dueSort);
}

export function doneHomework(state) {
  return (state.homework || [])
    .filter((h) => h.done)
    .sort((a, b) => (b.doneAt || b.updatedAt || 0) - (a.doneAt || a.updatedAt || 0));
}
