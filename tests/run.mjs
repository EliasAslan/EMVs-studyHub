/**
 * Test runner for EMVS Study Hub.
 *
 * Executes every tests/*.test.mjs file, captures exit codes and output,
 * prints a summary table, and exits non-zero if any test file fails.
 *
 * Test files must be self-sufficient: they exit non-zero on failure.
 * Run: node tests/run.mjs   (or: npm test)
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const TESTS_DIR = resolve(PROJECT_ROOT, 'tests');

function getTestFiles() {
  return readdirSync(TESTS_DIR)
    .filter(f => f.endsWith('.test.mjs'))
    .sort()
    .map(f => resolve(TESTS_DIR, f));
}

async function runTestFile(testFile) {
  return new Promise((resolve) => {
    const child = spawn('node', [testFile], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        file: testFile,
        passed: code === 0,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.on('error', (err) => {
      resolve({
        file: testFile,
        passed: false,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  const testFiles = getTestFiles();

  if (testFiles.length === 0) {
    console.error('No test files found matching tests/*.test.mjs');
    process.exitCode = 1;
    return;
  }

  console.log(`Running ${testFiles.length} test file(s)...\n`);

  const results = [];
  const startTime = Date.now();

  for (const testFile of testFiles) {
    const fileStart = Date.now();
    const result = await runTestFile(testFile);
    result.duration = Date.now() - fileStart;
    results.push(result);

    // Print live result
    const status = result.passed ? 'PASS' : 'FAIL';
    const relativePath = testFile.replace(PROJECT_ROOT + '\\', '').replace(PROJECT_ROOT + '/', '');
    console.log(`  ${status}  ${relativePath}  (${formatDuration(result.duration)})`);

    if (!result.passed) {
      if (result.stdout) console.log(`    stdout: ${result.stdout.split('\n').join('\n    ')}`);
      if (result.stderr) console.log(`    stderr: ${result.stderr.split('\n').join('\n    ')}`);
    }
  }

  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  // Summary table
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total:   ${results.length}`);
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Time:    ${formatDuration(totalDuration)}`);

  if (failed > 0) {
    console.log('\nFailed files:');
    for (const r of results.filter(r => !r.passed)) {
      const relativePath = r.file.replace(PROJECT_ROOT + '\\', '').replace(PROJECT_ROOT + '/', '');
      console.log(`  - ${relativePath} (exit code: ${r.exitCode})`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nAll tests passed.');
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exitCode = 1;
});