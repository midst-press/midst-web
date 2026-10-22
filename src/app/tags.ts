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

// The marks' text colour is the site's as well as this page's (src/tagColour.ts).
export { contrast, textColourFor } from '../tagColour'
