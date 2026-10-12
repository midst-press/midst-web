#!/usr/bin/env node
// What did the tests execute? Issue #13.
//
//   npm run coverage
//
// runs the unit tests (scripts/coverage-jest-reporter.cjs keeps their raw V8 coverage in
// coverage/unit-raw/), then the e2e suite with MIDST_COVERAGE=1 (e2e/coverage.ts writes Chromium's
// V8 coverage to coverage/raw/), and then this script, which:
//
//   1. maps each layer's V8 data back to src/ through its source maps and writes istanbul JSON
//      (monocart-coverage-reports does the conversion; that is the only part that is not ours);
//   2. checks the positive control in e2e/coverage-control.ts and refuses to report without it;
//   3. prints lines, branches and functions per source file and in total, for three layers:
//      unit-only, e2e-only and combined.
//
// Both layers go through the SAME converter. Jest's own coverage-final.json is not used here: its
// converter counts every source line as a statement, so its maps cannot be merged with these.
//
// NUMBERS ONLY. This prints file paths and counts. It never prints source text, and the raw dumps
// (which hold the built JavaScript) stay in the git-ignored coverage/ directory.
//
// Coverage is what RAN, not what was asserted. The combined figure is reported, never gated on.
//
// Every code file under src/ is listed, so a file no test loads counts as 0% and not as absent.

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { exit } from 'node:process'
import { CoverageReport } from 'monocart-coverage-reports'
import libCoverage from 'istanbul-lib-coverage'
import ts from 'typescript'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(REPO, 'coverage', 'raw')
const DIST = join(REPO, 'dist')
const OUT = join(REPO, 'coverage')
const E2E_JSON = join(OUT, 'e2e-istanbul.json')
const UNIT_RAW = join(REPO, 'coverage', 'unit-raw')
const UNIT_JSON = join(OUT, 'unit-istanbul.json')
const CONTROL = 'e2e/coverage-control.ts'

const isCode = path => /\.(ts|tsx|js|jsx)$/.test(path) && !path.endsWith('.d.ts')
// Tests are not the code under test.
const isTest = path => path.includes('/__tests__/') || /\.test\.[jt]sx?$/.test(path)
const counted = path => path.startsWith('src/') && isCode(path) && !isTest(path)

function fail(message) {
  console.error(`coverage: ${message}`)
  exit(1)
}

// ---- 1. V8 -> istanbul -------------------------------------------------------------------------

if (!existsSync(RAW)) fail('no coverage/raw directory. Run `npm run coverage`, which runs the tests first.')
const rawFiles = readdirSync(RAW).filter(name => name.endsWith('.json'))
if (!rawFiles.length) fail('coverage/raw is empty: no test recorded coverage.')

// A file no test loaded is not in anything that ran, so it is added with zero hits. That holds in each
// layer: a file the unit tests never import counts as 0% in the unit column, not as absent.
// TypeScript is compiled first, with a map back to the original lines, so it can be parsed.
const all = {
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
}

// Paths resolve to src/... in every layer, or a merge treats one file as two.
function load(file) {
  const map = libCoverage.createCoverageMap({})
  for (const [key, data] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
    const path = relative(REPO, key.startsWith('/') ? key : join(REPO, key)).split('\\').join('/')
    map.addFileCoverage({ ...data, path })
  }
  return map
}

async function convert(name, options, lists) {
  const outputDir = join(OUT, name)
  const report = new CoverageReport({ name: `midst-web ${name}`, logging: 'error', outputDir, baseDir: REPO, reports: [['json', { file: 'coverage-final.json' }]], all, ...options })
  for (const list of lists) await report.add(list)
  await report.generate()
  const produced = join(outputDir, 'coverage-final.json')
  if (!existsSync(produced)) fail(`the V8 conversion of the ${name} layer produced no istanbul JSON.`)
  const map = load(produced)
  rmSync(outputDir, { recursive: true, force: true })
  return map
}

// A test that never loaded a script (it set the page content itself) recorded an empty list.
const e2eLists = rawFiles.map(name => JSON.parse(readFileSync(join(RAW, name), 'utf8'))).filter(list => list.length)
const entries = e2eLists.reduce((sum, list) => sum + list.length, 0)
const e2eAll = await convert('e2e', {
  // Only what this build served: not the vendored zip reader, not inline analytics snippets.
  entryFilter: entry => /\/[\w.-]+\.js$/.test(new URL(entry.url).pathname) && existsSync(join(DIST, basename(new URL(entry.url).pathname))),
  sourceFilter: path => counted(path) || path === CONTROL,
  // The server that produced these URLs is gone by now; the maps are still in dist/.
  sourceMapResolver: url => {
    const file = join(DIST, basename(new URL(url).pathname))
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  },
}, e2eLists)

// The unit layer: what Jest's transform ran, per test file, with the transform's own source map.
const unitFiles = existsSync(UNIT_RAW) ? readdirSync(UNIT_RAW).filter(name => name.endsWith('.json')) : []
const unitLists = unitFiles
  .map(name => JSON.parse(readFileSync(join(UNIT_RAW, name), 'utf8')).filter(entry => counted(entry.path) || entry.path === CONTROL).map(entry => ({
    url: `${pathToFileURL(join(REPO, entry.path)).href}.unit.js`,
    source: entry.source.replace(/\n\/\/# sourceMappingURL=.*$/, ''),
    sourceMap: { ...entry.sourceMap, sources: [entry.path] },
    functions: entry.functions,
  })))
  .filter(list => list.length)
const unitAll = unitLists.length ? await convert('unit', { sourceFilter: path => counted(path) || path === CONTROL }, unitLists) : null

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
function control(layer, map, loadedBy) {
  const called = functionHits(map, CONTROL, 'coverageControlCalled')
  const never = functionHits(map, CONTROL, 'coverageControlNeverCalled')
  if (called === undefined || never === undefined) {
    fail(`${layer} positive control missing: ${CONTROL} was not measured. ${loadedBy}`)
  }
  if (!(called > 0)) fail(`${layer} positive control failed: the function the module calls reads as never run. Figures withheld.`)
  if (never !== 0) fail(`${layer} positive control failed: the function nothing calls reads as run. Figures withheld.`)
  return called
}
const called = control('e2e', e2eAll, 'The harness page must be loaded by at least one test.')
const unitCalled = unitAll ? control('unit', unitAll, 'src/__tests__/coverage-control.test.ts must run.') : 0

// ---- 3. three layers, numbers only -------------------------------------------------------------

// Copies, not references: merging into a map changes the file objects it holds.
function only(map) {
  const kept = libCoverage.createCoverageMap({})
  for (const file of map.files()) if (counted(file)) kept.addFileCoverage(JSON.parse(JSON.stringify(map.fileCoverageFor(file).toJSON())))
  return kept
}
const e2e = only(e2eAll)
mkdirSync(OUT, { recursive: true })
writeFileSync(E2E_JSON, JSON.stringify(e2e.toJSON()))
const unit = unitAll ? only(unitAll) : null
if (unit) {
  writeFileSync(UNIT_JSON, JSON.stringify(unit.toJSON()))
}

// The two layers run two different builds of one source file (Jest's transform, Parcel's bundle), and
// each build's source map places the END of a statement, function or branch a little differently.
// The standard merge identifies an item by its exact start and end, so it would count such an item
// twice, once per build, and report a function the unit tests ran as half covered. Where a construct
// BEGINS is the same in both builds, so the e2e item takes the unit item's location when exactly one
// unit item of the same kind begins there. Whatever is left unmatched is counted, and printed.
const begins = [['statementMap', item => item], ['fnMap', item => item.decl], ['branchMap', item => item.loc]]
const at = loc => loc && loc.start ? `${loc.start.line}:${loc.start.column}` : undefined
function alignTo(reference, other) {
  let unmatched = 0
  for (const [prop, where] of begins) {
    const byStart = new Map()
    for (const item of Object.values(reference[prop])) {
      const key = `${item.type || ''}@${at(where(item))}`
      byStart.set(key, byStart.has(key) ? null : item)
    }
    for (const [id, item] of Object.entries(other[prop])) {
      const match = byStart.get(`${item.type || ''}@${at(where(item))}`)
      if (match && (prop !== 'branchMap' || match.locations.length === item.locations.length)) other[prop][id] = JSON.parse(JSON.stringify(match))
      else unmatched += 1
    }
  }
  return unmatched
}
// A file only one layer ran keeps that layer's figures: the other layer holds nothing but zeros for
// it, on a map from yet another build. Only a file both layers ran is merged.
const ran = (layer, file) => Object.values(layer.fileCoverageFor(file).toJSON().s).some(hits => hits > 0)
const copy = (layer, file) => JSON.parse(JSON.stringify(layer.fileCoverageFor(file).toJSON()))
const combined = libCoverage.createCoverageMap({})
let unmatched = 0
let shared = 0
for (const file of e2e.files()) {
  if (!unit || !unit.files().includes(file) || !ran(unit, file)) { combined.addFileCoverage(copy(e2e, file)); continue }
  if (!ran(e2e, file)) { combined.addFileCoverage(copy(unit, file)); continue }
  const merged = libCoverage.createFileCoverage(copy(unit, file))
  const other = copy(e2e, file)
  unmatched += alignTo(merged.toJSON(), other)
  merged.merge(libCoverage.createFileCoverage(other))
  combined.addFileCoverage(merged)
  shared += 1
}
for (const file of unit ? unit.files() : []) if (!combined.files().includes(file)) combined.addFileCoverage(copy(unit, file))

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
if (!unit) console.log('\nunit layer: none recorded (coverage/unit-raw is absent), so combined equals e2e. `npm run coverage` runs the unit tests first.')
else console.log(`\nunit layer: ${unitFiles.length} test files. ${shared} source files ran in both layers; ${unmatched} items could not be matched between the two builds and count once per build.`)
console.log(`positive control: ok in ${unit ? 'both layers' : 'the e2e layer'} (called function ran ${called} time(s) in e2e${unit ? `, ${unitCalled} in unit` : ''}; uncalled function ran 0).`)
console.log('Coverage is what ran, not what was asserted. Reported, not gated.')
