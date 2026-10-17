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
  cursorPosition?: number
}

export interface IMidstChange {
  front: number
  inserted: string
  end: number
  t: string | number
  pos?: number
}

export interface IMidstCurrentFile {
  text: string
  history: IMidstChange[]
  meta?: { [key: string]: unknown }
}

export interface IMidstDraftMarker {
  timelineIndex: number
  name: string
  defaultName: string
}

// TODO: Move Midst types to common
export interface IMidstFile {
  editorTimelineFrames: IMidstTimelineFrame[]
  presentation?: { [key: string]: unknown }
  sourceHistoryLength?: number
  meta: {
		editorFontFamily: string
		editorFontSize: number
		editorHighestEverDraftNumber: number
		editorTitle: string
		editorDraftMarkers: IMidstDraftMarker[]
  }
}

// Why a poem did not load, in terms the page can put to a reader. Never the underlying error text:
// parser and network diagnostics can quote a poet's work.
//   missing  the server has no such file (404)        refused  the server refused it (403)
//   network  the request never got an answer          server   any other failed answer
//   damaged  the file arrived but is not a playable Midst archive
//   unknown  anything else
export type PoemLoadFailure = 'missing' | 'refused' | 'network' | 'server' | 'damaged' | 'unknown'

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
  /* Where this poem's files are, relative to POEMS_URL, as the published list recorded them (#110). Absent on a
   * bundled poem, whose names are derived. `processNote` is null when the poem has no note. */
  keys?: { timelapse: string, processNote: string | null }
  /* Place in the list as it was given, so a sort breaks ties the way the list did. */
  position: number
  /* The opaque storage id (tools/poem-ids.mjs). Absent only on a poem still on the pending list. */
  id?: string
  loaded: boolean
  loadFailure?: PoemLoadFailure | null
  poemId: string
  processNote: string
  slug: string
  tags: string
  title: string
  trigger?: boolean
  url: string
}

// Whether the list of poems is there. `ready` always under MIDST_POEM_LIST=bundled; under `published` it starts
// `loading` and becomes `ready` or `failed`, and a failed list is never replaced by the bundled one (#110).
export type PoemListStatus = 'ready' | 'loading' | 'failed'

// Why the published list could not be used: no answer, a failed answer, an answer that is not a list.
export type PoemListFailure = 'network' | 'server' | 'malformed'

export interface IState {
  mobileNavOpen: boolean
  poems: IPoem[]
  poemList: PoemListStatus
  poemListFailure?: PoemListFailure | null
  processNoteOpen: boolean
  sortTerm: string
  sortOrder: string
}

export const LOAD_POEM_DATA = 'LOAD_POEM_DATA'
export const LOAD_POEM_FAILED = 'LOAD_POEM_FAILED'
export const LOAD_POEM_RETRY = 'LOAD_POEM_RETRY'
export const LOAD_POEM_LIST = 'LOAD_POEM_LIST'
export const POEM_LIST_FAILED = 'POEM_LIST_FAILED'
export const REVERSE_SORT_ORDER = 'REVERSE_SORT_ORDER'
export const SET_MOBILE_NAV_OPEN = 'SET_MOBILE_NAV_OPEN'
export const SET_PROCESS_NOTE_OPEN = 'SET_PROCESS_NOTE_OPEN'
export const SET_SORT_TERM = 'SET_SORT_TERM'

export interface ILoadPoemData extends AnyAction {
  payload: { poemId: string, data: IMidstFile, processNote: string }
  type: typeof LOAD_POEM_DATA
}

export interface ILoadPoemFailed extends AnyAction {
  payload: { poemId: string, reason: PoemLoadFailure }
  type: typeof LOAD_POEM_FAILED
}

// A new attempt at a poem whose last load failed: its failure message comes down while the attempt runs (#43).
export interface ILoadPoemRetry extends AnyAction {
  payload: { poemId: string }
  type: typeof LOAD_POEM_RETRY
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
