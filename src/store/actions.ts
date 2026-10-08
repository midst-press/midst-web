import { AnyAction } from 'redux'
import $ from 'jquery'
// TODO: Type def file
//@ts-ignore
import marked from 'marked'
// TODO: Type def file
//@ts-ignore
import insane from 'insane'
import {
  LOAD_POEM_DATA,
  REVERSE_SORT_ORDER,
  SET_MOBILE_NAV_OPEN,
  SET_PROCESS_NOTE_OPEN,
  SET_SORT_TERM,

  IPoem,
} from './types'

const staticAssetsUrl = 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/'

// TODO: Should be: ThunkResult<void>. Why doesn't it work?
const loadPoemData = (poemIndex: number): any =>
  // TODO: Above should be: ThunkResult<void>, then `any` is not needed here
  async (dispatch: any, getState: any) => {
    let poems = [].concat(getState().app.poems)

    const zip = (window as any).zip
    zip.workerScriptsPath = '/static/workers/'

    try {
      const poem: IPoem = poems[poemIndex]
      const folder = poem.authorSecondaryFolder || poem.authorId
      const processNoteRaw = await $.get(`${staticAssetsUrl}${folder}/${poem.authorId}.md`)
      const processNote = insane(marked(processNoteRaw), { allowedTags: ['h1', 'p', 'i', 'a', 'em', 'b', 'strong', 'img', 'iframe', 'ul', 'li', 'ol']})
      const zipTest = await fetch(`${staticAssetsUrl}${folder}/${poem.poemId}.midst.zip`)
      const reader = new zip.BlobReader(await zipTest.blob())

      zip.createReader(reader, (zipReader: any) => {
        zipReader.getEntries((entries: any) => {
          const writer = new zip.BlobWriter()
          entries[0].getData(writer, (blob: Blob) => {
            const reader = new FileReader()
            reader.addEventListener('loadend', (e: any) => {
              const data = JSON.parse(e.srcElement.result)
              dispatch({ type: LOAD_POEM_DATA, payload: { poemId: poem.poemId, data, processNote }})
            })
            reader.readAsText(blob)
          })
        })
      }, (err: Error) => {
        console.log(err)
      })
    }

    catch(err) {
      console.log(err)
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
