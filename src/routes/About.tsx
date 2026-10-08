import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'

function About(): ReactElement {
  return (
    <div className="about-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} About</title>
        <meta name="description" content="" />
      </Helmet>

      <section className="heroine heroine--normal">
        <h2>About</h2>
        <p>What if you could watch your favorite poet write?</p>
        <p>
          Midst publishes poems in the form of interactive timelapses, giving readers and writers unprecedented access to the creative process.
        </p>
        <p>
         Hit play on any poem in Midst, and you'll see exactly how it was written: blank page to final draft, and every edit in between. 
        </p>
        <br />

        <h2>The Team</h2>

        <p>
          Founder & Director: <a href="http://www.annelysegelman.com">Annelyse Gelman</a><br />
          Lead Software Engineer (2023-present): <a href="https://julietshafto.com/">Juliet Shafto</a><br />
          Lead Software Engineer (2019-2022): <a href="http://hem.rocks">Jason Gillis-Grier</a><br />

        </p>

        <br />

        <h2>Manifesto</h2>

        <p>
          We hope Midst will make poetry more accessible for everyone, regardless of their experience. By seeing <i>how</i> a poem is made, readers can understand that writing and editing are parallel processes; that writing is often nonlinear; that making poems is not a matter of intentionally obfuscating or ‘dressing up’ simple ideas in fancy/symbolic language, but working with language as an expressive medium; that poems do not emerge fully-formed and perfect from a writer’s mind, but are crafted through the act of writing itself.
        </p>
        <p>  
          We hold no particular aesthetic allegiance; there is no right or wrong way to make a poem. Rather than centering any particular approach, Midst is dedicated to showcasing the myriad ways contemporary poets work. 
          </p>
          <p>  
            Midst is a publishing platform, a not-for-profit software initiative, an educational resource, a time-based art project, a study bridging science and literature, and, above all else, a free public resource for readers and writers, students and teachers, scholars, archivists, and all who are curious about how poems are made.
          </p>
          <p>  
        We believe that poetry is a process—a way of thinking in language, engaging with language, attending to language. Poems are events. Poems are for everyone.
        </p>

        <br />

        <h2>Contact</h2>
       
        <p>You can email us at <a href="mailto:team@midst.press">team(at)midst(dot)press</a>.
        </p>
        <p>Please note that Midst has a small, <a href="https://midst.press/funding">volunteer</a>  staff.</p>
        <p>
          Our software is still in development and we are not currently open to public submissions. You may nominate a poet for inviation to Midst at <a href="https://midst.press/nominate">midst.press/nominate</a>. 
          
          </p>

        <p>

          <a
            className="twitter-logo-in-text sm"
            href="http://twitter.com/midstpoetry"
          />
          <a href="http://twitter.com/midstpoetry"></a>
          <a
            className="instagram-logo-in-text sm"
            href="https://www.instagram.com/midstpoetry/"
          />
          <a href="http://instagram.com/midstpoetry"></a>
          </p>
        <br />

        <br />

        <h2>Thanks </h2>

        <p>
          <a href="https://bretanthonyjohnston.com/">Bret Anthony Johnston</a> is our advisor. <a href="http://www.chloescheffe.github.io/">Chloe Scheffe</a> made our logo and our shapes. Our <a href="http://www.patreon.com/midstpoetry">patrons</a> and <a href="https://ko-fi.com/midst">donors</a> keep Midst free and public and help us pay every commissioned poet. Thank you to <a href="http://clmp.org/">CLMP</a> and Daniel Machlin for development consulting, and to Marilyn Arsem, NECK, the Bains family, and the James A. Michener Center for Writers.
        </p>
        <p>
          Midst has presented live demos and craft talks at Lambda Litfest in Los Angeles, Amsterdam's <i>Track Changes</i> conference, and the annual ELO (Electronic Literature Foundation) conference in Cork, Ireland, as well as an installation at the Bodleian Library in Oxford, England, and a live presentation with local commissions at the Filmscene movie theatre in Iowa City. We welcome collaborations with educational institutions and creative organizations of all stripes.
        </p>
      </section>
    </div>
  ) 
}

export default About
