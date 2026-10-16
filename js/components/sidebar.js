/**
 * Sidebar facade — kept for the many views that call renderSidebar()
 * after state changes. All navigation rendering lives in navShell.js,
 * driven by the registry in utils/navConfig.js.
 */

import { renderNavShell, setNavLayout as applyNavLayout } from './navShell.js';
import { getNavLayout } from '../utils/navLayout.js';

export function renderSidebar() {
  renderNavShell();
}

/** Persist a layout choice and apply it immediately (no reload). */
export function setNavLayout(layout) {
  return applyNavLayout(layout);
}

export function isSidebarExpanded() {
  try {
    return getNavLayout(window.EMVS.getState()) === 'full';
  } catch {
    return false;
  }
}

export function setSidebarExpanded(expanded) {
  setNavLayout(expanded ? 'full' : 'rail');
}
