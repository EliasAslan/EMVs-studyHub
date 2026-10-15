/**
 * PDF background task tests — full workflow without Ollama, pdf.js or DOM.
 *
 * Dependency-free: plain Node assertions, no framework, no network.
 * Run:  node tests/pdf-tasks.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 *
 * Covers:
 *  - start gate: free / active-block / unreviewed-block / cleared
 *  - full run: extracting → analyzing → merging → done, progress events fire
 *  - concurrent runTask() calls share one promise (no duplicate analyses)
 *  - empty extraction result becomes error 'empty'
 *  - thrown error codes survive onto the task (UI maps them to text)
 *  - cancel mid-run settles as 'cancelled', nothing stored
 *  - retry after error runs again and can succeed
 *  - dismiss clears; committed flag set on commit path
 *  - draft updates replace the result draft
 *  - buildModuleEntities: numbering, junk filtering, resource defaults
 */

import assert from 'node:assert/strict';
import {
  _resetTasksForTests,
  getTask,
  isTaskActive,
  isTaskTerminal,
  fileKeyOf,
  describeStartBlock,
  createTask,
  runTask,
  cancelTask,
  retryTask,
  dismissTask,
  markCommitted,
  updateDraft,
  buildModuleEntities,
  subscribeTask,
} from '../js/services/pdfTasks.js';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  _resetTasksForTests();
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

const tick = () => new Promise(r => setTimeout(r, 0));
const fakeFile = (over = {}) => ({ name: 'skript.pdf', size: 12345, lastModified: 7, ...over });
const ai = { model: 'qwen3:8b', baseUrl: 'http://localhost:11434', numCtx: 8192 };

const okExtract = async (text = 'Text '.repeat(500), pages = 3) => ({ text, pageCount: pages });
const okAnalyze = async () => ({
  objectives: [{ title: 'Erklärt Transaktionen in Datenbanken genau', description: 'ACID im Detail.' }],
  resources: [{ name: 'Skript Kapitel 4', note: '' }],
});

await test('start gate blocks duplicates and guards unreviewed results', async () => {
  assert.equal(describeStartBlock(), null, 'free when empty');
  assert.equal(getTask(), null);
  const t = createTask({ file: fakeFile(), code: 'db1', title: 'Datenbanken', ai });
  assert.equal(t.code, 'DB1', 'code normalized');
  assert.equal(t.status, 'extracting');
  assert.ok(isTaskActive(t));
  assert.equal(describeStartBlock(), 'active', 'running blocks second start');
  // Settle as done without network: inject completed result directly.
  t.status = 'done';
  t.result = { objectives: [{ title: 'Versteht Joins in SQL-Abfragen sicher', description: '' }], resources: [] };
  assert.equal(describeStartBlock(), 'unreviewed', 'done result must be reviewed first');
  markCommitted(t);
  dismissTask();
  assert.equal(getTask(), null);
  assert.equal(describeStartBlock(), null, 'cleared after dismiss');
});

await test('fileKeyOf identifies files, tolerates junk', async () => {
  assert.equal(fileKeyOf(fakeFile()), 'skript.pdf|12345|7');
  assert.notEqual(fileKeyOf(fakeFile()), fileKeyOf(fakeFile({ size: 1 })));
  assert.equal(fileKeyOf(null), '');
  assert.equal(fileKeyOf('nope'), '');
});

await test('full run progresses extracting → analyzing → merging → done', async () => {
  const seen = [];
  const unsub = subscribeTask((t) => { if (t) seen.push(t.status); });
  const t = createTask({ file: fakeFile(), code: '162', title: 'DB', ai });
  const res = await runTask(t, {
    extractFn: async (file, opts) => {
      opts.onProgress({ done: 1, total: 3 });
      opts.onProgress({ done: 3, total: 3 });
      return okExtract();
    },
    analyzeFn: async (text, opts) => {
      opts.onProgress({ phase: 'chunks', done: 0, total: 2 });
      opts.onProgress({ phase: 'chunks', done: 2, total: 2 });
      opts.onProgress({ phase: 'merge', done: 1, total: 1 });
      return okAnalyze();
    },
  });
  unsub();
  assert.equal(res.status, 'done');
  assert.ok(isTaskTerminal(res));
  assert.equal(res.result.objectives.length, 1);
  assert.equal(res.result.objectives[0].title, 'Erklärt Transaktionen in Datenbanken genau');
  for (const s of ['extracting', 'analyzing', 'merging', 'done']) {
    assert.ok(seen.includes(s), `phase ${s} observed, got: ${[...new Set(seen)].join(',')}`);
  }
});

await test('concurrent runTask calls share one analysis', async () => {
  let analyzeCalls = 0;
  const deps = {
    extractFn: okExtract,
    analyzeFn: async () => { analyzeCalls += 1; await tick(); return okAnalyze(); },
  };
  const t = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  const [a, b] = await Promise.all([runTask(t, deps), runTask(t, deps)]);
  assert.equal(a, b, 'same task object');
  assert.equal(analyzeCalls, 1, 'analysis ran exactly once');
  assert.equal(a.status, 'done');
});

await test('empty extraction becomes error "empty"', async () => {
  const t = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  await runTask(t, { extractFn: okExtract, analyzeFn: async () => ({ objectives: [], resources: [] }) });
  assert.equal(t.status, 'error');
  assert.equal(t.error.code, 'empty');
  assert.equal(t.result, null);
});

await test('thrown codes survive: extract failure and analyze failure', async () => {
  const t1 = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  await runTask(t1, {
    extractFn: async () => { throw Object.assign(new Error('pdf-empty'), { code: 'pdf-empty' }); },
    analyzeFn: okAnalyze,
  });
  assert.equal(t1.status, 'error');
  assert.equal(t1.error.code, 'pdf-empty', 'extract code preserved for UI mapping');

  _resetTasksForTests();
  const t2 = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  await runTask(t2, {
    extractFn: okExtract,
    analyzeFn: async () => { throw Object.assign(new Error('model-missing'), { code: 'model-missing' }); },
  });
  assert.equal(t2.status, 'error');
  assert.equal(t2.error.code, 'model-missing');
});

await test('cancel mid-run settles as cancelled', async () => {
  const t = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  const slowAnalyze = (text, opts) => new Promise((_, rej) => {
    opts.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { code: 'aborted' })));
  });
  const p = runTask(t, { extractFn: okExtract, analyzeFn: slowAnalyze });
  await tick();
  await tick();
  assert.ok(isTaskActive(t), 'still running before cancel');
  cancelTask(t);
  await p;
  assert.equal(t.status, 'cancelled');
  assert.equal(t.result, null, 'no partial result kept');
  assert.equal(describeStartBlock(), null, 'cancelled task does not block a new start');
});

await test('retry after error runs again and can succeed', async () => {
  const t = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  await runTask(t, {
    extractFn: async () => { throw Object.assign(new Error('x'), { code: 'unreachable' }); },
    analyzeFn: okAnalyze,
  });
  assert.equal(t.status, 'error');
  await retryTask(t, { extractFn: okExtract, analyzeFn: okAnalyze });
  assert.equal(t.status, 'done');
  assert.equal(t.error, null, 'error cleared on retry');
  assert.equal(t.result.objectives.length, 1);
});

await test('retry while active is a no-op returning the same task', async () => {
  const t = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  const slowAnalyze = (text, opts) => new Promise((_, rej) => {
    opts.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { code: 'aborted' })));
  });
  const p = runTask(t, { extractFn: okExtract, analyzeFn: slowAnalyze });
  await tick();
  const same = await retryTask(t, { extractFn: okExtract, analyzeFn: okAnalyze });
  assert.equal(same, t, 'no second run started');
  cancelTask(t);
  await p;
  assert.equal(t.status, 'cancelled');
});

await test('updateDraft replaces the result draft', async () => {
  const t = createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  t.status = 'done';
  t.result = { objectives: [{ title: 'Alter Titel mit genug Länge', description: '' }], resources: [] };
  updateDraft(t, [{ title: 'Neuer Titel mit genug Länge', description: 'neu', checked: true }], []);
  assert.equal(t.result.objectives.length, 1);
  assert.equal(t.result.objectives[0].title, 'Neuer Titel mit genug Länge');
  updateDraft(null, [], []);
});

await test('buildModuleEntities numbers, filters junk, defaults resources', async () => {
  let n = 0;
  const idFn = () => `id-${n++}`;
  const built = buildModuleEntities(
    { code: ' db1 ', title: ' Datenbanken ' },
    {
      objectives: [
        { title: 'Erklärt die dritte Normalform an Beispielen', description: 'Details.' },
        { title: 'ok' },
        { title: '   ' },
      ],
      resources: [{ name: 'SQL Zoo', note: '' }, { name: 'x' }],
    },
    { now: 1000, idFn },
  );
  assert.equal(built.module.code, 'DB1', 'code normalized');
  assert.equal(built.module.title, 'Datenbanken');
  assert.equal(built.module.id, 'id-0');
  assert.equal(built.objectives.length, 1, 'junk filtered');
  assert.equal(built.objectives[0].number, 1);
  assert.equal(built.objectives[0].moduleId, 'id-0');
  assert.equal(typeof built.objectives[0].status, 'string', 'store fields ensured');
  assert.equal(built.resources.length, 1);
  assert.equal(built.resources[0].notes, 'Aus PDF importiert', 'default note');
  assert.equal(built.resources[0].moduleId, 'id-0');
});

await test('dismiss clears the slot and notifies', async () => {
  let notified = 0;
  subscribeTask(() => { notified += 1; });
  createTask({ file: fakeFile(), code: 'X', title: 'Y', ai });
  dismissTask();
  assert.equal(getTask(), null);
  assert.ok(notified >= 2, 'create + dismiss notified');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
