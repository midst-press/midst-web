import { KEY_SCHEME, POEMS_URL } from '../config'
import { fetchRecordedKey, parsePublishedList } from '../poems/poem-list'
import { parseMidstFile } from './midst-file'
import { fetchPoemAsset, objectNames } from '../poems/key-scheme'
import { AnyAction } from 'redux'
// TODO: Type def file
//@ts-ignore
import marked from 'marked'
// TODO: Type def file
//@ts-ignore
import insane from 'insane'
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
      entries = parsePublishedList(await response.json())
    } catch {
      return fail('malformed')
    }
    dispatch({ type: LOAD_POEM_LIST, payload: { entries }})
  }

// The part of zip.js used here. It is loaded by a script tag in index.html, not imported.
interface ZipEntry {
  getData(writer: unknown, onData: (blob: Blob) => void, onProgress?: unknown, checkCrc32?: boolean): void
}
interface ZipJs {
  workerScriptsPath: string
  BlobReader: new (blob: Blob) => unknown
  BlobWriter: new () => unknown
  createReader(
    reader: unknown,
    onReader: (zipReader: { getEntries(onEntries: (entries: ZipEntry[]) => void): void }) => void,
    // zip.js passes its error: a fixed message such as 'CRC failed.', never an entry's name or contents.
    onError: (error?: unknown) => void,
  ): void
}

// A failure with the message to log and the reason to show. A message carries its cause's name and message
// (describeCause) only where that text cannot quote a poet's work: zip.js's fixed messages, the browser's network
// and FileReader errors, and our own exceptions. The parser's can quote the poem, so it logs the name alone.
interface LoadError {
  reason: PoemLoadFailure
  log?: string
}

const NOTE_TAGS = ['h1', 'p', 'i', 'a', 'em', 'b', 'strong', 'img', 'iframe', 'ul', 'li', 'ol']

// How long the archive read may take before the load is given up. zip.js inflates in a worker, and a worker that
// never answers would otherwise leave the loading mark turning for ever (#43).
export const ARCHIVE_READ_TIMEOUT_MS = 30000

// What went wrong, for the log: the error's name and message, never its data. zip.js's messages are fixed strings and
// a DOMException has a name, so a bug in our own callbacks (a TypeError) reads as ours and not as a damaged file.
export const describeCause = (err: unknown): string => {
  if (typeof err === 'string') return err.slice(0, 200)
  if (err && typeof err === 'object' && 'name' in err && 'message' in err) {
    const { name, message } = err as { name: unknown, message: unknown }
    return `${String(name)}: ${String(message)}`.slice(0, 200)
  }
  return err === undefined ? 'no cause given' : `a thrown ${typeof err}`
}

// The error's name alone, for a cause whose message may quote the poem.
export const causeName = (err: unknown): string =>
  err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : `a thrown ${typeof err}`

// The text of the first file in a timelapse archive. Every way it can fail ends in a rejection (#43):
// - zip.js reports a bad archive, a bad entry header, a read or inflate error, and (with checkCrc32) a CRC mismatch
//   through createReader's error callback;
// - the callbacks run outside the caller's try, so each catches its own synchronous throw;
// - a FileReader error, and a read that never finishes, reject too.
const readFirstEntry = (zip: ZipJs, archive: Blob, timeoutMs = ARCHIVE_READ_TIMEOUT_MS): Promise<string> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ reason: 'unknown', log: 'Reading the Midst archive timed out' }), timeoutMs)
    const ok = (text: string) => { clearTimeout(timer); resolve(text) }
    const bad = (cause: unknown) => {
      clearTimeout(timer)
      reject({ reason: 'damaged', log: `Unable to read Midst archive: ${describeCause(cause)}` })
    }
    const guard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
      try { fn(...args) } catch (err) { bad(err) }
    }
    try {
      zip.createReader(new zip.BlobReader(archive), guard(zipReader => {
        zipReader.getEntries(guard(entries => {
          if (!entries.length) return bad('the archive has no entries')
          entries[0].getData(new zip.BlobWriter(), guard((blob: Blob) => {
            const reader = new FileReader()
            reader.addEventListener('loadend', () => (reader.error ? bad(reader.error) : ok(reader.result as string)))
            reader.readAsText(blob)
          }), undefined, true)
        }))
      }), bad)
    } catch (err) {
      bad(err)
    }
  })

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
      const zip = (window as unknown as { zip: ZipJs }).zip
      zip.workerScriptsPath = '/static/workers/'

      const names = poem.keys || objectNames(poem, KEY_SCHEME)
      // A recorded null means the poem has no note: no request, and an empty note.
      processNote = ''
      if (names.processNote !== null) {
        const note = await body(await get(names.processNote), r => r.text())
        processNote = insane(marked(note), { allowedTags: NOTE_TAGS })
      }
      const archive = await body(await get(names.timelapse), r => r.blob())
      text = await readFirstEntry(zip, archive)
    } catch (e: unknown) {
      const error = e as Partial<LoadError> | null
      // Not one of ours (marked or insane on the note, objectNames, no window.zip): its name only, since the note is
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

export {
  loadPoemData,
  loadPoemList,
  setMobileNavOpen,
  setProcessNoteOpen,
  reverseSortOrder,
  setSortTerm,
}
