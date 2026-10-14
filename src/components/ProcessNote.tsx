import { MEDIA_URL } from '../config'
import React, { ReactElement, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../store'
import { IPoem } from '../store/types'
import { setProcessNoteOpen } from '../store/actions'
import { useParams } from 'react-router'

interface IProps {
  match: any
}


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

  // The listeners below are added once, so they read the open state through a ref. It is set here, during
  // render, so it is already true when the commit that adds `open` to the class reaches the screen. It was
  // a module variable set in an effect, which runs after that commit: a mousedown in between was ignored
  // (connor-227743e6, from the e2e test failing in the slower coverage build).
  const openRef = useRef(processNoteOpen)
  openRef.current = processNoteOpen

  function handleEsc(evt: any) {
    if (evt.keyCode === 27) {
      dispatch(setProcessNoteOpen(false))
    }
  }

  function handleClickOutside(evt: any) {
    if (!openRef.current) return
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
          <img src={`${MEDIA_URL}${poem.authorId}/${poem.authorId}.jpg`} />
        </div>
      }
    </div>
  )
}

export default ProcessNote
