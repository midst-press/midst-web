import React, { ReactElement, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { RootState } from '../store'
import { loadPoemData } from '../store/actions'
import { IPoem } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'
import { useParams } from 'react-router'

function Poem(): ReactElement {
  const { poemUrl } = useParams()
  const { currentPoemIndex, poems } = useSelector((state: RootState) => ({
    currentPoemIndex: state.app.poems.findIndex(poem => poem.url === poemUrl),
    poems: state.app.poems.filter(poem => poem.hidden !== null),
  }))

  const dispatch = useDispatch()

  const el = useRef(null)

  useEffect(() => {
    const sliderFrame = (el as any).current.querySelector('.sliding-poems__frame')

    if (currentPoemIndex > -1) {
      sliderFrame.style.left = `calc(100vw * -${currentPoemIndex})`
    }

    if (!poems[currentPoemIndex].loaded) {
      dispatch(loadPoemData(currentPoemIndex))
    }
  }, [poemUrl])

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
                  ${poem.loadFailed && !poem.loaded ? 'sliding-poems__poem--failed' : ''}
                  sliding-poems__poem--${poem.poemId}
                `}
                data-trigger={poem.trigger ? 'true' : 'false'}
                key={poem.poemId}
              >
                <div className="scrolling-area-border" />

                {poem.loadFailed && !poem.loaded &&
                  <p className="sliding-poems__failure" role="alert">
                    This poem could not be loaded.
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
