import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'

function TheApp(): ReactElement {
  return (
    <div className="app-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} About the App</title>
        <meta name="description" content="" />
      </Helmet>

      <section className="heroine">
        <p>
          The Midst software is a beautiful, minimalist, custom-built word processor that allows writers to generate interactive timelines of their process.
          Keep your timelines to yourself or submit them to the Midst journal.
        </p>
        <p>
          Sign up below for updates to find out when the app is available!
        </p>

        <p>
          <img src="http://annelysegelman.com/donotdelete/theredwheelbarrow.png" />
        </p>

        {/* Help, where the editor's "Need help?" lands (/app#help, midst-editor #105). Two dropdowns with stand-in
            text until Annelyse writes the help (GitHub midst-press/midst-editor#63; midst-web #278). */}
        <div id="help" className="app-help">
          <details>
            <summary>Installation</summary>
            <p>[Installation instructions go here]</p>
          </details>
          <details>
            <summary>Using Midst</summary>
            <p>[Instructions for using Midst go here]</p>
          </details>
        </div>
      </section>
    </div>
  )
}

export default TheApp
