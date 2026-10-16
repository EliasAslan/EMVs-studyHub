/**
 * Navigation registry — the one list of destinations every presentation
 * (sidebar, rail, workspace, upper bar, dock, mobile) renders from.
 *
 * DOM-free: safe for plain Node tests. Hashes match the router's
 * LEGACY_TO_HASH map so links are real, deep-linkable routes.
 */

import { MODULE_TABS, resolveModuleTab } from './navigation.js';

export const MOBILE_MAX_WIDTH = 780;

/** Primary destinations: always visible in every model. */
export const PRIMARY_DESTINATIONS = [
  { id: 'today', label: 'Heute', short: 'Heute', icon: 'today', hash: '#/heute', shortcut: '1', hint: 'Tagesfokus' },
  { id: 'overview', label: 'Module', short: 'Module', icon: 'modules', hash: '#/module', shortcut: '2', hint: 'Alle Module im Überblick' },
  { id: 'weak-spots', label: 'Schwachstellen', short: 'Schwach', icon: 'weak', hash: '#/schwach', shortcut: '3', badge: 'weak', hint: 'Fällige Wiederholungen' },
  { id: 'exams-global', label: 'Prüfungen', short: 'Prüfungen', icon: 'exam', hash: '#/pruefungen', shortcut: '4', badge: 'exam', hint: 'Alle Termine' },
];

/** Secondary destinations: grouped behind "Mehr" in compact models. */
export const SECONDARY_DESTINATIONS = [
  { id: 'weekly-review', label: 'Wochenreview', short: 'Review', icon: 'review', hash: '#/review', shortcut: '5', group: 'lernen' },
  { id: 'exam-prep', label: 'Prüfungsvorbereitung', short: 'Vorbereitung', icon: 'prep', hash: '#/vorbereitung', shortcut: '8', group: 'lernen' },
  { id: 'mock-exam', label: 'Mock-Prüfung', short: 'Mock', icon: 'timer', hash: '#/mock', group: 'lernen' },
  { id: 'captures', label: 'Alle Erfassungen', short: 'Erfassungen', icon: 'capture', hash: '#/erfassen', group: 'lernen' },
  { id: 'tools', label: 'Werkzeuge', short: 'Werkzeuge', icon: 'tools', hash: '#/werkzeuge', shortcut: '6', group: 'lernen' },
];

/** System destinations: visually separated from study navigation. */
export const SYSTEM_DESTINATIONS = [
  { id: 'settings', label: 'Einstellungen', short: 'Einstellungen', icon: 'settings', hash: '#/einstellungen', shortcut: '7', group: 'system' },
];

export const ALL_DESTINATIONS = [...PRIMARY_DESTINATIONS, ...SECONDARY_DESTINATIONS, ...SYSTEM_DESTINATIONS];

export const MODULE_TAB_ICONS = {
  home: 'home',
  ziele: 'target',
  plan: 'list',
  sessions: 'play',
  material: 'book',
};

const MODULE_TAB_LABELS = {
  home: 'Übersicht',
  ziele: 'Lernziele',
  plan: 'Plan',
  sessions: 'Sitzungen',
  material: 'Material',
};

/** Real hierarchy where a route belongs under another destination. */
const PARENT_OF = {
  module: 'overview',
  'mock-exam': 'exam-prep',
};

export function getDestination(id) {
  return ALL_DESTINATIONS.find(d => d.id === id) || null;
}

export function isSecondaryDestination(id) {
  return SECONDARY_DESTINATIONS.some(d => d.id === id) || SYSTEM_DESTINATIONS.some(d => d.id === id);
}

export function moduleTabHash(moduleId, tab) {
  return `#/modul/${encodeURIComponent(moduleId || '')}/${resolveModuleTab(tab)}`;
}

/**
 * Which destinations are active for a view.
 * - `current`: the destination that IS the page (aria-current="page").
 * - `parent`: the destination the page lives under (highlighted, aria-current="true").
 * - `inSecondary`: true when the active destination sits behind "Mehr".
 */
export function getActiveDestinations(view) {
  const own = getDestination(view) ? view : null;
  const parent = PARENT_OF[view] || null;
  const effective = own || parent;
  return {
    current: own,
    parent,
    inSecondary: !!effective && isSecondaryDestination(effective),
  };
}

/** Is a destination highlighted (current page or its parent) for this view? */
export function isDestinationActive(destId, view) {
  const a = getActiveDestinations(view);
  return destId === a.current || destId === a.parent;
}

/**
 * Contextual orientation for headers and breadcrumbs.
 * Returns { title, crumbs: [{ label, hash }], back: { label, hash } | null }.
 * Primary destinations have no Back (they are roots); everything else
 * goes "up" one level in the real hierarchy, never just history.back().
 */
export function getRouteContext(view, params = {}, state = null) {
  if (view === 'module') {
    const mods = (state && state.modules) || [];
    const mod = mods.find(m => m.id === params.id) || null;
    const tab = resolveModuleTab(params.tab);
    const code = mod ? `Modul ${mod.code}` : 'Modul';
    const modulesCrumb = { label: 'Module', hash: '#/module' };
    const homeCrumb = { label: code, hash: moduleTabHash(params.id, 'home') };
    if (tab === 'home') {
      return { title: code, subtitle: mod ? mod.title : '', crumbs: [modulesCrumb, homeCrumb], back: modulesCrumb };
    }
    const tabLabel = MODULE_TAB_LABELS[tab] || (MODULE_TABS.find(t => t.key === tab) || {}).label || tab;
    return {
      title: tabLabel,
      subtitle: code,
      crumbs: [modulesCrumb, homeCrumb, { label: tabLabel, hash: moduleTabHash(params.id, tab) }],
      back: homeCrumb,
    };
  }
  const dest = getDestination(view);
  if (!dest) return { title: 'EMVS', subtitle: '', crumbs: [], back: null };
  const self = { label: dest.label, hash: dest.hash };
  if (PRIMARY_DESTINATIONS.includes(dest)) {
    return { title: dest.label, subtitle: '', crumbs: [self], back: null };
  }
  const parentId = PARENT_OF[view];
  if (parentId) {
    const p = getDestination(parentId);
    const pc = { label: p.label, hash: p.hash };
    return { title: dest.label, subtitle: '', crumbs: [pc, self], back: pc };
  }
  const home = { label: 'Heute', hash: '#/heute' };
  return { title: dest.label, subtitle: '', crumbs: [self], back: home };
}

/**
 * Presentation actually rendered. Narrow viewports always get the
 * dedicated mobile model; the stored desktop preference is untouched so
 * widening the window restores it.
 */
export function getEffectiveNavLayout(desktopLayout, viewportWidth) {
  if (typeof viewportWidth === 'number' && viewportWidth <= MOBILE_MAX_WIDTH) return 'mobile';
  return desktopLayout;
}
