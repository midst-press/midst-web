import { AnyAction } from 'redux'
import { orderBy, sortBy } from 'lodash'
import produce from 'immer'
// deliberately including newline between SET_PROCESS_NOTE_OPEN and IState
// to satisfy linter grouping
import {
  LOAD_POEM_DATA,
  LOAD_POEM_FAILED,
  LOAD_POEM_RETRY,
  LOAD_POEM_LIST,
  POEM_LIST_FAILED,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,

  IPoem,
  IState,
} from './types'
import moment from 'moment'
// voca 1.4.1's ES build has a default export only, so the named import works under jest (CommonJS) and fails in
// Parcel's build.
import voca from 'voca'
import poemData from '../poems'
import * as poemNames from '../poems/poem-names'
import { POEM_LIST } from '../config'

// A stored date is YYYY-MM-DD (midst-infra #81), parsed strictly: anything else, or null, is an invalid moment,
// which the page shows as no date, never as a date moment guessed from another form.
const storedDate = (value: unknown) => moment(typeof value === 'string' ? value : null, 'YYYY-MM-DD', true)

function createPoem(data: any, position: number = 0) {
  // Derived by src/poems/poem-names.js, which is the one definition shared with the tooling. It
  // used to be inlined here and transcribed again in tools/poem-canary.mjs; two copies of the rule
  // that decides whether a poem can be fetched is one too many.
  const authorId = poemNames.authorId(data.author)
  const url = poemNames.poemUrl(data.title)

  const poem: IPoem = {
    author: data.author,
    authorId,
    authorSecondaryFolder: data.authorSecondaryFolder,
    cursorFollowing: data.cursorFollowing,
    data: null,
    date: storedDate(data.date),
    publishDate: storedDate(data.publishDate),
    poemId: `${authorId}--${url}`,
    cssId: `${authorId}--${url}`,
    position,
    hasScrollbar: data.hasScrollbar,
    highlighted: data.highlighted,
    id: data.id,
    loaded: false,
    processNote: '',
    url,
    slug: voca.slugify(data.title),
    tags: '',
    title: data.title,
    badge: data.badge,
  }

  return poem
}

// One entry of a validated published list (poems/poem-list.js). Same poem as a bundled one, with `id` the
// list's poemId and the recorded keys carried. A null date is an invalid moment, not today.
function createPublishedPoem(entry: any, position: number): IPoem {
  const poem = createPoem({
    author: entry.author,
    title: entry.title,
    highlighted: entry.highlighted,
    id: entry.poemId,
  }, position)
  poem.date = storedDate(entry.date)
  poem.publishDate = storedDate(entry.publishDate)
  poem.keys = entry.keys
  // Two poems may share a title (#141): the address is the list's, and the state's id is the list's own, so a load
  // for one can never land on the other. cssId stays name-derived, so a style written for a poem by name still applies.
  poem.url = entry.url
  poem.poemId = entry.poemId
  return poem
}

// Under `published` nothing is bundled into the state: the list arrives with LOAD_POEM_LIST.
const poems: IPoem[] = POEM_LIST === 'bundled' ? poemData.map(createPoem) : []

// Sorts the poems in the state, so what has been loaded into them is kept. Ties (one author's poems, when
// sorting by author) break by position in the list, so they come out in the same order whatever the
// previous sort was, for a bundled list or a published one. A poem with no publish date comes last in either
// order, in list order, so newest-first never opens on the undated ones (midst-web #309).
const undated = (poem: IPoem) => !(poem.publishDate && poem.publishDate.isValid())
function sortPoems(draftState: { poems: IPoem[], sortTerm: string, sortOrder: string }) {
  const last = draftState.sortTerm === 'publishDate' ? draftState.poems.filter(undated) : []
  const rest = draftState.sortTerm === 'publishDate' ? draftState.poems.filter(poem => !undated(poem)) : draftState.poems
  // Ties keep list order in either direction: only the term is reversed, never the position.
  const sorted = orderBy(rest, [draftState.sortTerm, 'position'], [draftState.sortOrder === 'DESC' ? 'desc' : 'asc', 'asc'])
  return [...sorted, ...sortBy(last, ['position'])]
}

// The Table of Contents opens newest first by publish date (Annelyse, 21 Oct, midst-web #309); a reader can sort
// by author or title, or reverse any of them.
const initialState: IState = {
  mobileNavOpen: false,
  poems: sortPoems({ poems, sortTerm: 'publishDate', sortOrder: 'DESC' }),
  poemList: POEM_LIST === 'bundled' ? 'ready' : 'loading',
  processNoteOpen: false,
  sortOrder: 'DESC',
  sortTerm: 'publishDate',
}

const reducer = (
  state: IState = initialState,
  // TODO: Should be Action from `../types.ts`
  { type, payload }: AnyAction,
): IState => {
  switch (type) {
    case LOAD_POEM_DATA:
      const { poemId, data, processNote } = payload
      return produce(state, draftState => {
        const poem = draftState.poems.find(poem => poem.poemId === poemId)
        if (poem) {
          poem.loaded = true
          poem.loadFailure = null
          poem.data = data
          poem.processNote = processNote
        }
      })

    // `loaded` stays false, so returning to the poem tries again.
    case LOAD_POEM_FAILED:
      return produce(state, draftState => {
        const poem = draftState.poems.find(poem => poem.poemId === payload.poemId)
        if (poem) poem.loadFailure = payload.reason
      })

    // A retry of a failed poem: the failure message comes down, so the page shows the loading mark again (#43).
    case LOAD_POEM_RETRY:
      return produce(state, draftState => {
        const poem = draftState.poems.find(poem => poem.poemId === payload.poemId)
        if (poem) poem.loadFailure = null
      })

    // The list replaces whatever the state held, in the order given: reading order, as the bundle's is until
    // the reader sorts.
    case LOAD_POEM_LIST:
      return produce(state, draftState => {
        draftState.poems = payload.entries.map(createPublishedPoem)
        draftState.poems = sortPoems(draftState)
        draftState.poemList = 'ready'
        draftState.poemListFailure = null
      })

    case POEM_LIST_FAILED:
      return produce(state, draftState => {
        draftState.poems = []
        draftState.poemList = 'failed'
        draftState.poemListFailure = payload.reason
      })

    case REVERSE_SORT_ORDER:
      return produce(state, draftState => {
        if (draftState.sortOrder === 'DESC') {
          draftState.sortOrder = 'ASC'
        }

        else {
          draftState.sortOrder = 'DESC'
        }

        draftState.poems = sortPoems(draftState)
      })

    case SET_MOBILE_NAV_OPEN:
      return { ...state, mobileNavOpen: payload }

    case SET_PROCESS_NOTE_OPEN:
      return { ...state, processNoteOpen: payload }

    case SET_SORT_TERM:
      return produce(state, draftState => {
        draftState.sortTerm = payload
        // A newly chosen term starts at its own order: a date newest first, an author or title A to Z, whatever the
        // previous sort's direction (midst-web #309: the page opens descending, so keeping it would start authors at Z).
        draftState.sortOrder = payload === 'publishDate' ? 'DESC' : 'ASC'
        draftState.poems = sortPoems(draftState)
      })

    default:
      return state
  }
}

export {
  initialState,
  reducer,
}
