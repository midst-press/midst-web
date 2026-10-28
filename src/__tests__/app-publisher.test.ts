import { Call, lastEditedWords, leftInCache, loadList, newestFirst, publish, saveDetails, saveTitleAndName, unpublish } from '../app/publisher'

// The publisher's calls (docs/app-api.md) and the newest-first order the page shows.

describe('the calls', () => {
  it('use the contract’s routes, methods and bodies, each carrying the listEtag', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await loadList(call)
    await publish(call, 'p1', 'e1', { publishDate: '2026-10-21', highlighted: false })
    await unpublish(call, 'p1', 'e2')
    await saveDetails(call, 'p/1', { publishDate: '2026-10-20', highlighted: true }, 'e4')
    expect(call.mock.calls).toEqual([
      ['/publisher/poems'],
      ['/publisher/publish', { method: 'POST', body: { poemId: 'p1', listEtag: 'e1', publishDate: '2026-10-21', highlighted: false } }],
      ['/publisher/unpublish', { method: 'POST', body: { poemId: 'p1', listEtag: 'e2' } }],
      ['/publisher/poems/p%2F1', { method: 'PUT', body: { publishDate: '2026-10-20', highlighted: true, listEtag: 'e4' } }],
    ])
  })
})

describe('publish with a poem it replaces (#101; midst-infra #190)', () => {
  it('sends replaces when one is named, and no replaces key when none is', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await publish(call, 'p1', 'e1', { publishDate: '2026-10-21', highlighted: false }, 'p0')
    await publish(call, 'p1', 'e1', { publishDate: '2026-10-21', highlighted: false }, undefined)
    await publish(call, 'p1', 'e1', { publishDate: '2026-10-21', highlighted: false }, '')
    expect(call.mock.calls).toEqual([
      ['/publisher/publish', { method: 'POST', body: { poemId: 'p1', listEtag: 'e1', publishDate: '2026-10-21', highlighted: false, replaces: 'p0' } }],
      ['/publisher/publish', { method: 'POST', body: { poemId: 'p1', listEtag: 'e1', publishDate: '2026-10-21', highlighted: false } }],
      ['/publisher/publish', { method: 'POST', body: { poemId: 'p1', listEtag: 'e1', publishDate: '2026-10-21', highlighted: false } }],
    ])
    for (const [, init] of call.mock.calls.slice(1)) expect(Object.keys(init.body)).not.toContain('replaces')
  })
})

// #239: the page warns only on an explicit false. No field means nothing was withdrawn.
describe('leftInCache', () => {
  it('is true only for an answer whose edgeCleared is false', () => {
    expect(leftInCache({ listEtag: 'e2', published: [], edgeCleared: false })).toBe(true)
  })

  it('is false when the copies were cleared, when nothing was withdrawn, and for anything else', () => {
    for (const result of [{ edgeCleared: true }, { listEtag: 'e2', published: [] }, { edgeCleared: 'false' }, { edgeCleared: 0 },
      { edgeCleared: null }, null, undefined, 'false', false]) {
      expect(leftInCache(result)).toBe(false)
    }
  })
})

describe('lastEditedWords', () => {
  it('says when the poet last edited, as the reader writes dates (#305)', () => {
    const at = '2021-01-07T08:00:00.000Z'
    expect(lastEditedWords(at)).toBe(`last edited ${new Date(at).toLocaleDateString()}`)
  })

  it('says nothing when it is not known: null, absent (an API before midst-infra #208), or not a time', () => {
    expect(lastEditedWords(null)).toBeNull()
    expect(lastEditedWords(undefined)).toBeNull()
    expect(lastEditedWords('not a time')).toBeNull()
  })
})

describe('saveDetails and tags (#310)', () => {
  it('sends tags only when given, so a date or highlight change leaves a poem\'s tags alone', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await saveDetails(call, 'p1', { publishDate: null, highlighted: false }, 'e1')
    await saveDetails(call, 'p1', { publishDate: null, highlighted: false, tags: ['ta'] }, 'e2')
    expect(call.mock.calls).toEqual([
      ['/publisher/poems/p1', { method: 'PUT', body: { publishDate: null, highlighted: false, listEtag: 'e1' } }],
      ['/publisher/poems/p1', { method: 'PUT', body: { publishDate: null, highlighted: false, tags: ['ta'], listEtag: 'e2' } }],
    ])
  })
})

describe('saveTitleAndName (#372)', () => {
  it('sends the new pair and the pair shown, which the server checks', async () => {
    const call = jest.fn(async () => ({ title: 'Zq', author: 'Vb' })) as unknown as Call & jest.Mock
    await saveTitleAndName(call, 'p/1', { title: 'Zq', author: 'Vb' }, { title: 'Ta', author: 'Aa' })
    expect(call.mock.calls).toEqual([
      ['/publisher/poems/p%2F1/details', { method: 'PUT', body: { title: 'Zq', author: 'Vb', shown: { title: 'Ta', author: 'Aa' } } }],
    ])
  })
})

describe('newestFirst (#377)', () => {
  const p = (poemId: string, publishDate: string | null) => ({ poemId, publishDate })
  it('orders by publish date newest first, keeps list order for one date, and puts undated poems last in list order', () => {
    const list = [p('a', null), p('b', '2026-01-02'), p('c', '2026-03-04'), p('d', 'not a date'), p('e', '2026-01-02'), p('f', '2025-12-31')]
    expect(newestFirst(list).map(x => x.poemId)).toEqual(['c', 'b', 'e', 'f', 'a', 'd'])
  })
  it('leaves the list it is given as it was', () => {
    const list = [p('a', '2026-01-01'), p('b', '2026-02-01')]
    newestFirst(list)
    expect(list.map(x => x.poemId)).toEqual(['a', 'b'])
  })
})
