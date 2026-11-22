/**
 * Daily checklist derivation. Pure and DOM-free.
 *
 * Rules (Part 4):
 * - open homework due within the checklist horizon (today .. +5 days) appears
 *   automatically, sorted by due date
 * - homework completed today remains visible as checked until the next day
 * - custom items are always visible
 * - "studiert heute" is a per-day item
 * - checked state is per-day and resets on the next day
 * - unchecked items are never hidden
 */

/** How far ahead the daily checklist lists open homework (default 5). */
const DEFAULT_HORIZON_DAYS = 5;

/** Derive checked state for a given day from the checklist box. */
export function checkedForDay(state, now = new Date()) {
  const today = todayKey(now);
  const box = state.checklist;
  if (!box || box.date !== today) return {};
  return box.checked || {};
}

import { STUDIED_ID } from './entities.js';
import { todayKey, relativeDayLabel } from './dates.js';
import { $preferences } from '../stores/preferences.js';

function addDaysKey(key, days) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Derive the daily checklist for today.
 * @param state   The app state containing homework and checklist items.
 * @param now     The current date (default: new Date()).
 * @param horizonDays Number of days ahead to look for homework (default DEFAULT_HORIZON_DAYS).
 * @param includeOverdue If true, include homework whose dueDate is before today.
 *                       If false, only show homework due today or in the future.
 *                       Defaults to true.
 */
export function checklistForDay(state, now = new Date(), horizonDays = DEFAULT_HORIZON_DAYS, includeOverdue = true) {
  const today = todayKey(now);
  const checked = checkedForDay(state, now);

  const horizonFromPrefs = $preferences.checklistHorizon;
  const effectiveHorizon = horizonDays ?? horizonFromPrefs ?? DEFAULT_HORIZON_DAYS;
  const effectiveIncludeOverdue = includeOverdue !== false && ($preferences.includeOverdue ?? includeOverdue);

  const homework = (state.homework || [])
    .filter((h) => {
      const completedToday =
        h.done &&
        Number.isFinite(h.doneAt) &&
        todayKey(new Date(h.doneAt)) === today;
      return (
        (!h.done || completedToday) &&
        h.dueDate &&
        h.dueDate <= addDaysKey(today, effectiveHorizon) &&
        (effectiveIncludeOverdue || h.dueDate >= today),
      );
    })
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
      isOverdue: !!h.dueDate && h.dueDate < today && effectiveIncludeOverdue,
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