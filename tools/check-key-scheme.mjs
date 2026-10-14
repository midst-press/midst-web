#!/usr/bin/env node
// Refuse to build without a key scheme. Issue #41.
//
// `npm run build` and `npm start` run this first. MIDST_KEY_SCHEME must be "legacy" or "canonical";
// there is no default, because a build that guessed would ask a bucket for the other scheme's names.
// Under "canonical" every published poem must also have an id, since its object names are built from it.
//
// Prints the scheme and counts only.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import keyScheme from '../src/poems/key-scheme.js'

/** What is wrong with building under `value` from the poem files in `dir`; empty when nothing is. */
export function problems(value, dir) {
  let scheme
  try {
    scheme = keyScheme.parseScheme(value)
  } catch (error) {
    return [error.message]
  }
  if (scheme === 'legacy') return []
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'poems')
  const found = problems(process.env.MIDST_KEY_SCHEME, dir)
  for (const line of found) console.error(`key scheme: ${line}`)
  if (found.length) process.exit(1)
  console.log(`key scheme: ${process.env.MIDST_KEY_SCHEME}`)
}
