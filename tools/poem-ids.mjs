#!/usr/bin/env node
// Every poem has an opaque id, minted once and never derived from a name. Issue #41.
//
//   node tools/poem-ids.mjs           check: every poem file has a well-formed id, no two share one
//   node tools/poem-ids.mjs --mint    give an id to each poem file that has none, then check
//
// Poets' names and poem titles change (the requirement behind #41). The id is the poem's storage
// identity: object keys are built from it, so correcting a name never moves an object. It is a random
// version-4 UUID and carries no information. Do not edit one, reuse one, or build one from anything.
//
// Prints file names and counts only.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { isMain } from './is-main.mjs'
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

if (isMain(import.meta.url)) {
  const dir = fileURLToPath(new URL('../src/poems', import.meta.url))
  if (process.argv.includes('--mint')) {
    const minted = mint(dir)
    console.log(`minted ${minted.length} id(s)${minted.length ? ': ' + minted.join(', ') : ''}`)
  }
  const found = problems(dir)
  for (const message of found) console.error(`poem ids: ${message}`)
  if (found.length) process.exit(1)
  console.log(`poem ids: ${poemFiles(dir).length - Object.keys(PENDING).length} poems have an id, ${Object.keys(PENDING).length} pending`)
}
