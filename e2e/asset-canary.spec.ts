import { test, expect } from '@playwright/test'
import { createServer } from 'http'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'

test('the actual canary traverses alternate keys and still detects a missing timelapse', async () => {
  const root = join(__dirname, '..')
  const dir = join(root, 'test-results', `canary-assets-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  for (const [file, author, published] of [['01', 'Ordinary', true], ['02', 'Synth\u00e9tique', true], ['03', 'Skipped', false]] as const) {
    writeFileSync(join(dir, `${file}.json`), JSON.stringify({ author, title: 'x', published }))
  }
  let missing = false
  const requests: { method?: string, path: string }[] = []
  const keys = new Set([
    '/ordinary/ordinary.md', '/ordinary/ordinary--x.midst.zip',
    '/synthe\u0301tique/synthe\u0301tique.md', '/synthe\u0301tique/synthe\u0301tique--x.midst.zip',
  ])
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url || '')
    requests.push({ method: request.method, path })
    response.statusCode = keys.has(path) && !(missing && path.endsWith('.zip') && path.startsWith('/synthe\u0301tique/')) ? 200 : 403
    response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const run = () => new Promise<{ code: number | null, output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'tools/poem-canary.mjs')], {
      cwd: root, env: { ...process.env, MIDST_KEY_SCHEME: 'legacy', MIDST_POEMS_DIR: dir, MIDST_ASSETS_URL: `http://127.0.0.1:${address.port}/`, MIDST_CANARY_TIMEOUT: '5000' },
    })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    child.on('error', reject)
    child.on('exit', code => resolve({ code, output }))
  })
  // BASE requires a trailing slash, just as the production origin does.
  try {
    const good = await run()
    expect(good.code).toBe(0)
    expect(good.output).toContain('timelapses reachable: 2/2')
    expect(requests).toHaveLength(6)
    expect(requests.every(request => request.method === 'HEAD')).toBe(true)
    requests.length = 0
    missing = true
    const bad = await run()
    expect(bad.code).toBe(1)
    expect(bad.output).toContain('timelapses reachable: 1/2')
    expect(bad.output).toContain('poem 2:')
    expect(bad.output).not.toContain('Synth\u00e9tique')
    expect(bad.output).not.toContain('synthe\u0301tique')
    expect(requests).toHaveLength(6)
    expect(requests.every(request => request.method === 'HEAD')).toBe(true)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

// The canonical scheme: one HEAD per object under the poem's id, no second spelling, and no scheme
// means no run at all.
test('the actual canary asks for canonical names once each, and refuses to run without a scheme', async () => {
  const root = join(__dirname, '..')
  const dir = join(root, 'test-results', `canary-canonical-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const first = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
  const second = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
  writeFileSync(join(dir, '01.json'), JSON.stringify({ id: first, author: 'Ordinary', title: 'x', published: true }))
  writeFileSync(join(dir, '02.json'), JSON.stringify({ id: second, author: 'Synth\u00e9tique', title: 'x', published: true }))
  writeFileSync(join(dir, '03.json'), JSON.stringify({ author: 'Skipped', title: 'x', published: false }))
  let missing = false
  const requests: { method?: string, path: string }[] = []
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url || '')
    requests.push({ method: request.method, path })
    response.statusCode = missing && path === `/${second}/timelapse.midst.zip` ? 403 : 200
    response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const run = (scheme?: string) => new Promise<{ code: number | null, output: string }>((resolve, reject) => {
    const env: Record<string, string | undefined> = { ...process.env, MIDST_POEMS_DIR: dir, MIDST_ASSETS_URL: `http://127.0.0.1:${address.port}/`, MIDST_CANARY_TIMEOUT: '5000' }
    delete env.MIDST_KEY_SCHEME
    if (scheme !== undefined) env.MIDST_KEY_SCHEME = scheme
    const child = spawn(process.execPath, [join(root, 'tools/poem-canary.mjs')], { cwd: root, env: env as NodeJS.ProcessEnv })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    child.on('error', reject)
    child.on('exit', code => resolve({ code, output }))
  })
  const expected = [first, second].flatMap(id => [`/${id}/timelapse.midst.zip`, `/${id}/process-note.md`]).sort()
  try {
    const good = await run('canonical')
    expect(good.code).toBe(0)
    expect(good.output).toContain('key scheme: canonical')
    expect(good.output).toContain('timelapses reachable: 2/2')
    expect(requests.map(request => request.path).sort()).toEqual(expected)
    expect(requests.every(request => request.method === 'HEAD')).toBe(true)

    requests.length = 0
    missing = true
    const bad = await run('canonical')
    expect(bad.code).toBe(1)
    expect(bad.output).toContain('timelapses reachable: 1/2')
    expect(bad.output).toContain('poem 2:')
    // Still four requests: a refused canonical name is not retried under another spelling.
    expect(requests.map(request => request.path).sort()).toEqual(expected)

    for (const scheme of [undefined, 'both']) {
      requests.length = 0
      const refused = await run(scheme)
      expect(refused.code).toBe(2)
      expect(refused.output).toContain('MIDST_KEY_SCHEME must be "legacy" or "canonical"')
      expect(requests).toHaveLength(0)
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

// Issue #36, item 2. Under the legacy scheme the site asks for a key all composed, then all decomposed,
// so an object whose folder is in one form and whose file name is in the other answers neither and a
// reader cannot open that poem. No such object exists today. The fetch does not try the mixed spellings
// (every reader of every accented poem would pay for them); the canary is what says so if one is ever
// uploaded.
test('the actual canary reports a timelapse stored with its folder and file name in different Unicode forms', async () => {
  const root = join(__dirname, '..')
  const dir = join(root, 'test-results', `canary-mixed-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  for (const [file, author, published] of [['01', 'Ordinary', true], ['02', 'Synth\u00e9tique', true], ['03', 'Skipped', false]] as const) {
    writeFileSync(join(dir, `${file}.json`), JSON.stringify({ author, title: 'x', published }))
  }
  const composed = '/synth\u00e9tique/synth\u00e9tique--x.midst.zip'
  const decomposed = '/synthe\u0301tique/synthe\u0301tique--x.midst.zip'
  // Stored: composed folder, decomposed file name.
  const mixed = '/synth\u00e9tique/synthe\u0301tique--x.midst.zip'
  expect([composed, decomposed]).not.toContain(mixed)
  const requests: { method?: string, path: string }[] = []
  const keys = new Set(['/ordinary/ordinary.md', '/ordinary/ordinary--x.midst.zip', '/synth\u00e9tique/synth\u00e9tique.md', mixed])
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url || '')
    requests.push({ method: request.method, path })
    response.statusCode = keys.has(path) ? 200 : 403
    response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  try {
    const result = await new Promise<{ code: number | null, output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [join(root, 'tools/poem-canary.mjs')], {
        cwd: root, env: { ...process.env, MIDST_KEY_SCHEME: 'legacy', MIDST_POEMS_DIR: dir, MIDST_ASSETS_URL: `http://127.0.0.1:${address.port}/`, MIDST_CANARY_TIMEOUT: '5000' },
      })
      let output = ''
      child.stdout.on('data', data => { output += data })
      child.stderr.on('data', data => { output += data })
      child.on('error', reject)
      child.on('exit', code => resolve({ code, output }))
    })
    expect(result.code).toBe(1)
    expect(result.output).toContain('timelapses reachable: 1/2')
    expect(result.output).toContain('poem 2:')
    expect(result.output).not.toContain('Synth\u00e9tique')
    expect(result.output).not.toContain('synth\u00e9tique')
    expect(result.output).not.toContain('synthe\u0301tique')
    // It asked for the two spellings the site asks for, and neither is the stored one.
    const asked = requests.map(request => request.path).filter(path => path.endsWith('--x.midst.zip') && !path.startsWith('/ordinary/'))
    expect(asked.sort()).toEqual([composed, decomposed].sort())
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
