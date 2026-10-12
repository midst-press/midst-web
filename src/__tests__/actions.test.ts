import { fetchAsset } from '../poems/asset-fetch'
import { parseMidstFile } from '../components/midst-player-hack/midst-file'
import { processNoteObjectName, timelapseObjectName } from '../poems/poem-names'
import {
  loadPoemData,
  setMobileNavOpen,
  setProcessNoteOpen,
  reverseSortOrder,
  setSortTerm,
} from '../store/actions'
import {
  LOAD_POEM_DATA,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,
} from '../store/types'

jest.mock('../poems/asset-fetch', () => ({ fetchAsset: jest.fn() }))
jest.mock('../config', () => ({ POEMS_URL: 'http://127.0.0.1:1/zq/' }))

const POEMS_URL = 'http://127.0.0.1:1/zq/'
const mockFetchAsset = fetchAsset as unknown as jest.Mock

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
let fakeZipReaderMode: 'ok' | 'error'
let consoleError: jest.SpyInstance

const okResponse = (note = 'zq note') => ({
  ok: true,
  text: async () => note,
  blob: async () => fakeBlob,
})
// A failed request still has a readable body (S3 answers 403 with an error document). Only the
// check of `ok` keeps that body from being used as a process note or opened as an archive, so these
// fakes must NOT throw when read: a fake that threw would pass the tests with the check removed.
const badResponse = () => ({
  ok: false,
  text: async () => '<Error><Code>AccessDenied</Code></Error>',
  blob: async () => fakeBlob,
})

const stateWith = (poems: any[]) => () => ({ app: { poems } })

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
      return onReader({
        getEntries: (cb: any) =>
          cb([{ getData: (_writer: any, dataCb: any) => dataCb(fakeBlob) }]),
      })
    }),
  }
  ;(globalThis as any).window = { zip }
  ;(globalThis as any).FileReader = class {
    private listeners: Record<string, any> = {}
    addEventListener(type: string, fn: any) {
      this.listeners[type] = fn
    }
    readAsText(_blob: any) {
      this.listeners.loadend({ srcElement: { result: fileText } })
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
      [POEMS_URL, 'zq-xv/zq-xv.md'],
      [POEMS_URL, 'zq-xv/zq-xv--kj-wm.midst.zip'],
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
      [POEMS_URL, 'zq-folder/zq-xv.md'],
      [POEMS_URL, 'zq-folder/zq-xv--kj-wm.midst.zip'],
    ])
    expect(dispatch).toHaveBeenCalledTimes(1)
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
  it('note response not ok: no second fetch, no dispatch', async () => {
    mockFetchAsset.mockResolvedValueOnce(badResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
  })

  it('timelapse response not ok: no reader, no dispatch', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(badResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(2)
    expect(zip.createReader).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
  })

  it('network error on the note: no second fetch, no dispatch', async () => {
    mockFetchAsset.mockRejectedValueOnce(new Error('network down'))
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(mockFetchAsset).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst data']])
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
  it('archive reader error: no dispatch', async () => {
    fakeZipReaderMode = 'error'
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(zip.createReader).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([['Unable to read Midst archive']])
  })

  it.each([
    ['broken JSON', '{"text": QZXSENTINEL'],
    ['valid JSON of the wrong shape', JSON.stringify({ unexpected: 'QZXSENTINEL' })],
  ])('%s: no dispatch and nothing leaks', async (_name, text) => {
    fileText = text
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([poemB]))

    expect(dispatch).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([['Unable to load Midst file']])
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('QZXSENTINEL')
  })
})

describe('window.zip missing', () => {
  it('rejects with a TypeError because the zip assignment is outside the try', async () => {
    ;(globalThis as any).window = {}
    const dispatch = jest.fn()

    await expect(loadPoemData(0)(dispatch, stateWith([poemB]))).rejects.toThrow(TypeError)

    expect(mockFetchAsset).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })
})
