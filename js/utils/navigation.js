/**
 * Navigation model — single source of truth for global + module navigation.
 *
 * DOM-free: no window/document access, safe for plain Node tests.
 * Both router.js (active states, default tabs) and sidebar.js (rendering)
 * consume these helpers so they can never disagree about destinations.
 */

/** Module detail tabs. 'home' is the module dashboard; the other four are the working tabs. */
export const MODULE_TABS = [
  { key: 'home', label: 'Home' },
  { key: 'ziele', label: 'Ziele' },
  { key: 'plan', label: 'Plan' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'material', label: 'Material' },
];

/** Landing tab when a module is opened without an explicit tab. */
export const DEFAULT_MODULE_TAB = 'home';

/**
 * Every place a student can go. One registry feeds the rail, mega menu,
 * context modes, bento launchpad, command palette, focus drawer and the
 * keyboard shortcuts, so labels, icons and keys can never drift apart.
 *
 * - `view`      → router view name (global destinations)
 * - `moduleTab` → module detail tab (needs a current module; see goTo())
 * - `key`       → single-key shortcut (no modifier, outside inputs)
 */
export const DESTINATIONS = {
  'today': { label: 'Heute', ico: '◉', view: 'today', key: '1', hint: 'Tagesfokus' },
  'overview': { label: 'Module', ico: '▦', view: 'overview', key: '2', hint: 'Alle Module im Überblick' },
  'weak-spots': { label: 'Schwachstellen', short: 'Schwach', ico: '△', view: 'weak-spots', key: '3', hint: 'Fällige Wiederholungen' },
  'exams-global': { label: 'Prüfungen', ico: '◷', view: 'exams-global', key: '4', hint: 'Alle Termine' },
  'weekly-review': { label: 'Review', ico: '✎', view: 'weekly-review', key: '5', hint: 'Wochenrückblick' },
  'tools': { label: 'Werkzeuge', ico: '⚒', view: 'tools', key: '6', hint: 'Links und Ressourcen' },
  'settings': { label: 'Einstellungen', ico: '⚙', view: 'settings', key: '7', hint: 'Konto, Daten, Navigation' },
  'exam-prep': { label: 'Prüfungsvorbereitung', ico: '⧉', view: 'exam-prep', key: '8', hint: 'Stoff und Lücken erkennen' },
  'mock-exam': { label: 'Mock-Prüfung', ico: '⏱', view: 'mock-exam', hint: 'Prüfung unter Zeitdruck simulieren' },
  'captures': { label: 'Erfassungen', ico: '⚡', view: 'captures', hint: 'Fragen, Fehler und Gedanken' },
  'module:home': { label: 'Modul-Home', ico: '⌂', moduleTab: 'home', hint: 'Übersicht des aktuellen Moduls' },
  'module:ziele': { label: 'Lernziele', ico: '◎', moduleTab: 'ziele', hint: 'Ziele und Sicherheit' },
  'module:plan': { label: 'Plan', ico: '≡', moduleTab: 'plan', hint: 'Wochenplan' },
  'module:sessions': { label: 'Sitzungen', ico: '▶', moduleTab: 'sessions', hint: 'Lernzeit erfassen' },
  'module:material': { label: 'Material', ico: '▤', moduleTab: 'material', hint: 'Ressourcen und Prüfungen' },
};

/** Destination id for a route, or null when the route has none. */
export function destinationIdFor(currentView, params = {}) {
  if (currentView === 'module') return `module:${resolveModuleTab(params.tab)}`;
  return Object.prototype.hasOwnProperty.call(DESTINATIONS, currentView) ? currentView : null;
}

/** Single-key shortcut → destination id (derived, never hand-maintained). */
export function shortcutMap() {
  const map = {};
  for (const [id, d] of Object.entries(DESTINATIONS)) {
    if (d.key) map[d.key] = id;
  }
  return map;
}

/**
 * Context navigation: destinations grouped by what the student wants to do
 * right now. Each destination lives in exactly one mode, so the active
 * page always maps to exactly one mode.
 */
export const CONTEXT_MODES = [
  { id: 'learn', label: 'Lernen', ico: '◈', lede: 'Stoff verstehen und einordnen',
    items: ['overview', 'module:home', 'module:ziele', 'module:material', 'tools'] },
  { id: 'practice', label: 'Üben', ico: '✦', lede: 'Abfragen und Prüfungen trainieren',
    items: ['exam-prep', 'mock-exam', 'module:sessions'] },
  { id: 'plan', label: 'Planen', ico: '❏', lede: 'Heute, Woche und Termine',
    items: ['today', 'module:plan', 'exams-global'] },
  { id: 'review', label: 'Wiederholen', ico: '↻', lede: 'Schwachstellen und Rückblick',
    items: ['weak-spots', 'weekly-review', 'captures'] },
];

export const DEFAULT_CONTEXT_MODE = 'plan';

export function isContextModeId(id) {
  return CONTEXT_MODES.some(m => m.id === id);
}

/** Mode that owns a destination id (null for e.g. settings). */
export function contextModeFor(destId) {
  const mode = CONTEXT_MODES.find(m => m.items.includes(destId));
  return mode ? mode.id : null;
}

/**
 * Mode to show: the mode of the current page wins (so navigating by any
 * other means never leaves the sidebar on a mode that does not contain
 * where you are); otherwise the stored choice; otherwise the default.
 */
export function resolveContextMode(destId, stored) {
  return contextModeFor(destId) || (isContextModeId(stored) ? stored : DEFAULT_CONTEXT_MODE);
}

/**
 * Mega menu structure. Groups hold destination ids, or `kind: 'modules'`
 * for the live list of subjects. Top-level entries without groups are
 * plain links.
 */
export const MEGA_MENUS = [
  { id: 'heute', label: 'Heute', dest: 'today' },
  { id: 'lernen', label: 'Lernen', groups: [
    { title: 'Fächer', kind: 'modules' },
    { title: 'Aktuelles Modul', items: ['module:home', 'module:ziele', 'module:material'] },
    { title: 'Mehr', items: ['overview', 'tools'] },
  ] },
  { id: 'pruefen', label: 'Prüfen', groups: [
    { title: 'Vorbereiten', items: ['exam-prep', 'mock-exam'] },
    { title: 'Termine', items: ['exams-global'] },
    { title: 'Wiederholen', items: ['weak-spots'] },
  ] },
  { id: 'planen', label: 'Planen', groups: [
    { title: 'Planen', items: ['module:plan', 'module:sessions'] },
    { title: 'Rückblick', items: ['weekly-review', 'captures'] },
  ] },
];

/** Modules hold their pages in tabs; the tree's "chapters" are these tabs. */
export const TREE_CHAPTERS = [
  { tab: 'home', label: 'Home' },
  { tab: 'ziele', label: 'Lernziele' },
  { tab: 'plan', label: 'Plan' },
  { tab: 'sessions', label: 'Sitzungen' },
  { tab: 'material', label: 'Material' },
];

/**
 * Title + subtitle for the contextual mobile header.
 * Module pages show the module code with the tab as subtitle.
 */
export function routeTitle(currentView, params = {}, state = null) {
  if (currentView === 'module') {
    const id = params.id || state?.settings?.currentModuleId || null;
    const mod = (state?.modules || []).find(m => m.id === id);
    const tab = MODULE_TABS.find(t => t.key === resolveModuleTab(params.tab));
    return { title: mod ? `Modul ${mod.code}` : 'Modul', sub: tab ? tab.label : '' };
  }
  const d = DESTINATIONS[currentView];
  return { title: d ? d.label : 'EMVS', sub: '' };
}

/** Breadcrumb trail [{label, dest}] for the command bar. */
export function getBreadcrumb(currentView, params = {}, state = null) {
  if (currentView === 'module') {
    const t = routeTitle(currentView, params, state);
    return [
      { label: 'Module', dest: 'overview' },
      { label: t.title, dest: 'module:home' },
      ...(t.sub && t.sub !== 'Home' ? [{ label: t.sub, dest: null }] : []),
    ];
  }
  const d = DESTINATIONS[currentView];
  return [{ label: d ? d.label : 'EMVS', dest: d ? currentView : null }];
}

export const GLOBAL_VIEWS = ['today', 'overview', 'weak-spots', 'exams-global'];

/** Legacy per-module view names (sidebar chapters, palette, deep links) → tab keys. */
export const LEGACY_VIEW_TO_TAB = {
  'module-home': 'home',
  'module-objectives': 'ziele',
  'module-resources': 'material',
  'module-exams': 'material',
  'module-sessions': 'sessions',
  'module-plan': 'plan',
};

export function isModuleTabKey(tab) {
  return MODULE_TABS.some(t => t.key === tab);
}

/** Unknown/empty tabs fall back to the module Home dashboard. */
export function resolveModuleTab(tab) {
  return isModuleTabKey(tab) ? tab : DEFAULT_MODULE_TAB;
}

/**
 * Derive navigation state for active-state rendering.
 *
 * Returns { global, moduleId, moduleTab }:
 * - global views → { global: view, moduleId: currentModuleId, moduleTab: null }
 * - module detail → { global: null, moduleId: params.id || currentModuleId, moduleTab }
 * - anything else (settings, captures, …) → { global: <view if global>, moduleId, moduleTab: null }
 */
export function getNavState(currentView, params = {}, currentModuleId = null) {
  if (currentView === 'module') {
    return {
      global: null,
      moduleId: params.id || currentModuleId || null,
      moduleTab: resolveModuleTab(params.tab),
    };
  }
  return {
    global: GLOBAL_VIEWS.includes(currentView) ? currentView : currentView,
    moduleId: currentModuleId || null,
    moduleTab: null,
  };
}

/**
 * Countdown for an exam date string (YYYY-MM-DD).
 *
 * Returns null for missing/empty/invalid dates (callers render an
 * intentional empty state instead). Otherwise { days, text, urgent }:
 * - days: whole days from today (negative = overdue)
 * - text: 'heute' | 'morgen' | 'in N Tagen' | 'überschritten'
 * - urgent: true when the exam is today or within the next 14 days
 */
export function formatCountdown(dateStr, nowMs = Date.now()) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // Calendar-day math in UTC: immune to DST transitions that break
  // millisecond division around the October/March clock changes.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const target = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const check = new Date(target);
  if (isNaN(target) || check.getUTCFullYear() !== +m[1] ||
      check.getUTCMonth() !== +m[2] - 1 || check.getUTCDate() !== +m[3]) {
    return null; // e.g. month 13 or February 30th
  }
  const d = new Date(nowMs);
  const todayUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((target - todayUTC) / 86400000);
  if (days < 0) return { days, text: 'überschritten', urgent: false };
  if (days === 0) return { days, text: 'heute', urgent: true };
  if (days === 1) return { days, text: 'morgen', urgent: true };
  return { days, text: `in ${days} Tagen`, urgent: days <= 14 };
}

/**
 * Lightweight to-do source: open, non-dropped plan items.
 * Ordering: overdue-week leftovers first, then by week, then by creation.
 * Pure read-only aggregation over the existing plan-item model.
 */
export function getOpenPlanItems(state, { moduleId = null, limit = 5, now = new Date() } = {}) {
  const items = (state.planItems || []).filter(p =>
    (!moduleId || p.moduleId === moduleId) && !p.done && !p.dropped);
  const currentWeek = getIsoWeek(now);
  const scored = items.map(p => {
    const week = parseInt(p.week, 10);
    const overdue = Number.isFinite(week) && week < currentWeek;
    return { item: p, overdue, week: Number.isFinite(week) ? week : 999 };
  });
  scored.sort((a, b) =>
    (b.overdue - a.overdue) || (a.week - b.week) || ((a.item.createdAt || 0) - (b.item.createdAt || 0)));
  return scored.slice(0, Math.max(0, limit)).map(s => s.item);
}

function getIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  return 1 + Math.round((d - firstThursday) / 6048e5);
}

/**
 * Notes source: newest captures with actual content, newest first.
 * Pure read-only; opening happens via the existing capture modal.
 */
export function getRecentCaptures(state, { limit = 3 } = {}) {
  return [...(state.captures || [])]
    .filter(c => c && String(c.content || '').trim())
    .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0))
    .slice(0, Math.max(0, limit));
}
