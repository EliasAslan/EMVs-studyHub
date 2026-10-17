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

/** Top-level destinations in the sidebar rail / tabbar. */
/**
 * Context navigation grouping by student intention.
 * "Learn" → modules, topics, learning objectives and resources.
 * "Practice" → exercises, quizzes and exam simulations.
 * "Plan" → planner, deadlines, tasks and study sessions.
 * "Review" → progress, weak topics, completed objectives and revision.
 */
export const CONTEXT_GROUPS = [
  { id: 'learn', label: 'Lernen', icon: '📚',
    views: ['overview', 'module-homepage', 'module-ziele', 'module-plan', 'module-sessions', 'module-material'] },
  { id: 'practice', label: 'Üben', icon: '✏️',
    views: ['weekly-review', 'tools', 'module-homepage', 'module-ziele', 'module-plan', 'module-sessions', 'module-material'] },
  { id: 'plan', label: 'Planen', icon: '📅',
    views: ['today', 'weak-spots', 'weekly-review', 'tools'] },
  { id: 'review', label: 'Wiederholen', icon: '📈',
    views: ['weak-spots', 'exams-global', 'weekly-review', 'tools'] },
];

/**
 * Global views mapped to their primary context group for the Context layout.
 */
export const GLOBAL_TO_CONTEXT = {
  'today': 'plan',
  'overview': 'learn',
  'weak-spots': 'review',
  'exams-global': 'review',
};

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
