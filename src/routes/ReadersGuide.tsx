import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import guide from '../guide/readers-guide.json'

// "Press **Play** to watch" becomes "Press <strong>Play</strong> to watch". Bold is the only markup.
function withBold(text: string): Array<string | ReactElement> {
  return text.split('**').map((part, i) => i % 2 ? <strong key={i}>{part}</strong> : part)
}

function ReadersGuide(): ReactElement {
  return (
    <div className="guide-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} {guide.title}</title>
        <meta name="description" content="" />
      </Helmet>

      <section className="heroine heroine--normal">
        <h2>{guide.title}</h2>
        {guide.intro.map((text, i) => <p key={i}>{withBold(text)}</p>)}
        {guide.sections.map(section => (
          <React.Fragment key={section.heading}>
            <h4>{section.heading}</h4>
            {section.paragraphs.map((text, i) => <p key={i}>{withBold(text)}</p>)}
          </React.Fragment>
        ))}
      </section>
    </div>
  )
}

export default ReadersGuide
