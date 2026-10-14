import { LISTS, fetchRecordedKey, parsePoemList, parsePublishedList } from '../poems/poem-list'

// Invented ids, titles and authors only.
const ID_A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const ID_B = 'ffffffff-ffff-4fff-bfff-ffffffffffff'

const entry = (over: Record<string, unknown> = {}) => ({
  poemId: ID_A,
  title: 'Aa Title',
  author: 'Zq Xv',
  timelapse: `poems/${ID_A}/timelapse.midst.zip`,
  processNote: `poems/${ID_A}/process-note.md`,
  publishDate: '2020-03-03',
  highlighted: true,
  date: '2020-02-02',
  tags: [],
  ...over,
})
const list = (...poems: unknown[]) => ({ version: 1, updated: '2026-01-01T00:00:00.000Z', poems })

describe('parsePoemList', () => {
  it('knows exactly two lists', () => {
    expect(LISTS).toEqual(['bundled', 'published'])
  })

  it.each(['bundled', 'published'])('accepts %s', value => {
    expect(parsePoemList(value)).toBe(value)
  })

  it('refuses a missing value and says there is no default', () => {
    expect(() => parsePoemList(undefined)).toThrow('MIDST_POEM_LIST must be "bundled" or "published"; it is not set. There is no default.')
    expect(() => parsePoemList('')).toThrow('it is not set')
  })

  it.each(['Bundled', 'PUBLISHED', ' bundled', 'legacy', 'true', null, 0, ['bundled']])('refuses %p and quotes it', value => {
    expect(() => parsePoemList(value)).toThrow(`it is ${JSON.stringify(value)}`)
  })
})

describe('parsePublishedList', () => {
  it('keeps the list order, and records each key without the leading poems/', () => {
    const parsed = parsePublishedList(list(
      entry({ poemId: ID_B, timelapse: `poems/${ID_B}/timelapse.midst.zip`, processNote: `poems/${ID_B}/process-note.md` }),
      entry(),
    ))
    expect(parsed.map(p => p.poemId)).toEqual([ID_B, ID_A])
    expect(parsed[0].keys).toEqual({ timelapse: `${ID_B}/timelapse.midst.zip`, processNote: `${ID_B}/process-note.md` })
    expect(parsed[1].keys).toEqual({ timelapse: `${ID_A}/timelapse.midst.zip`, processNote: `${ID_A}/process-note.md` })
  })

  it('carries the display fields, and defaults the absent ones', () => {
    const [full] = parsePublishedList(list(entry()))
    expect(full).toMatchObject({ title: 'Aa Title', author: 'Zq Xv', publishDate: '2020-03-03', date: '2020-02-02', highlighted: true })
    const [bare] = parsePublishedList(list({ poemId: ID_A, title: 't', author: 'a', timelapse: 'poems/x/t.zip' }))
    expect(bare).toMatchObject({ publishDate: null, date: null, highlighted: false })
    expect(bare.keys.processNote).toBeNull()
  })

  it('records a null note as null', () => {
    expect(parsePublishedList(list(entry({ processNote: null })))[0].keys.processNote).toBeNull()
  })

  it('accepts an empty list: nothing published yet is a list', () => {
    expect(parsePublishedList(list())).toEqual([])
  })

  it.each([
    ['not an object', null],
    ['a string', 'x'],
    ['no poems array', { version: 1, updated: 'x' }],
    ['poems not an array', { version: 1, poems: {} }],
    ['an unknown version', { version: 2, poems: [] }],
    ['no version', { poems: [] }],
    ['an entry that is not an object', list(entry(), 'x')],
    ['an entry that is null', list(null)],
    ['an entry without poemId', list(entry(), entry({ poemId: undefined }))],
    ['an entry with an empty poemId', list(entry({ poemId: '' }))],
    ['an entry without timelapse', list(entry(), entry({ poemId: ID_B, timelapse: undefined }))],
    ['a timelapse not starting poems/', list(entry({ timelapse: `${ID_A}/timelapse.midst.zip` }))],
    ['a timelapse that is only poems/', list(entry({ timelapse: 'poems/' }))],
    ['a timelapse climbing out of poems/', list(entry({ timelapse: 'poems/../x.zip' }))],
    ['a note not starting poems/', list(entry({ processNote: `${ID_A}/process-note.md` }))],
    ['a note that is not text', list(entry({ processNote: 5 }))],
    ['an entry without a title', list(entry({ title: undefined }))],
    ['an entry without an author', list(entry({ author: undefined }))],
    ['two entries with one poemId', list(entry(), entry())],
  ])('refuses the whole list for %s', (_name, json) => {
    expect(() => parsePublishedList(json)).toThrow('The published poem list is not well formed.')
  })

  it('says nothing about which entry or what it held', () => {
    expect(() => parsePublishedList(list(entry({ title: 'Secret Title', timelapse: 'bad' }))))
      .toThrow(/^The published poem list is not well formed\.$/)
  })
})

describe('fetchRecordedKey', () => {
  it('requests base + key once, as written, with the options given', async () => {
    const request = jest.fn().mockResolvedValue({ ok: true })
    const options = { cache: 'no-cache' as const }
    await fetchRecordedKey('http://127.0.0.1:1/zq/poems/', `${ID_A}/timelapse.midst.zip`, options, request)
    expect(request.mock.calls).toEqual([[`http://127.0.0.1:1/zq/poems/${ID_A}/timelapse.midst.zip`, options]])
  })

  it('uses the global fetch when none is given', async () => {
    const saved = (globalThis as any).fetch
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({ ok: true })
    try {
      await fetchRecordedKey('http://127.0.0.1:1/zq/', 'k')
      expect((globalThis as any).fetch).toHaveBeenCalledWith('http://127.0.0.1:1/zq/k', {})
    } finally {
      ;(globalThis as any).fetch = saved
    }
  })
})
