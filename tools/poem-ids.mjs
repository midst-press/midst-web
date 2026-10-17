#!/usr/bin/env node
// Every poem has an opaque id, minted once and never derived from a name. Issue #41.
//
//   node tools/poem-ids.mjs           check: every poem file has a well-formed id, no two share one, and every
//                                     id on the merge base with origin/main is still on one poem file (#65)
//   node tools/poem-ids.mjs --mint    give an id to each poem file that has none, then check
//
// Poets' names and poem titles change (the requirement behind #41). The id is the poem's storage
// identity: object keys are built from it, so correcting a name never moves an object. It is a random
// version-4 UUID and carries no information. Do not edit one, reuse one, or build one from anything.
//
// Prints file names and counts only.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import keyScheme from '../src/poems/key-scheme.js'

// Defined once, beside the code that builds object names from it.
export const ID_SHAPE = keyScheme.ID_SHAPE

// Files that are not poems.
const NOT_POEMS = new Set(['order.json'])

// Poem files deliberately left without an id, each with its reason. An entry here is a decision
// someone still owes; minting an id would make that decision by accident.
export const PENDING = {
  'Annelyse_Gelman_2.json': 'same author and title as Annelyse_Gelman.json; whether it is the same poem is undecided (#41)',
}

export const poemFiles = dir => readdirSync(dir).filter(name => name.endsWith('.json') && !NOT_POEMS.has(name)).sort()

// Every problem found, as messages. An empty list means the ids are sound.
export function problems(dir, pending = PENDING) {
  const found = []
  const owners = new Map()
  const files = poemFiles(dir)
  for (const name of Object.keys(pending)) {
    if (!files.includes(name)) found.push(`${name} is on the pending list but is not a poem file; remove it from the list`)
  }
  for (const name of files) {
    const { id } = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    if (name in pending) {
      if (id !== undefined) found.push(`${name} has an id but is on the pending list; decide it and remove it from the list`)
      continue
    }
    if (id === undefined) found.push(`${name} has no id; run node tools/poem-ids.mjs --mint`)
    else if (typeof id !== 'string' || !ID_SHAPE.test(id)) found.push(`${name} has an id that is not a lower-case version-4 UUID`)
    else if (owners.has(id)) found.push(`${name} has the same id as ${owners.get(id)}`)
    else owners.set(id, name)
  }
  return found
}

// The ids every poem file has now, as id -> file name. Files with no id, a malformed one or a shared one are
// problems() findings, not this function's.
export function currentIds(dir) {
  const ids = new Map()
  for (const name of poemFiles(dir)) {
    const { id } = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    if (typeof id === 'string') ids.set(id, name)
  }
  return ids
}

// An id is the poem's storage identity, so once minted it never changes and never goes (#65). `before` is
// id -> file name on the base. Compared by id, not by file name, so a renamed file keeps its id.
export function idChanges(before, now) {
  const found = []
  for (const [id, name] of before) {
    if (!now.has(id)) found.push(`id ${id} (on ${name} at the base) is on no poem file now; an id never changes and is never removed`)
  }
  return found
}

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

// id -> file name for the poem files at the merge base of HEAD and `base`. Throws, never returns empty, when
// there is no base to compare with: an empty base would pass every change.
export function baseIds(root, base = 'origin/main') {
  let commit
  try {
    commit = git(root, ['merge-base', 'HEAD', base]).trim()
  } catch {
    throw new Error(`no merge base with ${base}: fetch it with its history (CI: fetch-depth 0), or set POEM_IDS_BASE`)
  }
  const ids = new Map()
  const names = git(root, ['ls-tree', '--name-only', `${commit}:src/poems`]).split('\n').filter(Boolean)
  for (const name of names.filter(n => n.endsWith('.json') && !NOT_POEMS.has(n))) {
    const { id } = JSON.parse(git(root, ['show', `${commit}:src/poems/${name}`]))
    if (typeof id === 'string') ids.set(id, name)
  }
  return ids
}

// Adds an id as the first field of each poem file that lacks one, leaving every other byte alone.
export function mint(dir, pending = PENDING, newId = randomUUID) {
  const minted = []
  for (const name of poemFiles(dir)) {
    if (name in pending) continue
    const path = join(dir, name)
    const text = readFileSync(path, 'utf8')
    if (JSON.parse(text).id !== undefined) continue
    if (!text.startsWith('{\n  "')) throw new Error(`${name} does not start as expected; add the id by hand`)
    writeFileSync(path, `{\n  "id": "${newId()}",\n` + text.slice(2))
    minted.push(name)
  }
  return minted
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = fileURLToPath(new URL('../src/poems', import.meta.url))
  if (process.argv.includes('--mint')) {
    const minted = mint(dir)
    console.log(`minted ${minted.length} id(s)${minted.length ? ': ' + minted.join(', ') : ''}`)
  }
  const root = fileURLToPath(new URL('..', import.meta.url))
  const found = [...problems(dir), ...idChanges(baseIds(root, process.env.POEM_IDS_BASE || 'origin/main'), currentIds(dir))]
  for (const message of found) console.error(`poem ids: ${message}`)
  if (found.length) process.exit(1)
  console.log(`poem ids: ${poemFiles(dir).length - Object.keys(PENDING).length} poems have an id, ${Object.keys(PENDING).length} pending`)
}
