import { KEY_SCHEME, POEMS_URL } from '../config'
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
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,

  IPoem,
  PoemLoadFailure,
} from './types'


// The part of zip.js used here. It is loaded by a script tag in index.html, not imported.
interface ZipEntry {
  getData(writer: unknown, onData: (blob: Blob) => void): void
}
interface ZipJs {
  workerScriptsPath: string
  BlobReader: new (blob: Blob) => unknown
  BlobWriter: new () => unknown
  createReader(
    reader: unknown,
    onReader: (zipReader: { getEntries(onEntries: (entries: ZipEntry[]) => void): void }) => void,
    onError: () => void,
  ): void
}

// A failure with the fixed message to log and the reason to show. Messages are fixed because parser
// and network diagnostics can quote a poet's work.
interface LoadError {
  reason: PoemLoadFailure
  log?: string
}

const NOTE_TAGS = ['h1', 'p', 'i', 'a', 'em', 'b', 'strong', 'img', 'iframe', 'ul', 'li', 'ol']

// The text of the first file in a timelapse archive.
const readFirstEntry = (zip: ZipJs, archive: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const damaged: LoadError = { reason: 'damaged', log: 'Unable to read Midst archive' }
    zip.createReader(new zip.BlobReader(archive), zipReader => {
      zipReader.getEntries(entries => {
        if (!entries.length) return reject(damaged)
        entries[0].getData(new zip.BlobWriter(), blob => {
          const reader = new FileReader()
          reader.addEventListener('loadend', () => resolve(reader.result as string))
          reader.readAsText(blob)
        })
      })
    }, () => reject(damaged))
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

    // One of the poem's two files, or a thrown LoadError saying why not.
    const get = async (name: string) => {
      let response
      try {
        response = await fetchPoemAsset(POEMS_URL, name, KEY_SCHEME)
      } catch {
        throw { reason: 'network' }
      }
      if (!response.ok) throw { reason: response.status === 404 ? 'missing' : response.status === 403 ? 'refused' : 'server' }
      return response
    }

    let text: string
    let processNote: string
    try {
      const zip = (window as unknown as { zip: ZipJs }).zip
      zip.workerScriptsPath = '/static/workers/'

      const names = objectNames(poem, KEY_SCHEME)
      const note = await (await get(names.processNote)).text()
      processNote = insane(marked(note), { allowedTags: NOTE_TAGS })
      const archive = await (await get(names.timelapse)).blob()
      text = await readFirstEntry(zip, archive)
    } catch (e: unknown) {
      const error = e as Partial<LoadError> | null
      return fail((error && error.log) || 'Unable to load Midst data', (error && error.reason) || 'unknown')
    }

    let data
    try {
      data = parseMidstFile(text)
    } catch {
      return fail('Unable to load Midst file', 'damaged')
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
  setMobileNavOpen,
  setProcessNoteOpen,
  reverseSortOrder,
  setSortTerm,
}
