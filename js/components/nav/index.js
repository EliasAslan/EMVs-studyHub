/**
 * Layout chrome orchestrator.
 *
 * sidebar.js owns the classic rail/workspace shell. Everything the newer
 * layouts add (context modes, tree, mega bar, command bar, launchpad,
 * focus handle) is rendered here, each into its own container, so no
 * layout can ever leave debris behind for the next one.
 */

import { getCurrentView, getCurrentParams } from '../../views/router.js';
import { routeTitle } from '../../utils/navigation.js';
import { startTimer } from '../../views/module-sessions.js';
import * as context from './context.js';
import * as tree from './tree.js';
import * as mega from './mega.js';
import * as bento from './bento.js';
import { currentModule, getState } from './shared.js';

const STYLES = { context, tree, mega, bento };
const TOP_STYLES = ['mega', 'bento'];

let activeLayout = null;
let initialized = false;

/** Full (re)render for the active layout; called from renderSidebar(). */
export function renderLayoutChrome(layout, state) {
  activeLayout = layout;
  for (const [id, mod] of Object.entries(STYLES)) {
    if (id !== layout) mod.teardown?.();
  }
  if (!TOP_STYLES.includes(layout)) {
    const top = document.getElementById('topchrome');
    if (top) { top.hidden = true; top.replaceChildren(); delete top.dataset.style; }
  }
  if (layout !== 'bento') bento.closeLaunchpad(false);
  const launch = document.getElementById('mobileLaunch');
  if (launch) launch.hidden = layout !== 'bento';
  STYLES[layout]?.render(state);
  syncMobileHeader(state);
  syncSidebarInert();
}

/** Route changed: refresh active states, close transient UI. */
export function syncLayoutChrome() {
  const state = getState();
  closeTransient();
  STYLES[activeLayout]?.sync?.(state);
  syncMobileHeader(state);
}

/** Close anything that floats over the page (menus, launchpad, drawer). */
export function closeTransient() {
  mega.closeMenus();
  bento.closeLaunchpad(false);
}

/** Contextual mobile header: current section, back, and section action. */
export function syncMobileHeader(state = getState()) {
  const title = document.getElementById('mobileTitle');
  const t = routeTitle(getCurrentView(), getCurrentParams(), state);
  if (title) title.textContent = t.sub ? `${t.title} · ${t.sub}` : t.title;
  const action = document.getElementById('mobileAction');
  if (action) {
    const inModule = getCurrentView() === 'module' && !!currentModule(state);
    action.hidden = !inModule;
  }
}

/**
 * The sidebar doubles as an off-canvas drawer (phones).
 * While it is closed and off-screen its controls must not be reachable by
 * Tab or screen readers, so it is made inert until it opens.
 */
export function syncSidebarInert() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const phone = window.matchMedia && window.matchMedia('(max-width: 780px)').matches;
  const offCanvas = phone || activeLayout === 'mobile';
  const hide = offCanvas && !sidebar.classList.contains('open');
  if (hide) sidebar.setAttribute('inert', ''); else sidebar.removeAttribute('inert');
}

/** One-time wiring: route events, drawer inert state, mobile header actions. */
export function initLayoutChrome() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('emvs:navigated', syncLayoutChrome);

  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.MutationObserver) {
    new MutationObserver(syncSidebarInert).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  }
  if (window.matchMedia) {
    const mq = window.matchMedia('(max-width: 780px)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(syncSidebarInert);
  }

  document.getElementById('mobileAction')?.addEventListener('click', () => {
    const mod = currentModule(getState());
    if (mod) startTimer(mod.id, 25);
  });
  document.getElementById('mobileLaunch')?.addEventListener('click', () => bento.toggleLaunchpad());

  window.EMVS.closeNavChrome = closeTransient;
  window.EMVS.launchpad = {
    open: bento.openLaunchpad, close: bento.closeLaunchpad,
    toggle: bento.toggleLaunchpad, isOpen: bento.isLaunchpadOpen,
  };
  window.EMVS.getLayout = () => activeLayout;
}
