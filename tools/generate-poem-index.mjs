#!/usr/bin/env node
// src/poems/index.ts is GENERATED. This writes it, and checks it.
//
// Issue #19, steps 2 and 3.
//
// What it replaces
// ---------------
// index.ts was a hand-maintained TypeScript array of require() calls, and a poem was unpublished by
// COMMENTING OUT ITS LINE. Two things went wrong with that, both observed rather than imagined:
//
//   * Margaret Yapp's metadata sat in the repository and was never added to the array, so git had
//     no record that the newest poem on the site was published at all. Nothing could have noticed.
//   * publication state was expressed in code structure, so it could not be read, queried, or
//     changed by anyone who was not editing TypeScript.
//
// Now: `published` is a field in each poem's own metadata, the display order is data in order.json,
// and index.ts is derived from the two. The checks below are the point of the exercise -- they make
// the Margaret Yapp failure impossible rather than unlikely.
//
// Why the order is DATA and not computed
// --------------------------------------
// Sorting by publishDate was the obvious idea and it is wrong. Measured against the deployed index:
// the newest 24 poems are in strict date order, and the tail is not -- there are 10 genuine
// inversions, and sorting would move 23 of 50 poems by up to 13 positions. That tail order is an
// editorial fact about a published journal, not an accident to be tidied up, so it is recorded
// rather than recomputed.
//
// Run: node tools/generate-poem-index.mjs           verify (what CI and the hook run)
//      node tools/generate-poem-index.mjs --write   regenerate index.ts

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit, env } from 'node:process'

const here = dirname(fileURLToPath(import.meta.url))
// Overridable so the checks below can be exercised against fixtures rather than against the real
// archive. A check nobody has seen fail is a check nobody should rely on.
const POEMS = env.MIDST_POEMS_DIR ?? join(here, '..', 'src', 'poems')
const ORDER = join(POEMS, 'order.json')
const INDEX = join(POEMS, 'index.ts')

const metaFiles = readdirSync(POEMS)
  .filter((f) => f.endsWith('.json') && f !== 'order.json')
  .sort()

const metas = new Map()
for (const f of metaFiles) metas.set(f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(POEMS, f), 'utf8')))

const order = JSON.parse(readFileSync(ORDER, 'utf8')).order

const problems = []

// 1. every poem must SAY whether it is published. A new metadata file with no answer is the
//    Margaret Yapp case, and it fails here rather than being silently absent from the site.
for (const [name, m] of metas) {
  if (typeof m.published !== 'boolean') {
    problems.push(
      `${name}.json has no "published" field (must be true or false). A poem that does not say ` +
        `whether it is published is how the newest poem on the site ended up in no commit.`,
    )
  }
}

const published = [...metas].filter(([, m]) => m.published === true).map(([n]) => n)

// 2. every published poem must have a place in the order
for (const n of published) {
  if (!order.includes(n)) {
    problems.push(`${n}.json is published:true but is not listed in order.json, so it has no place on the page.`)
  }
}

// 3. the order must not name anything that does not exist, or anything unpublished
for (const n of order) {
  if (!metas.has(n)) problems.push(`order.json lists "${n}", which has no ${n}.json.`)
  else if (metas.get(n).published !== true) {
    problems.push(`order.json lists "${n}", which is published:false. Remove it from the order, or publish it.`)
  }
}

// 4. no duplicates in the order
const seen = new Set()
for (const n of order) {
  if (seen.has(n)) problems.push(`order.json lists "${n}" more than once.`)
  seen.add(n)
}

if (problems.length) {
  console.log(`src/poems is not consistent (${problems.length}):\n`)
  for (const p of problems) console.log(`  - ${p}`)
  console.log('')
  exit(1)
}

const generated =
  `// GENERATED FILE -- DO NOT EDIT.\n` +
  `//\n` +
  `// Written by tools/generate-poem-index.mjs from:\n` +
  `//   src/poems/order.json     the display order\n` +
  `//   src/poems/<poem>.json    "published": true | false\n` +
  `//\n` +
  `// To publish or unpublish a poem, change "published" in ITS OWN metadata file -- not here. A\n` +
  `// poem used to be unpublished by commenting out its line in this array, which meant publication\n` +
  `// state was only legible to someone editing TypeScript.\n` +
  `//\n` +
  `// Regenerate:  node tools/generate-poem-index.mjs --write\n` +
  `// A hand edit will fail the pre-commit hook and CI, which compare this file to the generator's\n` +
  `// output. ${published.length} of ${metas.size} poems are published.\n` +
  `\n` +
  `const poems = [\n` +
  order.map((n) => `  require('./${n}.json'),\n`).join('') +
  `]\n` +
  `\n` +
  `export default poems\n`

if (argv.includes('--write')) {
  writeFileSync(INDEX, generated)
  console.log(`wrote ${INDEX}: ${order.length} published of ${metas.size} poems`)
  exit(0)
}

const current = readFileSync(INDEX, 'utf8')
if (current !== generated) {
  console.log(`src/poems/index.ts does not match the generator's output.`)
  console.log(`It is a generated file. Run:  node tools/generate-poem-index.mjs --write`)
  console.log(`\nIf you were trying to publish or unpublish a poem, set "published" in its own`)
  console.log(`metadata file and add or remove it from order.json, then regenerate.`)
  const a = current.split('\n')
  const b = generated.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      console.log(`\nfirst difference, line ${i + 1}:`)
      console.log(`  committed: ${JSON.stringify(a[i])}`)
      console.log(`  generated: ${JSON.stringify(b[i])}`)
      break
    }
  }
  exit(1)
}

console.log(`src/poems/index.ts is current: ${order.length} published of ${metas.size} poems.`)
exit(0)
