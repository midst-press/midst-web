import { ID_SHAPE, SCHEMES, fetchPoemAsset, objectNames, parseScheme } from '../poems/key-scheme'

// All names here are invented. Expected object names are written out, never built with the module
// under test, so a change to either scheme's names has to be made here by hand as well.
const BASE = 'http://127.0.0.1:1/zq/'
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const OTHER_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff'

const response = (status: number) => ({ ok: status >= 200 && status < 300, status })

describe('parseScheme', () => {
  it('knows exactly two schemes', () => {
    expect(SCHEMES).toEqual(['legacy', 'canonical'])
  })

  it.each(['legacy', 'canonical'])('accepts %s', scheme => {
    expect(parseScheme(scheme)).toBe(scheme)
  })

  it('refuses a missing value and says there is no default', () => {
    expect(() => parseScheme(undefined)).toThrow('MIDST_KEY_SCHEME must be "legacy" or "canonical"; it is not set. There is no default.')
    expect(() => parseScheme('')).toThrow('it is not set')
  })

  it.each(['Legacy', 'CANONICAL', ' legacy', 'canonical ', 'both', 'true', null, 0, ['legacy']])('refuses %p and quotes it', value => {
    expect(() => parseScheme(value)).toThrow(`it is ${JSON.stringify(value)}`)
  })
})

describe('objectNames', () => {
  const poem = { id: ID, author: 'Zq Xv', title: 'Kj, Wm' }

  it('legacy: the author and title names, as before', () => {
    expect(objectNames(poem, 'legacy')).toEqual({
      timelapse: 'zq-xv/zq-xv--kj-wm.midst.zip',
      processNote: 'zq-xv/zq-xv.md',
    })
  })

  it('legacy: honours the folder override and needs no id', () => {
    expect(objectNames({ author: 'Zq Xv', title: 'Kj, Wm', authorSecondaryFolder: 'zq-folder' }, 'legacy')).toEqual({
      timelapse: 'zq-folder/zq-xv--kj-wm.midst.zip',
      processNote: 'zq-folder/zq-xv.md',
    })
  })

  it('canonical: both names are under the id and nowhere else', () => {
    expect(objectNames(poem, 'canonical')).toEqual({
      timelapse: `${ID}/timelapse.midst.zip`,
      processNote: `${ID}/process-note.md`,
    })
  })

  it('canonical: nothing but the id decides the names', () => {
    const renamed = { id: ID, author: 'Someone Else', title: 'Another <i>Title</i>', authorSecondaryFolder: 'zq-folder' }
    expect(objectNames(renamed, 'canonical')).toEqual(objectNames(poem, 'canonical'))
    expect(objectNames({ ...poem, id: OTHER_ID }, 'canonical').timelapse).toBe(`${OTHER_ID}/timelapse.midst.zip`)
  })

  it('canonical: two poems by one author have separate process notes', () => {
    const first = objectNames({ id: ID, author: 'Zq Xv', title: 'One' }, 'canonical')
    const second = objectNames({ id: OTHER_ID, author: 'Zq Xv', title: 'Two' }, 'canonical')
    expect(first.processNote).not.toBe(second.processNote)
  })

  it.each([
    ['no id', undefined],
    ['an empty id', ''],
    ['an upper-case id', ID.toUpperCase()],
    ['an id that is not version 4', '0a1b2c3d-4e5f-1a6b-8c7d-9e0f1a2b3c4d'],
    ['an id with a path in it', `${ID}/../x`],
    ['an id that is not a string', 7],
  ])('canonical: refuses %s, without naming the poem', (_what, id) => {
    let message = ''
    try {
      objectNames({ id: id as any, author: 'Zq Xv', title: 'Kj, Wm' }, 'canonical')
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('A poem without a well-formed id has no canonical object names.')
  })

  it.each([undefined, '', 'Canonical'])('refuses scheme %p, and does not fall back to legacy names', scheme => {
    expect(() => objectNames(poem, scheme as any)).toThrow('MIDST_KEY_SCHEME must be')
  })

  it('shares the id shape with the id tool', () => {
    expect(ID_SHAPE.test(ID)).toBe(true)
    expect(ID_SHAPE.test(ID.toUpperCase())).toBe(false)
  })
})

describe('fetchPoemAsset', () => {
  const canonicalKey = `${ID}/timelapse.midst.zip`
  // NFC in the key; the object "exists" only under the NFD spelling.
  const nfcKey = 'synthétique/synthétique--x.midst.zip'
  const nfdUrl = BASE + encodeURI(nfcKey.normalize('NFD'))

  it('canonical: asks once for base + key and returns that answer', async () => {
    const good = response(200)
    const request = jest.fn().mockResolvedValue(good)
    const options = { method: 'HEAD' }
    expect(await fetchPoemAsset(BASE, canonicalKey, 'canonical', options, request as any)).toBe(good)
    expect(request.mock.calls).toEqual([[BASE + canonicalKey, options]])
  })

  it.each([403, 404, 500])('canonical: a %d is the answer, with no second request', async status => {
    const request = jest.fn().mockResolvedValue(response(status))
    const out = await fetchPoemAsset(BASE, canonicalKey, 'canonical', {}, request as any)
    expect(out.status).toBe(status)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('canonical: does not try another spelling even for a key that has one', async () => {
    const request = jest.fn(async (url: string) => response(url === nfdUrl ? 200 : 403))
    const out = await fetchPoemAsset(BASE, nfcKey, 'canonical', {}, request as any)
    expect(out.status).toBe(403)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('canonical: a transport failure is passed on', async () => {
    const request = jest.fn().mockRejectedValue(new Error('network down'))
    await expect(fetchPoemAsset(BASE, canonicalKey, 'canonical', {}, request as any)).rejects.toThrow('network down')
  })

  it('legacy: still finds an object stored under the other spelling', async () => {
    const request = jest.fn(async (url: string) => response(url === nfdUrl ? 200 : 403))
    const out = await fetchPoemAsset(BASE, nfcKey, 'legacy', {}, request as any)
    expect(out.status).toBe(200)
    expect(request.mock.calls.map(call => call[0])).toEqual([BASE + encodeURI(nfcKey), nfdUrl])
  })

  it.each([undefined, '', 'Legacy'])('refuses scheme %p without making a request', scheme => {
    const request = jest.fn()
    expect(() => fetchPoemAsset(BASE, canonicalKey, scheme as any, {}, request as any)).toThrow('MIDST_KEY_SCHEME must be')
    expect(request).not.toHaveBeenCalled()
  })
})
