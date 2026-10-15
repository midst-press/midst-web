/*
 * The poet's routes (docs/app-api.md, "Poet"). Submitting is three steps, so the file goes straight to
 * the bucket and never through the Lambda: ask for an upload URL, PUT the file to it, then complete.
 */
import { ApiError } from './api'
import { Call } from './publisher'

export type SubmissionStatus = 'uploading' | 'received' | 'accepted' | 'declined' | 'published'

export interface Submission {
  submissionId: string
  title: string
  author: string
  /** Where the record came from: an upload through the app, or a poem from the archive that was never uploaded. */
  origin: 'archive' | 'upload'
  /** For an archive record, the last edit in its own file (Stuart, 16 Oct); null when the file has no times. */
  submittedAt: string | null
  status: SubmissionStatus
  note: string | null
  /** The poet's email, on the publisher's routes only; null for an archive record with no poet. */
  poet?: string | null
  /** Who recorded an archive record, when the migration that wrote it said. */
  recordedBy?: string
}

export const ARCHIVE_WORDS = 'from the archive'

/** When a submission arrived, for a person: the local date, or "from the archive" when there is no time. A null time is never made into a date. */
export const whenWords = (s: Pick<Submission, 'submittedAt'>): string =>
  (s.submittedAt === null ? ARCHIVE_WORDS : new Date(s.submittedAt).toLocaleDateString())

/** The publisher's line under a title: "by Author, poet, when", leaving out a poet there is none of. */
export const reviewByline = (s: Pick<Submission, 'origin' | 'submittedAt' | 'author' | 'poet'>): string =>
  `by ${[s.author, ...(s.poet ? [s.poet] : []), whenWords(s)].join(', ')}`

/** An upload that never completed has no review copy, and an archive record never had one. */
export const canPlay = (s: Pick<Submission, 'origin' | 'status'>): boolean => s.origin !== 'archive' && s.status !== 'uploading'

interface UploadTicket {
  submissionId: string
  uploadUrl: string
  uploadHeaders: Record<string, string>
  expiresAt: string
}

export const STATUS_WORDS: Record<SubmissionStatus, string> = {
  uploading: 'Not finished uploading',
  received: 'Received, waiting to be read',
  accepted: 'Accepted',
  declined: 'Not taken this time',
  published: 'Published',
}

// The largest file the app accepts (docs/app-api.md, POST /submissions; #112).
export const MAX_BYTES = 20 * 1024 * 1024

/** Why a chosen file cannot be sent, or null when it can. The server checks again; this saves a round trip. */
export function fileProblem(file: { name: string, size: number }): string | null {
  if (!/\.midst$/i.test(file.name)) return 'Please choose a Midst file: its name ends in .midst.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_BYTES) return 'That file is larger than 20 MB, which is the most the app accepts.'
  return null
}

/**
 * Submit a poem. `put` sends the file to the upload URL (fetch in the browser). Returns the submission
 * as the server records it once complete.
 */
export async function submitPoem(
  call: Call,
  put: (url: string, headers: Record<string, string>, file: Blob) => Promise<{ ok: boolean }>,
  details: { title: string, author: string },
  file: File | (Blob & { name: string }),
): Promise<Submission> {
  const ticket = await call<UploadTicket>('/submissions', {
    method: 'POST',
    body: { title: details.title, author: details.author, fileName: file.name, sizeBytes: file.size },
  })
  let uploaded: { ok: boolean }
  try {
    uploaded = await put(ticket.uploadUrl, ticket.uploadHeaders, file)
  } catch {
    uploaded = { ok: false }
  }
  if (!uploaded.ok) throw new ApiError(0, 'upload', 'The file could not be uploaded. Please try again.')
  return call<Submission>(`/submissions/${encodeURIComponent(ticket.submissionId)}/complete`, { method: 'POST' })
}

export const mySubmissions = (call: Call) => call<{ submissions: Submission[] }>('/submissions/mine')
