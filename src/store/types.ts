import { AnyAction } from 'redux'
import { ThunkAction } from 'redux-thunk'
import { Moment } from 'moment'

// TODO: How to get around putting this in every project??
export type ThunkResult<R> = ThunkAction<R, IState, undefined, Action>

// TODO: Move Midst types to common
export interface IMidstTimelineFrame {
  content: string
  lineNumber: number
  timestamp: number
}

// TODO: Move Midst types to common
export interface IMidstFile {
  editorTimelineFrames: IMidstTimelineFrame[]
  meta: {
		editorFontFamily: string
		editorFontSize: number
		editorHighestEverDraftNumber: number
		editorTitle: string
    editorDraftMarkers: []
  }
}

export interface IPoem {
  author: string
  authorId: string
  authorSecondaryFolder: string
  badge: string | null | undefined
  cursorFollowing: boolean | undefined
  data: IMidstFile | null
  date: Moment
  publishDate: Moment
  hasScrollbar?: boolean
  hidden?: boolean
  highlighted: boolean
  loaded: boolean
  poemId: string
  processNote: string
  slug: string
  tags: string
  title: string
  trigger?: boolean
  url: string
}

export interface IState {
  mobileNavOpen: boolean
  poems: IPoem[]
  processNoteOpen: boolean
  sortTerm: string
  sortOrder: string
}

export const LOAD_POEM_DATA = 'LOAD_POEM_DATA'
export const REVERSE_SORT_ORDER = 'REVERSE_SORT_ORDER'
export const SET_MOBILE_NAV_OPEN = 'SET_MOBILE_NAV_OPEN'
export const SET_PROCESS_NOTE_OPEN = 'SET_PROCESS_NOTE_OPEN'
export const SET_SORT_TERM = 'SET_SORT_TERM'

export interface ILoadPoemData extends AnyAction {
  payload: { poemId: string, data: IMidstFile}
  type: typeof SET_MOBILE_NAV_OPEN
}

export interface ISetMobileNavOpen extends AnyAction {
  payload: boolean
  type: typeof SET_MOBILE_NAV_OPEN
}

export interface ISetProcessNoteOpen extends AnyAction {
  payload: boolean
  type: typeof SET_PROCESS_NOTE_OPEN
}

export interface ISetSortOrder extends AnyAction {
  payload: boolean
  type: typeof REVERSE_SORT_ORDER
}

export interface ISetSortTerm extends AnyAction {
  payload: boolean
  type: typeof SET_SORT_TERM
}

export type Action =
  ILoadPoemData
  | ISetMobileNavOpen
  | ISetProcessNoteOpen
  | ISetSortOrder
  | ISetSortTerm
