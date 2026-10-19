import { Call } from '../app/publisher'
import { disablePoet, listPoets, poetOnly, registerPoet, resendInvitation } from '../app/poets'

// The publisher's poet routes (docs/app-api.md, "Poets").

describe('the poet calls', () => {
  it('use the contract’s routes, methods and bodies', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await listPoets(call)
    await registerPoet(call, 'Qz Vb', 'qz@example.invalid')
    await resendInvitation(call, 'u/1')
    await disablePoet(call, 'u/1')
    expect(call.mock.calls).toEqual([
      ['/publisher/poets'],
      ['/publisher/poets', { method: 'POST', body: { name: 'Qz Vb', email: 'qz@example.invalid' } }],
      ['/publisher/poets/u%2F1/resend', { method: 'POST' }],
      ['/publisher/poets/u%2F1/disable', { method: 'POST' }],
    ])
  })
})

describe('poetOnly (#122)', () => {
  it('is true only for someone in exactly the poet group', () => {
    expect(poetOnly({ groups: ['poet'] })).toBe(true)
    expect(poetOnly({ groups: ['poet', 'publisher'] })).toBe(false)
    expect(poetOnly({ groups: ['admin', 'poet'] })).toBe(false)
    expect(poetOnly({ groups: ['publisher'] })).toBe(false)
    expect(poetOnly({ groups: [] })).toBe(false)
  })
})
