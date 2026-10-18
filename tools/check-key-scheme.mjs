#!/usr/bin/env node
// Refuse to build without a key scheme or a poem list. Issues #41, #110.
//
// `npm run build` and `npm start` run this first. MIDST_KEY_SCHEME must be "legacy" or "canonical";
// there is no default, because a build that guessed would ask a bucket for the other scheme's names.
// Under "canonical" every published poem must also have an id, since its object names are built from it --
// unless MIDST_POEM_LIST is "published": then the list records each poem's keys, the bundled poem files are
// not what the site shows, and their ids are not this build's concern.
// MIDST_POEM_LIST must be "bundled" or "published"; there is no default either.
//
// Prints the scheme and counts only.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { isMain } from './is-main.mjs'
import keyScheme from '../src/poems/key-scheme.js'
import poemList from '../src/poems/poem-list.js'

/**
 * What is wrong with building under scheme `value` and poem list `list` from the poem files in `dir`; empty when
 * nothing is. `list` has no default: leaving it out is a problem like any other.
 */
export function problems(value, dir, list) {
  const found = []
  let listed
  try {
    listed = poemList.parsePoemList(list)
  } catch (error) {
    found.push(error.message)
  }
  let scheme
  try {
    scheme = keyScheme.parseScheme(value)
  } catch (error) {
    found.push(error.message)
  }
  if (found.length) return found
  // The bundled poem files are only what the site shows under "bundled".
  if (scheme === 'legacy' || listed === 'published') return []
  const missing = readdirSync(dir)
    .filter(name => name.endsWith('.json') && name !== 'order.json')
    .filter(name => {
      const meta = JSON.parse(readFileSync(join(dir, name), 'utf8'))
      return meta.published === true && !(typeof meta.id === 'string' && keyScheme.ID_SHAPE.test(meta.id))
    })
  return missing.length
    ? [`${missing.length} published poem file(s) have no well-formed id, so they have no canonical object names: ${missing.join(', ')}`]
    : []
}

if (isMain(import.meta.url)) {
  const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'poems')
  const found = problems(process.env.MIDST_KEY_SCHEME, dir, process.env.MIDST_POEM_LIST)
  for (const line of found) console.error(`key scheme: ${line}`)
  if (found.length) process.exit(1)
  console.log(`key scheme: ${process.env.MIDST_KEY_SCHEME}; poem list: ${process.env.MIDST_POEM_LIST}`)
}
