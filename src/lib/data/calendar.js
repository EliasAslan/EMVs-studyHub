/**
 * Calendar grouping. Pure and DOM-free.
 */

import { monthGrid, monthRange, todayKey } from './dates.js';

export function monthModel(year, monthIndex, state, now = new Date()) {
  const weeks = monthGrid(year, monthIndex).map((week) =>
    week.map((key) => {
      const inMonth = Number(key.slice(5, 7)) - 1 === monthIndex && Number(key.slice(0, 4)) === year;
      return {
        key,
        inMonth,
        isToday: key === todayKey(now),
        homework: [],
        exams: [],
      };
    }),
  );
  const byKey = new Map();
  weeks.forEach((week) => week.forEach((day) => byKey.set(day.key, day)));

  const { from, to } = monthRange(year, monthIndex);

  for (const h of state.homework || []) {
    if (!h.dueDate || h.done) continue;
    if (h.dueDate < from || h.dueDate > to) continue;
    byKey.get(h.dueDate)?.homework.push(h);
  }
  for (const e of state.exams || []) {
    if (!e.date) continue;
    if (e.date < from || e.date > to) continue;
    byKey.get(e.date)?.exams.push(e);
  }

  return weeks;
}

/** All items on one date, homework first. */
export function itemsOnDate(state, key) {
  const homework = (state.homework || []).filter((h) => h.dueDate === key);
  const exams = (state.exams || []).filter((e) => e.date === key);
  return { homework, exams };
}
