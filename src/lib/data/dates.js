/**
 * Local-date helpers. Dates in state are 'YYYY-MM-DD' strings in local time.
 * Pure and DOM-free.
 */

const DAY_MS = 86400000;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayKey(now = new Date()) {
  return dateKey(now);
}

export function parseDateKey(key) {
  if (typeof key !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isValidDateKey(key) {
  const d = parseDateKey(key);
  return !!d && dateKey(d) === key;
}

export function addDays(key, days) {
  const d = parseDateKey(key);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Whole days from a to b (b - a). Both are date keys. */
export function daysBetween(a, b) {
  const da = parseDateKey(a);
  const db = parseDateKey(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

export function daysUntil(key, now = new Date()) {
  return daysBetween(todayKey(now), key);
}

const formatters = new Map();

function formatter(options) {
  const key = JSON.stringify(options);
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat('de-CH', options));
  }
  return formatters.get(key);
}

/** 04.11.2026 */
export function formatDate(key, style = 'numeric') {
  const d = parseDateKey(key);
  if (!d) return '';
  if (style === 'short') {
    return formatter({ weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  }
  if (style === 'long') {
    return formatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }
  return formatter({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatMonth(year, monthIndex) {
  return formatter({ month: 'long', year: 'numeric' }).format(new Date(year, monthIndex, 1));
}

export function weekdayShort(date) {
  return formatter({ weekday: 'short' }).format(date);
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

export function weekDateKeys(date = new Date()) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dateKey(d);
  });
}

/** Monday-first 6x7 month matrix of date keys. */
export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const d = new Date(start);
      d.setDate(start.getDate() + week * 7 + day);
      return dateKey(d);
    }),
  );
}

/** First and last date key of a month. */
export function monthRange(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  return { from: dateKey(first), to: dateKey(last) };
}

export function isToday(key, now = new Date()) {
  return key === todayKey(now);
}

export function relativeDayLabel(key, now = new Date()) {
  const diff = daysUntil(key, now);
  if (diff === null) return '';
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  if (diff < 0) return `${Math.abs(diff)} Tage überfällig`;
  return `in ${diff} Tagen`;
}

export function formatTimeRange(start, end) {
  return `${start || ''}–${end || ''}`;
}

export const WEEKDAYS = [
  { value: 1, label: 'Montag', short: 'Mo' },
  { value: 2, label: 'Dienstag', short: 'Di' },
  { value: 3, label: 'Mittwoch', short: 'Mi' },
  { value: 4, label: 'Donnerstag', short: 'Do' },
  { value: 5, label: 'Freitag', short: 'Fr' },
  { value: 6, label: 'Samstag', short: 'Sa' },
  { value: 7, label: 'Sonntag', short: 'So' },
];
