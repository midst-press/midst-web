#!/usr/bin/env node
// Warn about declared-but-unused dependencies. FAIL only on NEW ones.
//
// Why it is built this way: this repository currently has 54 unused dependencies out of 85. A gate
// that failed on all of them would be unmergeable on day one and would be switched off within a
// week, which is worse than having no gate. So:
//
//   in dependency-baseline.json   -> warn, counted, visible in every run
//   in .depcheckrc.yaml ignores   -> silent, and the entry carries a written reason
//   NEITHER                       -> FAIL. A newly added dependency that nothing imports is a
//                                    mistake or a deliberate choice; either way somebody says so.
//
// Deliberate anticipatory additions are fine. They go in the allowlist WITH a reason, which is the
// whole point: the cost is one line of explanation, not a veto.
//
// depcheck has genuine false positives -- bundler plugins loaded by name, CSS-only imports, tools
// invoked through npx. Those belong in the allowlist with the reason stated, not in the baseline.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { argv, exit } from 'node:process';

const UPDATE = argv.includes('--update-baseline');
const BASELINE = 'dependency-baseline.json';

let report;
try {
  const out = execFileSync('npx', ['--no-install', 'depcheck', '--json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  report = JSON.parse(out);
} catch (e) {
  // depcheck exits non-zero WHENEVER it finds anything, so a non-zero exit is not an error.
  // Only an unparseable stdout is.
  const out = e.stdout;
  if (!out) {
    console.error('depcheck produced no output. Is it installed? (npm ci, then retry)');
    console.error(String(e.message).slice(0, 300));
    exit(2);
  }
  try {
    report = JSON.parse(out);
  } catch {
    console.error('depcheck output was not JSON:');
    console.error(String(out).slice(0, 600));
    exit(2);
  }
}

const unused = [...(report.dependencies ?? []), ...(report.devDependencies ?? [])].sort();
const missing = Object.keys(report.missing ?? {}).sort();

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : { unused: [], note: '' };

if (UPDATE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        note:
          'Declared-but-unused dependencies that already existed. Warned about, not blocking. ' +
          'Shrink this list; never grow it. Regenerate with: node tools/check-unused-deps.mjs --update-baseline',
        generated: new Date().toISOString().slice(0, 10),
        unused,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`baseline written: ${unused.length} entr${unused.length === 1 ? 'y' : 'ies'}`);
  exit(0);
}

const known = new Set(baseline.unused ?? []);
const fresh = unused.filter((d) => !known.has(d));
const fixed = [...known].filter((d) => !unused.includes(d)).sort();

if (unused.length) {
  console.log(`\nunused dependencies: ${unused.length} (${known.size} baselined)`);
  for (const d of unused) console.log(`   ${known.has(d) ? 'known ' : 'NEW   '} ${d}`);
}
if (missing.length) {
  console.log(`\nused but NOT declared: ${missing.length}`);
  for (const d of missing) console.log(`   ${d}  <- ${(report.missing[d] ?? [])[0] ?? ''}`);
}
if (fixed.length) {
  console.log(`\nno longer unused -- remove these from ${BASELINE}:`);
  for (const d of fixed) console.log(`   ${d}`);
}

if (fresh.length) {
  console.error(`\nFAIL: ${fresh.length} newly unused dependenc${fresh.length === 1 ? 'y' : 'ies'}:`);
  for (const d of fresh) console.error(`   ${d}`);
  console.error(
    `\nIf nothing imports it, remove it. If it is deliberate -- added in anticipation, loaded by a\n` +
      `bundler by name, or used only from a config file -- add it to .depcheckrc.yaml under "ignores"\n` +
      `WITH a comment saying why. One line of explanation is the whole cost.`,
  );
  exit(1);
}

console.log(
  missing.length
    ? `\nno NEW unused dependencies. ${missing.length} undeclared import(s) above are worth fixing.`
    : `\nno new unused dependencies.`,
);
exit(0);
