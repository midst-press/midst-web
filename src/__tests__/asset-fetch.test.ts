import { assetUrls, fetchAsset } from '../poems/asset-fetch'

const BASE = 'https://assets.example.test/bucket/'
const NFC_E = 'é'.normalize('NFC')
const NFD_E = 'é'.normalize('NFD')
const NFC_ENC = '%C3%A9'
const NFD_ENC = 'e%CC%81'

const res = (status: number): Response =>
  ({ ok: status >= 200 && status < 300, status }) as Response

describe('assetUrls', () => {
  it('sanity: the two spellings are different strings', () => {
    expect(NFC_E).not.toBe(NFD_E)
    expect(NFC_E).toHaveLength(1)
    expect(NFD_E).toHaveLength(2)
  })

  it('gives exactly one URL for an ASCII key', () => {
    expect(assetUrls(BASE, 'zq/xv.md')).toEqual([`${BASE}zq/xv.md`])
  })

  it('gives [original, NFD] for an NFC key', () => {
    const key = `zq/caf${NFC_E}.md`
    expect(assetUrls(BASE, key)).toEqual([
      `${BASE}zq/caf${NFC_ENC}.md`,
      `${BASE}zq/cafe%CC%81.md`,
    ])
  })

  it('gives [original, NFC] for an NFD key', () => {
    const key = `zq/caf${NFD_E}.md`
    expect(assetUrls(BASE, key)).toEqual([
      `${BASE}zq/cafe%CC%81.md`,
      `${BASE}zq/caf${NFC_ENC}.md`,
    ])
  })

  it('gives original, NFC, NFD for a key mixing both forms', () => {
    const key = `${NFC_E}x${NFD_E}`
    expect(assetUrls(BASE, key)).toEqual([
      `${BASE}${NFC_ENC}x${NFD_ENC}`,
      `${BASE}${NFC_ENC}x${NFC_ENC}`,
      `${BASE}${NFD_ENC}x${NFD_ENC}`,
    ])
  })

  it('prepends the base unchanged, without encoding it', () => {
    const base = 'http://h.test/a b/%20/'
    expect(assetUrls(base, 'k.md')).toEqual(['http://h.test/a b/%20/k.md'])
  })

  it('applies encodeURI: space becomes %20', () => {
    expect(assetUrls(BASE, 'zq/a b.md')).toEqual([`${BASE}zq/a%20b.md`])
  })

  it('leaves / and # as encodeURI does', () => {
    expect(assetUrls(BASE, 'zq/a#b/c.md')).toEqual([`${BASE}zq/a#b/c.md`])
  })

  it('turns an existing % into %25', () => {
    expect(assetUrls(BASE, 'zq/100%.md')).toEqual([`${BASE}zq/100%25.md`])
  })

  it('percent-encodes an accented character per its bytes', () => {
    expect(assetUrls(BASE, NFC_E)[0]).toBe(`${BASE}%C3%A9`)
    expect(assetUrls(BASE, NFD_E)[0]).toBe(`${BASE}e%CC%81`)
  })
})

describe('fetchAsset', () => {
  const NFC_KEY = `zq/caf${NFC_E}.md`
  const [URL_NFC, URL_NFD] = assetUrls(BASE, NFC_KEY)
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns the first response when it is ok, with one request', async () => {
    const first = res(200)
    const request = jest.fn().mockResolvedValueOnce(first)
    const out = await fetchAsset(BASE, NFC_KEY, {}, request)
    expect(out).toBe(first)
    expect(request.mock.calls.map(c => c[0])).toEqual([URL_NFC])
  })

  it.each([403, 404])('tries the next spelling after a %i', async status => {
    const first = res(status)
    const second = res(200)
    const request = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const out = await fetchAsset(BASE, NFC_KEY, {}, request)
    expect(out).toBe(second)
    expect(request.mock.calls.map(c => c[0])).toEqual([URL_NFC, URL_NFD])
  })

  it('tries every candidate once on 403 and returns the last response', async () => {
    const key = `${NFC_E}x${NFD_E}`
    const urls = assetUrls(BASE, key)
    const responses = [res(403), res(403), res(403)]
    const request = jest.fn()
    responses.forEach(r => request.mockResolvedValueOnce(r))
    const out = await fetchAsset(BASE, key, {}, request)
    expect(out).toBe(responses[2])
    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls.map(c => c[0])).toEqual(urls)
  })

  it('walks all three candidates when the third is the one that works', async () => {
    const key = `${NFC_E}x${NFD_E}`
    const urls = assetUrls(BASE, key)
    const third = res(200)
    const request = jest.fn()
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(403))
      .mockResolvedValueOnce(third)
    const out = await fetchAsset(BASE, key, {}, request)
    expect(out).toBe(third)
    expect(request.mock.calls.map(c => c[0])).toEqual(urls)
  })

  it.each([500, 401, 302])('does not try an alternative after a %i', async status => {
    const first = res(status)
    const request = jest.fn().mockResolvedValue(first)
    const out = await fetchAsset(BASE, NFC_KEY, {}, request)
    expect(out).toBe(first)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toBe(URL_NFC)
  })

  it('stops at a non-403/404 failure partway through the candidates', async () => {
    const key = `${NFC_E}x${NFD_E}`
    const urls = assetUrls(BASE, key)
    const second = res(500)
    const request = jest.fn().mockResolvedValueOnce(res(403)).mockResolvedValueOnce(second)
    const out = await fetchAsset(BASE, key, {}, request)
    expect(out).toBe(second)
    expect(request.mock.calls.map(c => c[0])).toEqual([urls[0], urls[1]])
  })

  it('makes exactly one request for an ASCII key that gets 403', async () => {
    const first = res(403)
    const request = jest.fn().mockResolvedValue(first)
    const out = await fetchAsset(BASE, 'zq/xv.md', {}, request)
    expect(out).toBe(first)
    expect(request.mock.calls.map(c => c[0])).toEqual([`${BASE}zq/xv.md`])
  })

  it('propagates a rejection from the first request without trying another', async () => {
    const request = jest.fn().mockRejectedValue(new Error('network down'))
    await expect(fetchAsset(BASE, NFC_KEY, {}, request)).rejects.toThrow('network down')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('propagates a rejection from a later request', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(res(403))
      .mockRejectedValueOnce(new Error('reset'))
    await expect(fetchAsset(BASE, NFC_KEY, {}, request)).rejects.toThrow('reset')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('passes the same options object to every request', async () => {
    const options = { method: 'HEAD', headers: { 'x-zq': '1' } }
    const request = jest.fn().mockResolvedValueOnce(res(403)).mockResolvedValueOnce(res(200))
    await fetchAsset(BASE, NFC_KEY, options, request)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][1]).toBe(options)
    expect(request.mock.calls[1][1]).toBe(options)
    expect(options).toEqual({ method: 'HEAD', headers: { 'x-zq': '1' } })
  })

  it('passes {} when options are omitted', async () => {
    const request = jest.fn().mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200))
    await fetchAsset(BASE, NFC_KEY, undefined, request)
    expect(request.mock.calls[0][1]).toEqual({})
    expect(request.mock.calls[1][1]).toEqual({})
  })

  it('uses globalThis.fetch when the request argument is omitted', async () => {
    const response = res(200)
    const replacement = jest.fn().mockResolvedValue(response)
    globalThis.fetch = replacement as unknown as typeof fetch
    const out = await fetchAsset(BASE, 'zq/xv.md')
    expect(out).toBe(response)
    expect(replacement.mock.calls).toEqual([[`${BASE}zq/xv.md`, {}]])
  })
})
