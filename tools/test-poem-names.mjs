#!/usr/bin/env node
// Does src/poems/poem-names.js still derive the names that are actually in the bucket?
//
// Two questions, and they are different:
//
//   EQUIVALENCE  does the extracted module agree with the implementation that shipped? The original
//                inline chain from src/store/reducer.ts is reproduced below, verbatim, as a
//                reference. If extracting it changed one character of behaviour, this fires. This
//                arm exists for exactly one commit's worth of confidence and is cheap to keep.
//
//   CHARACTERISATION  do the derived names still match the snapshot? Every object in the bucket was
//                uploaded under a name this code produced, so a changed name is a 403 in
//                production. The snapshot is committed. Changing a rule is allowed; changing it
//                SILENTLY is not.
//
// Run: node tools/test-poem-names.mjs            (verify)
//      node tools/test-poem-names.mjs --update   (re-snapshot, deliberately)
//
// Publishes names and titles only. Never poem content.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit } from 'node:process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const POEMS = join(here, '..', 'src', 'poems')
const SNAPSHOT = join(here, 'poem-names.snapshot.json')

const names = require(join(POEMS, 'poem-names.js'))

// The EQUIVALENCE arm is gone, deliberately. It carried a frozen copy of the original inline
// implementation to prove that extracting it changed nothing -- which it did prove, and that proof
// is recorded in the commit that extracted it. Keeping it afterwards means keeping a known-defective
// implementation as a permanent oracle, so every legitimate fix fails against it. It blocked the
// first real one (the italics defect) within the hour.
//
// The snapshot arm is the durable check and does the job that matters: it reports exactly which URLs
// a change moves, which is the question that decides whether objects need renaming.

// ---- inputs: every poem in the repository, plus titles that exercise each rule ------------------
const metas = readdirSync(POEMS)
  .filter((f) => f.endsWith('.json') && f !== 'order.json')
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(POEMS, f), 'utf8')) }))

// Synthetic cases. Each exists to exercise a rule no real title reaches, so that a change to that
// rule cannot pass unnoticed just because the archive happens not to use it yet.
const SYNTHETIC = [
  { author: 'A B', title: 'trailing dash-' }, //            /-$/
  { author: 'A B', title: 'double  space' }, //             /--/ after space->dash
  { author: 'A B', title: 'a/b/c' }, //                     global slash strip
  { author: 'A B', title: '<i>both</i> tags' }, //          THE DEFECT: documents the stray <i>
  { author: 'A B', title: 'two <i>x</i> and <i>y</i>' }, //  first-occurrence-only replaces
  { author: 'A B', title: 'brace {x} and (y) and #1' }, //  single-occurrence punctuation strips
  { author: 'A B', title: 'smile -:)' }, //                 the -:) rule
  { author: 'A B', title: '{:: inside ::}' }, //            the {:: ::} rules
  { author: 'A B', title: '"quoted"' }, //                  quote strip, applied LAST
  { author: 'Ünïcode Nâme', title: 'accents' }, //          non-ASCII author, untouched by the rules
]

const derived = {}

for (const m of [...metas, ...SYNTHETIC]) {
  const key = m.file || `synthetic: ${m.author} / ${m.title}`
  const got = {
    authorId: names.authorId(m.author),
    poemUrl: names.poemUrl(m.title),
    poemId: names.poemId(m.author, m.title),
    timelapse: names.timelapseObjectName(m),
    processNote: names.processNoteObjectName(m),
  }
  derived[key] = got
}

const total = metas.length + SYNTHETIC.length
console.log(`cases: ${total}  (${metas.length} real, ${SYNTHETIC.length} synthetic)`)

if (argv.includes('--update')) {
  writeFileSync(SNAPSHOT, JSON.stringify(derived, null, 2) + '\n')
  console.log(`snapshot written: ${SNAPSHOT}`)
  exit(0)
}

if (!existsSync(SNAPSHOT)) {
  console.log(`\nNo snapshot at ${SNAPSHOT}. Create it with --update.`)
  exit(1)
}

const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
const changed = []
for (const k of new Set([...Object.keys(snap), ...Object.keys(derived)])) {
  const a = JSON.stringify(snap[k]) ?? '(absent)'
  const b = JSON.stringify(derived[k]) ?? '(absent)'
  if (a !== b) changed.push({ k, was: snap[k], now: derived[k] })
}

if (changed.length) {
  console.log(`\nDERIVED NAMES CHANGED for ${changed.length} poem(s):`)
  for (const c of changed) {
    console.log(`  ${c.k}`)
    console.log(`     was: ${c.was ? c.was.timelapse : '(absent)'}`)
    console.log(`     now: ${c.now ? c.now.timelapse : '(absent)'}`)
  }
  console.log(`
Each line above is an object in the bucket that the site would stop being able to fetch, or start
fetching under a name nothing uploaded. If that is intended, the objects must be renamed (or a
fallback added) and the snapshot updated in the SAME change, with the rename recorded:

    node tools/test-poem-names.mjs --update
`)
  exit(1)
}

console.log(`snapshot matches: ${Object.keys(derived).length} names unchanged.`)
exit(0)
