/*
 * The publisher's routes (docs/app-api.md, "Publisher") and the list arithmetic the page does before
 * saving. Every change to the published list carries the listEtag the page last read; a 409 means
 * someone else changed it first.
 */
import { ApiError, apiFetch } from './api'

export interface Poem {
  poemId: string
  title: string
  author: string
  timelapseKey: string
  processNoteKey: string | null
  publishDate: string | null
  highlighted: boolean
  /** When the poet last edited it, an ISO instant (#305; midst-infra #208): in `GET /publisher/poems` only, null when
   *  unknown, absent from a list change's answer and from an API before that. Shown on this page, never on the site. */
  lastEdited?: string | null
  /** The tag ids a published poem has (#310; midst-infra #217), or a legacy entry's own words, which match no tag.
   *  Absent from an API before that, and for a poem not published. */
  tags?: string[]
}

/** "last edited <date>" in the reader's own format, or null when it is not known. */
export const lastEditedWords = (lastEdited: string | null | undefined): string | null => {
  if (typeof lastEdited !== 'string') return null
  const when = new Date(lastEdited)
  return Number.isNaN(when.getTime()) ? null : `last edited ${when.toLocaleDateString()}`
}

export interface PublisherList {
  listEtag: string
  published: Poem[]
  unpublished: Poem[]
  /** The ids of poems removed from the portal (#308; midst-infra #207). Absent from an API before that. */
  removed?: string[]
  /** The Deleted section (#349; midst-infra #227): each removed poem, most recently removed first. Absent from an API
   *  before that, and then the section is not shown. */
  deleted?: DeletedPoem[]
}

/** A poem in the Deleted section: as the portal shows it, and when it was removed. */
export interface DeletedPoem extends Poem { removedAt: string | null }

/** When a deleted poem was removed, in words, or null when that is not known. */
export const removedWords = (removedAt: string | null | undefined): string | null => {
  if (typeof removedAt !== 'string') return null
  const when = new Date(removedAt)
  return Number.isNaN(when.getTime()) ? null : `deleted ${when.toLocaleDateString()}`
}

export type Call = <T>(path: string, init?: { method?: string, body?: unknown }) => Promise<T>

export const callerFor = (baseUrl: string, idToken: string): Call =>
  (path, init) => apiFetch(baseUrl, idToken, path, init)

export const loadList = (call: Call) => call<PublisherList>('/publisher/poems')

/** What publish and unpublish answer. `edgeCleared` is there when copies were withdrawn (an unpublish, or a publish
 *  that replaced an earlier version), and false when CloudFront did not take the request to clear them (midst-infra
 *  #117): they may then be served from its cache for up to a day. */
export interface ListChange {
  listEtag: string
  published: Poem[]
  edgeCleared?: boolean
}

/** The date the Table of Contents shows and the highlight, set when publishing (#305). */
export interface PublishDetails { publishDate: string, highlighted: boolean }

/** `replaces` names the published poem this one replaces (midst-infra #190); the key is sent only when there is one. */
export const publish = (call: Call, poemId: string, listEtag: string, details: PublishDetails, replaces?: string) =>
  call<ListChange>('/publisher/publish', { method: 'POST', body: { poemId, listEtag, ...details, ...(replaces ? { replaces } : {}) } })

export const unpublish = (call: Call, poemId: string, listEtag: string) =>
  call<ListChange>('/publisher/unpublish', { method: 'POST', body: { poemId, listEtag } })

/** Remove an unpublished poem from the portal (#308): its record is marked, never deleted, and it moves to the
 *  Deleted section until it is restored (#349). Refused while the poem is published. */
export const removeFromPortal = (call: Call, poemId: string) =>
  call<{ removed: string }>('/publisher/remove', { method: 'POST', body: { poemId } })

/** Put a deleted poem back under Not published (#349): the mark is lifted, and the server keeps the removal undone. */
export const restoreToPortal = (call: Call, poemId: string) =>
  call<{ restored: string }>('/publisher/restore', { method: 'POST', body: { poemId } })

/** A draft poem's process note and the version to save it on (#312); both null for a poem with no note. */
export interface DraftNote { processNote: string | null, noteVersion: string | null }

export const readNote = (call: Call, poemId: string) =>
  call<DraftNote>(`/publisher/poems/${encodeURIComponent(poemId)}/process-note`)

/** Save an edit, on the version it was loaded at. Refused while the poem is published. */
export const saveNote = (call: Call, poemId: string, processNote: string, noteVersion: string | null) =>
  call<DraftNote>(`/publisher/poems/${encodeURIComponent(poemId)}/process-note`, { method: 'PUT', body: { processNote, noteVersion } })

/** A poem's title and the name it is shown under. */
export interface TitleAndName { title: string, author: string }

/** Change an unpublished poem's title and name (#372; midst-infra #232), on the pair the page showed: if either changed
 *  since, the server answers 409 conflict. Refused while the poem is published. */
export const saveTitleAndName = (call: Call, poemId: string, next: TitleAndName, shown: TitleAndName) =>
  call<TitleAndName>(`/publisher/poems/${encodeURIComponent(poemId)}/details`, {
    method: 'PUT', body: { title: next.title, author: next.author, shown: { title: shown.title, author: shown.author } },
  })

/** An unpublished poem's author photo (#312, step 2b): a one-minute link to it, and the version to change it on; all null
 *  for a poem with no photo. */
export interface DraftPhoto { url: string | null, expiresAt: string | null, photoVersion: string | null }

export const readPhoto = (call: Call, poemId: string) =>
  call<DraftPhoto>(`/publisher/poems/${encodeURIComponent(poemId)}/photo`)

/**
 * Change a poem's photo, on the version it was shown at, as a poet's is sent: ask for an upload URL, PUT the image there,
 * then complete, which checks it (midst-infra publisherphoto.mjs). Refused while the poem is published. `put` sends the
 * image (fetch in the browser).
 */
export async function changePhoto(
  call: Call,
  put: (url: string, headers: Record<string, string>, file: Blob) => Promise<{ ok: boolean }>,
  poemId: string,
  photo: Blob,
  photoVersion: string | null,
): Promise<{ photoVersion: string }> {
  const path = `/publisher/poems/${encodeURIComponent(poemId)}/photo`
  const described = { contentType: photo.type, sizeBytes: photo.size }
  const ticket = await call<{ uploadUrl: string, uploadHeaders: Record<string, string> }>(path, { method: 'POST', body: described })
  let sent = false
  try {
    sent = (await put(ticket.uploadUrl, ticket.uploadHeaders, photo)).ok
  } catch {
    sent = false
  }
  if (!sent) throw new ApiError(0, 'upload', 'The photo could not be uploaded. Please try again.')
  return call<{ photoVersion: string }>(`${path}/complete`, { method: 'POST', body: { ...described, photoVersion } })
}

/** Whether a change's answer says withdrawn copies were left in CloudFront's cache. Only an explicit false: an
 *  answer with no field withdrew nothing. */
export const leftInCache = (result: unknown): boolean =>
  typeof result === 'object' && result !== null && (result as { edgeCleared?: unknown }).edgeCleared === false

export const saveOrder = (call: Call, poemIds: string[], listEtag: string) =>
  call('/publisher/order', { method: 'PUT', body: { poemIds, listEtag } })

/** Without `tags`, the poem keeps the tags it has (midst-infra #214). */
export const saveDetails = (call: Call, poemId: string, details: { publishDate: string | null, highlighted: boolean, tags?: string[] }, listEtag: string) =>
  call(`/publisher/poems/${encodeURIComponent(poemId)}`, { method: 'PUT', body: { ...details, listEtag } })

/**
 * The published poems newest first, as the Table of Contents opens (#377; Annelyse, GitHub #102, #103): by publish date
 * (YYYY-MM-DD) newest first; poems with the same date keep their order in the list; a poem with no date comes last, in
 * list order. The same order the site gives readers (src/store/reducer.ts, sortPoems), so the page shows what they see.
 */
export function newestFirst<T extends Pick<Poem, 'publishDate'>>(poems: T[]): T[] {
  const dated = (poem: T) => typeof poem.publishDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(poem.publishDate)
  const indexed = poems.map((poem, position) => ({ poem, position }))
  const withDate = indexed.filter(({ poem }) => dated(poem))
    .sort((a, b) => (b.poem.publishDate as string).localeCompare(a.poem.publishDate as string) || a.position - b.position)
  return [...withDate, ...indexed.filter(({ poem }) => !dated(poem))].map(({ poem }) => poem)
}

/** The list with the item at `from` moved to `to`. Out-of-range moves return the list unchanged. */
export function moved<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Whether the page's order differs from the saved one. */
export const orderChanged = (saved: Poem[], shown: Poem[]): boolean =>
  saved.length !== shown.length || saved.some((poem, i) => poem.poemId !== shown[i].poemId)
