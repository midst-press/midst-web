import { initialState, reducer } from '../store/reducer'
import {
  LOAD_POEM_DATA,
  LOAD_POEM_FAILED,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,
  IState,
} from '../store/types'

// Invented metadata only. Mock order is deliberately different from the author, title and
// publishDate orders, which also differ from each other:
//   mock order:   Aa Title, Cc Title, Bb, Ti
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

const MOCK_ORDER = ['Aa Title', 'Cc Title', 'Bb, Ti']
const BY_AUTHOR = ['Cc Title', 'Aa Title', 'Bb, Ti']
const BY_TITLE = ['Aa Title', 'Bb, Ti', 'Cc Title']
const BY_DATE = ['Bb, Ti', 'Cc Title', 'Aa Title']

const reverse = <T>(list: T[]) => [...list].reverse()

describe('initialState', () => {
  it('has the expected flags and sort settings', () => {
    expect(initialState.mobileNavOpen).toBe(false)
    expect(initialState.processNoteOpen).toBe(false)
    expect(initialState.sortOrder).toBe('ASC')
    expect(initialState.sortTerm).toBe('publishDate')
  })

  it('has one poem per mocked entry, in mocked order', () => {
    expect(titles(initialState)).toEqual(MOCK_ORDER)
  })
})

describe('createPoem (via initialState.poems)', () => {
  const full = initialState.poems[2]
  const sparse = initialState.poems[0]

  it('derives author, title, authorId, url, poemId and slug', () => {
    expect(full.author).toBe('Zq Xv')
    expect(full.title).toBe('Bb, Ti')
    expect(full.authorId).toBe('zq-xv')
    expect(full.url).toBe('bb-ti')
    expect(full.poemId).toBe('zq-xv--bb-ti')
    expect(full.slug).toBe('bb-ti')
  })

  it('derives ids for a comma in the author and a plain title', () => {
    const poem = initialState.poems[1]
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
    expect(opened.sortOrder).toBe('ASC')
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
    expect(titles(initialState)).toEqual(MOCK_ORDER)
  })

  it('changes nothing for an unknown poemId', () => {
    const next = reducer(initialState, {
      type: LOAD_POEM_DATA,
      payload: { ...payload, poemId: 'no-one--nothing' },
    })
    expect(next.poems.every(poem => !poem.loaded)).toBe(true)
    expect(titles(next)).toEqual(MOCK_ORDER)
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

// Deliberately NOT pinned: what a poem loaded by LOAD_POEM_DATA looks like after a sort.
// sortPoems sorts the module-level `poems` list rather than the state's poems, so the result may
// not carry loaded data. Whether that is a defect or intended is undecided, and a test asserting
// either outcome would lock in a guess.
describe('SET_SORT_TERM', () => {
  it('orders by author ascending', () => {
    const next = reducer(initialState, { type: SET_SORT_TERM, payload: 'author' })
    expect(next.sortTerm).toBe('author')
    expect(titles(next)).toEqual(BY_AUTHOR)
  })

  it('orders by title ascending', () => {
    const next = reducer(initialState, { type: SET_SORT_TERM, payload: 'title' })
    expect(next.sortTerm).toBe('title')
    expect(titles(next)).toEqual(BY_TITLE)
  })

  it('orders by publishDate ascending', () => {
    const byTitle = reducer(initialState, { type: SET_SORT_TERM, payload: 'title' })
    const next = reducer(byTitle, { type: SET_SORT_TERM, payload: 'publishDate' })
    expect(next.sortTerm).toBe('publishDate')
    expect(titles(next)).toEqual(BY_DATE)
  })

  it('does not mutate the input state', () => {
    reducer(initialState, { type: SET_SORT_TERM, payload: 'author' })
    expect(initialState.sortTerm).toBe('publishDate')
    expect(titles(initialState)).toEqual(MOCK_ORDER)
  })
})

describe('REVERSE_SORT_ORDER', () => {
  const byAuthor = reducer(initialState, { type: SET_SORT_TERM, payload: 'author' })

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
