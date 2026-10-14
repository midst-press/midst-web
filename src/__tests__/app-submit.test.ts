import { Call } from '../app/publisher'
import { fileProblem, submitPoem } from '../app/submit'

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
