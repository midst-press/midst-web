import { ApiError, apiFetch } from '../app/api'

// Calls to the beta app's back end, and its error shape (docs/app-api.md).

const respond = (status: number, text: string) =>
  jest.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => text }))

describe('apiFetch', () => {
  it('sends the token, and JSON when there is a body', async () => {
    const fetchFn = respond(200, '{"listEtag":"e2"}')
    const result = await apiFetch<{ listEtag: string }>('https://api.example.invalid', 'tok', '/publisher/order',
      { method: 'PUT', body: { poemIds: ['a'], listEtag: 'e1' } }, fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ listEtag: 'e2' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.invalid/publisher/order')
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ poemIds: ['a'], listEtag: 'e1' })
  })

  it('sends no body and no content type on a GET', async () => {
    const fetchFn = respond(200, '{}')
    await apiFetch('https://api.example.invalid', 'tok', '/me', {}, fetchFn as unknown as typeof fetch)
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' })
    expect(init.body).toBeUndefined()
  })

  it('turns the contract’s error into an ApiError carrying its code, message and the rest of the body', async () => {
    const fetchFn = respond(409, '{"error":"conflict","message":"The list changed.","listEtag":"e3"}')
    const error = await apiFetch('u', 't', '/p', { method: 'POST', body: {} }, fetchFn as unknown as typeof fetch).catch(e => e)
    expect(error).toBeInstanceOf(ApiError)
    expect([error.status, error.code, error.message, error.body.listEtag]).toEqual([409, 'conflict', 'The list changed.', 'e3'])
  })

  it('shows its own sentence, not a page’s text, when an error is not the contract’s shape', async () => {
    const error = await apiFetch('u', 't', '/p', {}, respond(502, '<html>Bad gateway</html>') as unknown as typeof fetch).catch(e => e)
    expect([error.status, error.code]).toEqual([502, 'server'])
    expect(error.message).not.toContain('html')
  })

  it('says the app could not be reached when the request itself fails', async () => {
    const fetchFn = jest.fn(async () => { throw new TypeError('Failed to fetch') })
    const error = await apiFetch('u', 't', '/me', {}, fetchFn as unknown as typeof fetch).catch(e => e)
    expect([error.status, error.code]).toEqual([0, 'network'])
  })
})
