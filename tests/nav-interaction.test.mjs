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
test('rail expansion and navigation states transition smoothly', () => {
  assert.match(css, /transition:\s*transform 0\.25s cubic-bezier\([^;]+width 0\.22s cubic-bezier/);
  assert.match(css, /\.toc-item \{[^}]*transition: color 0\.16s ease, background-color 0\.16s ease, box-shadow 0\.16s ease/s);
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion remains supported');
});
console.log(`\n${passed} passed, 0 failed`);
