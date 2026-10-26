import React, { MouseEvent, ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { SUBMIT_TEXT, renderContent } from '../content'
import { isSitePath } from '../sitePath'
import { useNavigate } from 'react-router'

// The Submit page (#326, GitHub midst-press/midst-web#88): Annelyse's text about submitting, for everyone. The form to send
// a poem moved to the author portal, which nothing here links to (#360, GitHub midst-press/midst-web#96; AuthorPortal.tsx).

// Annelyse's words, from her content/ folder (content/submit.md; #281). A link to one of the site's own pages goes
// through the router, as a Link would, rather than reloading the site.
const SUBMIT_HTML = renderContent(SUBMIT_TEXT)

function SubmissionsText(): ReactElement {
  const navigate = useNavigate()
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a')
    const href = link?.getAttribute('href')
    if (!href || !isSitePath(href)) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(href)
  }
  return <div className="submit-text" onClick={follow} dangerouslySetInnerHTML={{ __html: SUBMIT_HTML }} />
}

function Submit(): ReactElement {
  return (
    <div className="app-account-page submit-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Submit</title>
      </Helmet>
      <section className="heroine heroine--normal">
        <SubmissionsText />
      </section>
    </div>
  )
}

export default Submit
