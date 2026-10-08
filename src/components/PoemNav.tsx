import React, { ReactElement, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useParams } from 'react-router'
import { Link } from 'react-router-dom'
import { findIndex } from 'lodash'
import { RootState } from '../store'
import { setProcessNoteOpen } from '../store/actions'
import { POEM_ARROW_KEY } from '../config'

function PoemNav(): ReactElement {
  const { poems, processNoteOpen } = useSelector((state: RootState) => ({
    poems: state.app.poems,
    processNoteOpen: state.app.processNoteOpen,
  }))

  const dispatch = useDispatch()

  const navigate = useNavigate()
  const { poemUrl } = useParams()

  const currentPoemIndex = findIndex(poems, { url: poemUrl })
  const currentPoem = poems[currentPoemIndex]
  const previousPoem = poems[currentPoemIndex - 1]
  const nextPoem = poems[currentPoemIndex + 1]
  const nextPoemUrl = nextPoem && `/poem/${nextPoem.url}/`
  const previousPoemUrl = previousPoem && `/poem/${previousPoem.url}/`

  useEffect(() => {
    if (POEM_ARROW_KEY !== 'slide') return

    function slidePoemOnArrowKeyDown(evt: any) {
      if (evt.keyCode === 37) {
        dispatch(setProcessNoteOpen(false))
        navigate(previousPoemUrl)
      }

      else if (evt.keyCode === 39) {
        dispatch(setProcessNoteOpen(false))
        navigate(nextPoemUrl)
      }
    }

    document.addEventListener('keydown', slidePoemOnArrowKeyDown)

    return function cleanup() {
      document.removeEventListener('keydown', slidePoemOnArrowKeyDown)
    }
  }, [nextPoemUrl, previousPoemUrl])

  return (
    <>
      <a className="poem-credit">
        <span onClick={() => dispatch(setProcessNoteOpen(!processNoteOpen))}>
          <i className="author-name">
            { currentPoem.author }
          </i>
          <span className="divider">
            &nbsp;|&nbsp;
          </span>
          <span
            className="poem-title"
            dangerouslySetInnerHTML={{__html: currentPoem.title}}
          />
        </span>
      </a>

      <div id="poem-nav">
        {nextPoem ?
          <Link
            to={nextPoemUrl}>
            <i className="arrow arrow-forward"></i>
          </Link>
          :
          <a className="disabled">
            <i className="arrow arrow-forward"></i>
          </a>
        }

        {previousPoem ?
          <Link
            to={previousPoemUrl}>
            <i className="arrow arrow-back"></i>
          </Link>
          :
          <a className="disabled">
            <i className="arrow arrow-back"></i>
          </a>
        }
      </div>

      <div id="back-to-toc">
        <Link to="/read">Table of Contents</Link>
      </div>
    </>
  )
}

export default PoemNav
