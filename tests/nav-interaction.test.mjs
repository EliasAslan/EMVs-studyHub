/** Focused regression checks for navigation interaction and motion. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sidebar = readFileSync(new URL('../js/components/sidebar.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`ok - ${name}`); }

test('native navigation buttons do not manually replay Enter/Space on keydown', () => {
  const start = sidebar.indexOf('function bindModuleSection');
  const end = sidebar.indexOf('/**', start + 10);
  const block = sidebar.slice(start, end);
  assert.ok(block.includes("querySelectorAll('[data-mtab]')"));
  assert.ok(block.includes("querySelectorAll('[data-module-pick]')"));
  assert.ok(!block.includes("addEventListener('keydown'"), 'native buttons must rely on native keyboard activation');
  assert.ok(!block.includes("setAttribute('tabindex', '0')"), 'native buttons already participate in tab order');
});

test('interactive module controls retain native button semantics', () => {
  assert.ok(sidebar.includes('<button type="button" class="mod-current-head'));
  assert.ok(sidebar.includes('<button type="button" class="toc-item" data-mtab='));
  assert.ok(sidebar.includes('<button type="button" class="mod-pick'));
  assert.ok(!sidebar.includes('role="listitem"'), 'buttons should not lose button semantics to listitem role');
});

test('sidebar expansion and navigation states transition smoothly', () => {
  assert.match(css, /transition:\s*transform 0\.25s cubic-bezier\([^;]+width 0\.22s cubic-bezier/);
  assert.match(css, /\.toc-item \{[^}]*transition: color 0\.16s ease, background-color 0\.16s ease, box-shadow 0\.16s ease/s);
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion remains supported');
});

test('global sidebar items are native buttons grouped into destinations and quick actions', () => {
  const htmlPath = new URL('../index.html', import.meta.url);
  const html = readFileSync(htmlPath, 'utf8');
  const nav = html.slice(html.indexOf('<nav class="toc" id="nav-global"'), html.indexOf('</nav>', html.indexOf('<nav class="toc" id="nav-global"')));

  // The 4 primary destinations are native buttons
  for (const view of ['today', 'overview', 'weak-spots', 'exams-global']) {
    assert.match(nav, new RegExp(`<button type="button" class="toc-item" data-view="${view}"`),
      `sidebar destination ${view} must be a native button`);
  }
  assert.ok(!nav.includes('role="listitem"'), 'button items must not wear listitem roles');
  const group = nav.match(/role="group" aria-label="Schnellaktionen"/);
  assert.ok(group, 'quick actions are one announced group');
  assert.ok(nav.includes('class="rail-actions"'), 'quick actions are contained in a group wrapper');
  assert.ok(nav.includes('<span class="toc-lb">Schwachstellen</span>'), 'weak spots label is not abbreviated');
  assert.ok(/<div class="rail-actions" role="group" aria-label="Weitere Bereiche">[\s\S]*id="railMore"/.test(nav),
    'more/mod actions live in their own group');
  const cssText = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
  assert.match(cssText, /\.rail-actions \{[^}]*flex-direction: column/s, 'group wrapper keeps the sidebar column layout');
});

test('layout picker offers tree as recommended with the rest as secondary choices', () => {
  const navLayout = readFileSync(new URL('../js/utils/navLayout.js', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../js/views/settings.js', import.meta.url), 'utf8');
  assert.equal([...navLayout.matchAll(/tier: 'recommended'/g)].length, 1, 'exactly one recommended layout');
  assert.ok(navLayout.includes("id: 'tree', group: 'sidebar', tier: 'recommended'"), 'tree is the recommended layout');
  const ids = [...navLayout.matchAll(/id: '([a-z]+)', group:/g)].map(m => m[1]);
  assert.deepEqual(ids, ['tree', 'mega', 'dock', 'context', 'bento', 'mobile'],
    'registry keeps the six kept layouts for migration');
  assert.ok(!settings.includes('NAV_LAYOUT_TIERS'), 'picker no longer uses NAV_LAYOUT_TIERS (flat list)');
  assert.ok(!settings.includes('NAV_LAYOUT_GROUPS'), 'picker no longer uses NAV_LAYOUT_GROUPS');
});

test('Escape closes exactly the topmost surface, never everything at once', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../js/components/modal.js', import.meta.url), 'utf8');
  const escapeBlock = app.slice(app.indexOf("if (e.key === 'Escape')"), app.indexOf("if (window.EMVS.palette?.isOpen()) return;"));
  assert.ok(escapeBlock.includes('window.EMVS.modal?.isOpen?.()'), 'modal open state is checked first');
  assert.ok(/modal\?\.isOpen[\s\S]*palette\?\.isOpen[\s\S]*more-overlay/.test(escapeBlock),
    'surface priority order is modal → palette → launchpad → more → drawer');
  // focus-menu check removed with Focus layout
  assert.ok(!escapeBlock.includes('focusMenu'), 'focus-menu reference removed with Focus layout');
  assert.ok(/^\s*return;/m.test(escapeBlock), 'each surface close returns early');
  assert.ok(!/closeMore\(.*sidebar|modal\?\.close\(\);\s*\n\s*window\.EMVS\.palette\?\.close\(\)/.test(escapeBlock),
    'closing one surface must not chain the others in the same branch');
  assert.ok(modal.includes('isOpen:'), 'modal exposes its open state for the chain');
});

test('route changes restore keyboard focus into the new view', () => {
  const router = readFileSync(new URL('../js/views/router.js', import.meta.url), 'utf8');
  const renderBlock = router.slice(router.indexOf('function render() {'));
  assert.match(renderBlock, /needsRestore/, 'render checks whether focus lived inside the replaced content');
  assert.match(renderBlock, /previousView !== currentView/, 'restore only happens on real route changes, not refresh');
  assert.match(renderBlock, /page-title, h1/, 'focus lands on the page heading');
  assert.match(renderBlock, /tabindex', '-1'/, 'heading gets focus via tabindex and focus()');
});

test('exactly one aria-current is set per visible navigation surface', () => {
  const router = readFileSync(new URL('../js/views/router.js', import.meta.url), 'utf8');
  const navGlobal = router.slice(router.indexOf("querySelectorAll('#nav-global .toc-item')"),
    router.indexOf("querySelectorAll('.chapter-nav"));
  assert.match(navGlobal, /if \(on\) n\.setAttribute\('aria-current', 'page'\);[\s\S]*else n\.removeAttribute\('aria-current'\);/,
    'sidebar sets aria-current exclusively');
  assert.match(navGlobal, /classList\.toggle\('active', on\)/, 'sidebar toggles active alongside aria-current');
  const tabbar = router.slice(router.indexOf("querySelectorAll('#tabbar .tab[data-route]"), router.indexOf('const backBtn'));
  assert.match(tabbar, /t\.setAttribute\('aria-current', on \? 'page' : 'false'\)/,
    'tabbar/dock keep every item in the tab order, one is page');
});

console.log(`\n${passed} passed, 0 failed`);