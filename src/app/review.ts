/*
 * The publisher's review routes (docs/app-api.md, "Review"): read the submissions, play one, accept or
 * decline it. Playing fetches the review copy from a pre-signed URL and reads it as the poem page does
 * (src/store/actions.ts): a zip whose first entry is the Midst file.
 */
import { Call } from './publisher'
import { Submission } from './submit'
import { parseMidstFile } from '../store/midst-file'
import { IMidstFile } from '../store/types'

export type Decision = 'accept' | 'decline'

export const reviewSubmissions = (call: Call) => call<{ submissions: Submission[] }>('/review/submissions')

export const timelapseTicket = (call: Call, submissionId: string) =>
  call<{ url: string, expiresAt: string }>(`/review/submissions/${encodeURIComponent(submissionId)}/timelapse`)

export const decide = (call: Call, submissionId: string, decision: Decision, note: string) =>
  call<Submission>(`/review/submissions/${encodeURIComponent(submissionId)}/decision`, { method: 'POST', body: { decision, note } })

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
