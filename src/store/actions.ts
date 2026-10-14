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

// TODO: Should be: ThunkResult<void>. Why doesn't it work?
const loadPoemData = (poemIndex: number): any =>
  // TODO: Above should be: ThunkResult<void>, then `any` is not needed here
  async (dispatch: any, getState: any) => {
    const poem: IPoem = getState().app.poems[poemIndex]

    // Every failure ends here: a fixed console message (parser and network diagnostics can quote a
    // poet's work) and an action, so the page can say the poem did not load.
    const fail = (message: string, reason: PoemLoadFailure) => {
      console.error(message)
      if (poem) dispatch({ type: LOAD_POEM_FAILED, payload: { poemId: poem.poemId, reason }})
    }

    // One of the poem's two files, or a thrown `{ reason }` saying why not.
    const get = async (name: string) => {
      let response
      try {
        // A poem from the published list carries the keys it was recorded under: fetched as written.
        response = poem.keys
          ? await fetchRecordedKey(POEMS_URL, name)
          : await fetchPoemAsset(POEMS_URL, name, KEY_SCHEME)
      } catch {
        throw { reason: 'network' }
      }
      if (!response.ok) throw { reason: response.status === 404 ? 'missing' : response.status === 403 ? 'refused' : 'server' }
      return response
    }

    try {
      const zip = (window as any).zip
      zip.workerScriptsPath = '/static/workers/'

      const names = poem.keys || objectNames(poem, KEY_SCHEME)
      // A recorded null means the poem has no note: no request, and an empty note.
      let processNote = ''
      if (names.processNote !== null) {
        const noteResponse = await get(names.processNote)
        const processNoteRaw = await noteResponse.text()
        processNote = insane(marked(processNoteRaw), { allowedTags: ['h1', 'p', 'i', 'a', 'em', 'b', 'strong', 'img', 'iframe', 'ul', 'li', 'ol']})
      }
      const zipTest = await get(names.timelapse)
      const reader = new zip.BlobReader(await zipTest.blob())

      zip.createReader(reader, (zipReader: any) => {
        zipReader.getEntries((entries: any) => {
          if (!entries.length) return fail('Unable to read Midst archive', 'damaged')
          const writer = new zip.BlobWriter()
          entries[0].getData(writer, (blob: Blob) => {
            const reader = new FileReader()
            reader.addEventListener('loadend', (e: any) => {
              let data
              try {
                data = parseMidstFile(e.srcElement.result)
              } catch {
                return fail('Unable to load Midst file', 'damaged')
              }
              dispatch({ type: LOAD_POEM_DATA, payload: { poemId: poem.poemId, data, processNote }})
            })
            reader.readAsText(blob)
          })
        })
      }, () => {
        fail('Unable to read Midst archive', 'damaged')
      })
    }

    catch (e: any) {
      fail('Unable to load Midst data', (e && e.reason) || 'unknown')
    }
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
