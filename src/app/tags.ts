/*
 * The publisher's tags (docs/app-api.md, "Tags"; #310; midst-infra #214): named, coloured marks for a collection, such
 * as a folio. The list is replaced whole, on the tagsEtag the page last read; a 409 means someone else saved it first,
 * or, with `in_use`, that a tag left out is still on a published poem. A poem names its tags by id.
 */
import { Call } from './publisher'

export interface Tag {
  id: string
  name: string
  /** #rrggbb, lower case. */
  colour: string
}

export interface TagsList {
  tagsEtag: string
  tags: Tag[]
}

/** A tag as the form sends it: a new one has no id. */
export interface TagEdit {
  id?: string
  name: string
  colour: string
}

// The back end's limits (midst-infra publisher.mjs TAG_NAME_MAX, TAGS_MAX), so the form can say so before a save.
export const TAG_NAME_MAX = 40
export const TAGS_MAX = 100

export const loadTags = (call: Call) => call<TagsList>('/publisher/tags')

export const saveTags = (call: Call, tags: TagEdit[], tagsEtag: string) =>
  call<TagsList>('/publisher/tags', { method: 'PUT', body: { tagsEtag, tags } })

/**
 * A poem's tags after its box for `id` is ticked or unticked: the ids of the tags it then has, in the tags' own order.
 * Only tag ids: a legacy entry's own words are not tags, and are not sent back.
 */
export const tagsAfterToggle = (tags: Tag[], poemTags: string[] | undefined, id: string): string[] => {
  const had = new Set(poemTags ?? [])
  return tags.map(tag => tag.id).filter(tagId => (tagId === id ? !had.has(id) : had.has(tagId)))
}

// WCAG 2 relative luminance of a #rrggbb colour.
const luminance = (colour: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(colour.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The contrast ratio of two #rrggbb colours, 1 to 21. */
export const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The text colour for a tag's mark: black or white, whichever contrasts more with the tag's colour. One of the two is
 * always at least 4.5:1 (WCAG AA for text), so any colour the publisher picks stays readable.
 */
export const textColourFor = (colour: string): '#000000' | '#ffffff' =>
  (contrast(colour, '#000000') >= contrast(colour, '#ffffff') ? '#000000' : '#ffffff')
