import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import DonorWall from '../components/DonorWall'
import { BASE_SITE_TITLE } from '../config'

function Home(): ReactElement {
  return (
    <div className="home-page">
      <Helmet>
        <title>{BASE_SITE_TITLE}</title>
        <meta name="description" content="" />
      </Helmet>

      <section className="heroine">
        <p className="first">
          What if you could watch your favorite poet write?
        </p>

        <p style={{ paddingTop: '20px' }}>
          Every poem published in <i>Midst</i> is an interactive timelapse. Hit play to rewind the poem back to its beginnings and see exactly how it was written—start to finish, blank page to final draft, and every edit in between.
        </p>

        <p style={{ paddingTop: '20px' }}>
          <a style={{ textDecoration: 'underline' }} href="http://www.midst.press/read">Check it out.</a>
        </p>

        <p style={{ paddingTop: '10px' }} />

        <DonorWall>
          <h2>🙌 to our <a href="http://www.patreon.com/midstpoetry">Patrons</a>:</h2>
        </DonorWall>
      </section>
    </div>
  )
}

export default Home
