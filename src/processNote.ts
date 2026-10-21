/*
 * A process note (#292): the poet's Markdown, written in the submit form and shown on the poem page, the review page and
 * the form's own preview. All three render it here, so a poet's preview is what readers will see.
 */
import marked from 'marked'
// TODO: Type def file
//@ts-ignore
import insane from 'insane'

// The tags a note may use. insane's default schemes (http, https, mailto) and attributes apply.
export const NOTE_TAGS = ['h1', 'p', 'i', 'a', 'em', 'b', 'strong', 'img', 'iframe', 'ul', 'li', 'ol']

/** A note's Markdown as the sanitised HTML the poem page shows. */
export const renderProcessNote = (markdown: string): string => insane(marked(markdown), { allowedTags: NOTE_TAGS })

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
