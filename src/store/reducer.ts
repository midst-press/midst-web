import { AnyAction } from 'redux'
import { sortBy, reverse } from 'lodash'
import produce from 'immer'
// deliberately including newline between SET_PROCESS_NOTE_OPEN and IState
// to satisfy linter grouping
import {
  LOAD_POEM_DATA,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,

  IState,
} from './types'
import moment from 'moment'
import { slugify } from 'voca'
import poemData from '../poems'

function createPoem(data: any) {
  const authorId = data.author.toLowerCase().replace(/ /g, '-')
  const url = data.title.toLowerCase()
    .replace(/ /g, '-')
    .replace(/\,/g, '')
    .replace(/\//g, '')
    .replace('<i>', '')
    .replace('</i>', '')
    .replace('-:)', '')
    .replace('{::', '')
    .replace('::}', '')
    .replace('{', '')
    .replace('}', '')
    .replace('(', '')
    .replace(')', '')
    .replace('#', '')
    .replace(/-$/, '')
    .replace(/--/g, '-')
    .replace(/"/g, '')
  
  const poem = {
    author: data.author,
    authorId,
    authorSecondaryFolder: data.authorSecondaryFolder,
    cursorFollowing: data.cursorFollowing,
    data: null,
    date: moment(data.date),
    publishDate: moment(data.publishDate),
    poemId: `${authorId}--${url}`,
    hasScrollbar: data.hasScrollbar,
    highlighted: data.highlighted,
    loaded: false,
    processNote: '',
    url,
    slug: slugify(data.title),
    tags: '',
    title: data.title,
    badge: data.badge,
  }

  return poem
}

const poems = poemData.map(createPoem)

function sortPoems(draftState: IState) {
  let finalPoems = Array.from(draftState.poems)

  // @ts-ignore
  finalPoems = sortBy(poems, draftState.sortTerm)

  if (draftState.sortOrder === 'DESC') {
    finalPoems = reverse(finalPoems)
  }

  return finalPoems
}

const initialState: IState = {
  mobileNavOpen: false,
  poems,
  processNoteOpen: false,
  sortOrder: 'ASC',
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
          poem.data = data
          poem.processNote = processNote
        }
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
