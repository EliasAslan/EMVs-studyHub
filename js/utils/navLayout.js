/**
 * Navigation layouts — registry + settings helpers.
 *
 * DOM-free: no window/document access, safe for plain Node tests.
 * sidebar.js (rendering) and settings.js (selector) consume these so the
 * available layouts, the default, and persistence stay in one place.
 *
 * Layouts (desktop):
 * - 'full': complete sidebar with labels, modules and actions.
 * - 'rail': narrow icon-only rail with tooltips.
 * - 'workspace': narrow global rail plus a secondary module panel.
 * - 'topbar': horizontal bar across the top of the application.
 * - 'dock': floating pill-shaped dock with the primary actions.
 */

export const NAV_LAYOUTS = [
  { id: 'full', group: 'sidebar', label: 'Volle Seitenleiste', hint: 'Labels, Module und Aktionen' },
  { id: 'rail', group: 'sidebar', label: 'Kompakte Icon-Leiste', hint: 'Nur Icons mit Tooltips' },
  { id: 'workspace', group: 'sidebar', label: 'Arbeitsbereich', hint: 'Icon-Leiste plus Modul-Panel' },
  { id: 'topbar', group: 'bar', label: 'Obere Navigation', hint: 'Horizontale Leiste am oberen Rand' },
  { id: 'dock', group: 'bar', label: 'Schwebendes Dock', hint: 'Pillendock mit Hauptaktionen' },
  { id: 'context', group: 'bar', label: 'Kontext-Ansicht', hint: 'Nach Absicht gruppiert: Lernen, Üben, Planen, Wiederholen' },
];

/** Selector groups in Settings: sidebar styles, then the other layouts. */
export const NAV_LAYOUT_GROUPS = [
  { id: 'sidebar', label: 'Seitenleisten' },
  { id: 'bar', label: 'Weitere Layouts' },
];

/** Default preserves the long-standing compact rail behaviour. */
export const DEFAULT_NAV_LAYOUT = 'rail';

export function isNavLayoutId(value) {
  return NAV_LAYOUTS.some(l => l.id === value);
}

/**
 * Resolve the effective layout: a stored id wins; otherwise migrate the
 * legacy `sidebarExpanded` flag (true → full, absent/false → rail);
 * anything else falls back to the default. Never throws, never returns
 * an unknown id.
 */
export function resolveNavLayout(value, state) {
  if (isNavLayoutId(value)) return value;
  try {
    if (state && state.settings && state.settings.sidebarExpanded) return 'full';
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
