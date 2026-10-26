/*
 * The tags the site marks poems with (#310): named, coloured marks for a collection, such as a folio. They are data,
 * not code: /site/tags.json, public site data the back end writes whenever the publisher saves the tags
 * (docs/app-api.md, "Tags"). A poem names its tags by id in its published.json entry.
 *
 *   { "version": 1, "updated": "<ISO time>", "tags": [{ "id", "name", "colour": "#rrggbb" }, ...] }
 *
 * Marks are decoration: a file that cannot be read, or a tag in it that is not sound, shows no mark, and the Table of
 * Contents is shown as ever.
 */
import type { IPoem } from './store/types'

export interface SiteTag {
  id: string
  name: string
  colour: string
}

export const TAGS_URL = '/site/tags.json'

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const COLOUR = /^#[0-9a-f]{6}$/i

/** The tags from the file's JSON, by id: each sound tag, and none of any other. Throws when it is not the file. */
export function parseTags(json: unknown): Map<string, SiteTag> {
  const file = json as { version?: unknown, tags?: unknown } | null
  if (!file || typeof file !== 'object' || file.version !== 1 || !Array.isArray(file.tags)) {
    throw new Error('tags.json is not a list of tags')
  }
  const tags = new Map<string, SiteTag>()
  for (const tag of file.tags as Array<{ id?: unknown, name?: unknown, colour?: unknown } | null>) {
    if (tag && isText(tag.id) && isText(tag.name) && typeof tag.colour === 'string' && COLOUR.test(tag.colour)) {
      tags.set(tag.id, { id: tag.id, name: tag.name, colour: tag.colour.toLowerCase() })
    }
  }
  return tags
}

/** The tags, fetched now. Rejects on any failure: no answer, an error status, or a file that is not the tags. */
export async function loadSiteTags(request: typeof fetch = fetch): Promise<Map<string, SiteTag>> {
  const response = await request(TAGS_URL, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`tags.json answered ${response.status}`)
  return parseTags(await response.json())
}

/**
 * Each published.json entry's tag ids, by poemId: the strings in its `tags`. A legacy entry's own words may be among
 * them; they match no tag, so they mark nothing. Read beside poem-list.js's parser, which is shared with midst-infra
 * and keeps only the fields both use.
 */
export function entryTagIds(json: unknown): Map<string, string[]> {
  const poems = (json as { poems?: unknown } | null)?.poems
  const ids = new Map<string, string[]>()
  if (!Array.isArray(poems)) return ids
  for (const entry of poems as Array<{ poemId?: unknown, tags?: unknown } | null>) {
    if (entry && typeof entry.poemId === 'string' && Array.isArray(entry.tags)) {
      ids.set(entry.poemId, entry.tags.filter((tag): tag is string => typeof tag === 'string'))
    }
  }
  return ids
}

/** The marks a poem shows: its tags that are tags, in the order the poem names them. */
export const marksFor = (tagIds: string[] | undefined, tags: Map<string, SiteTag> | null): SiteTag[] =>
  (tags ? (tagIds ?? []).flatMap(id => (tags.has(id) ? [tags.get(id)!] : [])) : [])

// Tags in the order a reader reads them: by name, ignoring case and accents (Armenia, Belarus, Canada), then by id.
const byName = (a: SiteTag, b: SiteTag) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The tags some poem shows, by name: what a reader can tick. None before the tags are read. */
export function tagsInUse(poems: IPoem[], tags: Map<string, SiteTag> | null): SiteTag[] {
  const used = new Map<string, SiteTag>()
  for (const poem of poems) for (const tag of marksFor(poem.tagIds, tags)) used.set(tag.id, tag)
  return [...used.values()].sort(byName)
}

/** One run of the Table of Contents: the poems under a tag, or with no tag heading. */
export interface TocSection {
  tag: SiteTag | null
  poems: IPoem[]
}

/**
 * What the Table of Contents shows (#310; Annelyse on GitHub midst-web#46, 26 Oct), from the poems in their sorted
 * order. With tags ticked, only the poems showing any ticked tag; an id that is not a tag ticks nothing. Sorted by tag,
 * a group per tag, by name (reversed when `descending`), each in the poems' order, and a poem with two tags in both;
 * then, with nothing ticked, the poems showing no tag. Otherwise one run, in the poems' order.
 */
export function tocSections(
  poems: IPoem[],
  tags: Map<string, SiteTag> | null,
  { byTag, descending, ticked }: { byTag: boolean, descending: boolean, ticked: string[] },
): TocSection[] {
  const chosen = new Set(ticked.filter(id => tags?.has(id)))
  const shows = (poem: IPoem) => marksFor(poem.tagIds, tags)
  const shown = chosen.size > 0 ? poems.filter(poem => shows(poem).some(tag => chosen.has(tag.id))) : poems
  if (!byTag || !tags) return [{ tag: null, poems: shown }]

  const groups = tagsInUse(shown, tags).filter(tag => chosen.size === 0 || chosen.has(tag.id))
  if (descending) groups.reverse()
  const sections: TocSection[] = groups.map(tag => ({ tag, poems: shown.filter(poem => shows(poem).some(mark => mark.id === tag.id)) }))
  const untagged = chosen.size > 0 ? [] : shown.filter(poem => shows(poem).length === 0)
  return untagged.length > 0 ? [...sections, { tag: null, poems: untagged }] : sections
}
