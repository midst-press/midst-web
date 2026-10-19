import { disable, enable, invite, loadPeople, resendInvitation, setGroups } from '../app/admin'
import { Call } from '../app/publisher'

// The admin's calls (docs/app-api.md, "Admin"): route, method and body of each.

describe('the calls', () => {
  it('use the contract’s routes, methods and bodies', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await loadPeople(call)
    await invite(call, 'Qz Vb', 'qz@example.invalid', ['poet', 'publisher'])
    await resendInvitation(call, 'a1b2')
    await setGroups(call, 'a1b2', ['admin'])
    await disable(call, 'a1b2')
    await enable(call, 'a1b2')
    expect(call.mock.calls).toEqual([
      ['/admin/users'],
      ['/admin/users', { method: 'POST', body: { name: 'Qz Vb', email: 'qz@example.invalid', groups: ['poet', 'publisher'] } }],
      ['/admin/users/a1b2/resend', { method: 'POST' }],
      ['/admin/users/a1b2/groups', { method: 'PUT', body: { groups: ['admin'] } }],
      ['/admin/users/a1b2/disable', { method: 'POST' }],
      ['/admin/users/a1b2/enable', { method: 'POST' }],
    ])
  })

  it('encode the username in the path', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await resendInvitation(call, 'a/b c')
    await setGroups(call, 'a/b c', [])
    await disable(call, 'a/b c')
    await enable(call, 'a/b c')
    expect(call.mock.calls.map(c => c[0])).toEqual([
      '/admin/users/a%2Fb%20c/resend', '/admin/users/a%2Fb%20c/groups', '/admin/users/a%2Fb%20c/disable', '/admin/users/a%2Fb%20c/enable',
    ])
  })
})
