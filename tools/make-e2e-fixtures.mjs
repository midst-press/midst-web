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

const here = dirname(fileURLToPath(import.meta.url))
const REPO = join(here, '..')
const OUT = join(REPO, 'e2e', 'fixtures', 'poems')

// Which poems get a fixture. Deliberately few: the tests assert player BEHAVIOUR, and more poems
// would make the suite slower without asking a new question. One plain poem, one whose title
// exercises the slug rules.
const SUBJECTS = ['Margaret_Yapp', 'Madeleine_Mori']

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
for (const subject of SUBJECTS) {
  const meta = JSON.parse(readFileSync(join(REPO, 'src', 'poems', `${subject}.json`), 'utf8'))
  const objectName = names.timelapseObjectName(meta) // <- the app's own derivation
  const noteName = names.processNoteObjectName(meta)
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
          editorFontFamily: 'Helvetica',
          editorFontSize: 14,
          editorHighestEverDraftNumber: 0,
          editorTitle: 'Untitled',
        },
      }),
    ),
  )
  writeFileSync(
    join(OUT, noteName),
    `# Process note (synthetic)\n\nThis text is invented for the end-to-end tests. It is not ${meta.author}'s writing.\n`,
  )
  // A 1x1 transparent GIF standing in for the author photograph. MEDIA_URL points at this same
  // directory, so without it the page 404s and the no-failed-requests assertion trips on noise
  // rather than on anything real.
  const px = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64',
  )
  writeFileSync(join(OUT, `${names.poemFolder(meta)}/${names.authorId(meta.author)}.jpg`), px)
  written += 3
}
console.log(`${written} fixture file(s) written under e2e/fixtures/poems/`)
console.log('Names come from src/poems/poem-names.js, so a change to the slug rules breaks these tests.')
