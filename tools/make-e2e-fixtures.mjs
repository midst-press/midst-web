#!/usr/bin/env node
// Build synthetic timelapses for the end-to-end tests, named exactly as the application will ask for
// them. Regenerate with: node tools/make-e2e-fixtures.mjs
//
// WHY SYNTHETIC. Poem timelapses are the poets' work and must never enter git. But the tests need
// something for the player to play, and pointing them at the production bucket would make them depend
// on the network, on CloudFront, and on data we do not control -- so a red test would not tell you
// whether the code was broken.
//
// THE SPLIT THAT MAKES THIS WORK: the object NAME is public metadata that is already in this
// repository (author and title, which are printed on the site). The CONTENT is invented. So the
// application asks for a real poem's object name and receives a poem that does not exist.
//
// A SECOND THING THIS BUYS, which was not the original intent: the fixture filenames are computed by
// src/poems/poem-names.js, the same module the app uses. If the slug derivation ever changes, the app
// asks for a name no fixture has and the tests 404. So these tests also guard the naming -- the defect
// that made four poems unreachable in production.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync, crc32 } from 'node:zlib'
import names from '../src/poems/poem-names.js'
import keyScheme from '../src/poems/key-scheme.js'
import poemList from '../src/poems/poem-list.js'
import { canonicalDate, isoPublishDate } from './publish-date.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = join(here, '..')
// The same values the site under test is built with; each parse throws when its variable is missing (#41, #110).
const LIST = poemList.parsePoemList(process.env.MIDST_POEM_LIST)
// The published variant has its own fixtures, so the two servers never share (or delete) each other's files.
// Its poems are named by the list, which records canonical keys, whatever MIDST_KEY_SCHEME says.
const OUT = join(REPO, 'e2e', 'fixtures', LIST === 'published' ? 'published' : 'poems')
const SCHEME = LIST === 'published' ? 'canonical' : keyScheme.parseScheme(process.env.MIDST_KEY_SCHEME)

// Which poems get a fixture. Deliberately few: the tests assert player BEHAVIOUR, and more poems
// would make the suite slower without asking a new question. One plain poem, one whose title
// exercises the slug rules.
const SUBJECTS = ['Margaret_Yapp', 'Madeleine_Mori', 'Jared_Harél', 'Mónica_de_la_Torre']

function currentFormat(snapshots) {
  let previous = ''
  const history = snapshots.map(frame => {
    // C's editor emits HTML without B's line-number attributes.
    const next = frame.content.replace(/ data-line-number="\d+"/g, '')
    let front = 0
    while (front < previous.length && previous[front] === next[front]) front += 1
    let end = 0
    while (end < previous.length - front && end < next.length - front
      && previous[previous.length - end - 1] === next[next.length - end - 1]) end += 1
    const change = {
      inserted: next.slice(front, next.length - end), front, end,
      t: new Date(frame.timestamp).toISOString(),
      pos: frame.lineNumber === '0' ? next.replace(/<[^>]*>/g, '').length + 1 : previous.replace(/<[^>]*>/g, '').length + 3,
    }
    previous = next
    return change
  })
  return `midstVersion: 1\n${JSON.stringify({ text: previous, history })}`
}

// A deterministic typing sequence. The words are nonsense on purpose -- no poem, not even a pastiche
// of one. The player's job is to replay keystrokes; what they spell is irrelevant to that.
const TYPED = 'the quick brown fox'

function frames(text) {
  const out = []
  for (let i = 1; i <= text.length; i += 1) {
    out.push({
      content: `<p data-line-number="0">${text.slice(0, i)}</p>`,
      lineNumber: '0',
      // Fixed epoch so regenerating produces byte-identical fixtures.
      timestamp: 1600000000000 + i * 1000,
    })
  }
  // A second line, so a test can assert more than one paragraph renders.
  out.push({
    content: `<p data-line-number="0">${text}</p><p data-line-number="1">and again</p>`,
    lineNumber: '1',
    timestamp: 1600000000000 + (text.length + 1) * 1000,
  })
  return out
}

// A minimal single-entry zip, written by hand. Avoids a dependency for nine lines of format, and the
// player only ever reads one file out of the archive.
function zipOne(name, body) {
  const nameBuf = Buffer.from(name, 'utf8')
  const data = Buffer.from(body, 'utf8')
  const comp = deflateRawSync(data)
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(comp.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(comp.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42)

  const offset = local.length + nameBuf.length + comp.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + nameBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([local, nameBuf, comp, central, nameBuf, end])
}

rmSync(OUT, { recursive: true, force: true })
let written = 0

// THE PUBLISHED LIST (#110), for the variant built with MIDST_POEM_LIST=published: published.json beside the
// objects, in the shape tools/seed-published.mjs writes. Its order is the REVERSE of SUBJECTS, so a site that
// reads the list shows an order the bundle does not have. One poem has no process note: its entry says null and
// no note file is written, so a site that asks for one anyway gets a 404 the specs see. Metadata only; the
// fixtures' content is invented as for every other fixture.
const publishedEntries = []

// FONTS. The real font files are not in this repository (#55), and the tests must not fall back to
// system fonts without saying so. So every file named in src/font-faces.json gets a SYNTHETIC font:
// three glyphs (a box for every printable ASCII character), family "MidstE2ESynthetic", built with
// fontTools' FontBuilder and saved as TrueType, WOFF and WOFF2. No part of any real typeface. The
// build points MIDST_FONTS_URL at this directory (package.json, e2e:build).
const SYNTHETIC_FONT = {
  ttf: 'AAEAAAAKAIAAAwAgT1MvMkUARHIAAAEoAAAAYGNtYXAAjgHtAAABkAAAAPJnbHlmf3R/cgAAAowAAAA0aGVhZC9UXTIAAACsAAAANmhoZWEFegHEAAAA5AAAACRobXR4AlgAZAAAAYgAAAAIbG9jYQANACcAAAKEAAAACG1heHAABQAGAAABCAAAACBuYW1lRcljQgAAAsAAAAB+cG9zdANqcHoAAANAAAAALAABAAAAAQAAGrqmYV8PPPUAAwPoAAAAAObzDS8AAAAA5vMNLwAyAAACJgH0AAAAAwACAAAAAAAAAAEAAAMg/zgAAAJYADIAMgImAAEAAAAAAAAAAAAAAAAAAAABAAEAAAADAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwJYAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAACAAfgMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAACWAAyAAAAMgAAAAIAAAADAAAAFAADAAEAAAAUAAQA3gAAAAQABAABAAAAfv//AAAAIP//AAAAAQAEAAAAAQACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAANAA0AGgABADIAAAImAfQAAwAAMxEhETIB9AH0/gwAAAEAMgAAAiYB9AADAAAzESERMgH0AfT+DAAAAAAEADYAAQAAAAAAAQARAAAAAQAAAAAAAgAHABEAAwABBAkAAQAiABgAAwABBAkAAgAOADpNaWRzdEUyRVN5bnRoZXRpY1JlZ3VsYXIATQBpAGQAcwB0AEUAMgBFAFMAeQBuAHQAaABlAHQAaQBjAFIAZQBnAHUAbABhAHIAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAADAQIDYm94',
  woff: 'd09GRgABAAAAAAJ8AAoAAAAAA2wAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABPUy8yAAABZAAAAC4AAABgRQBEcmNtYXAAAAGcAAAALwAAAPIAjgHtZ2x5ZgAAAdQAAAAlAAAANH90f3JoZWFkAAAA9AAAADYAAAA2L1RdMmhoZWEAAAEsAAAAHwAAACQFegHEaG10eAAAAZQAAAAIAAAACAJYAGRsb2NhAAABzAAAAAgAAAAIAA0AJ21heHAAAAFMAAAAGAAAACAABQAGbmFtZQAAAfwAAABoAAAAfkXJY0Jwb3N0AAACZAAAABUAAAAsA2pwegABAAAAAQAAGrqmYV8PPPUAAwPoAAAAAObzDS8AAAAA5vMNLwAyAAACJgH0AAAAAwACAAAAAAAAeJxjYGRgYFb4b8HAwBTBYMRgxKTGABRBAYwAPTECRAB4nGNgZGBgYGZgYQDRDAxMDGgAAAEtAAx4nGNgZopgnMDAysDCQBgwInPsgQBIKTDUMSv8t2BgYFZgOIGmXoGBAQDESQT4AAACWAAyAAAAMnicY2BgYGJgYGAGYhEgyQimWRjuAWkWIATx6/7/B5IKYJIRKAYimYYuBADlHAZ5AAAAAA0ADQAaeJxjYGQwYmBgUmP8wsDMwGAsqChoxPiF8cs/HgYGnDIA1vIJ3wAAAHicLYixDkAwFEVPkYhFYjP7hA4Ge0cLXyDaVJPGQA3+3iNOcm/uuUBBj+JF0Xz9klGK5aiikqej/XdGzTAGeyajzXzvaXMprJPzV1wORgKWk4RBS2ZudrENJx1YmWR5LiILxwNpqBOkeJxjYGLAD5hBmJGJOSm/AgADUAFYAAAA',
  woff2: 'd09GMgABAAAAAAFIAAoAAAAAA3AAAAD/AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmAAgXIKOEIBNgIkAwgLCAAEIAV+BywbvwJgHge5GeuSulCWDs17PBT7tbe7p5hHvKomIsmbNUqwHimJyNA58rd2Yhx/Nf9oYZjEx5coTpEgPJDrTv8d8PPzMcq9Q0UaALUFWC0PPMAMI0lvGM8mCY+cfjeqfLBra6EE8KKKRe+lOSQ8XwAtuonCjAV0yzdarcB702BROLR+nb0bCnSQ6GEI0AKBaLWGazSRtgc0Hq0Xefvc8I/j/feqfuHnb3Qjx7bJ9RigJAhOkfNBYbtDAABixWyfUVoCJAAAWvYFCJMIkLomlWj1hWULw2Qac3z1Wg+Y+PpPdIGWL1gvYAJVHcDIpeSboBOgikg015BtToWyIrJe1gMAAA==',
}
const faces = JSON.parse(readFileSync(join(REPO, 'src', 'font-faces.json'), 'utf8'))
mkdirSync(join(OUT, 'fonts'), { recursive: true })
for (const file of new Set(faces.flatMap(face => face.sources.map(source => source.file)))) {
  const extension = file.split('.').pop()
  // .eot is only ever requested by Internet Explorer; it gets the TrueType bytes so the name exists.
  writeFileSync(join(OUT, 'fonts', file), Buffer.from(SYNTHETIC_FONT[extension] || SYNTHETIC_FONT.ttf, 'base64'))
  written += 1
}
for (const subject of SUBJECTS) {
  const meta = JSON.parse(readFileSync(join(REPO, 'src', 'poems', `${subject}.json`), 'utf8'))
  const objects = keyScheme.objectNames(meta, SCHEME) // <- the app's own derivation
  const objectName = objects.timelapse
  const noteName = objects.processNote
  const innerName = objectName.split('/').pop().replace(/\.zip$/, '')

  mkdirSync(join(OUT, dirname(objectName)), { recursive: true })
  writeFileSync(
    join(OUT, objectName),
    zipOne(
      innerName,
      // `meta` is required: real archives carry it, and the player destructures it on load, so a
      // fixture without it crashes the component before anything renders. Schema read from a real
      // archive -- keys and types only, never its content.
      subject === 'Madeleine_Mori' ? currentFormat(frames(TYPED)) : JSON.stringify({
        editorTimelineFrames: frames(TYPED),
        meta: {
          editorDraftMarkers: [],
          // One poem is set in Lato, a face the site serves, so e2e can check a poem's own font loads.
          editorFontFamily: subject === 'Margaret_Yapp' ? 'Lato' : 'Helvetica',
          editorFontSize: 14,
          editorHighestEverDraftNumber: 0,
          editorTitle: 'Untitled',
        },
      }),
    ),
  )
  const hasNote = !(LIST === 'published' && subject === 'Madeleine_Mori')
  if (hasNote) {
    writeFileSync(
      join(OUT, noteName),
      `# Process note (synthetic)\n\nThis text is invented for the end-to-end tests. It is not ${meta.author}'s writing.\n`,
    )
  }
  publishedEntries.unshift({
    poemId: meta.id,
    title: meta.title,
    author: meta.author,
    timelapse: `poems/${objectName}`,
    processNote: hasNote ? `poems/${noteName}` : null,
    publishDate: isoPublishDate(meta.publishDate, meta.id),
    highlighted: meta.highlighted === true,
    date: canonicalDate(meta.date, 'date', meta.id),
    tags: [],
  })
  // A 1x1 transparent GIF standing in for the author photograph. MEDIA_URL points at this same
  // directory, so without it the page 404s and the no-failed-requests assertion trips on noise
  // rather than on anything real.
  const px = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64',
  )
  // The photograph is media, not a poem object: it keeps its author-derived name under both schemes.
  mkdirSync(join(OUT, names.poemFolder(meta)), { recursive: true })
  writeFileSync(join(OUT, `${names.poemFolder(meta)}/${names.authorId(meta.author)}.jpg`), px)
  written += 3
}
if (LIST === 'published') {
  writeFileSync(
    join(OUT, 'published.json'),
    `${JSON.stringify({ version: 1, updated: '2026-01-01T00:00:00.000Z', poems: publishedEntries }, null, 2)}\n`,
  )
  written += 1
}
console.log(`${written} fixture file(s) written under e2e/fixtures/${LIST === 'published' ? 'published' : 'poems'}/`)
console.log(`Poem list: ${LIST}. Key scheme: ${SCHEME}. Names come from src/poems/key-scheme.js, so a change to the naming breaks these tests.`)
