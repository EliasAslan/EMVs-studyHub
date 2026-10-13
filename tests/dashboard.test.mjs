/**
 * Dashboard helper tests (overview partitioning + progress).
 *
 * Dependency-free: plain Node assertions, no framework.
 * Run:  node tests/dashboard.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 *
 * Covers:
 *  - demo modules (demo- id prefix) are separated from user modules
 *  - test/support modules (test-sync and friends) are hidden, narrowly matched
 *  - genuine user modules are never hidden or moved
 *  - partitioning never mutates or deletes input data
 *  - progress percentage edge cases
 */

import assert from 'node:assert/strict';
import {
  isDemoModuleId,
  isDemoModule,
  isTestModule,
  partitionOverviewModules,
  objectiveProgressPercent,
} from '../js/utils/dashboard.js';

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

const userMod = (over = {}) => ({ id: 'm-abc123', code: 'DB1', title: 'Datenbanken', ...over });

await test('isDemoModuleId flags only the demo- prefix', async () => {
  assert.equal(isDemoModuleId('demo-mod-xyz'), true);
  assert.equal(isDemoModuleId('demo-obj1-xyz'), true);
  assert.equal(isDemoModuleId('m-abc123'), false);
  assert.equal(isDemoModuleId(''), false);
  assert.equal(isDemoModuleId(null), false);
  assert.equal(isDemoModuleId(undefined), false);
  assert.equal(isDemoModuleId(42), false);
  assert.equal(isDemoModule('demo-mod-x') && false, false, 'isDemoModule needs an object');
  assert.equal(isDemoModule({ id: 'demo-mod-x' }), true);
  assert.equal(isDemoModule({ id: 'm-1' }), false);
  assert.equal(isDemoModule(null), false);
});

await test('isTestModule matches test-sync narrowly, never real modules', async () => {
  assert.equal(isTestModule({ id: 'a', code: 'test-sync', title: 'whatever' }), true);
  assert.equal(isTestModule({ id: 'a', code: ' TEST-SYNC ', title: '' }), true, 'trims + lowercases');
  assert.equal(isTestModule({ id: 'a', code: 'test-123', title: '' }), true);
  assert.equal(isTestModule({ id: 'a', code: 'DB1', title: 'Sync test-sync notes' }), true, 'title marker');
  assert.equal(isTestModule({ id: 'test-sync-1', code: 'X', title: '' }), true, 'id marker');
  // Genuine modules stay visible:
  assert.equal(isTestModule(userMod()), false);
  assert.equal(isTestModule(userMod({ title: 'Testing the database layer' })), false, 'no substring ambush');
  assert.equal(isTestModule(userMod({ code: 'TEST' })), false, '"TEST" alone is a real code, not test-sync');
  assert.equal(isTestModule(userMod({ code: 'contest' })), false);
  assert.equal(isTestModule(null), false);
  assert.equal(isTestModule('test-sync'), false, 'non-objects never match');
});

await test('partition separates user, demo and test modules', async () => {
  const demo = { id: 'demo-mod-1', code: 'DB1', title: 'Beispielmodul' };
  const test = { id: 't-1', code: 'test-sync', title: 'sync probe' };
  const user = userMod();
  const { visible, demo: demos, hiddenTests } = partitionOverviewModules([user, demo, test]);
  assert.deepEqual(visible, [user]);
  assert.deepEqual(demos, [demo]);
  assert.deepEqual(hiddenTests, [test]);
});

await test('partition keeps every genuine module visible', async () => {
  const mods = [userMod(), userMod({ id: 'm-2', code: '162' }), userMod({ id: 'm-3', code: 'TEST' })];
  const { visible, demo, hiddenTests } = partitionOverviewModules(mods);
  assert.equal(visible.length, 3);
  assert.deepEqual(demo, []);
  assert.deepEqual(hiddenTests, []);
});

await test('partition never mutates or drops input data', async () => {
  const mods = [userMod(), { id: 'demo-mod-1', code: 'DB1', title: 'Demo' }, { id: 't', code: 'test-sync', title: '' }];
  const snapshot = JSON.stringify(mods);
  const { visible, demo, hiddenTests } = partitionOverviewModules(mods);
  assert.equal(visible.length + demo.length + hiddenTests.length, 3, 'nothing deleted, only sorted');
  assert.equal(JSON.stringify(mods), snapshot, 'input untouched');
  assert.deepEqual(partitionOverviewModules(null), { visible: [], demo: [], hiddenTests: [] });
  assert.deepEqual(partitionOverviewModules(undefined), { visible: [], demo: [], hiddenTests: [] });
});

await test('objectiveProgressPercent handles edges', async () => {
  assert.equal(objectiveProgressPercent(0, 0), 0, 'no objectives: 0');
  assert.equal(objectiveProgressPercent(0, 4), 0);
  assert.equal(objectiveProgressPercent(2, 4), 50);
  assert.equal(objectiveProgressPercent(4, 4), 100);
  assert.equal(objectiveProgressPercent(5, 4), 100, 'clamped');
  assert.equal(objectiveProgressPercent(-1, 4), 0, 'clamped');
  assert.equal(objectiveProgressPercent(1, 3), 33);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
