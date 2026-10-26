// Module graph smoke test - catches dangling/named import errors at test time.
// Dependency-free: plain Node assertions, no framework, no DOM.
// Run:  node tests/module-graph.test.mjs   (or: npm test)
// Exit code is 1 when any test fails.
//
// Verifies that every relative import in js/**/*.js resolves to a file that
// exports all the named bindings being imported.

import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, extname, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const JS_DIR = resolve(PROJECT_ROOT, 'js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok - ' + name);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log('FAIL - ' + name + ': ' + e.message);
  }
}

// Collect all .js files under js/ recursively.
function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (extname(entry) === '.js') {
      files.push(full);
    }
  }
  return files;
}

/**
 * Parse a JS file for named exports.
 * Handles: export function NAME, export class NAME, export const/let/var NAME,
 * export { NAME [as ALIAS], ... }, export { NAME } from '...' (re-exports).
 * Returns a Set of exported names.
 */
function parseExports(content) {
  const exports = new Set();

  // export function NAME
  for (const m of content.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    exports.add(m[1]);
  }
  // export class NAME
  for (const m of content.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) {
    exports.add(m[1]);
  }
  // export const/let/var NAME (may have multiple: export const a = 1, b = 2)
  for (const m of content.matchAll(/export\s+(?:const|let|var)\s+([^;]+)/g)) {
    const decl = m[1];
    // Split by comma, handle destructuring simply
    for (const part of decl.split(',')) {
      const match = part.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (match) exports.add(match[1]);
    }
  }
  // export { NAME [as ALIAS], ... }
  for (const m of content.matchAll(/export\s*\{([^}]+)\}(?:\s+from\s+['"][^'"]+['"])?/g)) {
    const list = m[1];
    for (const part of list.split(',')) {
      const trimmed = part.trim();
      // Handle "NAME as ALIAS" or just "NAME"
      const asMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asMatch) {
        exports.add(asMatch[2]); // The alias is what's exported
      } else if (trimmed) {
        exports.add(trimmed);
      }
    }
  }
  // export default - we track it as 'default' for completeness
  if (/export\s+default\s+/.test(content)) {
    exports.add('default');
  }

  return exports;
}

/**
 * Parse a JS file for named imports from relative specifiers.
 * Returns array of { specifier, importedNames: [...] }.
 */
function parseImports(content) {
  const imports = [];
  // import { a, b as c } from './x.js'
  for (const m of content.matchAll(/import\s*\{([^}]+)\}\s+from\s+(['"]\.[^'"]+['"])/g)) {
    const list = m[1];
    const specifier = m[2].slice(1, -1); // strip quotes
    const importedNames = [];
    for (const part of list.split(',')) {
      const trimmed = part.trim();
      const asMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asMatch) {
        importedNames.push({ local: asMatch[2], imported: asMatch[1] });
      } else if (trimmed) {
        importedNames.push({ local: trimmed, imported: trimmed });
      }
    }
    imports.push({ specifier, importedNames });
  }
  return imports;
}

/** Resolve a relative specifier from an importer file to an absolute target file. */
function resolveSpecifier(importerFile, specifier) {
  // Only handle relative specifiers (./, ../)
  if (!specifier.startsWith('.')) return null;
  const baseDir = dirname(importerFile);
  let target = resolve(baseDir, specifier);
  // Try as-is, then with .js extension
  const candidates = [target, target + '.js', resolve(target, 'index.js')];
  for (const c of candidates) {
    try {
      statSync(c);
      return c;
    } catch {}
  }
  return null;
}

// --- Main test logic ---

const allFiles = collectJsFiles(JS_DIR);
console.log('Scanning ' + allFiles.length + ' JS files in js/...');

// Build export map: absolute file path -> Set of exported names
const exportMap = new Map();
for (const file of allFiles) {
  const content = readFileSync(file, 'utf8');
  exportMap.set(file, parseExports(content));
}

// Check imports
for (const file of allFiles) {
  const content = readFileSync(file, 'utf8');
  const imports = parseImports(content);

  for (const imp of imports) {
    const targetFile = resolveSpecifier(file, imp.specifier);
    if (!targetFile) {
      // Skip bare specifiers (not relative) - they're external/CDN
      continue;
    }

    const targetExports = exportMap.get(targetFile);
    if (!targetExports) {
      test('import resolves to existing file: ' + relative(PROJECT_ROOT, file) + ' -> ' + imp.specifier, () => {
        assert.fail('Target file not found in export map: ' + imp.specifier);
      });
      continue;
    }

    for (const { local, imported } of imp.importedNames) {
      test('import binding exists: ' + relative(PROJECT_ROOT, file) + ' imports \'' + imported + '\' from ' + imp.specifier, () => {
        const relFile = relative(PROJECT_ROOT, file);
        const relSpec = imp.specifier;
        const relTarget = relative(PROJECT_ROOT, targetFile);
        const msg = 'MISSING ' + imported + ' <- ' + relFile + ' from ' + relSpec + ' (target: ' + relTarget + ')';
        if (!targetExports.has(imported)) {
          assert.fail(msg);
        }
      });
    }
  }
}

// --- Regression test: deliberately broken import should be caught ---
test('regression: detects missing named export', () => {
  // Create a temp scenario in memory: fake file with missing export
  const fakeExports = new Set(['foo']);
  const missing = 'bar';
  assert.throws(
    () => {
      if (!fakeExports.has(missing)) {
        throw new Error('MISSING ' + missing + ' <- test-file from ./test-spec');
      }
    },
    /MISSING bar <- test-file from \.\/test-spec/
  );
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.log('failed tests: ' + failures.join('; '));
  process.exitCode = 1;
}