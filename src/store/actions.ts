import { POEMS_URL } from '../config'
import { parseMidstFile } from '../components/midst-player-hack/midst-file'
import { fetchAsset } from '../poems/asset-fetch'
import { processNoteObjectName, timelapseObjectName } from '../poems/poem-names'
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
        response = await fetchAsset(POEMS_URL, name)
      } catch {
        throw { reason: 'network' }
      }
      if (!response.ok) throw { reason: response.status === 404 ? 'missing' : response.status === 403 ? 'refused' : 'server' }
      return response
    }

    try {
      const zip = (window as any).zip
      zip.workerScriptsPath = '/static/workers/'

      const noteResponse = await get(processNoteObjectName(poem))
      const processNoteRaw = await noteResponse.text()
      const processNote = insane(marked(processNoteRaw), { allowedTags: ['h1', 'p', 'i', 'a', 'em', 'b', 'strong', 'img', 'iframe', 'ul', 'li', 'ol']})
      const zipTest = await get(timelapseObjectName(poem))
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
  setMobileNavOpen,
  setProcessNoteOpen,
  reverseSortOrder,
  setSortTerm,
}
