import { Call } from '../app/publisher'
import { MAX_BYTES, MAX_PHOTO_BYTES, Submission, fileProblem, photoProblem, submitPoem, whenWords } from '../app/submit'

// The poet's submission (docs/app-api.md, "Poet"): ask, upload, complete.

const file = Object.assign(new Blob(['zq']), { name: 'zq.midst' })
const ticket = { submissionId: 's/1', uploadUrl: 'https://up.example.invalid/k', uploadHeaders: { 'Content-Type': 'application/octet-stream' }, expiresAt: 'x' }

describe('fileProblem', () => {
  it('takes a .midst file in any case, and refuses anything else or an empty file', () => {
    expect(fileProblem({ name: 'zq.midst', size: 3 })).toBeNull()
    expect(fileProblem({ name: 'ZQ.MIDST', size: 3 })).toBeNull()
    expect(fileProblem({ name: 'zq.midst.zip', size: 3 })).toContain('.midst')
    expect(fileProblem({ name: 'zq.txt', size: 3 })).toContain('.midst')
    expect(fileProblem({ name: 'zq.midst', size: 0 })).toBe('That file is empty.')
    expect(fileProblem({ name: 'zq.midst', size: MAX_BYTES })).toBeNull()
    expect(fileProblem({ name: 'zq.midst', size: MAX_BYTES + 1 })).toContain('larger than 20 MB')
    expect(MAX_BYTES).toBe(20_971_520)
  })
})

describe('submitPoem', () => {
  it('asks for an upload URL, sends the file there with exactly its headers, then completes', async () => {
    const call = jest.fn(async (path: string) => (path === '/submissions' ? ticket : { submissionId: 's/1', status: 'received' })) as unknown as Call & jest.Mock
    const put = jest.fn(async () => ({ ok: true }))
    const result = await submitPoem(call, put, { title: 'Zq', author: 'Qz', processNote: 'Zq *xv*' }, file)
    expect(call.mock.calls).toEqual([
      ['/submissions', { method: 'POST', body: { title: 'Zq', author: 'Qz', processNote: 'Zq *xv*', fileName: 'zq.midst', sizeBytes: 2 } }],
      ['/submissions/s%2F1/complete', { method: 'POST' }],
    ])
    expect(put).toHaveBeenCalledWith(ticket.uploadUrl, ticket.uploadHeaders, file)
    expect(result).toEqual({ submissionId: 's/1', status: 'received' })
  })

  it('does not complete when the upload fails or cannot be sent, and says so', async () => {
    for (const put of [jest.fn(async () => ({ ok: false })), jest.fn(async () => { throw new TypeError('network') })]) {
      const call = jest.fn(async () => ticket) as unknown as Call & jest.Mock
      await expect(submitPoem(call, put, { title: 'Zq', author: 'Qz', processNote: 'Zq' }, file)).rejects.toThrow('could not be uploaded')
      expect(call).toHaveBeenCalledTimes(1)
    }
  })
})

describe('photoProblem (#312)', () => {
  it('takes a JPEG, PNG or WebP of 1 byte to 5 MB, and refuses anything else', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(photoProblem({ type, size: 3 })).toBeNull()
    for (const type of ['image/gif', 'image/svg+xml', '', 'image/jpg']) expect(photoProblem({ type, size: 3 })).toContain('JPEG, PNG or WebP')
    expect(photoProblem({ type: 'image/png', size: 0 })).toBe('That photo is empty.')
    expect(photoProblem({ type: 'image/png', size: MAX_PHOTO_BYTES })).toBeNull()
    expect(photoProblem({ type: 'image/png', size: MAX_PHOTO_BYTES + 1 })).toContain('larger than 5 MB')
    expect(MAX_PHOTO_BYTES).toBe(5_242_880)
  })
})

describe('submitPoem with a photo (#312)', () => {
  const photo = new Blob(['qz'], { type: 'image/png' })
  const photoTicket = { ...ticket, photoUploadUrl: 'https://up.example.invalid/p', photoUploadHeaders: { 'Content-Type': 'image/png' } }

  it('describes the photo, sends the file then the photo to their own URLs, then completes', async () => {
    const call = jest.fn(async (path: string) => (path === '/submissions' ? photoTicket : { submissionId: 's/1', status: 'received' })) as unknown as Call & jest.Mock
    const put = jest.fn(async () => ({ ok: true }))
    await submitPoem(call, put, { title: 'Zq', author: 'Qz', processNote: 'Zq' }, file, photo)
    expect(call.mock.calls[0][1].body.photo).toEqual({ contentType: 'image/png', sizeBytes: 2 })
    expect(put.mock.calls).toEqual([
      [ticket.uploadUrl, ticket.uploadHeaders, file],
      [photoTicket.photoUploadUrl, photoTicket.photoUploadHeaders, photo],
    ])
    expect(call.mock.calls[1][0]).toBe('/submissions/s%2F1/complete')
  })

  it('does not complete when the photo fails, cannot be sent, or has no URL or headers to go to', async () => {
    const { photoUploadHeaders: _h, ...noHeaders } = photoTicket
    const cases: Array<[unknown, jest.Mock]> = [
      [photoTicket, jest.fn(async (url: string) => ({ ok: url !== photoTicket.photoUploadUrl }))],
      [photoTicket, jest.fn(async (url: string) => { if (url === photoTicket.photoUploadUrl) throw new TypeError('network'); return { ok: true } })],
      [ticket, jest.fn(async () => ({ ok: true }))],
      [noHeaders, jest.fn(async () => ({ ok: true }))],
    ]
    for (const [answer, put] of cases) {
      const call = jest.fn(async () => answer) as unknown as Call & jest.Mock
      await expect(submitPoem(call, put, { title: 'Zq', author: 'Qz', processNote: 'Zq' }, file, photo)).rejects.toThrow('photo could not be uploaded')
      expect(call).toHaveBeenCalledTimes(1)
    }
  })

  it('does not send the photo when the file itself failed', async () => {
    const call = jest.fn(async () => photoTicket) as unknown as Call & jest.Mock
    const put = jest.fn(async () => ({ ok: false }))
    await expect(submitPoem(call, put, { title: 'Zq', author: 'Qz', processNote: 'Zq' }, file, photo)).rejects.toThrow('The file could not be uploaded')
    expect(put).toHaveBeenCalledTimes(1)
  })
})

const upload: Submission = { submissionId: 's-1', title: 'Zq xv', author: 'Qz Vb', origin: 'upload', submittedAt: '2026-10-15T09:30:00Z', status: 'received', note: null }
const archive: Submission = { submissionId: 's-2', title: 'Zq xv', author: 'Qz Vb', origin: 'archive', submittedAt: null, status: 'accepted', note: null, poet: null }

describe('whenWords', () => {
  it('says "from the archive" for an archive record whose file has no times, with no date and no 1970', () => {
    expect(whenWords(archive)).toBe('from the archive')
    expect(whenWords(archive)).not.toContain('1970')
  })

  it('says "date not recorded" for an upload with no time, never "from the archive" and never a date', () => {
    expect(whenWords({ origin: 'upload', submittedAt: null })).toBe('date not recorded')
  })

  it('shows the local date of an upload, as before', () => {
    expect(whenWords(upload)).toBe(new Date('2026-10-15T09:30:00Z').toLocaleDateString())
  })

  it('says an archive record\'s date is its last edit, not a submission date (#159)', () => {
    const lastEdit = '2021-01-06T21:14:03.512Z'
    expect(whenWords({ ...archive, submittedAt: lastEdit })).toBe(`from the archive, last edited ${new Date(lastEdit).toLocaleDateString()}`)
  })

  it('never says "last edited" for an upload', () => {
    expect(whenWords(upload)).not.toContain('last edited')
    expect(whenWords({ origin: 'upload', submittedAt: null })).not.toContain('last edited')
  })
})
