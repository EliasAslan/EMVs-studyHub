/**
 * Navigation layouts — registry + settings helpers.
 *
 * DOM-free: no window/document access, safe for plain Node tests.
 * sidebar.js / nav/index.js (rendering) and settings.js (selector) consume
 * these so the available layouts, the default, legacy-id migration and
 * persistence stay in one place.
 *
 * Layouts:
 * - 'rail':      slim icon rail with tooltips (default).
 * - 'workspace': global icon rail plus a contextual panel (module pages/tools).
 * - 'tree':      hierarchical sidebar: subjects → chapters → topics.
 * - 'mega':      top bar whose categories open grouped mega menus.
 * - 'dock':      floating pill-shaped dock with the main destinations.
 * - 'mobile':    phone-first shell: bottom bar + contextual header.
 * - 'context':   goal-based navigation: Learn / Practice / Plan / Review.
 * - 'command':   search-first bar with command palette and shortcuts.
 * - 'bento':     visual launchpad of grouped cards.
 * - 'focus':     navigation hidden until requested.
 */

export const NAV_LAYOUTS = [
  { id: 'rail', group: 'sidebar', label: 'Rail', hint: 'Schmale Icon-Leiste für die Hauptbereiche' },
  { id: 'workspace', group: 'sidebar', label: 'Arbeitsbereich', hint: 'Icon-Leiste plus Panel mit Seiten und Werkzeugen' },
  { id: 'tree', group: 'sidebar', label: 'Baum', hint: 'Fächer → Kapitel → Themen zum Auf- und Zuklappen' },
  { id: 'mega', group: 'bar', label: 'Mega-Menü', hint: 'Obere Leiste mit gruppierten Menüs' },
  { id: 'dock', group: 'bar', label: 'Dock', hint: 'Schwebende Pillen-Leiste mit den Hauptzielen' },
  { id: 'mobile', group: 'bar', label: 'Mobil', hint: 'Handy-Layout: untere Leiste und Kontext-Kopfzeile' },
  { id: 'context', group: 'smart', label: 'Kontext', hint: 'Nach Ziel: Lernen, Üben, Planen, Wiederholen' },
  { id: 'command', group: 'smart', label: 'Befehl', hint: 'Suche zuerst, mit Befehlspalette und Tastenkürzeln' },
  { id: 'bento', group: 'smart', label: 'Bento', hint: 'Visuelle Startseite aus Karten (Launchpad)' },
  { id: 'focus', group: 'smart', label: 'Fokus', hint: 'Navigation ausgeblendet, öffnet auf Abruf' },
];

/** Selector groups in Settings. */
export const NAV_LAYOUT_GROUPS = [
  { id: 'sidebar', label: 'Seitenleisten' },
  { id: 'bar', label: 'Leisten' },
  { id: 'smart', label: 'Zielorientierte Ansichten' },
];

/** Default preserves the long-standing compact rail behaviour. */
export const DEFAULT_NAV_LAYOUT = 'rail';

/**
 * Layout ids from earlier versions. Stored settings are never rewritten
 * eagerly; they are translated whenever they are read.
 *  - 'full'   (expanded labeled sidebar)  → 'tree'
 *  - 'topbar' (horizontal top navigation) → 'mega'
 */
export const LEGACY_NAV_LAYOUTS = { full: 'tree', topbar: 'mega' };

export function isNavLayoutId(value) {
  return NAV_LAYOUTS.some(l => l.id === value);
}

/**
 * Resolve the effective layout: a stored id wins; a legacy id is mapped to
 * its successor; the even older `sidebarExpanded` flag (true → tree)
 * is migrated; anything else falls back to the default. Never throws,
 * never returns an unknown id.
 */
export function resolveNavLayout(value, state) {
  if (isNavLayoutId(value)) return value;
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_NAV_LAYOUTS, value)) {
    return LEGACY_NAV_LAYOUTS[value];
  }
  try {
    if (state && state.settings && state.settings.sidebarExpanded) return 'tree';
  } catch {}
  return DEFAULT_NAV_LAYOUT;
}

/** Effective layout for a state object (missing settings → default). */
export function getNavLayout(state) {
  if (!state || typeof state !== 'object') return DEFAULT_NAV_LAYOUT;
  return resolveNavLayout(state.settings ? state.settings.navLayout : undefined, state);
}

/**
 * Persist a layout choice on the state object. Returns true when applied,
 * false for unknown ids (state left untouched).
 */
export function setNavLayoutSetting(state, id) {
  if (!isNavLayoutId(id)) return false;
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  state.settings.navLayout = id;
  return true;
}
