/**
 * Dashboard helpers — pure, DOM-free functions for the module overview.
 *
 * Kept separate from views/overview.js so the logic stays unit-testable in
 * plain Node (overview.js transitively imports router/modal, which need DOM).
 */

/** Demo-seed records are identified by their own id prefix (see cloudSync.js). */
export function isDemoModuleId(id) {
  return typeof id === 'string' && id.startsWith('demo-');
}

export function isDemoModule(m) {
  return !!m && isDemoModuleId(m.id);
}

/**
 * Test/support modules (e.g. "test-sync" from sync testing) must never appear
 * in normal user accounts. Matching is deliberately narrow — an exact code
 * match or an explicit test- prefix / test-sync marker — so genuine user
 * modules are never hidden. Display-only: callers filter the view, the data
 * itself is never deleted or modified.
 */
export function isTestModule(m) {
  if (!m || typeof m !== 'object') return false;
  const code = String(m.code ?? '').trim().toLowerCase();
  const title = String(m.title ?? '').toLowerCase();
  const id = String(m.id ?? '').toLowerCase();
  if (code === 'test-sync' || code === 'testsync') return true;
  if (code.startsWith('test-') || code.startsWith('test_')) return true;
  if (title.includes('test-sync')) return true;
  if (id.startsWith('test-sync') || id.startsWith('test-')) return true;
  return false;
}

/**
 * Split modules into what the dashboard shows by default:
 * - visible: genuine user modules (no demo, no test data)
 * - demo: sample modules, rendered in a clearly labelled separate section
 * - hiddenTests: test/support modules, collapsed behind an opt-in note
 */
export function partitionOverviewModules(modules) {
  const list = Array.isArray(modules) ? modules : [];
  const visible = [];
  const demo = [];
  const hiddenTests = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    if (isTestModule(m)) hiddenTests.push(m);
    else if (isDemoModule(m)) demo.push(m);
    else visible.push(m);
  }
  return { visible, demo, hiddenTests };
}

/** Share of mastered objectives, 0..100 (integer, 0 when there is nothing). */
export function objectiveProgressPercent(done, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
