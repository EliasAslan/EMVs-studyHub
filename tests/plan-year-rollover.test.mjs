/**
 * Plan item year-rollover boundary tests.
 *
 * Tests the edge case where a plan item from week 52/53 of year N
 * is evaluated in week 1 of year N+1 (and vice versa).
 *
 * Run: node tests/plan-year-rollover.test.mjs
 */

import * as helpers from '../js/utils/helpers.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const origConsoleError = console.error;
console.error = () => {};

// Helper: create a date in a specific ISO week/year
function dateInWeek(week, year) {
  // Get Monday of that week, then add 3 days for Thursday (middle of week)
  const { start } = helpers.getWeekDateRange(week, year);
  const d = new Date(start);
  d.setDate(d.getDate() + 3); // Thursday
  d.setHours(12, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Test: Week 52 of 2025 viewed in Week 1 of 2026 should be a leftover
// ---------------------------------------------------------------------------

test('item from week 52 of 2025 is leftover when viewed in week 1 of 2026', () => {
  const item = { week: 52, year: 2025, done: false, dropped: false, moduleId: 'm1' };
  const now = dateInWeek(1, 2026); // Early Jan 2026 (week 1 of 2026)
  const isLeftover = helpers.isPlanItemLeftover(item, now);
  console.log(`  week 52/2025 item, viewed in week 1/2026: isLeftover=${isLeftover}`);
  // This SHOULD be true (the item's week ended in Dec 2025, we're in Jan 2026)
  // But current bug: it returns false because getPlanItemWeekEnd(52, 2026) gives Dec 2026
  assert(isLeftover === true, 'week 52 item from previous year should be leftover');
});

// ---------------------------------------------------------------------------
// Test: Week 1 of 2026 viewed in Week 1 of 2026 should NOT be a leftover
// ---------------------------------------------------------------------------

test('item from week 1 of 2026 is NOT leftover when viewed in week 1 of 2026', () => {
  const item = { week: 1, year: 2026, done: false, dropped: false, moduleId: 'm1' };
  const now = dateInWeek(1, 2026);
  const isLeftover = helpers.isPlanItemLeftover(item, now);
  console.log(`  week 1/2026 item, viewed in week 1/2026: isLeftover=${isLeftover}`);
  assert(isLeftover === false, 'current week item should not be leftover');
});

// ---------------------------------------------------------------------------
// Test: Week 2 of 2026 viewed in Week 1 of 2026 should NOT be a leftover
// ---------------------------------------------------------------------------

test('item from week 2 of 2026 is NOT leftover when viewed in week 1 of 2026', () => {
  const item = { week: 2, year: 2026, done: false, dropped: false, moduleId: 'm1' };
  const now = dateInWeek(1, 2026);
  const isLeftover = helpers.isPlanItemLeftover(item, now);
  console.log(`  week 2/2026 item, viewed in week 1/2026: isLeftover=${isLeftover}`);
  assert(isLeftover === false, 'future week item should not be leftover');
});

// ---------------------------------------------------------------------------
// Test: Week 52 of 2025 viewed in Week 52 of 2025 should NOT be a leftover (still current week)
// ---------------------------------------------------------------------------

test('item from week 52 of 2025 is NOT leftover when viewed in week 52 of 2025', () => {
  const item = { week: 52, year: 2025, done: false, dropped: false, moduleId: 'm1' };
  const now = dateInWeek(52, 2025);
  const isLeftover = helpers.isPlanItemLeftover(item, now);
  console.log(`  week 52/2025 item, viewed in week 52/2025: isLeftover=${isLeftover}`);
  assert(isLeftover === false, 'current week item should not be leftover');
});

// ---------------------------------------------------------------------------
// Test: Week 53 (if exists) edge case - week 53 of 2025 = week 1 of 2026 (same dates)
// ---------------------------------------------------------------------------

test('item from week 53 of 2025 is NOT leftover when viewed in week 1 of 2026 (same week)', () => {
  const item = { week: 53, year: 2025, done: false, dropped: false, moduleId: 'm1' };
  const now = dateInWeek(1, 2026);
  const isLeftover = helpers.isPlanItemLeftover(item, now);
  console.log(`  week 53/2025 item, viewed in week 1/2026: isLeftover=${isLeftover}`);
  // Week 53 of 2025 = Week 1 of 2026 (same date range), so NOT a leftover
  assert(isLeftover === false, 'week 53 of prev year = week 1 of current year, not leftover');
});

console.error = origConsoleError;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}