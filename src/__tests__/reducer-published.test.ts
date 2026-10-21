import { LOAD_POEM_DATA, LOAD_POEM_FAILED, LOAD_POEM_LIST, POEM_LIST_FAILED, REVERSE_SORT_ORDER, SET_SORT_TERM, IState } from '../store/types'

// The reducer under MIDST_POEM_LIST=published (#110). The bundle is mocked with entries that must never
// appear: there is no fallback from the published list to the bundled one. Invented data only.
jest.mock('../poems', () => ({
  __esModule: true,
  default: [{ author: 'Bundled Author', title: 'Bundled Title', date: '2020-01-01', publishDate: '2020-01-01' }],
}))

const ID_A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const ID_B = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
const ID_C = '11111111-2222-4333-8444-555555555555'

// List order is B, C, A on purpose; by author it is C, A, B (A and B share nothing); by title A, B, C.
// C has no publish date, so the list opens A, B, C: newest first, undated last (midst-web #309).
const entries = [
  { poemId: ID_B, title: 'Bb Title', url: 'bb-title', author: 'Zq Xv', publishDate: '2019-04-04', date: '2019-01-01', highlighted: false,
    keys: { timelapse: `${ID_B}/t.zip`, processNote: `${ID_B}/n.md` } },
  { poemId: ID_C, title: 'Cc Title', url: 'cc-title', author: 'Kj Wm', publishDate: null, date: null, highlighted: true,
    keys: { timelapse: `${ID_C}/t.zip`, processNote: null } },
  { poemId: ID_A, title: 'Aa Title', url: 'aa-title', author: 'Mm Nn', publishDate: '2020-03-03', date: '2020-02-02', highlighted: false,
    keys: { timelapse: `${ID_A}/t.zip`, processNote: `${ID_A}/n.md` } },
]

type Reducer = (state: IState | undefined, action: any) => IState
let initialState: IState
let reducer: Reducer
const titles = (state: IState) => state.poems.map(poem => poem.title)

beforeAll(() => {
  const saved = process.env.MIDST_POEM_LIST
  process.env.MIDST_POEM_LIST = 'published'
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;({ initialState, reducer } = require('../store/reducer'))
  process.env.MIDST_POEM_LIST = saved
})

const loaded = () => reducer(initialState, { type: LOAD_POEM_LIST, payload: { entries } })
const ascending = (state: IState) => reducer(state, { type: REVERSE_SORT_ORDER })
const byId = (state: IState, id: string) => state.poems.find(poem => poem.poemId === id)!

describe('two published poems with the same title (#141)', () => {
  // Two poets, one title: each has its own address from the list, and its own id, so a load for one never lands on
  // the other. The same author is used on purpose: the derived id authorId--url would be the same for both.
  const twins = [
    { ...entries[0], poemId: ID_B, url: 'bb-title' },
    { ...entries[0], poemId: ID_C, url: 'bb-title--zq-xv' },
  ]
  const both = () => reducer(initialState, { type: LOAD_POEM_LIST, payload: { entries: twins } })

  it('gives each the address and id the list gives it, and keeps the name-derived class for styling', () => {
    expect(byId(both(), ID_B).url).toBe('bb-title')
    expect(byId(both(), ID_C).url).toBe('bb-title--zq-xv')
    expect(both().poems.map(poem => poem.cssId)).toEqual(['zq-xv--bb-title', 'zq-xv--bb-title'])
  })

  it('lands a load on the poem it was for, and only that one', () => {
    const next = reducer(both(), { type: LOAD_POEM_DATA, payload: { poemId: ID_C, data: { text: 'x' }, processNote: '' } })
    expect(byId(next, ID_B).loaded).toBe(false)
    expect(byId(next, ID_C).loaded).toBe(true)
  })
})

describe('published mode: before the list arrives', () => {
  it('starts with no poems and says it is loading; the bundle is not used', () => {
    expect(initialState.poems).toEqual([])
    expect(initialState.poemList).toBe('loading')
  })
})

describe('LOAD_POEM_LIST', () => {
  it('fills the state newest first by publish date, undated last, and marks the list ready', () => {
    const next = loaded()
    expect(titles(next)).toEqual(['Aa Title', 'Bb Title', 'Cc Title'])
    expect(next.poemList).toBe('ready')
    expect(next.poemListFailure).toBeNull()
    expect(titles(next)).not.toContain('Bundled Title')
  })

  it('makes the same poem createPoem makes, with the list\'s id and address, and the recorded keys carried', () => {
    const b = byId(loaded(), ID_B)
    const c = byId(loaded(), ID_C)
    expect(b).toMatchObject({
      id: ID_B, author: 'Zq Xv', title: 'Bb Title', authorId: 'zq-xv', url: 'bb-title', poemId: ID_B,
      slug: 'bb-title', loaded: false, data: null, processNote: '', highlighted: false,
      keys: { timelapse: `${ID_B}/t.zip`, processNote: `${ID_B}/n.md` },
    })
    expect(b.publishDate.format('YYYY-MM-DD')).toBe('2019-04-04')
    expect(b.date.format('YYYY-MM-DD')).toBe('2019-01-01')
    expect(c.highlighted).toBe(true)
  })

  it('carries a null note as null, and null dates as invalid moments rather than today', () => {
    const c = byId(loaded(), ID_C)
    expect(c.keys).toEqual({ timelapse: `${ID_C}/t.zip`, processNote: null })
    expect(c.date.isValid()).toBe(false)
    expect(c.publishDate.isValid()).toBe(false)
  })

  it('reads a stored date strictly as YYYY-MM-DD: another form is no date, never a guessed one (#81)', () => {
    const next = reducer(initialState, { type: LOAD_POEM_LIST, payload: { entries: [
      { ...entries[0], publishDate: '4/4/2019', date: '2019-01-01T00:00:00Z' },
    ] } })
    const [p] = next.poems
    expect(p.publishDate.isValid()).toBe(false)
    expect(p.date.isValid()).toBe(false)
  })

  it('numbers the poems by their place in the list', () => {
    const next = loaded()
    expect([ID_B, ID_C, ID_A].map(id => byId(next, id).position)).toEqual([0, 1, 2])
  })

  it('an empty list is a list: ready, no poems', () => {
    const next = reducer(initialState, { type: LOAD_POEM_LIST, payload: { entries: [] } })
    expect(next.poems).toEqual([])
    expect(next.poemList).toBe('ready')
  })

  it('does not mutate the input state', () => {
    loaded()
    expect(initialState.poems).toEqual([])
    expect(initialState.poemList).toBe('loading')
  })

  it('loaded poems take LOAD_POEM_DATA and LOAD_POEM_FAILED like bundled ones', () => {
    const withData = reducer(loaded(), { type: LOAD_POEM_DATA, payload: { poemId: ID_C, data: { text: 'x' }, processNote: '' } })
    expect(byId(withData, ID_C).loaded).toBe(true)
    const failed = reducer(loaded(), { type: LOAD_POEM_FAILED, payload: { poemId: ID_B, reason: 'missing' } })
    expect(byId(failed, ID_B).loadFailure).toBe('missing')
  })
})

describe('POEM_LIST_FAILED', () => {
  const failed = () => reducer(undefined, { type: POEM_LIST_FAILED, payload: { reason: 'server' } })

  it('marks the list failed with its reason, and leaves no poems: nothing replaces the list', () => {
    const next = failed()
    expect(next.poemList).toBe('failed')
    expect(next.poemListFailure).toBe('server')
    expect(next.poems).toEqual([])
  })

  it('shows no poem whatever the state held before', () => {
    expect(reducer(loaded(), { type: POEM_LIST_FAILED, payload: { reason: 'malformed' } }).poems).toEqual([])
  })

  it('does not mutate the input state', () => {
    failed()
    expect(initialState.poemList).toBe('loading')
  })
})

describe('sorting a loaded list', () => {
  it('sorts the loaded poems, not the bundle', () => {
    const byTitle = reducer(ascending(loaded()), { type: SET_SORT_TERM, payload: 'title' })
    expect(titles(byTitle)).toEqual(['Aa Title', 'Bb Title', 'Cc Title'])
    const byAuthor = reducer(ascending(loaded()), { type: SET_SORT_TERM, payload: 'author' })
    expect(titles(byAuthor)).toEqual(['Cc Title', 'Aa Title', 'Bb Title'])
  })

  it('reverses a sorted loaded list', () => {
    // Opens descending, so by title it is Cc, Bb, Aa; reversed, Aa, Bb, Cc.
    const byTitle = reducer(loaded(), { type: SET_SORT_TERM, payload: 'title' })
    expect(titles(byTitle)).toEqual(['Cc Title', 'Bb Title', 'Aa Title'])
    const reversed = reducer(byTitle, { type: REVERSE_SORT_ORDER })
    expect(titles(reversed)).toEqual(['Aa Title', 'Bb Title', 'Cc Title'])
  })

  it('keeps the data a poem has loaded', () => {
    const withData = reducer(loaded(), { type: LOAD_POEM_DATA, payload: { poemId: ID_B, data: { text: 'x' }, processNote: 'note' } })
    const sorted = reducer(withData, { type: SET_SORT_TERM, payload: 'title' })
    const b = sorted.poems.find(poem => poem.id === ID_B)
    expect(b?.loaded).toBe(true)
    expect(b?.data).toEqual({ text: 'x' })
    expect(b?.processNote).toBe('note')
  })

  it('breaks ties by list position, not by where an earlier sort left them', () => {
    const sameAuthor = [entries[2], entries[0], entries[1]].map(e => ({ ...e, author: 'Mm Nn' }))
    // Listed Aa, Bb, Cc. Sorted by title and then by author, nothing separates them but their place in the list.
    const tied = ascending(reducer(initialState, { type: LOAD_POEM_LIST, payload: { entries: [sameAuthor[2], sameAuthor[1], sameAuthor[0]] } }))
    const byTitle = reducer(tied, { type: SET_SORT_TERM, payload: 'title' })
    expect(titles(byTitle)).toEqual(['Aa Title', 'Bb Title', 'Cc Title'])
    expect(titles(reducer(byTitle, { type: SET_SORT_TERM, payload: 'author' }))).toEqual(['Cc Title', 'Bb Title', 'Aa Title'])
  })
})

describe('opening order of a loaded list (midst-web #309)', () => {
  const entry = (title: string, publishDate: string | null) => ({
    poemId: `id-${title}`, title, url: title.toLowerCase(), author: 'Zq Xv', publishDate, date: null, highlighted: false,
    keys: { timelapse: `id-${title}/t.zip`, processNote: null },
  })
  const load = (list: ReturnType<typeof entry>[]) => reducer(initialState, { type: LOAD_POEM_LIST, payload: { entries: list } })
  const sortBy = (state: IState, payload: string) => reducer(state, { type: SET_SORT_TERM, payload })

  // Listed oldest first, with undated poems among the dated ones; '4/4/2019' is not a stored date, so it is none.
  const mixed = [
    entry('Nn', null), entry('Dd', '2018-01-01'), entry('Mm', null), entry('Bb', '2020-05-05'), entry('Kk', '4/4/2019'), entry('Ca', '2019-02-02'),
  ]

  it('a loaded list opens newest first by publish date', () => {
    const next = load([entry('Dd', '2018-01-01'), entry('Bb', '2020-05-05'), entry('Ca', '2019-02-02')])
    expect(next.sortOrder).toBe('DESC')
    expect(next.sortTerm).toBe('publishDate')
    expect(titles(next)).toEqual(['Bb', 'Ca', 'Dd'])
  })

  it('poems with no publish date come last, in list order, newest first', () => {
    expect(titles(load(mixed))).toEqual(['Bb', 'Ca', 'Dd', 'Nn', 'Mm', 'Kk'])
  })

  it('poems with no publish date still come last, in list order, after REVERSE_SORT_ORDER (oldest first)', () => {
    expect(titles(ascending(load(mixed)))).toEqual(['Dd', 'Ca', 'Bb', 'Nn', 'Mm', 'Kk'])
  })

  it('sorting by author or title and back to publish date keeps undated poems last', () => {
    const byTitle = sortBy(load(mixed), 'title')
    expect(titles(byTitle)).toEqual(['Nn', 'Mm', 'Kk', 'Dd', 'Ca', 'Bb'])
    expect(titles(sortBy(byTitle, 'publishDate'))).toEqual(['Bb', 'Ca', 'Dd', 'Nn', 'Mm', 'Kk'])
    const byAuthor = sortBy(load(mixed), 'author')
    // One author for all six: a tie, so list order, in descending as in ascending.
    expect(titles(byAuthor)).toEqual(['Nn', 'Dd', 'Mm', 'Bb', 'Kk', 'Ca'])
    expect(titles(sortBy(byAuthor, 'publishDate'))).toEqual(['Bb', 'Ca', 'Dd', 'Nn', 'Mm', 'Kk'])
    expect(titles(sortBy(ascending(byAuthor), 'publishDate'))).toEqual(['Dd', 'Ca', 'Bb', 'Nn', 'Mm', 'Kk'])
  })
})
