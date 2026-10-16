/**
 * Mobile navigation shell tests (bottom tab bar, More sheet, drawer,
 * responsive rules). Parses index.html + css/main.css as text — no DOM,
 * no framework, no dependencies.
 *
 * Run:  node tests/mobile-nav.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 *
 * Covers:
 *  - tabbar: 5 destinations with routes, labels, accessible names, badges
 *  - More sheet: all 6 secondary destinations + close control
 *  - drawer: toggle, sidebar, overlay all present and wired by id
 *  - responsive CSS: breakpoint shows tabbar, hides desktop chrome,
 *    safe-area insets, touch targets, sticky offsets, overflow guards
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}

function mobileBlock() {
  const start = css.indexOf('@media (max-width: 780px)');
  assert.ok(start >= 0, 'mobile breakpoint exists');
  // Slice until the next top-level @media to stay inside the mobile block.
  const rest = css.slice(start + 10);
  const next = rest.search(/@media/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

await test('tabbar covers the 4 primary destinations + capture', async () => {
  assert.ok(html.includes('id="tabbar"'), 'tabbar exists');
  for (const [route, label] of [['today', 'Heute'], ['overview', 'Module'], ['weak-spots', 'Schwach'], ['exams-global', 'Prüfungen']]) {
    const re = new RegExp(`<button[^>]*data-route="${route}"[^>]*aria-label="[^"]+"[^>]*>`);
    assert.ok(re.test(html), `tab ${route} is a labeled button`);
    assert.ok(html.includes(`>${label}<`), `tab label "${label}" rendered`);
  }
  assert.ok(html.includes('id="tabCapture"'), 'capture FAB exists in tabbar');
  assert.ok(/id="tabCapture"[^>]*aria-label="[^"]+"/.test(html), 'capture FAB labeled');
  assert.ok(html.includes('id="badgeWeak"') && html.includes('id="badgeExam"'), 'tab badges present');
});

await test('More sheet holds all secondary destinations', async () => {
  for (const route of ['weekly-review', 'tools', 'exam-prep', 'mock-exam', 'captures', 'settings']) {
    assert.ok(html.includes(`data-route="${route}"`), `more-sheet links ${route}`);
  }
  assert.ok(html.includes('id="more-close"'), 'sheet has a close control');
  assert.ok(html.includes('id="more-overlay"'), 'sheet overlay exists');
});

await test('drawer toggle, sidebar and overlay are all present', async () => {
  assert.ok(html.includes('id="menuBtn"'), 'drawer toggle exists');
  assert.ok(/id="menuBtn"[^>]*aria-controls="sidebar"/.test(html), 'toggle controls the sidebar');
  assert.ok(/id="menuBtn"[^>]*aria-label="[^"]+"/.test(html), 'toggle labeled');
  assert.ok(html.includes('id="sidebar"'), 'sidebar drawer exists');
  assert.ok(html.includes('id="sidebarOverlay"'), 'drawer overlay exists');
  assert.ok(html.includes('class="mobile-header"') || html.includes('mobile-header'), 'mobile header exists');
});

await test('mobile breakpoint shows tabbar and keeps desktop chrome away', async () => {
  const m = mobileBlock();
  assert.ok(/\.tabbar\s*\{\s*display:\s*grid/.test(m), 'tabbar becomes a grid on mobile');
  assert.ok(!/\.menu-btn\s*\{\s*display:\s*none/.test(css), 'drawer toggle is never hidden');
  assert.ok(m.includes('#workspace-panel') && m.includes('display: none !important'), 'workspace panel off on mobile');
  assert.ok(m.includes('#topbar') && m.includes('#dock'), 'topbar/dock rules present on mobile');
  assert.ok(/\.tabbar\s*\{\s*display:\s*none/.test(css), 'tabbar hidden on desktop');
});

await test('safe-area insets, touch targets and sticky offsets', async () => {
  const m = mobileBlock();
  assert.ok(m.includes('env(safe-area-inset-bottom)'), 'bottom safe-area respected');
  assert.ok(m.includes('env(safe-area-inset-top)'), 'top safe-area respected');
  const tabMin = css.match(/\.tab\s*\{[^}]*min-height:\s*(\d+)px/);
  assert.ok(tabMin && Number(tabMin[1]) >= 44, 'tab touch targets >= 44px');
  assert.ok(/\.subtabs\s*\{\s*top:\s*calc\(56px/.test(m), 'module subtabs stick below the mobile header');
  assert.ok(css.includes('.modal-overlay { align-items: flex-end'), 'dialogs become bottom sheets');
});

await test('no horizontal overflow or content hidden behind the bar', async () => {
  assert.ok(/body\s*\{[^}]*overflow-x:\s*hidden/.test(css), 'body clips horizontal overflow');
  assert.ok(/\.main\s*\{[^}]*overflow-x:\s*hidden/.test(css), 'main clips horizontal overflow');
  const pad = mobileBlock().match(/\.page\s*\{[^}]*padding:\s*[^;]*calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)/);
  assert.ok(pad && Number(pad[1]) >= 100, 'page bottom padding clears the tabbar');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
