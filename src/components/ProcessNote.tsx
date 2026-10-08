import React, { ReactElement, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../store'
import { IPoem } from '../store/types'
import { setProcessNoteOpen } from '../store/actions'
import { useParams } from 'react-router'

interface IProps {
  match: any
}

const staticAssetsUrl = 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/'

// TODO: How not to "freeze in" changing state values in event callbacks?
let proxyProcessNoteOpen: boolean = false

function ProcessNote(): ReactElement {
  const { processNoteOpen, poems } = useSelector((state: RootState) => ({
    processNoteOpen: state.app.processNoteOpen,
    poems: state.app.poems,
  }))

  const { poemUrl } = useParams()

  const poem = poems.find((poem: IPoem) => {
    return poem.url === poemUrl
  })

  const dispatch = useDispatch()

  const el = useRef(null)

  function handleEsc(evt: any) {
    if (evt.keyCode === 27) {
      dispatch(setProcessNoteOpen(false))
    }
  }

  function handleClickOutside(evt: any) {
    if (!proxyProcessNoteOpen) return
    if ((el as any).current.contains(evt.target)) return

    dispatch(setProcessNoteOpen(false))
  }

  useEffect(() => {
    document.body.addEventListener('keydown', handleEsc)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    proxyProcessNoteOpen = processNoteOpen
    const noteContent = document.body.querySelector('.process-note__content')
    noteContent && (noteContent.scrollTop = 0)
  }, [processNoteOpen])

  return (
    <div
      className={'process-note ' + (processNoteOpen ? 'open' : '')}
      ref={el}
    >
      <div
        className="close-process-note"
        onClick={() => dispatch(setProcessNoteOpen(false))}
      >
        x
      </div>
      {poem &&
        <div className="process-note__content">
          <div dangerouslySetInnerHTML={{ __html: poem ? poem.processNote : '' }} />
          <img src={`${staticAssetsUrl}${poem.authorId}/${poem.authorId}.jpg`} />
        </div>
      }
    </div>
  )
}

export default ProcessNote
