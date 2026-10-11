#!/usr/bin/env node
// Are the poems still reachable?
//
// Needs no credentials: these objects are served to the site, so a HEAD is exactly what a visitor's
// browser does. Publishes poem numbers and status codes ONLY -- never poem content.
//
// This exists because `/poem/december` was unreachable for an unknown length of time and nobody
// found out from the software. The URL the application builds did not match the object that exists:
// the S3 key is NFD (the accent in "Mónica" as a combining mark) and the app generates NFC. A daily
// HEAD would have reported it the day it appeared.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit, env } from 'node:process';
import names from '../src/poems/poem-names.js';
import assets from '../src/poems/asset-fetch.js';

const BASE =
  env.MIDST_ASSETS_URL ?? 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/';
const POEMS = env.MIDST_POEMS_DIR ?? 'src/poems';
const TIMEOUT_MS = Number(env.MIDST_CANARY_TIMEOUT ?? 45000);

// Names come from src/poems/poem-names.js -- the SAME module the application uses. This file used
// to carry a transcribed copy of the slug rules, which meant a canary that could report every poem
// healthy while the site asked for names it had stopped agreeing with. There is now one definition,
// and tools/test-poem-names.mjs pins its output against a committed snapshot.

const rows = [];
// Only PUBLISHED poems: an unpublished one has no object to find, and a canary that carries a
// permanent known failure is a canary people learn to ignore. `order.json` is the display order,
// not a poem.
// Sort by canonical spelling for stable numbers across hosts, but retain actual filenames for reads.
for (const f of readdirSync(POEMS).filter((x) => x.endsWith('.json') && x !== 'order.json')
  .sort((a, b) => a.normalize('NFC') < b.normalize('NFC') ? -1 : a.normalize('NFC') > b.normalize('NFC') ? 1 : 0)) {
  const d = JSON.parse(readFileSync(join(POEMS, f), 'utf8'));
  if (d.published !== true) continue;
  rows.push({
    number: rows.length + 1,
    meta: f,
    author: d.author,
    title: d.title,
    zip: names.timelapseObjectName(d),
    note: names.processNoteObjectName(d),
  });
}

async function head(key) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await assets.fetchAsset(BASE, key, { method: 'HEAD', signal: ac.signal });
    return r.status;
  } catch (e) {
    return e.name === 'AbortError' ? 'TIMEOUT' : e.constructor.name;
  } finally {
    clearTimeout(t);
  }
}

const bad = [];
let ok = 0;
for (const r of rows) {
  const [z, n] = await Promise.all([head(r.zip), head(r.note)]);
  if (z === 200) ok += 1;
  else bad.push({ ...r, status: z, kind: 'timelapse' });
  if (n !== 200) bad.push({ ...r, status: n, kind: 'process note' });
}

console.log(`poems declared in ${POEMS}: ${rows.length}`);
console.log(`timelapses reachable: ${ok}/${rows.length}`);

if (bad.length) {
  console.log(`\nUNREACHABLE (${bad.length}):`);
  for (const b of bad) {
    console.log(`  poem ${b.number}: ${String(b.status).padEnd(9)} ${b.kind}`);
  }
  // A missing process note is a degraded page; a missing timelapse is the poem being gone.
  const fatal = bad.filter((b) => b.kind === 'timelapse');
  console.log(
    `\n${fatal.length} poem(s) unreachable, ${bad.length - fatal.length} process note(s) unreachable.`,
  );
  exit(fatal.length ? 1 : 0);
}
console.log('\nall poems reachable.');
exit(0);
