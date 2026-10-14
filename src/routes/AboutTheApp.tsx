import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import editorGuide from '../guide/editor-user-guide.generated'

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

        {/* The editor's user guide (midst-editor docs/user-guide.md), until Annelyse writes the help
            for this page (GitHub midst-press/midst-editor#63). Generated from a checked copy; see
            src/guide/editorGuideHtml.ts. */}
        <div id="help" className="editor-guide" dangerouslySetInnerHTML={{ __html: editorGuide }} />
      </section>
    </div>
  )
}

export default TheApp
