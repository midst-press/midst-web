import React, { ReactElement, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useParams } from 'react-router'
import { Link } from 'react-router'
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

  // How far down the page the title and author reach, for the player to start the poem below them (#416): a long title
  // on a narrow window wraps onto several lines, and must never cover the poem.
  const credit = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const element = credit.current
    if (!element) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--poem-credit-bottom', `${element.getBoundingClientRect().bottom}px`)
    publish()
    // Its size changes with the window and the title; its place changes at the header's breakpoints, with the window.
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    window.addEventListener('resize', publish)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', publish)
      root.style.removeProperty('--poem-credit-bottom')
    }
  }, [currentPoem])

  // An address no published poem has: nothing to name and nowhere to move from. Rendering on regardless
  // read `author` of undefined and took the whole site down with it (#100).
  if (!currentPoem) return <></>

  return (
    <>
      <a className="poem-credit" ref={credit}>
        {/* No current poem while the published list loads, if it fails, or for a url not in it. */}
        {currentPoem &&
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
        }
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
