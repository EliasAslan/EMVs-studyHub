/**
 * Tree layout — hierarchical sidebar: subjects → chapters → topics.
 * WAI-ARIA tree pattern: role=tree/treeitem/group, roving tabindex,
 * Arrow keys / Home / End / Enter, aria-expanded on parents.
 * Expanded nodes persist in settings.navTreeOpen.
 */

import { buildNavTree } from '../../utils/navData.js';
import { getNavState } from '../../utils/navigation.js';
import { getCurrentView, getCurrentParams } from '../../views/router.js';
import { openObjectiveHistory } from '../../views/module-objectives.js';
import { esc, getState, goModule, preserveFocus } from './shared.js';

let focusedId = null; // roving-tabindex target

function openSet(state) {
  const raw = state.settings.navTreeOpen;
  return new Set(Array.isArray(raw) ? raw : []);
}

function saveOpen(state, set) {
  state.settings.navTreeOpen = [...set];
  try { window.EMVS.save(); } catch {}
}

/** Where the user is, as tree node ids (subject + chapter). */
function activeIds(state) {
  const nav = getNavState(getCurrentView(), getCurrentParams(), state.settings.currentModuleId);
  if (getCurrentView() !== 'module' || !nav.moduleId) return { subject: nav.moduleId ? `mod:${nav.moduleId}` : null, chapter: null };
  return { subject: `mod:${nav.moduleId}`, chapter: `mod:${nav.moduleId}:${nav.moduleTab}` };
}

function nodeHtml(node, level, open, active) {
  const hasKids = (node.children && node.children.length > 0);
  const expandable = node.type !== 'topic' && (hasKids || node.type === 'subject');
  const isOpen = expandable && open.has(node.id);
  const isActive = node.id === active.chapter || (node.type === 'subject' && node.id === active.subject && !active.chapter);
  const dot = node.type === 'subject'
    ? `<span class="tree-dot" aria-hidden="true" style="background:${esc(node.accent || 'var(--accent)')}"></span>` : '';
  const meta = node.type === 'subject' ? `<span class="tree-meta" aria-label="${node.pct}% gemeistert">${node.pct}%</span>`
    : (node.type === 'chapter' && node.count != null ? `<span class="tree-meta">${node.count}</span>` : '');
  const status = node.type === 'topic' && node.kind === 'objective'
    ? `<span class="tree-status st-${esc(node.status)}" aria-hidden="true"></span>` : '';
  const kids = hasKids && isOpen
    ? `<ul role="group" class="tree-group">${node.children.map(c => nodeHtml(c, level + 1, open, active)).join('')}${node.more ? `<li role="none" class="tree-more">+ ${node.more} weitere</li>` : ''}</ul>` : '';
  return `<li role="none">
    <div class="tree-row tree-${node.type}${isActive ? ' active' : ''}" role="treeitem" data-node="${esc(node.id)}" data-fk="tree:${esc(node.id)}"
      aria-level="${level}" ${expandable ? `aria-expanded="${isOpen}"` : ''} ${isActive ? 'aria-current="page"' : ''}
      tabindex="${node.id === focusedId ? 0 : -1}" style="--lvl:${level}">
      ${expandable ? `<span class="tree-caret" aria-hidden="true">${isOpen ? '▾' : '▸'}</span>` : '<span class="tree-caret" aria-hidden="true"></span>'}
      ${dot}${status}<span class="tree-label">${esc(node.label)}</span>${meta}
    </div>${kids}</li>`;
}

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children && findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

export function render(state) {
  const host = document.getElementById('tree-nav');
  if (!host) return;
  host.hidden = false;
  const tree = buildNavTree(state);
  const open = openSet(state);
  const active = activeIds(state);
  // First use: show where the student currently is. After that the saved
  // state wins, so every branch (including the current one) can be closed.
  if (!Array.isArray(state.settings.navTreeOpen)) {
    if (active.subject) open.add(active.subject);
    if (active.chapter) open.add(active.chapter);
    saveOpen(state, open);
  }
  if (!focusedId || !findNode(tree, focusedId)) focusedId = active.chapter || active.subject || tree[0]?.id || null;

  preserveFocus(host, () => {
    host.innerHTML = tree.length
      ? `<div class="toc-label">Fächer</div>
         <ul class="tree" role="tree" aria-label="Fächer, Kapitel und Themen">${tree.map(n => nodeHtml(n, 1, open, active)).join('')}</ul>`
      : '<p class="sidebar-empty">Noch keine Module — lege oben dein erstes an.</p>';
  });

  const rows = () => [...host.querySelectorAll('.tree-row')];
  host.querySelectorAll('.tree-row').forEach(row => {
    row.addEventListener('click', e => {
      const caret = e.target.closest('.tree-caret');
      if (caret && row.hasAttribute('aria-expanded')) toggle(row.dataset.node, tree);
      else activate(row.dataset.node, tree);
    });
    row.addEventListener('focus', () => { focusedId = row.dataset.node; });
    row.addEventListener('keydown', e => onKey(e, row, rows, tree));
  });
}

function setOpen(id, value) {
  const state = getState();
  const set = openSet(state);
  if (value) set.add(id); else set.delete(id);
  saveOpen(state, set);
  render(state);
}

function toggle(id) {
  setOpen(id, !openSet(getState()).has(id));
}

function activate(id, tree) {
  const node = findNode(tree, id);
  if (!node) return;
  focusedId = id;
  if (node.type === 'subject') {
    const set = openSet(getState()); set.add(id); saveOpen(getState(), set);
    goModule(node.moduleId, 'home');
  } else if (node.type === 'chapter') {
    goModule(node.moduleId, node.tab);
  } else if (node.kind === 'objective') {
    goModule(node.moduleId, 'ziele');
    openObjectiveHistory(node.targetId);
  } else if (node.kind === 'resource') {
    goModule(node.moduleId, 'material');
  } else if (node.kind === 'plan') {
    goModule(node.moduleId, 'plan');
  }
}

function onKey(e, row, rows, tree) {
  const list = rows();
  const i = list.indexOf(row);
  const expandable = row.hasAttribute('aria-expanded');
  const isOpen = row.getAttribute('aria-expanded') === 'true';
  const focusRow = r => { if (r) { r.focus(); } };
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); focusRow(list[i + 1]); break;
    case 'ArrowUp': e.preventDefault(); focusRow(list[i - 1]); break;
    case 'Home': e.preventDefault(); focusRow(list[0]); break;
    case 'End': e.preventDefault(); focusRow(list[list.length - 1]); break;
    case 'ArrowRight':
      e.preventDefault();
      if (expandable && !isOpen) setOpen(row.dataset.node, true);
      else if (expandable && isOpen) focusRow(list[i + 1]);
      break;
    case 'ArrowLeft': {
      e.preventDefault();
      if (expandable && isOpen) { setOpen(row.dataset.node, false); break; }
      const level = Number(row.getAttribute('aria-level'));
      for (let j = i - 1; j >= 0; j--) {
        if (Number(list[j].getAttribute('aria-level')) < level) { focusRow(list[j]); break; }
      }
      break;
    }
    case 'Enter':
    case ' ':
      e.preventDefault();
      activate(row.dataset.node, tree);
      break;
    default:
  }
}

/** Route changed: reveal the current branch, refresh the highlight. */
export function sync(state) {
  const host = document.getElementById('tree-nav');
  if (!host || host.hidden) return;
  const active = activeIds(state);
  const open = openSet(state);
  const before = open.size;
  if (active.subject) open.add(active.subject);
  if (active.chapter) open.add(active.chapter);
  if (open.size !== before) saveOpen(state, open);
  render(state);
}

export function teardown() {
  const host = document.getElementById('tree-nav');
  if (host) { host.hidden = true; host.replaceChildren(); }
}
