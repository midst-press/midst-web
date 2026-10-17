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
} from '../store/actions'
import {
  LOAD_POEM_DATA,
  LOAD_POEM_FAILED,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,
} from '../store/types'

// The names are the real ones; only the request is faked.
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
let zip: any
let fakeZipReaderMode: 'ok' | 'error' | 'empty'
let consoleError: jest.SpyInstance

const okResponse = (note = 'zq note') => ({
  ok: true,
  text: async () => note,
  blob: async () => fakeBlob,
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
  fakeZipReaderMode = 'ok'
  zip = {
    workerScriptsPath: undefined,
    BlobReader: jest.fn().mockImplementation(function (this: any, arg: any) {
      this.arg = arg
    }),
    BlobWriter: jest.fn().mockImplementation(function () {}),
    createReader: jest.fn((reader: any, onReader: any, onError: any) => {
      if (fakeZipReaderMode === 'error') return onError()
      if (fakeZipReaderMode === 'empty') return onReader({ getEntries: (cb: any) => cb([]) })
      return onReader({
        getEntries: (cb: any) =>
          cb([{ getData: (_writer: any, dataCb: any) => dataCb(fakeBlob) }]),
      })
    }),
  }
  ;(globalThis as any).window = { zip }
  // As a browser's FileReader: the text is on `result` when loadend fires.
  ;(globalThis as any).FileReader = class {
    private listeners: Record<string, any> = {}
    result: string | null = null
    addEventListener(type: string, fn: any) {
      this.listeners[type] = fn
    }
    readAsText(_blob: any) {
      this.result = fileText
      this.listeners.loadend({ target: this })
    }
  }
  mockFetchAsset.mockReset()
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  delete (globalThis as any).window
  delete (globalThis as any).FileReader
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
    expect(zip.workerScriptsPath).toBe('/static/workers/')
    expect(zip.BlobReader).toHaveBeenCalledWith(fakeBlob)
    expect(zip.createReader).toHaveBeenCalledTimes(1)
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
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
  })

  it('timelapse response not ok: no reader, failure dispatched', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(badResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(2)
    expect(zip.createReader).not.toHaveBeenCalled()
    expect(dispatch.mock.calls).toEqual(failedB('refused'))
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
  })

  it('network error on the note: no second fetch, failure dispatched', async () => {
    mockFetchAsset.mockRejectedValueOnce(new Error('network down'))
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls).toEqual(failedB('network'))
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
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
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
  })
})

describe('loadPoemData failures during unzip and parse', () => {
  it('archive reader error: failure dispatched', async () => {
    fakeZipReaderMode = 'error'
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(zip.createReader).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
    expect(consoleError.mock.calls).toEqual([['Unable to read Midst archive']])
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
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst file']])
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('QZXSENTINEL')
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain('QZXSENTINEL')
  })

  it('archive with no entries: failure dispatched, nothing thrown', async () => {
    fakeZipReaderMode = 'empty'
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(zip.BlobWriter).not.toHaveBeenCalled()
    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
    expect(consoleError.mock.calls).toEqual([['Unable to read Midst archive']])
  })

  it('a failure names the poem at the index, not the first', async () => {
    mockFetchAsset.mockResolvedValueOnce(badResponse())
    const dispatch = jest.fn()

    await loadPoemData(1)(dispatch, stateWith([poemA, poemB]))

    expect(dispatch.mock.calls).toEqual(failedB('refused'))
  })
})

describe('window.zip missing', () => {
  it('is a reported failure like any other: nothing fetched, failure dispatched', async () => {
    ;(globalThis as any).window = {}
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).not.toHaveBeenCalled()
    expect(dispatch.mock.calls).toEqual(failedB('unknown'))
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
  })
})

// #43: every way the archive read or a body read can fail reaches LOAD_POEM_FAILED. None of these may leave the
// loading mark turning for ever.
describe('loadPoemData: failures inside the archive read and the body read (#43)', () => {
  const entryWith = (getData: any) => {
    zip.createReader = jest.fn((_r: any, onReader: any) => onReader({ getEntries: (cb: any) => cb([{ getData }]) }))
  }

  it('asks zip.js to check the CRC, so a mismatch reaches its error callback rather than the parser', async () => {
    mockFetchAsset.mockResolvedValue(okResponse())
    const getData = jest.fn((_w: any, cb: any) => cb(fakeBlob))
    entryWith(getData)
    await loadPoemData(0)(jest.fn(), stateWith([poemB]))
    expect(getData.mock.calls[0][3]).toBe(true)
  })

  it('a throw inside a zip.js callback is damaged, not silent', async () => {
    mockFetchAsset.mockResolvedValue(okResponse())
    entryWith(() => { throw new Error('zq inflate') })
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
  })

  it('zip.js throwing as the reader is created is damaged', async () => {
    mockFetchAsset.mockResolvedValue(okResponse())
    zip.createReader = jest.fn(() => { throw new Error('zq reader') })
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
  })

  it('a FileReader error is damaged', async () => {
    mockFetchAsset.mockResolvedValue(okResponse())
    ;(globalThis as any).FileReader = class {
      private listeners: Record<string, any> = {}
      // A real reader leaves result null on error, and the parser would then call it damaged anyway. A readable
      // result beside the error makes this test fail unless the reader's error itself is checked.
      result: string | null = validText
      error = new Error('zq read')
      addEventListener(type: string, fn: any) { this.listeners[type] = fn }
      readAsText() { this.listeners.loadend({ target: this }) }
    }
    const dispatch = jest.fn()
    await loadPoemData(0)(dispatch, stateWith([poemB]))
    expect(dispatch.mock.calls).toEqual(failedB('damaged'))
  })

  it('an archive read that never finishes gives up after the timeout', async () => {
    jest.useFakeTimers()
    try {
      mockFetchAsset.mockResolvedValue(okResponse())
      entryWith(() => { /* a worker that never answers */ })
      const dispatch = jest.fn()
      const done = loadPoemData(0)(dispatch, stateWith([poemB]))
      await jest.advanceTimersByTimeAsync(ARCHIVE_READ_TIMEOUT_MS - 1)
      expect(dispatch).not.toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(1)
      await done
      expect(dispatch.mock.calls).toEqual(failedB('unknown'))
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
