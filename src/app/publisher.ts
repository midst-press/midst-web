/*
 * The publisher's routes (docs/app-api.md, "Publisher") and the list arithmetic the page does before
 * saving. Every change to the published list carries the listEtag the page last read; a 409 means
 * someone else changed it first.
 */
import { apiFetch } from './api'

export interface Poem {
  poemId: string
  title: string
  author: string
  timelapseKey: string
  processNoteKey: string | null
  publishDate: string | null
  highlighted: boolean
}

export interface PublisherList {
  listEtag: string
  published: Poem[]
  unpublished: Poem[]
  /** The ids of poems removed from the portal (#308; midst-infra #207). Absent from an API before that. */
  removed?: string[]
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

/** Remove an unpublished poem from the portal (#308): its record is marked, never deleted, and the portal stops
 *  offering it. Refused while the poem is published. */
export const removeFromPortal = (call: Call, poemId: string) =>
  call<{ removed: string }>('/publisher/remove', { method: 'POST', body: { poemId } })

/** A draft poem's process note and the version to save it on (#312); both null for a poem with no note. */
export interface DraftNote { processNote: string | null, noteVersion: string | null }

export const readNote = (call: Call, poemId: string) =>
  call<DraftNote>(`/publisher/poems/${encodeURIComponent(poemId)}/process-note`)

/** Save an edit, on the version it was loaded at. Refused while the poem is published. */
export const saveNote = (call: Call, poemId: string, processNote: string, noteVersion: string | null) =>
  call<DraftNote>(`/publisher/poems/${encodeURIComponent(poemId)}/process-note`, { method: 'PUT', body: { processNote, noteVersion } })

/** Whether a change's answer says withdrawn copies were left in CloudFront's cache. Only an explicit false: an
 *  answer with no field withdrew nothing. */
export const leftInCache = (result: unknown): boolean =>
  typeof result === 'object' && result !== null && (result as { edgeCleared?: unknown }).edgeCleared === false

export const saveOrder = (call: Call, poemIds: string[], listEtag: string) =>
  call('/publisher/order', { method: 'PUT', body: { poemIds, listEtag } })

export const saveDetails = (call: Call, poemId: string, details: { publishDate: string | null, highlighted: boolean }, listEtag: string) =>
  call(`/publisher/poems/${encodeURIComponent(poemId)}`, { method: 'PUT', body: { ...details, listEtag } })

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
