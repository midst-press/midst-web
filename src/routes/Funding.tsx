import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import DonorWall from '../components/DonorWall'
import { BASE_SITE_PAGE_TITLE } from '../config'

function Funding(): ReactElement {
  return (
    <div className="funding-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Funding</title>
        <meta name="description" content="" />
      </Helmet>

      <section className="heroine heroine--normal">
        <h2>Funding</h2>

        <h2 className="emoji-heading no-space">🌱</h2>

        <p>
          Midst's journal will always be free to the public.
        </p>

        <p>
          We hope to continue to grow and to regularly share diverse new work from contemporary writers, serving as a growing library of poetry-as-process. We currently have two "staff" members (Annelyse Gelman and Jason Gillis-Grier), both volunteers, and each contributor is currently paid $50. These commission fees are pulled from runner-up earnings from UT Austin's Keene Prize and from Midst's <a href="http://www.patreon.com/midstpoetry">patrons</a>. As Midst evolves, we'll continue to share up-to-date information on funding here. We believe transparency like this is important to build a healthy, thriving literary community where people trust each other.
        </p>

        <p>
          If you're excited about what we're building here, we hope you'll consider a one-time or monthly donation to help us continue our work!
        </p>

        <p>
          All contributions directly support Midst's future, including paying for commissions, web hosting, design, app development, and more.
        </p>

        <h2 className="emoji-heading">💵</h2>

        <p>
          <a
            className="patreon-logo-in-text"
            href="http://patreon.com/midstpoetry"
          />
          Join Midst's <a href="http://www.patreon.com/midstpoetry">Patreon</a> page as a monthly donor and receive sneak-peeks, previews, and special perks, starting at $3/month.
        </p>

        <p>
          <a
            className="ko-fi-logo-in-text"
            href="https://ko-fi.com/midst"
          />
          You can also give a fee-free, one-time donation of any amount <a href="https://ko-fi.com/midst">here</a>.
        </p>

        <p>
          <a
            className="racc-logo-in-text"
            href="https://racc.org"
          />
          Thanks to the <a href="https://racc.org">Regional Arts and Culture Council</a> of Portland, Oregon, who awarded Midst a Make | Learn | Build Grant.
        </p>


        {/*
          <h2 className="emoji-heading">🙌</h2>
          <p>
            xyz
          </p>
        */}

        <DonorWall>
          <h2>Enormous thanks and 🙌 forever to our <a href="http://www.patreon.com/midstpoetry">Patrons</a>:</h2>
        </DonorWall>
      </section>
    </div>
  )
}

export default Funding
