/**
 * Daily checklist derivation. Pure and DOM-free.
 *
 * Rules (Part 4):
 * - homework due today or overdue appears automatically, sorted by due date
 * - custom items are always visible
 * - "studiert heute" is a per-day item
 * - checked state is per-day and resets on the next day
 * - unchecked items are never hidden
 */

import { STUDIED_ID } from './entities.js';
import { todayKey, relativeDayLabel } from './dates.js';

export function checkedForDay(state, now = new Date()) {
  const today = todayKey(now);
  const box = state.checklist;
  if (!box || box.date !== today) return {};
  return box.checked || {};
}

export function checklistForDay(state, now = new Date()) {
  const today = todayKey(now);
  const checked = checkedForDay(state, now);

  const homework = (state.homework || [])
    .filter((h) => !h.done && h.dueDate && h.dueDate <= today)
    .sort((a, b) => {
      const ad = a.dueDate || '9999-12-31';
      const bd = b.dueDate || '9999-12-31';
      return ad < bd ? -1 : ad > bd ? 1 : (a.createdAt || 0) - (b.createdAt || 0);
    })
    .map((h) => ({
      id: `hw:${h.id}`,
      kind: 'homework',
      homeworkId: h.id,
      text: h.title,
      dueDate: h.dueDate || null,
      dueLabel: h.dueDate ? relativeDayLabel(h.dueDate, now) : '',
      isOverdue: !!h.dueDate && h.dueDate < today,
      checked: false,
    }));

  const custom = (state.checklistItems || [])
    .filter((c) => c.kind !== 'studied')
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0))
    .map((c) => ({
      id: c.id,
      kind: 'custom',
      text: c.text,
      checked: !!checked[c.id],
    }));

  const studiedItem = (state.checklistItems || []).find((c) => c.id === STUDIED_ID) || {
    id: STUDIED_ID,
    text: 'studiert heute',
  };
  const studied = {
    id: STUDIED_ID,
    kind: 'studied',
    text: studiedItem.text || 'studiert heute',
    checked: !!checked[STUDIED_ID],
  };

  return { date: today, items: [...homework, ...custom, studied], checked };
}

export function remainingCount(state, now = new Date()) {
  return checklistForDay(state, now).items.filter((i) => !i.checked).length;
}
