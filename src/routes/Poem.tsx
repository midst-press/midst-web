import React, { ReactElement, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { RootState } from '../store'
import { loadPoemData } from '../store/actions'
import { IPoem, PoemLoadFailure } from '../store/types'
import PoemListStatus from '../components/PoemListStatus'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'
import { useParams } from 'react-router'

// What a reader is told when a poem does not load. Only `network` and `server` can pass on their own,
// so only they suggest trying again. `missing` and `refused` share one sentence: the poems host answers
// 403 for a file that is not there (see asset-fetch.js), so the browser cannot tell the two apart.
const NOT_FOUND_OR_REFUSED = 'Unable to find the poem, but it is possible that access was refused.'
export const LOAD_FAILURE_MESSAGES: { [reason in PoemLoadFailure]: string } = {
  missing: NOT_FOUND_OR_REFUSED,
  refused: NOT_FOUND_OR_REFUSED,
  network: 'Unable to reach the poem. Check your connection and try again.',
  server: 'The poem could not be fetched. Please try again later.',
  damaged: 'The poem\'s file is damaged and cannot be played.',
  unknown: 'This poem could not be loaded.',
}

function Poem(): ReactElement {
  const { poemUrl } = useParams()
  const { currentPoemIndex, poems } = useSelector((state: RootState) => ({
    currentPoemIndex: state.app.poems.findIndex(poem => poem.url === poemUrl),
    poems: state.app.poems.filter(poem => poem.hidden !== null),
  }))

  const dispatch = useDispatch()

  const el = useRef(null)

  useEffect(() => {
    // No such poem, or the list has not arrived yet (it is empty, or this url is not in it): nothing to
    // slide to or load. Runs again when the list does arrive, because the index changes.
    if (currentPoemIndex < 0 || !poems[currentPoemIndex]) return

    const sliderFrame = (el as any).current.querySelector('.sliding-poems__frame')
    sliderFrame.style.left = `calc(100vw * -${currentPoemIndex})`

    if (!poems[currentPoemIndex].loaded) {
      dispatch(loadPoemData(currentPoemIndex))
    }
  }, [poemUrl, currentPoemIndex])

  return (
    <div
      className="poem-page"
      ref={el}
    >
      {/* TODO: Why is this a section and not a div like other pages? */}
      <section className="heroine heroine--normal">
        <Helmet>
          <title>{BASE_SITE_PAGE_TITLE} Player</title>
          <meta name="description" content="" />
        </Helmet>

        <PoemListStatus />

        <div className="sliding-poems">
          <div
            className="sliding-poems__frame"
            style={{ width: `${poems.length * 200}%` }}
          >
            {poems.map((poem: IPoem, i: number) =>
              <div
                className={`
                  sliding-poems__poem
                  sliding-poems__poem--${poem.loaded ? 'loaded' : ''}
                  ${poem.loadFailure && !poem.loaded ? 'sliding-poems__poem--failed' : ''}
                  sliding-poems__poem--${poem.poemId}
                `}
                data-trigger={poem.trigger ? 'true' : 'false'}
                key={poem.poemId}
              >
                <div className="scrolling-area-border" />

                {poem.loadFailure && !poem.loaded &&
                  <p className="sliding-poems__failure" role="alert">
                    {LOAD_FAILURE_MESSAGES[poem.loadFailure] || LOAD_FAILURE_MESSAGES.unknown}
                  </p>}

                 {poem.data && <MidstPlayer
                   activePlayer={i === currentPoemIndex}
                   cursorFollowing={poem.cursorFollowing !== undefined ? poem.cursorFollowing : true}
                   hasScrollbar={poem.hasScrollbar !== undefined ? poem.hasScrollbar : true}
                   data={poem.data}
                 />}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Poem
