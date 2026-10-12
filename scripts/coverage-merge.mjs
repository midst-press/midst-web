#!/usr/bin/env node
// What did the tests execute? Issue #13.
//
//   npm run coverage
//
// runs the e2e suite with MIDST_COVERAGE=1 (e2e/coverage.ts writes Chromium's V8 coverage to
// coverage/raw/) and then this script, which:
//
//   1. maps the V8 data back to src/ through the build's source maps and writes istanbul JSON
//      (monocart-coverage-reports does the conversion; that is the only part that is not ours);
//   2. checks the positive control in e2e/coverage-control.ts and refuses to report without it;
//   3. prints lines, branches and functions per source file and in total, for three layers:
//      unit-only, e2e-only and combined.
//
// NUMBERS ONLY. This prints file paths and counts. It never prints source text, and the raw dumps
// (which hold the built JavaScript) stay in the git-ignored coverage/ directory.
//
// Coverage is what RAN, not what was asserted. The combined figure is reported, never gated on.
//
// Every code file under src/ is listed, so a file no test loads counts as 0% and not as absent.

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exit } from 'node:process'
import { CoverageReport } from 'monocart-coverage-reports'
import libCoverage from 'istanbul-lib-coverage'
import ts from 'typescript'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(REPO, 'coverage', 'raw')
const DIST = join(REPO, 'dist')
const OUT = join(REPO, 'coverage')
const E2E_JSON = join(OUT, 'e2e-istanbul.json')
// Where a unit layer writes its istanbul JSON, when this repository has one (midst-web #14).
const UNIT_JSON = join(OUT, 'unit-istanbul.json')
const CONTROL = 'e2e/coverage-control.ts'

const isCode = path => /\.(ts|tsx|js|jsx)$/.test(path) && !path.endsWith('.d.ts')
const counted = path => path.startsWith('src/') && isCode(path)

function fail(message) {
  console.error(`coverage: ${message}`)
  exit(1)
}

// ---- 1. V8 -> istanbul -------------------------------------------------------------------------

if (!existsSync(RAW)) fail('no coverage/raw directory. Run `npm run coverage`, which runs the tests first.')
const rawFiles = readdirSync(RAW).filter(name => name.endsWith('.json'))
if (!rawFiles.length) fail('coverage/raw is empty: no test recorded coverage.')

const report = new CoverageReport({
  name: 'midst-web e2e',
  logging: 'error',
  outputDir: join(OUT, 'e2e'),
  baseDir: REPO,
  reports: [['json', { file: 'coverage-final.json' }]],
  // Only what this build served: not the vendored zip reader, not inline analytics snippets.
  entryFilter: entry => /\/[\w.-]+\.js$/.test(new URL(entry.url).pathname) && existsSync(join(DIST, basename(new URL(entry.url).pathname))),
  sourceFilter: path => counted(path) || path === CONTROL,
  // The server that produced these URLs is gone by now; the maps are still in dist/.
  sourceMapResolver: url => {
    const file = join(DIST, basename(new URL(url).pathname))
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  },
  // A file no test loaded is not in any bundle the browser ran, so it is added here with zero hits.
  // TypeScript is compiled first, with a map back to the original lines, so it can be parsed.
  all: {
    dir: [join(REPO, 'src')],
    filter: path => counted(relative(REPO, path).split('\\').join('/')),
    transformer: entry => {
      if (!/\.tsx?$/.test(entry.sourcePath)) return
      const out = ts.transpileModule(entry.source, {
        fileName: entry.sourcePath,
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, sourceMap: true, inlineSources: true },
      })
      entry.source = out.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '')
      // TypeScript names the source by its basename; give it the repository path, or the file is
      // reported under a name that matches nothing and silently drops out of the totals.
      entry.sourceMap = { ...JSON.parse(out.sourceMapText), sources: [entry.sourcePath] }
    },
  },
})
let entries = 0
for (const name of rawFiles) {
  const list = JSON.parse(readFileSync(join(RAW, name), 'utf8'))
  // A test that never loaded a script (it set the page content itself) recorded an empty list.
  if (!list.length) continue
  entries += list.length
  await report.add(list)
}
await report.generate()

const produced = join(OUT, 'e2e', 'coverage-final.json')
if (!existsSync(produced)) fail('the V8 conversion produced no istanbul JSON.')

// Paths resolve to src/... in every layer, or a merge treats one file as two.
function load(file) {
  const map = libCoverage.createCoverageMap({})
  for (const [key, data] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
    const path = relative(REPO, key.startsWith('/') ? key : join(REPO, key)).split('\\').join('/')
    map.addFileCoverage({ ...data, path })
  }
  return map
}
const e2eAll = load(produced)

// ---- 2. positive control -----------------------------------------------------------------------

// By declaration line: the bundler renames functions. The coverage build keeps scope hoisting on so
// that each source function is one function in the bundle; without it Parcel adds an unnamed getter
// per export on the same line, which would be counted as a function nobody called.
function functionHits(map, file, name) {
  if (!map.files().includes(file)) return undefined
  const line = readFileSync(join(REPO, file), 'utf8').split('\n').findIndex(text => text.includes(`function ${name}(`)) + 1
  const data = map.fileCoverageFor(file).toJSON()
  const ids = Object.keys(data.fnMap).filter(key => data.fnMap[key].line === line)
  return line === 0 || ids.length !== 1 ? undefined : data.f[ids[0]]
}
const called = functionHits(e2eAll, CONTROL, 'coverageControlCalled')
const never = functionHits(e2eAll, CONTROL, 'coverageControlNeverCalled')
if (called === undefined || never === undefined) {
  fail(`positive control missing: ${CONTROL} was not measured. The harness page must be loaded by at least one test.`)
}
if (!(called > 0)) fail('positive control failed: the function the harness calls reads as never run. Figures withheld.')
if (never !== 0) fail('positive control failed: the function nothing calls reads as run. Figures withheld.')

// ---- 3. three layers, numbers only -------------------------------------------------------------

function only(map) {
  const kept = libCoverage.createCoverageMap({})
  for (const file of map.files()) if (counted(file)) kept.addFileCoverage(map.fileCoverageFor(file))
  return kept
}
const e2e = only(e2eAll)
mkdirSync(OUT, { recursive: true })
writeFileSync(E2E_JSON, JSON.stringify(e2e.toJSON()))
rmSync(join(OUT, 'e2e'), { recursive: true, force: true })

const unit = existsSync(UNIT_JSON) ? only(load(UNIT_JSON)) : null
const combined = libCoverage.createCoverageMap({})
combined.merge(e2e)
if (unit) combined.merge(unit)

const pct = part => part.total === 0 ? '   -  ' : `${part.pct.toFixed(1).padStart(5)}%`
const cells = summary => `${pct(summary.lines)} ${pct(summary.branches)} ${pct(summary.functions)}`
const blank = '   -      -      -  '
function total(map) {
  const summary = libCoverage.createCoverageSummary()
  for (const file of map.files()) summary.merge(map.fileCoverageFor(file).toSummary())
  return summary
}
const row = (map, file) => map && map.files().includes(file) ? cells(map.fileCoverageFor(file).toSummary()) : blank

const files = combined.files().slice().sort()
// A file holding only a comment, types or a bare re-export has no statement to count.
function codeFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? codeFiles(join(dir, item.name))
    : [relative(REPO, join(dir, item.name)).split('\\').join('/')]).filter(counted)
}
const uncounted = codeFiles(join(REPO, 'src')).filter(file => !files.includes(file)).sort()
const width = Math.max(...files.map(file => file.length), 'TOTAL'.length)
const heading = `${'file'.padEnd(width)}  ${'unit: line  branch  func'.padEnd(22)}  ${'e2e: line  branch  func'.padEnd(22)}  combined: line branch func`
console.log(`\nCoverage: what the tests executed (${rawFiles.length} test recordings, ${entries} scripts, ${files.length} source files)\n`)
console.log(heading)
console.log('-'.repeat(heading.length))
for (const file of files) {
  console.log(`${file.padEnd(width)}  ${row(unit, file).padEnd(22)}  ${row(e2e, file).padEnd(22)}  ${row(combined, file)}`)
}
console.log('-'.repeat(heading.length))
console.log(`${'TOTAL'.padEnd(width)}  ${(unit ? cells(total(unit)) : blank).padEnd(22)}  ${cells(total(e2e)).padEnd(22)}  ${cells(total(combined))}`)
if (uncounted.length) console.log(`\nnot counted, no statements (${uncounted.length}): ${uncounted.join(', ')}`)
if (!unit) console.log('\nunit layer: none. This repository has no unit tests yet (midst-web #14), so combined equals e2e.')
console.log(`positive control: ok (called function ran ${called} time(s); uncalled function ran 0).`)
console.log('Coverage is what ran, not what was asserted. Reported, not gated.')
