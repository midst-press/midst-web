import { TAGS_URL, entryTagIds, loadSiteTags, marksFor, parseTags } from '../tags'

// The site's tags (#310): the file the back end writes, and each poem's tag ids from the published list. Names are
// invented.

const FILE = { version: 1, updated: '2026-10-22T00:00:00.000Z', tags: [{ id: 'ta', name: 'Zq Green', colour: '#006400' }, { id: 'tb', name: 'Zq Pale', colour: '#FAFAD2' }] }

describe('parseTags', () => {
  it('reads each sound tag, by id, colour in lower case', () => {
    expect([...parseTags(FILE).values()]).toEqual([{ id: 'ta', name: 'Zq Green', colour: '#006400' }, { id: 'tb', name: 'Zq Pale', colour: '#fafad2' }])
  })
  it('leaves out a tag that is not sound, and keeps the rest', () => {
    const tags = parseTags({ version: 1, tags: [null, { id: '', name: 'x', colour: '#000000' }, { id: 'tc', name: ' ', colour: '#000000' }, { id: 'td', name: 'Zq', colour: 'green' }, FILE.tags[0]] })
    expect([...tags.keys()]).toEqual(['ta'])
  })
  it('refuses anything that is not the file', () => {
    for (const json of [null, {}, { version: 2, tags: [] }, { version: 1, tags: 'x' }]) {
      expect(() => parseTags(json)).toThrow('tags.json is not a list of tags')
    }
  })
})

describe('loadSiteTags', () => {
  it('fetches /site/tags.json without a stale cache, and rejects an error status', async () => {
    const ok = jest.fn(async () => ({ ok: true, json: async () => FILE })) as unknown as typeof fetch & jest.Mock
    expect((await loadSiteTags(ok)).size).toBe(2)
    expect(ok.mock.calls[0]).toEqual([TAGS_URL, { cache: 'no-cache' }])
    expect(TAGS_URL).toBe('/site/tags.json')
    const missing = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch
    await expect(loadSiteTags(missing)).rejects.toThrow('tags.json answered 404')
  })
})

describe('entryTagIds and marksFor', () => {
  it('reads each entry\'s strings in `tags`, by poemId; an entry without a list has none', () => {
    const ids = entryTagIds({ version: 1, poems: [{ poemId: 'p1', tags: ['tb', 7, 'Mexico', 'ta'] }, { poemId: 'p2', tags: '' }, { poemId: 'p3' }, null] })
    expect([...ids.entries()]).toEqual([['p1', ['tb', 'Mexico', 'ta']]])
    expect(entryTagIds(null).size).toBe(0)
  })
  it('marks only the ids that are tags, in the poem\'s order; none before the tags are read', () => {
    const tags = parseTags(FILE)
    expect(marksFor(['tb', 'Mexico', 'ta'], tags).map(t => t.name)).toEqual(['Zq Pale', 'Zq Green'])
    expect(marksFor(['ta'], null)).toEqual([])
    expect(marksFor(undefined, tags)).toEqual([])
  })
})
