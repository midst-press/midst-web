import { Call, Poem, lastEditedWords, leftInCache, loadList, moved, orderChanged, publish, saveDetails, saveOrder, unpublish } from '../app/publisher'

// The publisher's calls (docs/app-api.md) and the reordering the page does before it saves.

const poem = (poemId: string): Poem =>
  ({ poemId, title: `Zq ${poemId}`, author: 'Qz', timelapseKey: `poems/${poemId}/t`, processNoteKey: null, publishDate: null, highlighted: false })

describe('moved', () => {
  it('moves an item up, down, to the top and to the bottom', () => {
    expect(moved(['a', 'b', 'c', 'd'], 2, 1)).toEqual(['a', 'c', 'b', 'd'])
    expect(moved(['a', 'b', 'c', 'd'], 0, 1)).toEqual(['b', 'a', 'c', 'd'])
    expect(moved(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moved(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('returns the same list, untouched, for a move that goes nowhere or off either end', () => {
    const items = ['a', 'b']
    for (const [from, to] of [[0, 0], [0, -1], [1, 2], [-1, 0], [2, 0]]) expect(moved(items, from, to)).toBe(items)
    expect(items).toEqual(['a', 'b'])
  })
})

describe('orderChanged', () => {
  it('is true only when the ids differ in order', () => {
    const [a, b] = [poem('a'), poem('b')]
    expect(orderChanged([a, b], [a, b])).toBe(false)
    expect(orderChanged([a, b], [b, a])).toBe(true)
    expect(orderChanged([a, b], [a])).toBe(true)
  })
})

describe('the calls', () => {
  it('use the contract’s routes, methods and bodies, each carrying the listEtag', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await loadList(call)
    await publish(call, 'p1', 'e1', { publishDate: '2026-10-21', highlighted: false })
    await unpublish(call, 'p1', 'e2')
    await saveOrder(call, ['p2', 'p1'], 'e3')
    await saveDetails(call, 'p/1', { publishDate: '2026-10-20', highlighted: true }, 'e4')
    expect(call.mock.calls).toEqual([
      ['/publisher/poems'],
      ['/publisher/publish', { method: 'POST', body: { poemId: 'p1', listEtag: 'e1', publishDate: '2026-10-21', highlighted: false } }],
      ['/publisher/unpublish', { method: 'POST', body: { poemId: 'p1', listEtag: 'e2' } }],
      ['/publisher/order', { method: 'PUT', body: { poemIds: ['p2', 'p1'], listEtag: 'e3' } }],
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
