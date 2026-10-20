import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { fetchPoemAsset } from '../poems/key-scheme'
import { loadPoemData, loadPoemList } from '../store/actions'
import { LOAD_POEM_DATA, LOAD_POEM_FAILED, LOAD_POEM_LIST, POEM_LIST_FAILED } from '../store/types'

// The published list's side of the actions (#110): a poem that carries recorded keys is fetched by them
// and by nothing derived; the list itself is fetched once and checked as a whole. Invented names only.
jest.mock('../poems/key-scheme', () => ({ ...jest.requireActual('../poems/key-scheme'), fetchPoemAsset: jest.fn() }))
let mockScheme: string = 'legacy'
jest.mock('../config', () => ({
  POEMS_URL: 'http://127.0.0.1:1/zq/poems/',
  get KEY_SCHEME() {
    return mockScheme
  },
}))

const POEMS_URL = 'http://127.0.0.1:1/zq/poems/'
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const mockFetchAsset = fetchPoemAsset as unknown as jest.Mock

const validText = JSON.stringify({ text: 'zq', history: [{ inserted: 'zq', front: 0, end: 0, t: 0 }] })
const fakeBlob = { fake: 'blob' }
// The timelapse is a real .midst.zip of validText (#270).
const midstZip = async () => {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  await writer.add('zq.midst', new TextReader(validText))
  return writer.close()
}
const okResponse = (note = 'zq note') => ({ ok: true, text: async () => note, blob: midstZip })
const badResponse = (status = 403) => ({ ok: false, status, text: async () => '<Error/>', blob: async () => fakeBlob })
const stateWith = (poems: any[]) => () => ({ app: { poems } })

// The recorded keys deliberately do NOT match what either scheme would derive from author, title or id.
const recorded = {
  poemId: 'zq-xv--kj-wm', author: 'Zq Xv', title: 'Kj Wm', id: ID,
  keys: { timelapse: 'zz-recorded/t.midst.zip', processNote: 'zz-recorded/n.md' },
}

let fetchMock: jest.Mock
let consoleError: jest.SpyInstance

beforeEach(() => {
  mockScheme = 'legacy'
  mockFetchAsset.mockReset()
  fetchMock = jest.fn()
  ;(globalThis as any).fetch = fetchMock
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  delete (globalThis as any).fetch
})

describe('a poem from the published list (recorded keys)', () => {
  it.each(['legacy', 'canonical'])('fetches base + recorded key by plain fetch and derives no name (%s)', async scheme => {
    mockScheme = scheme
    fetchMock.mockResolvedValueOnce(okResponse('zq note')).mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([recorded]))

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      `${POEMS_URL}zz-recorded/n.md`,
      `${POEMS_URL}zz-recorded/t.midst.zip`,
    ])
    expect(mockFetchAsset).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: LOAD_POEM_DATA,
      payload: { poemId: 'zq-xv--kj-wm', processNote: '<p>zq note</p>\n' },
    })
  })

  it('a null note means no note: it is not requested, and the poem loads with an empty one', async () => {
    fetchMock.mockResolvedValueOnce(okResponse())
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([{ ...recorded, keys: { ...recorded.keys, processNote: null } }]))

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([`${POEMS_URL}zz-recorded/t.midst.zip`])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: LOAD_POEM_DATA, payload: { processNote: '' } })
  })

  it('reports a recorded key that is not there as missing', async () => {
    fetchMock.mockResolvedValueOnce(badResponse(404))
    const dispatch = jest.fn()

    await loadPoemData(0)(dispatch, stateWith([recorded]))

    expect(dispatch.mock.calls).toEqual([[{ type: LOAD_POEM_FAILED, payload: { poemId: 'zq-xv--kj-wm', reason: 'missing' } }]])
  })

  it('a bundled poem (no keys) still derives its names and never uses the plain fetch', async () => {
    mockFetchAsset.mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(okResponse())
    const { keys: _keys, ...bundled } = recorded

    await loadPoemData(0)(jest.fn(), stateWith([bundled]))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockFetchAsset.mock.calls).toEqual([
      [POEMS_URL, 'zq-xv/zq-xv.md', 'legacy'],
      [POEMS_URL, 'zq-xv/zq-xv--kj-wm.midst.zip', 'legacy'],
    ])
  })
})

describe('loadPoemList', () => {
  const published = {
    version: 1,
    updated: '2026-01-01T00:00:00.000Z',
    poems: [{ poemId: ID, title: 'Aa Title', author: 'Zq Xv', timelapse: `poems/${ID}/timelapse.midst.zip`, processNote: null }],
  }
  const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body })

  it('fetches published.json once, uncached, and dispatches the checked entries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(published))
    const dispatch = jest.fn()

    await loadPoemList()(dispatch)

    expect(fetchMock.mock.calls).toEqual([[`${POEMS_URL}published.json`, { cache: 'no-cache' }]])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0].type).toBe(LOAD_POEM_LIST)
    expect(dispatch.mock.calls[0][0].payload.entries[0]).toMatchObject({
      poemId: ID,
      keys: { timelapse: `${ID}/timelapse.midst.zip`, processNote: null },
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it.each([
    ['the request never gets an answer', () => fetchMock.mockRejectedValueOnce(new Error('x')), 'network'],
    ['the answer is 404', () => fetchMock.mockResolvedValueOnce(jsonResponse({}, 404)), 'server'],
    ['the answer is 500', () => fetchMock.mockResolvedValueOnce(jsonResponse({}, 500)), 'server'],
    ['the body is not JSON', () => fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('x') } }), 'malformed'],
    ['the list is malformed', () => fetchMock.mockResolvedValueOnce(jsonResponse({ version: 1 })), 'malformed'],
  ])('fails, with one fixed console message, when %s', async (_name, arrange, reason) => {
    arrange()
    const dispatch = jest.fn()

    await loadPoemList()(dispatch)

    expect(dispatch.mock.calls).toEqual([[{ type: POEM_LIST_FAILED, payload: { reason } }]])
    expect(consoleError.mock.calls).toEqual([['Unable to load the poem list']])
  })
})
