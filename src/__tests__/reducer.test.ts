import { initialState, reducer } from '../store/reducer'
import {
  LOAD_POEM_DATA,
  LOAD_POEM_FAILED,
  LOAD_POEM_RETRY,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,
  IState,
} from '../store/types'

// Invented metadata only. Mock order is deliberately different from the author, title and
// publishDate orders, which also differ from each other:
//   mock order:   Aa Title, Cc Title, Bb, Ti   (also the newest-first order the state opens in, and position order)
//   by author:    Cc Title (Kj, Wm), Aa Title (Mm Nn), Bb, Ti (Zq Xv)
//   by title:     Aa Title, Bb, Ti, Cc Title
//   by date:      Bb, Ti (2018), Cc Title (2019), Aa Title (2020)
jest.mock('../poems', () => ({
  __esModule: true,
  default: [
    {
      author: 'Mm Nn',
      title: 'Aa Title',
      date: '2020-02-02',
      publishDate: '2020-03-03',
    },
    {
      author: 'Kj, Wm',
      title: 'Cc Title',
      date: '2019-01-01',
      publishDate: '2019-04-04',
    },
    {
      author: 'Zq Xv',
      title: 'Bb, Ti',
      date: '2017-05-05',
      publishDate: '2018-06-06',
      id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      authorSecondaryFolder: 'zq-folder',
      cursorFollowing: true,
      hasScrollbar: false,
      highlighted: true,
      badge: 'Qq',
    },
  ],
}))

const titles = (state: IState) => state.poems.map(poem => poem.title)

// The state opens newest first by publish date (midst-web #309).
const OPENING_ORDER = ['Aa Title', 'Cc Title', 'Bb, Ti']
const MOCK_ORDER = ['Aa Title', 'Cc Title', 'Bb, Ti']
const BY_AUTHOR = ['Cc Title', 'Aa Title', 'Bb, Ti']
const BY_TITLE = ['Aa Title', 'Bb, Ti', 'Cc Title']
const BY_DATE = ['Bb, Ti', 'Cc Title', 'Aa Title']

const reverse = <T>(list: T[]) => [...list].reverse()

// The same state with the order flipped to ascending, for tests that are about ascending order or list-order ties.
const ascending = (state: IState) => reducer(state, { type: REVERSE_SORT_ORDER })
const byTitle = (state: IState, title: string) => state.poems.find(poem => poem.title === title)!

describe('initialState', () => {
  it('has the expected flags and sort settings', () => {
    expect(initialState.mobileNavOpen).toBe(false)
    expect(initialState.processNoteOpen).toBe(false)
    expect(initialState.sortOrder).toBe('DESC')
    expect(initialState.sortTerm).toBe('publishDate')
  })

  it('has one poem per mocked entry, newest first by publish date', () => {
    expect(titles(initialState)).toEqual(OPENING_ORDER)
    expect(initialState.poems.map(poem => poem.publishDate.format('YYYY-MM-DD'))).toEqual(['2020-03-03', '2019-04-04', '2018-06-06'])
  })
})

describe('createPoem (via initialState.poems)', () => {
  const full = byTitle(initialState, 'Bb, Ti')
  const sparse = byTitle(initialState, 'Aa Title')

  it('derives author, title, authorId, url, poemId and slug', () => {
    expect(full.author).toBe('Zq Xv')
    expect(full.title).toBe('Bb, Ti')
    expect(full.authorId).toBe('zq-xv')
    expect(full.url).toBe('bb-ti')
    expect(full.poemId).toBe('zq-xv--bb-ti')
    expect(full.slug).toBe('bb-ti')
  })

  it('derives ids for a comma in the author and a plain title', () => {
    const poem = byTitle(initialState, 'Cc Title')
    expect(poem.authorId).toBe('kj,-wm')
    expect(poem.url).toBe('cc-title')
    expect(poem.poemId).toBe('kj,-wm--cc-title')
    expect(poem.slug).toBe('cc-title')
  })

  it('starts unloaded with empty data, note and tags', () => {
    expect(full.data).toBeNull()
    expect(full.loaded).toBe(false)
    expect(full.processNote).toBe('')
    expect(full.tags).toBe('')
  })

  it('turns date and publishDate into moments for the given dates', () => {
    expect(full.date.format('YYYY-MM-DD')).toBe('2017-05-05')
    expect(full.publishDate.format('YYYY-MM-DD')).toBe('2018-06-06')
    expect(full.date.isValid()).toBe(true)
    expect(full.publishDate.isValid()).toBe(true)
  })

  it('passes through the optional fields when given', () => {
    expect(full.authorSecondaryFolder).toBe('zq-folder')
    // The storage id is carried as given, and is not the route-derived poemId.
    expect(full.id).toBe('0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')
    expect(full.cursorFollowing).toBe(true)
    expect(full.hasScrollbar).toBe(false)
    expect(full.highlighted).toBe(true)
    expect(full.badge).toBe('Qq')
  })

  it('leaves the optional fields undefined when missing', () => {
    expect(sparse.authorSecondaryFolder).toBeUndefined()
    expect(sparse.id).toBeUndefined()
    expect(sparse.cursorFollowing).toBeUndefined()
    expect(sparse.hasScrollbar).toBeUndefined()
    expect(sparse.highlighted).toBeUndefined()
    expect(sparse.badge).toBeUndefined()
  })
})

describe('unknown actions', () => {
  it('returns the same state object', () => {
    const state = { ...initialState }
    expect(reducer(state, { type: 'NOT_AN_ACTION' })).toBe(state)
  })

  it('returns initialState when state is undefined', () => {
    expect(reducer(undefined, { type: 'NOT_AN_ACTION' })).toBe(initialState)
  })
})

describe.each([
  ['SET_MOBILE_NAV_OPEN', SET_MOBILE_NAV_OPEN, 'mobileNavOpen', 'processNoteOpen'],
  ['SET_PROCESS_NOTE_OPEN', SET_PROCESS_NOTE_OPEN, 'processNoteOpen', 'mobileNavOpen'],
] as const)('%s', (_name, type, field, other) => {
  it('sets true then false', () => {
    const opened = reducer(initialState, { type, payload: true })
    expect(opened[field]).toBe(true)
    const closed = reducer(opened, { type, payload: false })
    expect(closed[field]).toBe(false)
  })

  it('returns a new object and leaves the other fields and poems alone', () => {
    const opened = reducer(initialState, { type, payload: true })
    expect(opened).not.toBe(initialState)
    expect(opened[other]).toBe(initialState[other])
    expect(opened.sortOrder).toBe('DESC')
    expect(opened.sortTerm).toBe('publishDate')
    expect(opened.poems).toBe(initialState.poems)
  })

  it('does not mutate the input state', () => {
    reducer(initialState, { type, payload: true })
    expect(initialState[field]).toBe(false)
  })
})

describe('LOAD_POEM_DATA', () => {
  const payload = { poemId: 'kj,-wm--cc-title', data: { text: 'invented' }, processNote: 'note Qq' }

  it('loads the matching poem only', () => {
    const next = reducer(initialState, { type: LOAD_POEM_DATA, payload })
    const target = next.poems.find(poem => poem.poemId === payload.poemId)
    expect(target?.loaded).toBe(true)
    expect(target?.data).toEqual({ text: 'invented' })
    expect(target?.processNote).toBe('note Qq')

    const others = next.poems.filter(poem => poem.poemId !== payload.poemId)
    expect(others).toHaveLength(2)
    others.forEach(poem => {
      const before = initialState.poems.find(p => p.poemId === poem.poemId)
      expect(poem).toBe(before)
      expect(poem.loaded).toBe(false)
      expect(poem.data).toBeNull()
      expect(poem.processNote).toBe('')
    })
  })

  it('does not mutate the input state or its poems', () => {
    const before = initialState.poems.find(poem => poem.poemId === payload.poemId)
    reducer(initialState, { type: LOAD_POEM_DATA, payload })
    expect(before?.loaded).toBe(false)
    expect(before?.data).toBeNull()
    expect(before?.processNote).toBe('')
    expect(titles(initialState)).toEqual(OPENING_ORDER)
  })

  it('changes nothing for an unknown poemId', () => {
    const next = reducer(initialState, {
      type: LOAD_POEM_DATA,
      payload: { ...payload, poemId: 'no-one--nothing' },
    })
    expect(next.poems.every(poem => !poem.loaded)).toBe(true)
    expect(titles(next)).toEqual(OPENING_ORDER)
    expect(next.poems.map(poem => poem.data)).toEqual([null, null, null])
  })
})

describe('LOAD_POEM_FAILED', () => {
  const poemId = 'kj,-wm--cc-title'
  const failed = { type: LOAD_POEM_FAILED, payload: { poemId, reason: 'missing' } }

  it('marks the matching poem only, and leaves it unloaded so it can be tried again', () => {
    const next = reducer(initialState, failed)
    const target = next.poems.find(poem => poem.poemId === poemId)
    expect(target?.loadFailure).toBe('missing')
    expect(target?.loaded).toBe(false)
    expect(target?.data).toBeNull()
    next.poems.filter(poem => poem.poemId !== poemId).forEach(poem => {
      expect(poem).toBe(initialState.poems.find(p => p.poemId === poem.poemId))
      expect(poem.loadFailure).toBeUndefined()
    })
  })

  it('does not mutate the input state', () => {
    reducer(initialState, failed)
    expect(initialState.poems.find(poem => poem.poemId === poemId)?.loadFailure).toBeUndefined()
  })

  it('changes nothing for an unknown poemId', () => {
    const next = reducer(initialState, { type: LOAD_POEM_FAILED, payload: { poemId: 'no-one--nothing', reason: 'missing' } })
    expect(next.poems.every(poem => poem.loadFailure === undefined)).toBe(true)
  })

  it('a later successful load clears the failure', () => {
    const loaded = reducer(reducer(initialState, failed), {
      type: LOAD_POEM_DATA,
      payload: { poemId, data: { text: 'invented' }, processNote: '' },
    })
    const target = loaded.poems.find(poem => poem.poemId === poemId)
    expect(target?.loadFailure).toBeNull()
    expect(target?.loaded).toBe(true)
  })
})

// A sort reorders the poems in the state. It once sorted the list made at start-up instead, so every
// sort dropped what had been loaded since (#21, #108).
describe('sorting keeps what has been loaded', () => {
  const poemId = byTitle(initialState, 'Cc Title').poemId
  const loaded = reducer(initialState, {
    type: LOAD_POEM_DATA,
    payload: { poemId, data: { text: 'invented' }, processNote: 'zq note' },
  })
  const failedId = byTitle(initialState, 'Bb, Ti').poemId
  const both = reducer(loaded, { type: LOAD_POEM_FAILED, payload: { poemId: failedId, reason: 'missing' } })

  it.each([
    ['SET_SORT_TERM', { type: SET_SORT_TERM, payload: 'title' }],
    ['REVERSE_SORT_ORDER', { type: REVERSE_SORT_ORDER }],
  ])('%s keeps a loaded timelapse, its note and a recorded failure', (_name, action) => {
    const next = reducer(both, action)
    const poem = next.poems.find(p => p.poemId === poemId)
    expect(poem?.loaded).toBe(true)
    expect(poem?.data).toEqual({ text: 'invented' })
    expect(poem?.processNote).toBe('zq note')
    expect(next.poems.find(p => p.poemId === failedId)?.loadFailure).toBe('missing')
  })

  it('poems that tie keep the list order, whatever the previous sort was', () => {
    // Every poem has the same `tags`, standing in for poems by one author.
    // In the opening (descending) order: ties come out in list order either way, since only the term is reversed.
    const byAuthor = reducer(both, { type: SET_SORT_TERM, payload: 'author' })
    expect(titles(reducer(byAuthor, { type: SET_SORT_TERM, payload: 'tags' }))).toEqual(MOCK_ORDER)
  })
})

describe('SET_SORT_TERM', () => {
  const asc = ascending(initialState)

  it('orders by author ascending', () => {
    const next = reducer(asc, { type: SET_SORT_TERM, payload: 'author' })
    expect(next.sortTerm).toBe('author')
    expect(titles(next)).toEqual(BY_AUTHOR)
  })

  it('orders by title ascending', () => {
    const next = reducer(asc, { type: SET_SORT_TERM, payload: 'title' })
    expect(next.sortTerm).toBe('title')
    expect(titles(next)).toEqual(BY_TITLE)
  })

  it('orders by publishDate ascending', () => {
    const next = reducer(reducer(asc, { type: SET_SORT_TERM, payload: 'title' }), { type: SET_SORT_TERM, payload: 'publishDate' })
    expect(next.sortTerm).toBe('publishDate')
    expect(titles(next)).toEqual(BY_DATE)
  })

  it('from the opening state (descending) orders by author and title in descending order', () => {
    expect(titles(reducer(initialState, { type: SET_SORT_TERM, payload: 'author' }))).toEqual(['Bb, Ti', 'Aa Title', 'Cc Title'])
    expect(titles(reducer(initialState, { type: SET_SORT_TERM, payload: 'title' }))).toEqual(['Cc Title', 'Bb, Ti', 'Aa Title'])
  })

  it('does not mutate the input state', () => {
    reducer(initialState, { type: SET_SORT_TERM, payload: 'author' })
    expect(initialState.sortTerm).toBe('publishDate')
    expect(titles(initialState)).toEqual(OPENING_ORDER)
  })
})

describe('REVERSE_SORT_ORDER', () => {
  // Ascending by author, set up explicitly: the state opens descending.
  const byAuthor = reducer(ascending(initialState), { type: SET_SORT_TERM, payload: 'author' })

  it('flips the opening DESC to ASC and puts the oldest publish date first', () => {
    const next = reducer(initialState, { type: REVERSE_SORT_ORDER })
    expect(next.sortOrder).toBe('ASC')
    expect(titles(next)).toEqual(['Bb, Ti', 'Cc Title', 'Aa Title'])
  })

  it('flips ASC to DESC and reverses the current term order', () => {
    const next = reducer(byAuthor, { type: REVERSE_SORT_ORDER })
    expect(next.sortOrder).toBe('DESC')
    expect(next.sortTerm).toBe('author')
    expect(titles(next)).toEqual(reverse(BY_AUTHOR))
    expect(titles(next)).toEqual(['Bb, Ti', 'Aa Title', 'Cc Title'])
  })

  it('flips DESC back to ASC and restores the order', () => {
    const desc = reducer(byAuthor, { type: REVERSE_SORT_ORDER })
    const asc = reducer(desc, { type: REVERSE_SORT_ORDER })
    expect(asc.sortOrder).toBe('ASC')
    expect(titles(asc)).toEqual(BY_AUTHOR)
  })

  it('applies DESC to a newly chosen sort term', () => {
    const desc = reducer(byAuthor, { type: REVERSE_SORT_ORDER })
    const byTitle = reducer(desc, { type: SET_SORT_TERM, payload: 'title' })
    expect(byTitle.sortOrder).toBe('DESC')
    expect(titles(byTitle)).toEqual(['Cc Title', 'Bb, Ti', 'Aa Title'])
    const byDate = reducer(byTitle, { type: SET_SORT_TERM, payload: 'publishDate' })
    expect(titles(byDate)).toEqual(['Aa Title', 'Cc Title', 'Bb, Ti'])
  })

  it('does not mutate the input state', () => {
    reducer(byAuthor, { type: REVERSE_SORT_ORDER })
    expect(byAuthor.sortOrder).toBe('ASC')
    expect(titles(byAuthor)).toEqual(BY_AUTHOR)
  })
})

describe('LOAD_POEM_RETRY (#43)', () => {
  const poemId = 'kj,-wm--cc-title'
  const failed = reducer(initialState, { type: LOAD_POEM_FAILED, payload: { poemId, reason: 'network' } })

  it('takes the failure down for that poem only, leaving it unloaded', () => {
    const other = reducer(failed, { type: LOAD_POEM_FAILED, payload: { poemId: failed.poems.find(p => p.poemId !== poemId)!.poemId, reason: 'missing' } })
    const next = reducer(other, { type: LOAD_POEM_RETRY, payload: { poemId } })
    const target = next.poems.find(p => p.poemId === poemId)!
    expect(target.loadFailure).toBeNull()
    expect(target.loaded).toBe(false)
    expect(next.poems.filter(p => p.loadFailure === 'missing')).toHaveLength(1)
  })

  it('changes nothing for an unknown poemId', () => {
    const next = reducer(failed, { type: LOAD_POEM_RETRY, payload: { poemId: 'no-one--nothing' } })
    expect(next.poems.find(p => p.poemId === poemId)?.loadFailure).toBe('network')
  })
})
