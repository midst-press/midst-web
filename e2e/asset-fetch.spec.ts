import { test, expect } from '@playwright/test'
import { assetUrls, fetchAsset } from '../src/poems/asset-fetch'

const base = 'http://127.0.0.1/archive/'
const key = 'synthétique/synthétique--x.midst.zip'
const variants = assetUrls(base, key)

test('asset candidates preserve original spelling and deduplicate Unicode forms', () => {
  expect(variants).toEqual([base + encodeURI(key), base + encodeURI(key.normalize('NFD'))])
  const decomposed = key.normalize('NFD')
  expect(assetUrls(base, decomposed)).toEqual([base + encodeURI(decomposed), base + encodeURI(key)])
  expect(assetUrls(base, 'ascii/x.zip')).toEqual([base + 'ascii/x.zip'])
  expect(assetUrls(base, 'synthétique/synthétique--x.zip')).toHaveLength(3)
})

test('existing success is returned without retry or reading content', async () => {
  const visited: string[] = []
  const good = new Response(null, { status: 200 })
  const request: typeof fetch = async url => { visited.push(String(url)); return good }
  expect(await fetchAsset(base, key, {}, request)).toBe(good)
  expect(visited).toEqual([variants[0]])
})

test('403 and 404 retry the alternate spelling with the same HEAD and signal', async () => {
  for (const status of [403, 404]) {
    const visited: string[] = []
    const controller = new AbortController()
    const options = { method: 'HEAD', signal: controller.signal }
    const request: typeof fetch = async (url, received) => {
      expect(received).toBe(options)
      visited.push(String(url))
      return new Response(null, { status: visited.length === 1 ? status : 200 })
    }
    const result = await fetchAsset(base, key, options, request)
    expect(result.status).toBe(200)
    expect(result.bodyUsed).toBe(false)
    expect(visited).toEqual(variants)
  }
})

test('other failures and transport rejection do not trigger spelling retries', async () => {
  for (const status of [401, 429, 500]) {
    let calls = 0
    const request: typeof fetch = async () => { calls += 1; return new Response(null, { status }) }
    expect((await fetchAsset(base, key, {}, request)).status).toBe(status)
    expect(calls).toBe(1)
  }
  let calls = 0
  const failure = new Error('synthetic transport failure')
  const request: typeof fetch = async () => { calls += 1; throw failure }
  await expect(fetchAsset(base, key, {}, request)).rejects.toBe(failure)
  expect(calls).toBe(1)
})

test('exhausted missing variants remain failures; ASCII misses are not duplicated', async () => {
  let calls = 0
  const request: typeof fetch = async () => { calls += 1; return new Response(null, { status: 403 }) }
  expect((await fetchAsset(base, key, {}, request)).status).toBe(403)
  expect(calls).toBe(2)
  calls = 0
  expect((await fetchAsset(base, 'ascii/x.zip', {}, request)).status).toBe(403)
  expect(calls).toBe(1)
})
