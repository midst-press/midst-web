#!/usr/bin/env node
// Build the first published list, poems/published.json (#12, #110), from what the site bundles today:
// src/poems/order.json for the reading order and each poem's own metadata. Run once per bucket; after that the
// publisher's page owns the list.
//
//   node tools/seed-published.mjs --staged <dir> --out <file> [--poems <dir>]
//
//   --staged  the stage_poems.py output (midst-infra) for the canonical scheme: every key the list names must
//             be a file there, so the list never points at an object that was not staged.
//   --out     where to write the list. Refused inside a git work tree, and never over an existing file. Upload it
//             with If-None-Match: *, so it cannot replace a list the publisher has already changed.
//   --poems   the metadata directory (default src/poems).
//
// Keys come from key-scheme.js under `canonical`, imported, never restated (#21). Output is counts and opaque
// ids only: a message here can end up in a log, and a poem's name says which poem.
import { createRequire } from 'node:module'
import { closeSync, existsSync, openSync, readFileSync, statSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { argv, exit } from 'node:process'
import { isoPublishDate } from './publish-date.mjs'

const require = createRequire(import.meta.url)
const { objectNames } = require('../src/poems/key-scheme.js')

function arg(name, fallback) {
  const i = argv.indexOf(name)
  if (i === -1) return fallback
  const value = argv[i + 1]
  if (!value || value.startsWith('--')) refuse(`${name} needs a value.`)
  return value
}

function refuse(message) {
  console.error(`seed-published: ${message}`)
  exit(1)
}

function insideGitTree(path) {
  for (let dir = resolve(dirname(path)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return true
    if (dirname(dir) === dir) return false
  }
}

const staged = arg('--staged')
const out = arg('--out')
const poemsDir = arg('--poems', 'src/poems')
if (!staged || !out) refuse('usage: seed-published.mjs --staged <dir> --out <file> [--poems <dir>]')
if (insideGitTree(out)) refuse('--out is inside a git work tree; the list must not be committed anywhere.')

const order = JSON.parse(readFileSync(join(poemsDir, 'order.json'), 'utf8')).order
if (!Array.isArray(order)) refuse('order.json has no "order" list.')

const isFile = path => existsSync(path) && statSync(path).isFile()
const problems = { notPublished: 0, missing: 0, noId: 0, duplicateId: 0, timelapseNotStaged: [] }
const ids = new Set()
const poems = []
let notes = 0

for (const name of new Set(order)) {
  const file = join(poemsDir, `${name}.json`)
  if (!isFile(file)) { problems.missing++; continue }
  const meta = JSON.parse(readFileSync(file, 'utf8'))
  if (meta.published !== true) { problems.notPublished++; continue }
  let keys
  try {
    keys = objectNames(meta, 'canonical')
  } catch {
    problems.noId++
    continue
  }
  if (ids.has(meta.id)) { problems.duplicateId++; continue }
  ids.add(meta.id)
  const timelapse = `poems/${keys.timelapse}`
  const processNote = `poems/${keys.processNote}`
  if (!isFile(join(staged, timelapse))) { problems.timelapseNotStaged.push(meta.id); continue }
  const hasNote = isFile(join(staged, processNote))
  if (hasNote) notes++
  poems.push({
    poemId: meta.id,
    title: meta.title,
    author: meta.author,
    timelapse,
    processNote: hasNote ? processNote : null,
    publishDate: isoPublishDate(meta.publishDate, meta.id),
    highlighted: meta.highlighted === true,
    // Legacy fields the site shows today, carried as they are; the Lambda passes unknown fields through.
    date: meta.date ?? null,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
  })
}

const failures = [
  order.length !== new Set(order).size && `order.json names a poem more than once (${order.length - new Set(order).size}).`,
  problems.missing && `${problems.missing} name(s) in order.json have no metadata file.`,
  problems.notPublished && `${problems.notPublished} poem(s) in order.json are not published:true.`,
  problems.noId && `${problems.noId} published poem(s) have no well-formed id.`,
  problems.duplicateId && `${problems.duplicateId} published poem(s) share an id with another.`,
  problems.timelapseNotStaged.length &&
    `${problems.timelapseNotStaged.length} timelapse(s) are not in --staged: ${problems.timelapseNotStaged.join(', ')}`,
].filter(Boolean)
if (failures.length) refuse(`nothing written.\n  ${failures.join('\n  ')}`)

const list = { version: 1, updated: new Date().toISOString(), poems }
let fd
try {
  fd = openSync(out, 'wx', 0o600)
} catch {
  refuse('--out already exists, or cannot be created; nothing written.')
}
writeSync(fd, `${JSON.stringify(list, null, 2)}\n`)
closeSync(fd)
console.log(`seed-published: ${poems.length} poems in reading order, ${notes} with a process note.`)
