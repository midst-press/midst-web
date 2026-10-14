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
  submittedAt: string
  status: SubmissionStatus
  note: string | null
  poet?: string
}

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

/** Why a chosen file cannot be sent, or null when it can. The server checks again; this saves a round trip. */
export function fileProblem(file: { name: string, size: number }): string | null {
  if (!/\.midst$/i.test(file.name)) return 'Please choose a Midst file: its name ends in .midst.'
  if (file.size === 0) return 'That file is empty.'
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
