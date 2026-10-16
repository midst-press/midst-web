/*
 * The publisher's review routes (docs/app-api.md, "Review"): read the submissions, play one, accept or
 * decline it. Playing fetches the review copy from a pre-signed URL and reads it as the poem page does
 * (src/store/actions.ts): a zip whose first entry is the Midst file.
 */
import { Call, PublisherList } from './publisher'
import { Submission } from './submit'
import { parseMidstFile } from '../store/midst-file'
import { IMidstFile } from '../store/types'

export type Decision = 'accept' | 'decline'

export const reviewSubmissions = (call: Call) => call<{ submissions: Submission[] }>('/review/submissions')

export const timelapseTicket = (call: Call, submissionId: string) =>
  call<{ url: string, expiresAt: string }>(`/review/submissions/${encodeURIComponent(submissionId)}/timelapse`)

export const decide = (call: Call, submissionId: string, decision: Decision, note: string) =>
  call<Submission>(`/review/submissions/${encodeURIComponent(submissionId)}/decision`, { method: 'POST', body: { decision, note } })

/** The ids of the publisher's poems, published or not. A poem's id is the id of the submission it was made from. */
export const poemIdsOf = (list: Pick<PublisherList, 'published' | 'unpublished'>): Set<string> =>
  new Set([...list.published, ...list.unpublished].map(p => p.poemId))

/** The poem list as the review page holds it: the ids, 'loading' while it is being read, or null when it could not be. */
export type PoemIds = Set<string> | 'loading' | null

export const POEM_LIST_UNKNOWN = "Can't tell whether this poem was made: the list of poems could not be loaded. Reload the page to try again."

export type Finishing = { offer: false } | { offer: true, enabled: true } | { offer: true, enabled: false, reason: string }

/**
 * Whether the review page offers "Finish accepting": an accept is committed before the poem is made, so an
 * `accepted` upload whose id is on neither of the publisher's lists has no poem, and accepting again makes it.
 * Archive records answer 409, and a `published` submission is on the list by definition. While the list is being
 * read nothing is offered; when it could not be read (`poemIds` null) it is offered disabled, with the reason,
 * rather than on a guess.
 */
export function needsFinishing(submission: Pick<Submission, 'submissionId' | 'origin' | 'status'>, poemIds: PoemIds): Finishing {
  if (submission.status !== 'accepted' || submission.origin === 'archive') return { offer: false }
  if (poemIds === 'loading') return { offer: false }
  if (poemIds === null) return { offer: true, enabled: false, reason: POEM_LIST_UNKNOWN }
  return poemIds.has(submission.submissionId) ? { offer: false } : { offer: true, enabled: true }
}

/** Why a review copy could not be played. The message is safe to show: it never carries the file or the URL. */
export class PlayError extends Error {}

/** The parts of the zip library (window.zip, zip.js) this file uses. */
export interface ZipLib {
  workerScriptsPath?: string
  BlobReader: new (blob: Blob) => unknown
  BlobWriter: new () => unknown
  createReader: (
    reader: unknown,
    onReader: (zipReader: { getEntries: (done: (entries: { getData: (writer: unknown, done: (blob: Blob) => void) => void }[]) => void) => void }) => void,
    onError: () => void,
  ) => void
}

export interface PlayDeps {
  fetch: (url: string) => Promise<{ ok: boolean, blob: () => Promise<Blob> }>
  zip: ZipLib
  readText: (blob: Blob) => Promise<string>
}

const EXPIRED = 'The review copy could not be fetched. The link may have expired: press Play again.'
const DAMAGED = 'The review copy is damaged and cannot be played.'

/** Fetch the pre-signed review copy, unzip it and parse the Midst file inside. Throws a PlayError a person can read. */
export async function fetchTimelapse(url: string, deps: PlayDeps, workerScriptsPath = '/static/workers/'): Promise<IMidstFile> {
  let blob: Blob
  try {
    const response = await deps.fetch(url)
    if (!response.ok) throw new PlayError(EXPIRED)
    blob = await response.blob()
  } catch {
    throw new PlayError(EXPIRED)
  }
  const zip = deps.zip
  zip.workerScriptsPath = workerScriptsPath
  let entry: { getData: (writer: unknown, done: (blob: Blob) => void) => void }
  try {
    entry = await new Promise((resolve, reject) => {
      zip.createReader(new zip.BlobReader(blob), zipReader => {
        zipReader.getEntries(entries => (entries.length ? resolve(entries[0]) : reject(new PlayError(DAMAGED))))
      }, () => reject(new PlayError(DAMAGED)))
    })
    const unzipped = await new Promise<Blob>(resolve => entry.getData(new zip.BlobWriter(), resolve))
    return parseMidstFile(await deps.readText(unzipped))
  } catch {
    throw new PlayError(DAMAGED)
  }
}
