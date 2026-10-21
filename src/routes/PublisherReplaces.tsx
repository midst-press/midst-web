import React, { ReactElement } from 'react'
import { Call, ListChange, Poem, PublishDetails, publish } from '../app/publisher'

// Which published poem an unpublished one replaces, if any (Stuart, 21 Oct, #101): the replaced poem leaves the list,
// the new one takes its place, and old links to it lead to the new one. Only a poem by the same poet may be replaced
// (midst-infra #190). The publisher's list carries each poem's author and not who sent it, so the page offers the
// published poems with the same author; the server checks the poet itself and refuses anything else.

/** The published poems `poem` may be published as the replacement for. */
export function replaceable(poem: Poem, published: Poem[]): Poem[] {
  return published.filter(other => other.poemId !== poem.poemId && other.author === poem.author)
}

/** The replacement to send: the chosen poem only while it is still offered (cora-2f1e43dc, review of #290). */
export function replacementToSend(poem: Poem, published: Poem[], chosen: string | undefined): string | undefined {
  return chosen && replaceable(poem, published).some(other => other.poemId === chosen) ? chosen : undefined
}

/** Today's date where the publisher is, as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The date and highlight a publish starts from, before the publisher changes either (Annelyse, 21 Oct, #305): those of
 * the poem it replaces, if one is chosen; else of a published poem with the same author and title, which the server
 * will treat as a revision of it; else what this poem had when it was last published; else today, not highlighted.
 */
export function detailsFor(poem: Poem, published: Poem[], chosen: string | undefined, today: string): PublishDetails {
  const replaced = published.find(other => other.poemId === replacementToSend(poem, published, chosen))
    ?? published.find(other => other.poemId !== poem.poemId && other.author === poem.author && sameTitle(other.title, poem.title))
  const from = replaced ?? poem
  return { publishDate: from.publishDate ?? today, highlighted: from.highlighted }
}

/**
 * Publish `poem` with `details`, replacing the chosen poem if it is still offered, and forget the choice once the
 * publish has landed, so a later republish does not send it again. A failed publish keeps it.
 */
export async function publishWithChoice(
  call: Call, etag: string, poem: Poem, published: Poem[], chosen: string | undefined, details: PublishDetails,
  forget: (poemId: string) => void,
): Promise<ListChange> {
  const result = await publish(call, poem.poemId, etag, details, replacementToSend(poem, published, chosen))
  forget(poem.poemId)
  return result
}

interface Props {
  poem: Poem
  published: Poem[]
  value: string
  disabled: boolean
  onChange: (poemId: string) => void
}

/** A choice of none, or one of the poems `poem` may replace. Nothing at all when there is none to choose. */
export default function ReplacesChoice({ poem, published, value, disabled, onChange }: Props): ReactElement | null {
  const options = replaceable(poem, published)
  if (options.length === 0) return null
  return (
    <label>
      Replaces{' '}
      <select value={value} disabled={disabled} aria-label={`Replaces, for ${poem.title}`}
        onChange={event => onChange(event.target.value)}>
        <option value="">None</option>
        {options.map(other => <option key={other.poemId} value={other.poemId}>{other.title} by {other.author}</option>)}
      </select>
    </label>
  )
}
