/**
 * Deadline aggregation for Heute, the calendar and the palette.
 * Pure and DOM-free.
 */

import { daysUntil, todayKey } from './dates.js';

/**
 * @param {object} state
 * @param {{now?: Date, limit?: number, includeOverdue?: boolean, includePastExams?: boolean}} opts
 * @returns {Array<{kind:'homework'|'exam', item:object, date:string, days:number}>}
 */
export function upcomingDeadlines(state, opts = {}) {
  const { now = new Date(), limit = 6, includeOverdue = true, includePastExams = false } = opts;
  const today = todayKey(now);
  const out = [];

  for (const h of state.homework || []) {
    if (h.done || !h.dueDate) continue;
    if (!includeOverdue && h.dueDate < today) continue;
    out.push({ kind: 'homework', item: h, date: h.dueDate });
  }
  for (const e of state.exams || []) {
    if (!e.date) continue;
    if (!includePastExams && e.date < today) continue;
    out.push({ kind: 'exam', item: e, date: e.date });
  }

  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'exam' ? -1 : 1;
    return (a.item.createdAt || 0) - (b.item.createdAt || 0);
  });

  return out.slice(0, limit).map((entry) => ({
    ...entry,
    days: daysUntil(entry.date, now),
  }));
}
