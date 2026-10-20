import { Call } from '../app/publisher'
import { MAX_BYTES, Submission, fileProblem, submitPoem, whenWords } from '../app/submit'

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
    const result = await submitPoem(call, put, { title: 'Zq', author: 'Qz' }, file)
    expect(call.mock.calls).toEqual([
      ['/submissions', { method: 'POST', body: { title: 'Zq', author: 'Qz', fileName: 'zq.midst', sizeBytes: 2 } }],
      ['/submissions/s%2F1/complete', { method: 'POST' }],
    ])
    expect(put).toHaveBeenCalledWith(ticket.uploadUrl, ticket.uploadHeaders, file)
    expect(result).toEqual({ submissionId: 's/1', status: 'received' })
  })

  it('does not complete when the upload fails or cannot be sent, and says so', async () => {
    for (const put of [jest.fn(async () => ({ ok: false })), jest.fn(async () => { throw new TypeError('network') })]) {
      const call = jest.fn(async () => ticket) as unknown as Call & jest.Mock
      await expect(submitPoem(call, put, { title: 'Zq', author: 'Qz' }, file)).rejects.toThrow('could not be uploaded')
      expect(call).toHaveBeenCalledTimes(1)
    }
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
