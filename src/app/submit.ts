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

export const NO_DATE_WORDS = 'date not recorded'

/**
 * An archive record's date is the last edit in its own file (Stuart, 16 Oct), not when it was submitted, so it says so
 * (#159). Provisional wording, pending Annelyse (GitHub midst-press/midst-web#65, point 2): this is the one place to
 * change it.
 */
export const archiveDatedWords = (date: string): string => `${ARCHIVE_WORDS}, last edited ${date}`

/**
 * When a submission arrived, for a person: an upload's local date; an archive record's last edit, saying it is one
 * (#159); with no time, "from the archive" for an archive record and "date not recorded" otherwise, so a lost date on
 * an upload is not passed off as provenance (silas-397300f6, review of #157). A null time is never made into a date.
 */
export const whenWords = (s: Pick<Submission, 'origin' | 'submittedAt'>): string => {
  if (s.submittedAt !== null) {
    const date = new Date(s.submittedAt).toLocaleDateString()
    return s.origin === 'archive' ? archiveDatedWords(date) : date
  }
  return s.origin === 'archive' ? ARCHIVE_WORDS : NO_DATE_WORDS
}

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
  /** Present when a photo was described: a second pre-signed PUT, for the photo alone. */
  photoUploadUrl?: string
  photoUploadHeaders?: Record<string, string>
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

// The author photo (#312; Annelyse, 26 Oct): optional, one per poem, shown at the foot of its process note. The types and
// the size are the server's (docs/app-api.md, POST /submissions), which also checks the photo's first bytes.
export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/** Why a chosen photo cannot be sent, or null when it can. The server checks again; this saves a round trip. */
export function photoProblem(photo: { type: string, size: number }): string | null {
  if (!PHOTO_TYPES.includes(photo.type)) return 'Please choose a JPEG, PNG or WebP image for your photo.'
  if (photo.size === 0) return 'That photo is empty.'
  if (photo.size > MAX_PHOTO_BYTES) return 'That photo is larger than 5 MB, which is the most the app accepts.'
  return null
}

/**
 * Submit a poem. `put` sends the file to the upload URL (fetch in the browser). Returns the submission
 * as the server records it once complete. With `forPoet`, a publisher sends it for that registered poet (midst-infra
 * #232): the same steps on the publisher's routes, and the submission is the poet's.
 */
export async function submitPoem(
  call: Call,
  put: (url: string, headers: Record<string, string>, file: Blob) => Promise<{ ok: boolean }>,
  details: { title: string, author: string, processNote: string },
  file: File | (Blob & { name: string }),
  photo: Blob | null = null,
  forPoet: string | null = null,
): Promise<Submission> {
  const base = forPoet === null ? '/submissions' : '/publisher/submissions'
  const ticket = await call<UploadTicket>(base, {
    method: 'POST',
    body: {
      title: details.title, author: details.author, processNote: details.processNote, fileName: file.name, sizeBytes: file.size,
      ...(photo ? { photo: { contentType: photo.type, sizeBytes: photo.size } } : {}),
      ...(forPoet === null ? {} : { poetUsername: forPoet }),
    },
  })
  const sent = async (url: string, headers: Record<string, string>, blob: Blob): Promise<boolean> => {
    try {
      return (await put(url, headers, blob)).ok
    } catch {
      return false
    }
  }
  if (!(await sent(ticket.uploadUrl, ticket.uploadHeaders, file))) {
    throw new ApiError(0, 'upload', 'The file could not be uploaded. Please try again.')
  }
  // Completing without the photo would make the server refuse it as not arrived, so a photo that cannot be sent stops
  // here, as the file does. A ticket missing the photo's URL or headers is the same failure: never complete
  // as though the poet had sent none.
  if (photo) {
    const { photoUploadUrl: url, photoUploadHeaders: headers } = ticket
    const ok = url !== undefined && headers !== undefined && await sent(url, headers, photo)
    if (!ok) throw new ApiError(0, 'upload', 'Your photo could not be uploaded. Please try again.')
  }
  return call<Submission>(`${base}/${encodeURIComponent(ticket.submissionId)}/complete`, { method: 'POST' })
}

export const mySubmissions = (call: Call) => call<{ submissions: Submission[] }>('/submissions/mine')
