/*
 * Annelyse's texts, from content/ (#281). Parcel inlines each readFileSync at build time, so the page carries the
 * text as it was in content/ when it was built; under Jest it is read from the file.
 */
import fs from 'fs'
import marked from 'marked'
// TODO: Type def file
//@ts-ignore
import insane from 'insane'

// What her Markdown makes, and nothing that could load something from elsewhere (no img, no iframe). A link keeps
// only its address.
export const CONTENT_TAGS = ['p', 'em', 'strong', 'i', 'b', 'a', 'br', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote']
const CONTENT_ATTRIBUTES = { a: ['href'] }

/** Her Markdown as the sanitised HTML a page shows. */
export const renderContent = (markdown: string): string =>
  insane(marked(markdown), { allowedTags: CONTENT_TAGS, allowedAttributes: CONTENT_ATTRIBUTES, allowedSchemes: ['http', 'https', 'mailto'] })

/** The Submit page's text (content/submit.md). */
export const SUBMIT_TEXT = fs.readFileSync(__dirname + '/../content/submit.md', 'utf8')
