/**
 * PDF import + local AI helper tests.
 *
 * Dependency-free: plain Node assertions, no framework, no network.
 * Run:  node tests/pdf-import.test.mjs   (or: npm test)
 * Exit code is 1 when any test fails.
 *
 * Covers:
 *  - chunk splitting (overlap, edges, empty input)
 *  - JSON repair (fences, trailing commas, garbage prefix/suffix)
 *  - extraction normalization (caps, junk filtering, German aliases)
 *  - merge dedupe (keeps longer description, caps totals)
 *  - error classification + German messages
 *  - settings defaults (backwards compatible)
 *  - pdf text guards (meaningfulness, page joining)
 *  - full pipeline with a stubbed chat function (no Ollama needed)
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL,
  defaultLocalAISettings,
  getLocalAISettings,
  classifyConnectionError,
  describeLocalAIError,
  splitIntoChunks,
  repairJson,
  normalizeExtraction,
  mergeExtractions,
  extractObjectivesFromText,
} from '../js/services/localAI.js';
import { joinPageTexts, isTextMeaningful } from '../js/services/pdfExtract.js';

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

await test('settings defaults keep old datasets working', async () => {
  assert.equal(DEFAULT_MODEL, 'qwen3:8b');
  const d = defaultLocalAISettings();
  assert.equal(d.model, 'qwen3:8b');
  assert.equal(d.baseUrl, 'http://localhost:11434');
  assert.equal(getLocalAISettings({}).model, 'qwen3:8b', 'missing settings');
  assert.equal(getLocalAISettings({ settings: {} }).model, 'qwen3:8b', 'missing localAI');
  assert.equal(getLocalAISettings({ settings: { localAI: { model: 'mistral:7b' } } }).model, 'mistral:7b', 'user choice kept');
  assert.equal(getLocalAISettings({ settings: { localAI: { model: 'mistral:7b' } } }).baseUrl, 'http://localhost:11434', 'missing keys defaulted');
  assert.equal(getLocalAISettings({ settings: { localAI: 'nope' } }).model, 'qwen3:8b', 'non-object ignored');
});

await test('splitIntoChunks overlaps and handles edges', async () => {
  assert.deepEqual(splitIntoChunks(''), []);
  assert.deepEqual(splitIntoChunks('   '), []);
  assert.deepEqual(splitIntoChunks('kurz'), ['kurz']);
  const long = 'a'.repeat(3000);
  const chunks = splitIntoChunks(long, 1000, 100);
  assert.ok(chunks.length >= 3, 'splits long text');
  assert.ok(chunks.every(c => c.length <= 1000), 'respects size');
  assert.equal(chunks[1].slice(0, 100), chunks[0].slice(-100), 'overlap continues text');
  assert.ok(splitIntoChunks('x'.repeat(1000), 1000, 100).length === 1, 'exact fit is one chunk');
});

await test('repairJson handles model output quirks', async () => {
  assert.deepEqual(repairJson('{"a": 1}'), { a: 1 });
  assert.deepEqual(repairJson('```json\n{"a": 1}\n```'), { a: 1 }, 'fences stripped');
  assert.deepEqual(repairJson('{"a": 1,}'), { a: 1 }, 'trailing comma repaired');
  assert.deepEqual(repairJson('Hier bitte: {"a": [1, 2,]} ok?'), { a: [1, 2] }, 'prefix/suffix cut');
  await assert.rejects(async () => repairJson(''), /bad-json/, 'empty rejects');
  await assert.rejects(async () => repairJson('kein json hier'), /bad-json/, 'garbage rejects');
});

await test('normalizeExtraction filters junk and caps totals', async () => {
  const n = normalizeExtraction({
    objectives: [
      { title: 'Erklärt die dritte Normalform an einem Beispiel', description: 'Details hier.' },
      { title: 'ok' },
      { title: '' },
      null,
    ],
    resources: [{ name: 'SQL Zoo', note: 'Übungen' }, { name: 'x' }],
  });
  assert.equal(n.objectives.length, 1, 'short/empty dropped');
  assert.equal(n.objectives[0].title, 'Erklärt die dritte Normalform an einem Beispiel');
  assert.equal(n.resources.length, 1);
  // German aliases
  const de = normalizeExtraction({ lernziele: [{ titel: 'Versteht Joins in SQL-Ausdrücken', beschreibung: 'd' }], ressourcen: [{ name: 'Buch XY' }] });
  assert.equal(de.objectives.length, 1);
  assert.equal(de.resources.length, 1);
  // Caps
  const many = { objectives: Array.from({ length: 100 }, (_, i) => ({ title: `Lernziel Nummer ${i} mit genügend Text` })) };
  assert.ok(normalizeExtraction(many).objectives.length <= 40, 'capped');
  assert.deepEqual(normalizeExtraction(null), { objectives: [], resources: [] }, 'null-safe');
  assert.deepEqual(normalizeExtraction('string'), { objectives: [], resources: [] }, 'shape-safe');
});

await test('mergeExtractions dedupes and keeps longer text', async () => {
  const merged = mergeExtractions([
    { objectives: [{ title: 'Erklärt die dritte Normalform', description: 'kurz' }] },
    { objectives: [{ title: 'Erklärt die dritte Normalform!', description: 'eine deutlich längere Beschreibung hier' }] },
    { objectives: [{ title: 'Schreibt SQL-Joins mit approved Textlänge' }] },
  ]);
  assert.equal(merged.objectives.length, 2, 'dedupe by normalized title');
  assert.equal(merged.objectives[0].description, 'eine deutlich längere Beschreibung hier', 'longer wins');
  assert.deepEqual(mergeExtractions([]), { objectives: [], resources: [] });
});

await test('error helpers classify and explain in German', async () => {
  assert.equal(classifyConnectionError({ name: 'AbortError' }), 'timeout');
  assert.equal(classifyConnectionError(new Error('Failed to fetch')), 'unreachable');
  assert.equal(classifyConnectionError(new Error('boom')), 'unknown');
  for (const code of ['unreachable', 'timeout', 'cors', 'model-missing', 'bad-json', 'unknown']) {
    assert.ok(describeLocalAIError(code).length > 10, `${code} explained`);
    assert.ok(!/undefined|null/.test(describeLocalAIError(code)), `${code} clean`);
  }
});

await test('pdf guards join pages and detect scans', async () => {
  assert.equal(joinPageTexts(['Hallo', 'Welt']), '[Seite 1]\nHallo\n\n[Seite 2]\nWelt');
  assert.equal(joinPageTexts([]), '');
  assert.equal(isTextMeaningful('x'.repeat(500), 10), true);
  assert.equal(isTextMeaningful('kurz', 10), false, 'scan-like rejected');
  assert.equal(isTextMeaningful('', 5), false);
  assert.equal(isTextMeaningful('x'.repeat(500), 0), false);
});

await test('pipeline works end-to-end with stubbed model', async () => {
  const stubChat = async () => JSON.stringify({
    objectives: [{ title: 'Erklärt Transaktionen in Datenbanken genau', description: 'ACID im Detail.' }],
    resources: [{ name: 'Skript Kapitel 4', note: '' }],
  });
  const res = await extractObjectivesFromText('Ein '.repeat(2000) + 'langer Text über Datenbanken und Transaktionen. '.repeat(50), { model: 'test' }, { chatFn: stubChat });
  assert.ok(res.objectives.length >= 1, 'objectives extracted');
  assert.equal(res.objectives[0].title, 'Erklärt Transaktionen in Datenbanken genau');
});

await test('pipeline tolerates bad chunks and empty results', async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw new Error('bad-json');
    return JSON.stringify({ objectives: [{ title: 'Versteht Indizes in relationalen Datenbanken' }] });
  };
  const res = await extractObjectivesFromText('Text '.repeat(1500), { model: 'test' }, { chatFn: flaky });
  assert.ok(res.objectives.length >= 1, 'good chunk survives bad chunk');
  const empty = await extractObjectivesFromText('Text '.repeat(1500), { model: 'test' }, { chatFn: async () => '{"objectives": []}' });
  assert.deepEqual(empty.objectives, [], 'empty stays empty, no throw');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed tests: ${failures.join('; ')}`);
  process.exitCode = 1;
}
