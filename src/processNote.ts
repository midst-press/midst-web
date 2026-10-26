/*
 * A process note (#292): Markdown, rendered here for the poem page, the review page and the submit form's preview, the
 * same way everywhere (Annelyse, 26 Oct, GitHub #81): she reads every note before it is published.
 */
import { renderMarkdown } from './markdown'

// The tags a note may use, from the archive's notes, with the attributes insane allowed them by default.
export const NOTE_TAGS = ['h1', 'p', 'i', 'a', 'em', 'b', 'strong', 'img', 'iframe', 'ul', 'li', 'ol', 'br']
const NOTE_ATTRIBUTES = {
  a: ['href', 'name', 'target', 'title', 'aria-label'],
  iframe: ['allowfullscreen', 'frameborder', 'src'],
  img: ['src', 'alt', 'title', 'aria-label'],
}
// Embedded video only from YouTube and Vimeo (Annelyse, 26 Oct, GitHub #81). Any other iframe is shown as a link to
// its address, so a note cannot put another site's page, a fake sign-in for one, inside the publisher's signed-in page.
export const EMBED_HOSTS = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com']

/** A note's Markdown as the sanitised HTML every page shows. */
export const renderProcessNote = (markdown: string): string =>
  renderMarkdown(markdown, { tags: NOTE_TAGS, attributes: NOTE_ATTRIBUTES, iframeHosts: EMBED_HOSTS })

// The most the API accepts (docs/app-api.md, POST /submissions), counted as a textarea's maxlength counts.
export const MAX_NOTE_CHARACTERS = 20000

export type Markup = 'bold' | 'italic' | 'link'

export interface Edit {
  text: string
  /** The selection to leave: the wrapped words, or for a link its address. */
  start: number
  end: number
}

const LINK_PLACEHOLDER = 'https://'

/**
 * Wrap the selection [start, end) of `text` in Markdown. With nothing selected the markers go in at the caret, with the
 * caret between them.
 */
export function applyMarkup(text: string, start: number, end: number, kind: Markup): Edit {
  const [from, to] = start <= end ? [start, end] : [end, start]
  const before = text.slice(0, from)
  const selected = text.slice(from, to)
  const after = text.slice(to)
  if (kind === 'link') {
    const inserted = `[${selected}](${LINK_PLACEHOLDER})`
    // The address is selected, so typing replaces it; with no words selected, the caret goes inside the brackets.
    if (selected === '') return { text: before + inserted + after, start: from + 1, end: from + 1 }
    const at = from + selected.length + 3
    return { text: before + inserted + after, start: at, end: at + LINK_PLACEHOLDER.length }
  }
  const marker = kind === 'bold' ? '**' : '*'
  return {
    text: before + marker + selected + marker + after,
    start: from + marker.length,
    end: from + marker.length + selected.length,
  }
}
