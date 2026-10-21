import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
// Bare specifiers, not `node:fs`: this repository pins @types/node 12.12.42 (see e2e/poem-plays.spec.ts).
import { closeSync, createReadStream, createWriteStream, openSync, readFileSync, readSync, statSync, writeFileSync, mkdirSync, unlinkSync, writeSync } from 'fs'
import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import { dirname, join } from 'path'
import * as zlib from 'zlib'
import names from '../src/poems/poem-names.js'
import keyScheme from '../src/poems/key-scheme.js'

// SIZE LIMITS (midst-editor #34): how long a poem the web player copes with. Opt-in and run by hand, never by CI:
// with MIDST_SIZE_FILE unset the whole file is skipped. tools/size_search.mjs in midst-format drives it over
// generated poems of halving length.
//
//   MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled MIDST_SIZE_FILE=/path/poem.midst MIDST_SIZE_RESULT=/path/result.json \
//     npx playwright test e2e/size-limits.spec.ts
//
// The .midst is zipped (outside the repository, next to the result) and served from a throwaway local server; the
// request for one bundled poem's timelapse is pointed at it, so the player loads it exactly as it loads a poem from
// MIDST_POEMS_URL. It measures and writes ONE JSON object to MIDST_SIZE_RESULT; thresholds are applied by the driver.
//
// WHAT THE TIMESTAMPS BRACKET. Load: from just before page.goto to the poll that finds the editor's last paragraph
// ending with the file's last 30 characters (so zip download, inflate, parse and first render are all in it). Play:
// the timeline slider's value sampled every 25 ms in the page while playing. Scrub: from the input event (taken
// immediately before the page dispatches it) to the first DOM mutation in the player ("dom"), and to the first timer
// after the next animation frame ("screen", an approximation of paint with no compositor timing).

test.skip(!process.env.MIDST_SIZE_FILE, 'size-limit measurement is opt-in: set MIDST_SIZE_FILE and MIDST_SIZE_RESULT')

const LOAD_TIMEOUT = 300_000
const PLAY_TIMEOUT = 120_000
const SCRUB_TIMEOUT = 60_000
const PLAY_SECONDS = 6
// MidstPlayer.tsx DEFAULT_FPS (11 fps, GitHub #89, midst-web #327): the size-limit
// run measures at the default rate and records SET_FPS beside achievedFps, so it
// must move whenever DEFAULT_FPS does (clement-7074f29f, review of #328).
const SET_FPS = 11
const SCRUB_POSITIONS = [0.5, 0.1, 0.9, 0.3, 0.7, 0.2]
const SUBJECT = 'Madeleine_Mori'

type Failure = { step: string, reason: string }

// zlib.crc32 is newer than the pinned @types/node.
const crc32: (data: Buffer, value?: number) => number = (zlib as any).crc32
const createDeflateRaw = zlib.createDeflateRaw

// Rejects after `ms` unless `p` settles first; the timer is cleared either way, so no rejection is left unobserved.
async function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(what)), ms) })])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const dist = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const at = (q: number) => (s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : NaN)
  return { n: s.length, p50: at(0.5), p95: at(0.95), max: s.length ? s[s.length - 1] : NaN }
}

// The poem's last non-empty paragraph's last 30 characters, from the head of the file (`text` is written first).
function lastTail(file: string): { tail: string, chars: number } {
  const fd = openSync(file, 'r')
  try {
    const chunk = Buffer.alloc(8 << 20)
    const parts: Buffer[] = []
    let seen = ''
    let pos = 0
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, pos)
      if (n === 0) throw new Error('no "history" key found in the file')
      pos += n
      parts.push(Buffer.from(chunk.subarray(0, n)))
      seen += chunk.toString('latin1', 0, n)
      const k = seen.indexOf('","history":')
      if (k !== -1) {
        const bytes = Buffer.concat(parts)
        const text = JSON.parse(`${bytes.subarray(seen.indexOf('{'), k + 1).toString('utf8')}}`).text as string
        const plain = text.split('</p>')
          .map(p => p.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
          .filter(p => p.length > 0)
        const last = plain[plain.length - 1] || ''
        return { tail: last.slice(-30), chars: plain.join('').length }
      }
    }
  } finally {
    closeSync(fd)
  }
}

// A one-entry zip written by streaming (the file may be a gigabyte): local header with sizes patched afterwards.
async function zipFile(name: string, src: string, dest: string): Promise<void> {
  const nameBuf = Buffer.from(name, 'utf8')
  const fd = openSync(dest, 'w')
  const local = Buffer.alloc(30 + nameBuf.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 8)
  local.writeUInt16LE(nameBuf.length, 26)
  nameBuf.copy(local, 30)
  writeSync(fd, local, 0, local.length, 0)
  closeSync(fd)
  let crc = 0
  let size = 0
  let comp = 0
  const deflate = createDeflateRaw({ level: 1 })
  const reader = createReadStream(src)
  reader.on('data', (c: Buffer | string) => {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c)
    crc = crc32(b, crc)
    size += b.length
  })
  await new Promise<void>((resolve, reject) => {
    const sink = createWriteStream(dest, { flags: 'r+', start: local.length })
    deflate.on('data', (c: Buffer) => { comp += c.length })
    reader.on('error', reject)
    deflate.on('error', reject)
    sink.on('error', reject)
    sink.on('finish', () => resolve())
    reader.pipe(deflate).pipe(sink)
  })
  if (size >= 0xffffffff || comp >= 0xffffffff) throw new Error(`file too large for a zip32 entry (${size} bytes)`)
  const central = Buffer.alloc(46 + nameBuf.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(crc >>> 0, 16)
  central.writeUInt32LE(comp, 20)
  central.writeUInt32LE(size, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  nameBuf.copy(central, 46)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(local.length + comp, 16)
  const fd2 = openSync(dest, 'r+')
  // Patch the local header's crc and sizes, then append the central directory and the end record.
  const patch = Buffer.alloc(12)
  patch.writeUInt32LE(crc >>> 0, 0)
  patch.writeUInt32LE(comp, 4)
  patch.writeUInt32LE(size, 8)
  writeSync(fd2, patch, 0, 12, 14)
  writeSync(fd2, Buffer.concat([central, end]), 0, central.length + end.length, local.length + comp)
  closeSync(fd2)
}

test('size limits: load, play, scrub', async ({ page, baseURL }) => {
  test.setTimeout(60 * 60_000)
  const FILE = process.env.MIDST_SIZE_FILE as string
  const RESULT = process.env.MIDST_SIZE_RESULT
  if (!RESULT) throw new Error('MIDST_SIZE_RESULT is not set: nowhere to write the measurements')
  mkdirSync(dirname(RESULT), { recursive: true })

  const fileBytes = statSync(FILE).size
  const { tail, chars } = lastTail(FILE)
  const meta = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', `${SUBJECT}.json`), 'utf8'))
  const objectName: string = keyScheme.objectNames(meta, keyScheme.parseScheme(process.env.MIDST_KEY_SCHEME)).timelapse
  const base = objectName.split('/').pop()!
  const route = `/poem/${names.poemUrl(meta.title)}/`
  const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`
  const zipPath = join(dirname(RESULT), `web-poem-${process.pid}.zip`)

  const failures: Failure[] = []
  const m: Record<string, unknown> = {}
  const crashes: string[] = []
  // Counted, never kept: on a real poem a console message can carry its name or text.
  let consoleErrors = 0
  let server: Server | undefined
  let dead: string | undefined
  const note = (step: string, e: unknown) => failures.push({ step, reason: String((e as Error)?.message ?? e).slice(0, 600) })
  async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (dead) { failures.push({ step: name, reason: `skipped: ${dead}` }); return undefined }
    try {
      return await fn()
    } catch (e) {
      note(name, e)
      try {
        await within(page.evaluate(() => 1), 15_000, 'page not answering for 15 s')
      } catch (e2) {
        dead = `after ${name} the page was gone or hung: ${String((e2 as Error).message).slice(0, 200)}`
      }
      return undefined
    }
  }

  try {
    page.on('crash', () => crashes.push('page crashed (crash event)'))
    page.on('pageerror', e => crashes.push(`pageerror: ${String(e).slice(0, 200)}`))
    // Aborted third-party requests (analytics, fonts) log "Failed to load resource"; any other console error is kept as information.
    page.on('console', c => { if (c.type() === 'error' && !/Failed to load resource/.test(c.text())) consoleErrors += 1 })

    const zipStart = Date.now()
    await zipFile(base.replace(/\.zip$/, ''), FILE, zipPath)
    m.zipMs = Date.now() - zipStart
    m.zipBytes = statSync(zipPath).size

    server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      const s = statSync(zipPath)
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': s.size })
      createReadStream(zipPath).pipe(res)
    })
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as AddressInfo).port
    await page.route('**/*', r => {
      const url = new URL(r.request().url())
      if (url.origin === new URL(baseURL!).origin && decodeURIComponent(url.pathname).normalize('NFC').endsWith(base.normalize('NFC'))) {
        return r.continue({ url: `http://127.0.0.1:${port}/poem.zip` })
      }
      const ok = url.origin === new URL(baseURL!).origin
      if (ok) return r.continue()
      return r.abort()
    })

    const editor = `${scope} .editor`
    let loadT0 = 0
    const loaded = await step('load', async () => {
      const t0 = Date.now()
      loadT0 = t0
      // The player says it could not load a poem with a fixed console message (store/actions.ts loadPoemData); without
      // this the step would sit out its whole timeout after the player had already given up.
      const gaveUp = new Promise<never>((_, reject) => {
        page.on('console', (c) => {
          if (c.type() === 'error' && /^Unable to load/.test(c.text())) {
            m.loadFailedAfterMs = Date.now() - t0
            reject(new Error(`the player gave up after ${Date.now() - t0} ms: console.error "${c.text()}"`))
          }
        })
      })
      gaveUp.catch(() => undefined)
      await page.goto(route)
      const shown = page.waitForFunction(({ sel, tail }) => {
        const el = document.querySelector(sel + ' .ProseMirror')
        if (!el) return false
        let p = el.lastElementChild
        while (p && !p.textContent) p = p.previousElementSibling
        return !!p && (p.textContent || '').endsWith(tail)
      }, { sel: editor, tail }, { timeout: LOAD_TIMEOUT, polling: 50 })
      shown.catch(() => undefined) // when the player gives up first, this one times out unobserved
      await Promise.race([gaveUp, shown])
      m.loadMs = Date.now() - t0
      m.frames = Number(await page.locator(`${scope} input[type=range]`).getAttribute('max')) + 1
      return true
    })
    // A failed load records how long it took to fail (the player giving up, a crash, or the timeout itself).
    if (!loaded) m.loadMs = { failedAfterMs: m.loadFailedAfterMs ?? Date.now() - loadT0, timeoutMs: LOAD_TIMEOUT }

    if (loaded) {
      const play: Record<string, unknown> = { setFps: SET_FPS }
      m.play = play
      await step('play', async () => {
        await page.locator(`${scope} button[aria-label="Skip to start"]`).click({ timeout: PLAY_TIMEOUT })
        await page.evaluate((sel) => {
          const w = window as unknown as { __pl: { t: number, v: number }[], __plTimer: number }
          w.__pl = []
          const input = document.querySelector(sel) as HTMLInputElement
          w.__plTimer = window.setInterval(() => w.__pl.push({ t: performance.now(), v: Number(input.value) }), 25)
        }, `${scope} input[type=range]`)
        await page.locator(`${scope} .play-pause-button`).click({ timeout: PLAY_TIMEOUT })
        await page.waitForFunction(() => {
          const w = window as unknown as { __pl: { v: number }[] }
          return w.__pl.some(s => s.v > 0)
        }, undefined, { timeout: PLAY_TIMEOUT, polling: 50 })
        await page.waitForTimeout(PLAY_SECONDS * 1000)
        const s = await page.evaluate(() => {
          const w = window as unknown as { __pl: { t: number, v: number }[], __plTimer: number }
          clearInterval(w.__plTimer)
          return w.__pl
        })
        const seg = s.slice(s.findIndex(x => x.v > 0))
        const a = seg[0]
        const b = seg[seg.length - 1]
        play.playSampleSeconds = (b.t - a.t) / 1000
        play.playFrames = b.v - a.v
        play.achievedFps = (b.v - a.v) / (b.t - a.t) * 1000
        let stall = 0
        let since = seg[0].t
        for (let i = 1; i < seg.length; i += 1) {
          if (seg[i].v !== seg[i - 1].v) { stall = Math.max(stall, seg[i].t - since); since = seg[i].t }
        }
        play.longestStallMs = stall
        await page.locator(`${scope} .play-pause-button`).click({ timeout: 30_000 })
      })

      await step('scrub', async () => {
        const max = Number(await page.locator(`${scope} input[type=range]`).getAttribute('max'))
        const dom: number[] = []
        const screen: number[] = []
        const positions: { f: number, value: number }[] = []
        for (const f of SCRUB_POSITIONS) {
          const target = Math.round(max * f)
          // eslint-disable-next-line no-await-in-loop
          const r = await within(page.evaluate(({ sel, target }) => new Promise<{ dom: number, screen: number }>((resolve) => {
            const input = document.querySelector(sel + ' input[type=range]') as HTMLInputElement
            const root = document.querySelector(sel + ' .ProseMirror') as HTMLElement
            const t0 = performance.now()
            let dom = 0
            const mo = new MutationObserver(() => {
              mo.disconnect()
              dom = performance.now() - t0
              requestAnimationFrame(() => setTimeout(() => resolve({ dom, screen: performance.now() - t0 }), 0))
            })
            mo.observe(root, { subtree: true, childList: true, characterData: true })
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
            setter.call(input, String(target))
            input.dispatchEvent(new Event('input', { bubbles: true }))
          }), { sel: scope, target }), SCRUB_TIMEOUT, `scrub to ${f} did not update the text within ${SCRUB_TIMEOUT} ms`)
          dom.push(r.dom)
          screen.push(r.screen)
          // eslint-disable-next-line no-await-in-loop
          positions.push({ f, value: Number(await page.locator(`${scope} input[type=range]`).inputValue()) })
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(500)
        }
        m.scrubDomMs = dist(dom)
        m.scrubScreenMs = dist(screen)
        m.scrubPositions = positions
        m.scrubDomEachMs = dom
      })
    }
  } catch (e) {
    note('harness', e)
  } finally {
    if (crashes.length) failures.push({ step: 'crash', reason: crashes.slice(0, 5).join(' | ') })
    m.consoleErrors = consoleErrors
    writeFileSync(RESULT, JSON.stringify({
      spec: 'web',
      // Size only, never the path: a hand run on a real poem would put its name in the result.
      fileBytes,
      finalChars: chars,
      browser: page.context().browser()?.version(),
      steps: m,
      failures,
      finishedAt: new Date().toISOString(),
    }, null, 2))
    server?.close()
    try {
      unlinkSync(zipPath)
    } catch (e) {
      // Absent when the zip step failed first; anything else would leave a large file behind, so say so.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`could not delete ${zipPath}: ${(e as Error).message}`)
    }
  }
  if (failures.length) throw new Error(`size-limit run failed:\n${failures.map(f => `${f.step}: ${f.reason}`).join('\n')}`)
})
