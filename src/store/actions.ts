import { KEY_SCHEME, POEMS_URL } from '../config'
import { fetchRecordedKey, parsePublishedList } from '../poems/poem-list'
import { entryTagIds } from '../tags'
import { parseMidstFile } from './midst-file'
import { ArchiveError, describeCause, readFirstEntry } from '../archive'
import { fetchPoemAsset, objectNames } from '../poems/key-scheme'
import { AnyAction } from 'redux'
import { renderProcessNote } from '../processNote'
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
  SET_TAG_FILTER,

  IPoem,
  PoemListFailure,
  PoemLoadFailure,
} from './types'


// The published list (MIDST_POEM_LIST=published), fetched once at start. Every failure ends in the same
// action and the same fixed console message: the page says the poems could not be loaded, and nothing
// else is shown in their place.
const loadPoemList = (): any =>
  async (dispatch: any) => {
    const fail = (reason: PoemListFailure) => {
      console.error('Unable to load the poem list')
      dispatch({ type: POEM_LIST_FAILED, payload: { reason }})
    }

    let response
    try {
      response = await fetch(`${POEMS_URL}published.json`, { cache: 'no-cache' })
    } catch {
      return fail('network')
    }
    if (!response.ok) return fail('server')

    let entries
    try {
      const json = await response.json()
      // Each entry's tag ids (#310), read beside the shared parser, which keeps only what midst-infra uses too.
      const tagIds = entryTagIds(json)
      entries = parsePublishedList(json).map((entry: { poemId: string }) => ({ ...entry, tagIds: tagIds.get(entry.poemId) ?? [] }))
    } catch {
      return fail('malformed')
    }
    dispatch({ type: LOAD_POEM_LIST, payload: { entries }})
  }

// A failure with the message to log and the reason to show. A message carries its cause's name and message
// (describeCause) only where that text cannot quote a poet's work: the zip library's fixed messages, the browser's
// network errors, and our own exceptions. The parser's can quote the poem, so it logs the name alone.
interface LoadError {
  reason: PoemLoadFailure
  log?: string
}

// The archive's reading (its timeout, and what its errors may log) is in ../archive (#43, #270).
export { ARCHIVE_READ_TIMEOUT_MS, describeCause } from '../archive'

// The error's name alone, for a cause whose message may quote the poem.
export const causeName = (err: unknown): string =>
  err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : `a thrown ${typeof err}`

// The text of the first file in a timelapse archive (#43). A damaged archive, one with no entries, or a CRC mismatch
// is `damaged`; a read that never finishes gives up as `unknown`, as before.
const readArchive = async (archive: Blob): Promise<string> => {
  try {
    return await readFirstEntry(archive)
  } catch (err) {
    if (err instanceof ArchiveError) throw { reason: err.kind === 'timeout' ? 'unknown' : 'damaged', log: err.message }
    throw { reason: 'damaged', log: `Unable to read Midst archive: ${describeCause(err)}` }
  }
}

// TODO: Should be: ThunkResult<void>. Why doesn't it work?
const loadPoemData = (poemIndex: number): any =>
  // TODO: Above should be: ThunkResult<void>, then `any` is not needed here
  async (dispatch: any, getState: any) => {
    const poem: IPoem = getState().app.poems[poemIndex]

    // Every failure ends here: a fixed console message and an action, so the page can say the poem
    // did not load.
    const fail = (message: string, reason: PoemLoadFailure) => {
      console.error(message)
      if (poem) dispatch({ type: LOAD_POEM_FAILED, payload: { poemId: poem.poemId, reason }})
    }

    // Returning to a poem whose last load failed: take its failure message down while this attempt runs, or the
    // page says "could not be loaded" until the poem appears (#43). A first load dispatches nothing here.
    if (poem && poem.loadFailure) dispatch({ type: LOAD_POEM_RETRY, payload: { poemId: poem.poemId }})

    // One of the poem's two files, or a thrown LoadError saying why not.
    const get = async (name: string) => {
      let response
      try {
        // A poem from the published list carries the keys it was recorded under: fetched as written.
        response = poem.keys
          ? await fetchRecordedKey(POEMS_URL, name)
          : await fetchPoemAsset(POEMS_URL, name, KEY_SCHEME)
      } catch (err) {
        throw { reason: 'network', log: `Unable to fetch the poem: ${describeCause(err)}` }
      }
      if (!response.ok) throw { reason: response.status === 404 ? 'missing' : response.status === 403 ? 'refused' : 'server' }
      return response
    }

    // The body of a response that arrived: a connection dropped while reading it is a network failure (#43).
    const body = async <T>(response: Response, read: (r: Response) => Promise<T>): Promise<T> => {
      try {
        return await read(response)
      } catch (err) {
        throw { reason: 'network', log: `Unable to read the poem from the network: ${describeCause(err)}` }
      }
    }

    let text: string
    let processNote: string
    try {
      const names = poem.keys || objectNames(poem, KEY_SCHEME)
      // A recorded null means the poem has no note: no request, and an empty note.
      processNote = ''
      if (names.processNote !== null) {
        const note = await body(await get(names.processNote), r => r.text())
        processNote = renderProcessNote(note)
      }
      const archive = await body(await get(names.timelapse), r => r.blob())
      text = await readArchive(archive)
    } catch (e: unknown) {
      const error = e as Partial<LoadError> | null
      // Not one of ours (marked or DOMPurify on the note, objectNames): its name only, since the note is
      // the poet's text.
      const why = error && error.reason ? error.reason : causeName(e)
      return fail((error && error.log) || `Unable to load Midst data: ${why}`, (error && error.reason) || 'unknown')
    }

    let data
    try {
      data = parseMidstFile(text)
    } catch (err) {
      // The name only: a JSON SyntaxError's message quotes the text it failed on, and that text is the poem.
      return fail(`Unable to load Midst file: ${causeName(err)}`, 'damaged')
    }
    dispatch({ type: LOAD_POEM_DATA, payload: { poemId: poem.poemId, data, processNote }})
  }

const setMobileNavOpen = (mobileNavOpen: boolean): AnyAction => ({
  type: SET_MOBILE_NAV_OPEN,
  payload: mobileNavOpen,
})

const setProcessNoteOpen = (processNoteOpen: boolean): AnyAction => ({
  type: SET_PROCESS_NOTE_OPEN,
  payload: processNoteOpen,
})

const reverseSortOrder = (): AnyAction => ({
  type: REVERSE_SORT_ORDER,
  payload: null,
})

const setSortTerm = (sortBy: string): AnyAction => ({
  type: SET_SORT_TERM,
  payload: sortBy,
})

// The tags a reader has ticked (#310), by id.
const setTagFilter = (tagIds: string[]): AnyAction => ({
  type: SET_TAG_FILTER,
  payload: tagIds,
})

export {
  loadPoemData,
  loadPoemList,
  setMobileNavOpen,
  setProcessNoteOpen,
  reverseSortOrder,
  setSortTerm,
  setTagFilter,
}
