/**
 * Recurring homework rules. Pure and DOM-free.
 *
 * A rule never stores more than the shape below. The UI materializes one next
 * occurrence when the current one is completed; it does not pre-generate a
 * series.
 */

import { addDays, dateKey, isValidDateKey, parseDateKey } from './dates.js';

const FREQS = new Set(['daily', 'weekly', 'monthly']);
const MAX_INTERVAL = 12;

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Nie', recurrence: null },
  { value: 'daily', label: 'Täglich', recurrence: { freq: 'daily', interval: 1 } },
  { value: 'weekly', label: 'Wöchentlich', recurrence: { freq: 'weekly', interval: 1 } },
  { value: 'biweekly', label: 'Alle 2 Wochen', recurrence: { freq: 'weekly', interval: 2 } },
  { value: 'monthly', label: 'Monatlich', recurrence: { freq: 'monthly', interval: 1 } },
];

/**
 * @returns {{freq:string, interval:number, until:string|null, seriesId:string|null}|null}
 */
export function normalizeRecurrence(raw, seriesId = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const freq = String(raw.freq || '');
  if (!FREQS.has(freq)) return null;

  const parsedInterval = Math.floor(Number(raw.interval));
  const interval = Number.isFinite(parsedInterval)
    ? Math.min(MAX_INTERVAL, Math.max(1, parsedInterval))
    : 1;
  const until = isValidDateKey(raw.until) ? raw.until : null;
  const series =
    typeof raw.seriesId === 'string' && raw.seriesId
      ? raw.seriesId
      : typeof seriesId === 'string' && seriesId
        ? seriesId
        : null;

  return { freq, interval, until, seriesId: series };
}

/** Build the stored rule from a UI option value. */
export function recurrenceFromValue(value, seriesId = null) {
  const option = RECURRENCE_OPTIONS.find((o) => o.value === value);
  if (!option || !option.recurrence) return null;
  return normalizeRecurrence(option.recurrence, seriesId);
}

/** Match a stored rule back to the closest UI option value. */
export function recurrenceValue(rule) {
  const normalized = normalizeRecurrence(rule);
  if (!normalized) return 'none';
  const exact = RECURRENCE_OPTIONS.find(
    (o) =>
      o.recurrence &&
      o.recurrence.freq === normalized.freq &&
      o.recurrence.interval === normalized.interval,
  );
  return exact ? exact.value : normalized.freq;
}

function addMonthsClamped(date, months) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const target = new Date(year, month + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

/**
 * Next due date after `dueDateKey`, or null when the rule is invalid, has no
 * date, or has passed its `until` boundary.
 */
export function nextOccurrence(dueDateKey, rule) {
  const normalized = normalizeRecurrence(rule);
  if (!normalized || !isValidDateKey(dueDateKey)) return null;

  let next = null;
  if (normalized.freq === 'daily') {
    next = addDays(dueDateKey, normalized.interval);
  } else if (normalized.freq === 'weekly') {
    next = addDays(dueDateKey, 7 * normalized.interval);
  } else if (normalized.freq === 'monthly') {
    const date = parseDateKey(dueDateKey);
    if (!date) return null;
    next = dateKey(addMonthsClamped(date, normalized.interval));
  }

  if (!next) return null;
  if (normalized.until && next > normalized.until) return null;
  return next;
}

/**
 * Build the next homework instance for a completed recurring item.
 * Returns null when there is no next date or the rule is invalid.
 */
export function nextHomeworkFrom(hw) {
  if (!hw || !hw.recurrence || !hw.dueDate) return null;
  const nextDate = nextOccurrence(hw.dueDate, hw.recurrence);
  if (!nextDate) return null;
  const seriesId = hw.recurrence.seriesId || hw.id;
  return {
    moduleId: hw.moduleId || null,
    topicId: hw.topicId || null,
    title: hw.title,
    dueDate: nextDate,
    done: false,
    doneAt: null,
    recurrence: normalizeRecurrence({ ...hw.recurrence, seriesId }, seriesId),
  };
}

/**
 * The next instance to append for a completed recurring item, or null when
 * the series ended or an instance for that date already exists.
 */
export function nextInstanceToAdd(state, hw) {
  const next = nextHomeworkFrom(hw);
  const seriesId = next?.recurrence?.seriesId;
  if (!seriesId) return null;
  const exists = (state.homework || []).some(
    (h) => h.recurrence?.seriesId === seriesId && h.dueDate === next.dueDate,
  );
  return exists ? null : next;
}

export function describeRecurrence(rule) {
  const normalized = normalizeRecurrence(rule);
  if (!normalized) return '';
  if (normalized.freq === 'daily') {
    return normalized.interval > 1 ? `↻ alle ${normalized.interval} Tage` : '↻ täglich';
  }
  if (normalized.freq === 'weekly') {
    return normalized.interval > 1 ? `↻ alle ${normalized.interval} Wochen` : '↻ wöchentlich';
  }
  return normalized.interval > 1 ? `↻ alle ${normalized.interval} Monate` : '↻ monatlich';
}
