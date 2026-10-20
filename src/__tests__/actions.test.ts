import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import * as archiveModule from '../archive'
import { fetchPoemAsset } from '../poems/key-scheme'
import { parseMidstFile } from '../store/midst-file'
import { processNoteObjectName, timelapseObjectName } from '../poems/poem-names'
import {
  loadPoemData,
  setMobileNavOpen,
  setProcessNoteOpen,
  reverseSortOrder,
  setSortTerm,
  ARCHIVE_READ_TIMEOUT_MS,
  causeName,
  describeCause,
} from '../store/actions'
import {
  LOAD_POEM_DATA,
  LOAD_POEM_FAILED,
  LOAD_POEM_RETRY,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,
} from '../store/types'

// The names are the real ones; only the request is faked.
// marked as it is, unless a test asks it to throw.
const mockMarked = { throws: false }
jest.mock('marked', () => {
  const actual = jest.requireActual('marked')
  const wrapped = (...args: unknown[]) => {
    if (mockMarked.throws) throw new TypeError('zq marked')
    return actual(...args)
  }
  return Object.assign(wrapped, actual)
})
jest.mock('../poems/key-scheme', () => ({ ...jest.requireActual('../poems/key-scheme'), fetchPoemAsset: jest.fn() }))
let mockScheme: string | undefined = 'legacy'
jest.mock('../config', () => ({
  POEMS_URL: 'http://127.0.0.1:1/zq/',
  get KEY_SCHEME() {
    return mockScheme
  },
}))

const POEMS_URL = 'http://127.0.0.1:1/zq/'
const mockFetchAsset = fetchPoemAsset as unknown as jest.Mock

const poemA = { poemId: 'zq-xv--other', author: 'Zq Xv', title: 'Other' }
const poemB = { poemId: 'zq-xv--kj-wm', author: 'Zq Xv', title: 'Kj Wm' }
const poemFolder = {
  poemId: 'zq-xv--kj-wm',
  author: 'Zq Xv',
  title: 'Kj Wm',
  authorSecondaryFolder: 'zq-folder',
}

const validText = JSON.stringify({ text: 'zq', history: [{ inserted: 'zq', front: 0, end: 0, t: 0 }] })

const fakeBlob = { fake: 'blob' }
let fileText: string
// What the timelapse request answers: a real .midst.zip of fileText (#270), unless a test sets other bytes.
let archiveBytes: (() => Promise<Blob>) | null
let consoleError: jest.SpyInstance

async function zipOf(files: [string, string][], level?: number): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), level === undefined ? {} : { level })
  for (const [name, text] of files) await writer.add(name, new TextReader(text))
  return writer.close()
}

const okResponse = (note = 'zq note') => ({
  ok: true,
  text: async () => note,
  blob: async () => (archiveBytes ? archiveBytes() : zipOf([['zq.midst', fileText]])),
})
// A failed request still has a readable body (S3 answers 403 with an error document). Only the
// check of `ok` keeps that body from being used as a process note or opened as an archive, so these
// fakes must NOT throw when read: a fake that threw would pass the tests with the check removed.
const badResponse = (status = 403) => ({
  ok: false,
  status,
  text: async () => '<Error><Code>AccessDenied</Code></Error>',
  blob: async () => fakeBlob,
})

const stateWith = (poems: any[]) => () => ({ app: { poems } })

// What every failed load of poemB must dispatch, and nothing else: the page shows it (#34).
const failedB = (reason: string) => [[{ type: LOAD_POEM_FAILED, payload: { poemId: 'zq-xv--kj-wm', reason } }]]

beforeEach(() => {
  fileText = validText
  archiveBytes = null
  mockFetchAsset.mockReset()
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  jest.restoreAllMocks()
})

describe('plain action creators', () => {
  it.each([true, false])('setMobileNavOpen(%s)', value => {
    expect(setMobileNavOpen(value)).toEqual({ type: SET_MOBILE_NAV_OPEN, payload: value })
  })

  it.each([true, false])('setProcessNoteOpen(%s)', value => {
    expect(setProcessNoteOpen(value)).toEqual({ type: SET_PROCESS_NOTE_OPEN, payload: value })
  })

  it('reverseSortOrder has a null payload', () => {
    expect(reverseSortOrder()).toEqual({ type: REVERSE_SORT_ORDER, payload: null })
  })

  it('setSortTerm carries the term', () => {
    expect(setSortTerm('author')).toEqual({ type: SET_SORT_TERM, payload: 'author' })
  })
})

describe('loadPoemData success', () => {
  it('dispatches the parsed file and sanitised note for the poem at the index', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse('zq note')).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(1)(dispatch, stateWith([poemA, poemB]))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const expected = parseMidstFile(validText)
    expect(expected.editorTimelineFrames).toHaveLength(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: LOAD_POEM_DATA,
      payload: { poemId: 'zq-xv--kj-wm', data: expected, processNote: '<p>zq note</p>\n' },
    })
    expect(mockFetchAsset.mock.calls).toEqual([
      [POEMS_URL, 'zq-xv/zq-xv.md', 'legacy'],
      [POEMS_URL, 'zq-xv/zq-xv--kj-wm.midst.zip', 'legacy'],
    ])
    expect(mockFetchAsset.mock.calls[0][1]).toBe(processNoteObjectName(poemB))
    expect(mockFetchAsset.mock.calls[1][1]).toBe(timelapseObjectName(poemB))
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('selects the poem by index, not the first', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemA, poemB]))

    expect(mockFetchAsset.mock.calls[1][1]).toBe('zq-xv/zq-xv--other.midst.zip')
    expect(dispatch.mock.calls[0][0].payload.poemId).toBe('zq-xv--other')
  })

  it('accepts a file with a midstVersion header', async () => {
    fileText = 'midstVersion: 1\n' + validText
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0].type).toBe(LOAD_POEM_DATA)
    expect(dispatch.mock.calls[0][0].payload.data).toEqual(parseMidstFile(fileText))
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('uses authorSecondaryFolder in both object names', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemFolder]))

    expect(mockFetchAsset.mock.calls).toEqual([
      [POEMS_URL, 'zq-folder/zq-xv.md', 'legacy'],
      [POEMS_URL, 'zq-folder/zq-xv--kj-wm.midst.zip', 'legacy'],
    ])
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  describe('under the canonical key scheme', () => {
    const id = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
    beforeEach(() => {
      mockScheme = 'canonical'
    })
    afterEach(() => {
      mockScheme = 'legacy'
    })

    it('asks for both files under the id, whatever the author, title or folder', async () => {
      mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
      const dispatch = jest.fn()

      await loadPoemData(0)(dispatch, stateWith([{ ...poemFolder, id }]))

      expect(mockFetchAsset.mock.calls).toEqual([
        [POEMS_URL, `${id}/process-note.md`, 'canonical'],
        [POEMS_URL, `${id}/timelapse.midst.zip`, 'canonical'],
      ])
      expect(dispatch.mock.calls[0][0].type).toBe(LOAD_POEM_DATA)
    })

    it('fails the load, asking for nothing, when the poem has no id', async () => {
      const dispatch = jest.fn()

      await loadPoemData(0)(dispatch, stateWith([poemB]))

      expect(mockFetchAsset).not.toHaveBeenCalled()
      expect(dispatch.mock.calls).toEqual(failedB('unknown'))
    })
  })

  it('fails the load, asking for nothing, when no key scheme was built in', async () => {
    mockScheme = undefined
    const dispatch = jest.fn()
    try {
      await loadPoemData(0)(dispatch, stateWith([poemB]))
    } finally {
      mockScheme = 'legacy'
    }

    expect(mockFetchAsset).not.toHaveBeenCalled()
    expect(dispatch.mock.calls).toEqual(failedB('unknown'))
  })
})

describe('process note sanitising', () => {
  it('keeps allowed tags and strips script tags and event attributes', async () => {
    const note = '**zq** <script>alert(1)</script>\n\n<p onclick="alert(2)">zq note</p>'
    mockFetchAsset.mockResolvedValueOnce(okResponse(note)).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const processNote: string = dispatch.mock.calls[0][0].payload.processNote
    expect(processNote).toContain('<strong>zq</strong>')
    expect(processNote).not.toContain('<script')
    expect(processNote).not.toContain('onclick')
    expect(consoleError).not.toHaveBeenCalled()
  })
})

describe('loadPoemData failures before unzip', () => {
  it('note response not ok: no second fetch, failure dispatched', async () => {
    mockFetchAsset.mockResolvedValueOnce(badResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls).toEqual(failedB('refused'))
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data: refused']])
  })

  it('timelapse response not ok: no reader, failure dispatched', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(badResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(2)
    expect(dispatch.mock.calls).toEqual(failedB('refused'))
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data: refused']])
  })

  it('network error on the note: no second fetch, failure dispatched', async () => {
    mockFetchAsset.mockRejectedValueOnce(new Error('network down'))
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls).toEqual(failedB('network'))
    expect(consoleError.mock.calls).toEqual([['Unable to fetch the poem: Error: network down']])
  })

  it.each([
    [404, 'missing'],
    [403, 'refused'],
    [500, 'server'],
    [429, 'server'],
  ])('status %i on the note is reported as %s', async (status, reason) => {
    mockFetchAsset.mockResolvedValueOnce(badResponse(status))
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch.mock.calls).toEqual(failedB(reason))
  })

  it.each([
    [404, 'missing'],
    [403, 'refused'],
    [503, 'server'],
  ])('status %i on the timelapse is reported as %s', async (status, reason) => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(badResponse(status))
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch.mock.calls).toEqual(failedB(reason))
  })

  it('network error on the timelapse is reported as network', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockRejectedValueOnce(new Error('network down'))
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch.mock.calls).toEqual(failedB('network'))
  })

  it('out-of-range index: no fetch, no dispatch', async () => {
    const dispatch = jest.fn()

    await loadPoemData(5)(dispatch, stateWith([poemA, poemB]))

    expect(mockFetchAsset).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data: TypeError']])
  })
})

describe('loadPoemData failures during unzip and parse', () => {
  it('bytes that are not an archive: failure dispatched, logged with the library\'s message', async () => {
    archiveBytes = async () => new Blob(['zq not a zip'])
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
    expect(consoleError.mock.calls).toEqual([['Unable to read Midst archive: Error: File format is not recognized']])
  })

  it.each([
    ['broken JSON', '{"text": QZXSENTINEL'],
    ['valid JSON of the wrong shape', JSON.stringify({ unexpected: 'QZXSENTINEL' })],
  ])('%s: failure dispatched and nothing leaks', async (_name, text) => {
    fileText = text
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst file: Error']])
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('QZXSENTINEL')
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain('QZXSENTINEL')
  })

  it('archive with no entries: failure dispatched, nothing thrown', async () => {
    archiveBytes = () => zipOf([])
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
    expect(consoleError.mock.calls).toEqual([['Unable to read Midst archive: the archive has no entries']])
  })

  it('a failure names the poem at the index, not the first', async () => {
    mockFetchAsset.mockResolvedValueOnce(badResponse())
    const dispatch = jest.fn()

    await loadPoemData(1)(dispatch, stateWith([poemA, poemB]))

    expect(dispatch.mock.calls).toEqual(failedB('refused'))
  })
})

// #43: every way the archive read or a body read can fail reaches LOAD_POEM_FAILED. None of these may leave the
// loading mark turning for ever.
describe('loadPoemData: failures inside the archive read and the body read (#43)', () => {
  it('a CRC mismatch is damaged, logged with the library\'s message, and never reaches the parser', async () => {
    const stored = new Uint8Array(await (await zipOf([['zq.midst', validText]], 0)).arrayBuffer())
    // A byte of the stored contents, not of the file name in the headers. The text stays valid JSON, so only the CRC
    // check can refuse it.
    const at = Buffer.from(stored).indexOf('inserted')
    expect(at).toBeGreaterThan(0)
    stored[at + 1] ^= 1
    archiveBytes = async () => new Blob([stored])
    mockFetchAsset.mockResolvedValue(okResponse())
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
    expect(consoleError.mock.calls).toEqual([['Unable to read Midst archive: Error: Invalid CRC32']])
  })

  it('an error that is not the archive\'s is damaged and logged by its name and message', async () => {
    jest.spyOn(archiveModule, 'readFirstEntry').mockRejectedValue(new TypeError('zq is not a function'))
    mockFetchAsset.mockResolvedValue(okResponse())
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
    expect(consoleError.mock.calls).toEqual([['Unable to read Midst archive: TypeError: zq is not a function']])
  })

  it('an archive read that never finishes gives up after the timeout', async () => {
    jest.useFakeTimers()
    try {
      // Bytes that never arrive: the library waits on them for ever, and only the timer ends the read.
      const stalled = { size: 100, type: 'application/zip', slice: () => stalled, arrayBuffer: () => new Promise<ArrayBuffer>(() => {}) }
      archiveBytes = async () => stalled as unknown as Blob
      mockFetchAsset.mockResolvedValue(okResponse())
      const dispatch = jest.fn()
      const done = loadPoemData(0)(dispatch, stateWith([poemB]))
      await jest.advanceTimersByTimeAsync(ARCHIVE_READ_TIMEOUT_MS - 1)
      expect(dispatch).not.toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(1)
      await done
      expect(dispatch.mock.calls).toEqual(failedB('unknown'))
      expect(consoleError.mock.calls).toEqual([['Reading the Midst archive timed out']])
    } finally {
      jest.useRealTimers()
    }
  })

  it('a connection dropped while reading the archive body is network', async () => {
    mockFetchAsset.mockResolvedValue({ ok: true, text: async () => 'zq note', blob: async () => { throw new TypeError('zq dropped') } })
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('network'))
  })

  it('a connection dropped while reading the note body is network', async () => {
    mockFetchAsset.mockResolvedValue({ ok: true, text: async () => { throw new TypeError('zq dropped') }, blob: async () => fakeBlob })
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('network'))
  })
})

describe('the cause in a failure log', () => {
  it('describeCause: name and message of an error, a string as it is, and what anything else was', () => {
    expect(describeCause(new TypeError('zq'))).toBe('TypeError: zq')
    expect(describeCause({ name: 'NotReadableError', message: 'zq xv' })).toBe('NotReadableError: zq xv')
    expect(describeCause('CRC failed.')).toBe('CRC failed.')
    expect(describeCause(undefined)).toBe('no cause given')
    expect(describeCause(7)).toBe('a thrown number')
    expect(describeCause(null)).toBe('a thrown object')
    expect(describeCause('x'.repeat(300))).toHaveLength(200)
  })

  it('causeName: the name only, never the message', () => {
    expect(causeName(new SyntaxError('Unexpected token, "zq xv" is not valid JSON'))).toBe('SyntaxError')
    expect(causeName('zq')).toBe('a thrown string')
    expect(causeName(null)).toBe('a thrown object')
  })
})

describe('a failure outside the archive and the network', () => {
  afterEach(() => { mockMarked.throws = false })

  it('a throw from marked on the note is logged by name, never by its message', async () => {
    mockFetchAsset.mockResolvedValue(okResponse())
    mockMarked.throws = true
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('unknown'))
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data: TypeError']])
  })
})

describe('loadPoemData: returning to a poem whose last load failed (#43)', () => {
  it('takes the failure message down before the new attempt, then loads', async () => {
    mockFetchAsset.mockResolvedValue(okResponse())
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([{ ...poemB, loadFailure: 'network' }]))
    expect(dispatch.mock.calls.map(call => call[0].type)).toEqual([LOAD_POEM_RETRY, LOAD_POEM_DATA])
    expect(dispatch.mock.calls[0][0].payload).toEqual({ poemId: 'zq-xv--kj-wm' })
  })

  it('a first load dispatches no retry', async () => {
    mockFetchAsset.mockResolvedValue(okResponse())
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls.map(call => call[0].type)).toEqual([LOAD_POEM_DATA])
  })
})
