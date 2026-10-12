#!/usr/bin/env node
// Fail when a relative import names a file in a different letter case (or Unicode form) than git has it.
//
// Why: the Gitea gate builds on macOS, whose filesystem ignores case and Unicode normalisation, so
// `require('./torrin_a._greathouse')` finds `Torrin_A._Greathouse.json` here and fails on Linux, where
// the site is built for GitHub. This site has shipped that bug once (issue #29).
//
// How: it never asks the filesystem. The names come from `git ls-files`, which are exact bytes on
// every platform, so the verdict is the same on a Mac and on Linux.
//
//   exact match with a tracked file      -> fine
//   matches only after folding case/NFC  -> FAIL, naming the importing file and the tracked name
//   matches nothing tracked              -> not this tool's business (tsc reports unresolved imports;
//                                           a generated or untracked target is legitimate). Counted.
//
// What is read: import / export-from / require() / import() in .ts .tsx .js .jsx .mjs .cjs (found by
// TypeScript's own scanner, not a regular expression), url() and @import in .css, and src= / href= in
// .html. Only relative specifiers (./ or ../). Vendored trees (static/, etc/) are not scanned.
//
// CONTROL, every run: a built-in case with one wrong-case import and one correct import must give
// exactly one finding. If it does not, the detector is broken and the run exits 2 rather than 0.
//
// Usage: node tools/check-import-case.mjs        exit 0 clean, 1 mismatches, 2 the tool could not run
// Prints file paths from this repository only; it never prints file contents.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP = /^(static|etc|node_modules|dist)\//;
// What a bundler or TypeScript may append to a specifier, in the order tried.
const SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
const INDEXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs', '/index.json'];

const fold = (s) => s.normalize('NFC').toLowerCase();

/** Relative specifiers a file refers to. */
export function specifiers(file, text) {
  let found = [];
  if (SCRIPT.test(file)) {
    found = ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);
  } else if (file.endsWith('.css')) {
    for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) found.push(m[2]);
    for (const m of text.matchAll(/@import\s+(['"])([^'"]+)\1/g)) found.push(m[2]);
  } else if (file.endsWith('.html')) {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*(['"])([^'"]+)\1/g)) found.push(m[2]);
  }
  return found.map((s) => s.replace(/[?#].*$/, '')).filter((s) => s.startsWith('./') || s.startsWith('../'));
}

/**
 * Findings for a set of tracked paths. `read(path)` returns a file's text.
 * Returns { mismatches: [{ file, specifier, tracked }], checked, unresolved }.
 */
export function findMismatches(tracked, read) {
  const exact = new Set(tracked);
  const folded = new Map();
  for (const path of tracked) {
    const key = fold(path);
    folded.set(key, [...(folded.get(key) || []), path]);
  }
  const mismatches = [];
  let checked = 0;
  let unresolved = 0;
  for (const file of tracked) {
    if (SKIP.test(file) || !(SCRIPT.test(file) || /\.(css|html)$/.test(file))) continue;
    for (const specifier of specifiers(file, read(file))) {
      checked += 1;
      const base = posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\/$/, '');
      const candidates = [...SUFFIXES, ...INDEXES].map((suffix) => base + suffix);
      if (candidates.some((c) => exact.has(c))) continue;
      const near = candidates.flatMap((c) => folded.get(fold(c)) || []);
      if (near.length) mismatches.push({ file, specifier, tracked: near[0] });
      else unresolved += 1;
    }
  }
  return { mismatches, checked, unresolved };
}

/** The built-in control: one wrong-case import among correct ones must be the only finding. */
export function controlHolds() {
  const files = {
    'src/Thing.ts': 'export const thing = 1',
    'src/other/index.ts': 'export const other = 2',
    'src/right.ts': "import { thing } from './Thing'\nimport { other } from './other'\nexport default [thing, other]",
    'src/wrong.ts': "import { thing } from './thing'\nexport default thing",
  };
  const { mismatches } = findMismatches(Object.keys(files), (f) => files[f]);
  return (
    mismatches.length === 1 &&
    mismatches[0].file === 'src/wrong.ts' &&
    mismatches[0].specifier === './thing' &&
    mismatches[0].tracked === 'src/Thing.ts'
  );
}

function main() {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
  } catch (e) {
    console.error('check-import-case: git ls-files failed, so nothing was checked.');
    exit(2);
  }
  if (!controlHolds()) {
    console.error('check-import-case: CONTROL FAILED. A known wrong-case import was not reported, so a clean result means nothing.');
    exit(2);
  }
  const { mismatches, checked, unresolved } = findMismatches(tracked, (f) => readFileSync(f, 'utf8'));
  for (const m of mismatches) {
    console.error(`${m.file}: imports '${m.specifier}', but git has it as ${m.tracked}`);
  }
  console.log(
    `import case: ${checked} relative imports checked, ${mismatches.length} mismatched, ` +
      `${unresolved} with no tracked target (not judged here); control holds`,
  );
  if (mismatches.length) {
    console.error('\nmacOS resolves these; Linux does not. Spell the import exactly as the file is named.');
    exit(1);
  }
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) main();
