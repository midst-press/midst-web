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
    expect(parsed[0].keys).toEqual({ timelapse: `${ID_B}/timelapse.midst.zip`, processNote: `${ID_B}/process-note.md`, photo: null })
    expect(parsed[1].keys).toEqual({ timelapse: `${ID_A}/timelapse.midst.zip`, processNote: `${ID_A}/process-note.md`, photo: null })
  })

  it('carries the display fields, and defaults the absent ones', () => {
    const [full] = parsePublishedList(list(entry()))
    expect(full).toMatchObject({ title: 'Aa Title', author: 'Zq Xv', publishDate: '2020-03-03', date: '2020-02-02', highlighted: true })
    const [bare] = parsePublishedList(list({ poemId: ID_A, title: 't', author: 'a', timelapse: 'poems/x/t.zip' }))
    expect(bare).toMatchObject({ publishDate: null, date: null, highlighted: false })
    expect(bare.keys.processNote).toBeNull()
  })

  it('accepts a real YYYY-MM-DD date, including a leap day, and null (#81)', () => {
    const [p] = parsePublishedList(list(entry({ publishDate: '2024-02-29', date: null })))
    expect(p).toMatchObject({ publishDate: '2024-02-29', date: null })
  })

  it('records a null note as null', () => {
    expect(parsePublishedList(list(entry({ processNote: null })))[0].keys.processNote).toBeNull()
  })

  it('carries an author photo key under poems/ without the prefix, and null when absent (#312)', () => {
    expect(parsePublishedList(list(entry({ photo: `poems/${ID_A}/g1/author-photo.png` })))[0].keys.photo).toBe(`${ID_A}/g1/author-photo.png`)
    expect(parsePublishedList(list(entry()))[0].keys.photo).toBeNull()
    expect(parsePublishedList(list(entry({ photo: null })))[0].keys.photo).toBeNull()
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
    ['a photo not starting poems/ (#312)', list(entry({ photo: `${ID_A}/author-photo.jpg` }))],
    ['a photo that is not text (#312)', list(entry({ photo: 5 }))],
    ['an entry without a title', list(entry({ title: undefined }))],
    ['an entry without an author', list(entry({ author: undefined }))],
    ['two entries with one poemId', list(entry(), entry())],
    ['a publishDate in M/D/YYYY (#81)', list(entry({ publishDate: '3/3/2020' }))],
    ['a date in M/D/YYYY (#81)', list(entry({ date: '2/2/2020' }))],
    ['a date that is not a real date', list(entry({ date: '2021-02-29' }))],
    ['a publishDate with a time on it', list(entry({ publishDate: '2020-03-03T00:00:00.000Z' }))],
    ['an empty date', list(entry({ date: '' }))],
    ['a date that is not text', list(entry({ publishDate: 20200303 }))],
  ])('refuses the whole list for %s', (_name, json) => {
    expect(() => parsePublishedList(json)).toThrow('The published poem list is not well formed.')
  })

  it('says nothing about which entry or what it held', () => {
    expect(() => parsePublishedList(list(entry({ title: 'Secret Title', timelapse: 'bad' }))))
      .toThrow(/^The published poem list is not well formed\.$/)
  })
})

describe('addresses (#141)', () => {
  const ID_C = '11111111-2222-4333-8444-555555555555'
  const ID_D = '22222222-3333-4444-8555-666666666666'
  const at = (poemId: string, over: Record<string, unknown> = {}) =>
    entry({ poemId, timelapse: `poems/${poemId}/t.zip`, processNote: null, ...over })
  const urls = (...poems: unknown[]) => parsePublishedList(list(...poems)).map(p => [p.poemId, p.url])

  it('is the title\'s address when no other poem has it', () => {
    expect(urls(at(ID_A, { title: 'Aa Title' }), at(ID_B, { title: 'Bb, Title' }))).toEqual([[ID_A, 'aa-title'], [ID_B, 'bb-title']])
  })

  it('goes to the first published of a shared title; a later one adds its author', () => {
    const first = at(ID_B, { author: 'Zq Xv', firstPublishedAt: '2026-01-01T00:00:00.000Z' })
    const later = at(ID_A, { author: 'Kj Wm', firstPublishedAt: '2026-05-05T00:00:00.000Z' })
    expect(urls(later, first)).toEqual([[ID_A, 'aa-title--kj-wm'], [ID_B, 'aa-title']])
  })

  it('does not move when the list is reordered, and counts a poem with no first publication time as first', () => {
    const old = at(ID_B, { author: 'Zq Xv' })
    const later = at(ID_A, { author: 'Kj Wm', firstPublishedAt: '2026-05-05T00:00:00.000Z' })
    expect(urls(old, later)).toEqual([[ID_B, 'aa-title'], [ID_A, 'aa-title--kj-wm']])
    expect(urls(later, old)).toEqual([[ID_A, 'aa-title--kj-wm'], [ID_B, 'aa-title']])
  })

  it('breaks a tie of times by id, and numbers an address the author\'s one would repeat', () => {
    // By id, the order is ID_A (0a1b…), ID_C (1111…), ID_D (2222…), ID_B (ffff…).
    const time = { author: 'Zq Xv', firstPublishedAt: '2026-01-01T00:00:00.000Z' }
    const found = urls(at(ID_D, time), at(ID_C, time), at(ID_B, time), at(ID_A, time))
    expect(new Map(found as [string, string][])).toEqual(new Map([
      [ID_A, 'aa-title'], [ID_C, 'aa-title--zq-xv'], [ID_D, 'aa-title--zq-xv-2'], [ID_B, 'aa-title--zq-xv-3'],
    ]))
  })

  it('never gives a later poem an address another poem has as its own title', () => {
    // poemUrl folds a pair of hyphens, but not a run of three: this title's own address is aa-title--zq-xv.
    const plain = at(ID_A, { title: 'Aa Title---zq-xv', author: 'Kj Wm' })
    const first = at(ID_B, { firstPublishedAt: '2026-01-01T00:00:00.000Z' })
    const second = at(ID_C, { firstPublishedAt: '2026-02-01T00:00:00.000Z' })
    const found = new Map(urls(plain, first, second) as [string, string][])
    expect(found.get(ID_A)).toBe('aa-title--zq-xv')
    expect(found.get(ID_C)).toBe('aa-title--zq-xv-2')
    expect(new Set(found.values()).size).toBe(3)
  })

  it('orders by code unit, not by the reader\'s collation, so every browser gives the same addresses', () => {
    // vivian-1a61bc9a, review of #216: in Danish, "aa" collates after "ab". Any collation here is wrong.
    const real = String.prototype.localeCompare
    String.prototype.localeCompare = () => { throw new Error('collation used') }
    try {
      const found = new Map(urls(at('ab000000-zq', { author: 'Zq Xv' }), at('aa000000-zq', { author: 'Zq Xv' })) as [string, string][])
      expect(found.get('aa000000-zq')).toBe('aa-title')
      expect(found.get('ab000000-zq')).toBe('aa-title--zq-xv')
    } finally {
      String.prototype.localeCompare = real
    }
  })

  it('moves a later poem onto an address its sibling gave up when it was unpublished', () => {
    const time = (month: number) => ({ firstPublishedAt: `2026-0${month}-01T00:00:00.000Z` })
    const all = urls(at(ID_A, time(1)), at(ID_B, time(2)), at(ID_C, time(3)))
    expect(all).toEqual([[ID_A, 'aa-title'], [ID_B, 'aa-title--zq-xv'], [ID_C, 'aa-title--zq-xv-2']])
    expect(urls(at(ID_A, time(1)), at(ID_C, time(3)))).toEqual([[ID_A, 'aa-title'], [ID_C, 'aa-title--zq-xv']])
  })

  it('gives the title\'s address back to a poem from before first publication was recorded, when it is republished', () => {
    const since = at(ID_B, { author: 'Kj Wm', firstPublishedAt: '2026-05-05T00:00:00.000Z' })
    expect(urls(since)).toEqual([[ID_B, 'aa-title']])
    expect(urls(since, at(ID_A, { author: 'Zq Xv' }))).toEqual([[ID_B, 'aa-title--kj-wm'], [ID_A, 'aa-title']])
  })

  it('refuses a first publication time that is not text', () => {
    expect(() => parsePublishedList(list(at(ID_A, { firstPublishedAt: 7 })))).toThrow('not well formed')
  })
})

describe('stored addresses (#101)', () => {
  const ID_C = '11111111-2222-4333-8444-555555555555'
  const at = (poemId: string, over: Record<string, unknown> = {}) =>
    entry({ poemId, timelapse: `poems/${poemId}/t.zip`, processNote: null, ...over })
  const urls = (...poems: unknown[]) => parsePublishedList(list(...poems)).map(p => [p.poemId, p.url])

  it('uses each stored address as stored, even where derivation would give another', () => {
    // Derived, these would be aa-title and aa-title--zq-xv: the publisher's choice stands.
    expect(urls(at(ID_A, { url: 'aa-title--kj-wm' }), at(ID_B, { url: 'kept-from-before' }))).toEqual([
      [ID_A, 'aa-title--kj-wm'], [ID_B, 'kept-from-before'],
    ])
  })

  it('takes any character derivation can produce, an accented one or a question mark included', () => {
    expect(urls(at(ID_A, { url: 'caf\u00e9-zq?' }))).toEqual([[ID_A, 'caf\u00e9-zq?']])
  })

  it('refuses a list where some entries have an address and some do not', () => {
    expect(() => parsePublishedList(list(at(ID_A, { url: 'aa-title' }), at(ID_B)))).toThrow('not well formed')
    expect(() => parsePublishedList(list(at(ID_A), at(ID_B, { url: 'aa-title' })))).toThrow('not well formed')
  })

  it('refuses an address used twice', () => {
    expect(() => parsePublishedList(list(at(ID_A, { url: 'aa-title' }), at(ID_B, { url: 'aa-title' }), at(ID_C, { url: 'x' }))))
      .toThrow('not well formed')
  })

  it('refuses two addresses that differ only in Unicode normalisation', () => {
    const composed = 'caf\u00e9-tide'
    const decomposed = 'cafe\u0301-tide'
    expect(composed).not.toBe(decomposed)
    expect(() => parsePublishedList(list(at(ID_A, { url: composed }), at(ID_B, { url: decomposed })))).toThrow('not well formed')
    expect(() => parsePublishedList(list(at(ID_A, { url: decomposed }), at(ID_B, { url: composed })))).toThrow('not well formed')
  })

  it('refuses an address that is not one path segment of text', () => {
    for (const url of ['', 'a/b', '/a', 'a\nb', 'a\u0000b', 'a\u007fb', null, 7, ['aa-title']]) {
      expect(() => parsePublishedList(list(at(ID_A, { url })))).toThrow('not well formed')
    }
  })

  it('names no poem in what it throws', () => {
    expect(() => parsePublishedList(list(at(ID_A, { url: 'aa-title' }), at(ID_B)))).toThrow(/^The published poem list is not well formed\.$/)
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
