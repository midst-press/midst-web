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
      cwd: root, env: { ...process.env, MIDST_POEMS_DIR: dir, MIDST_ASSETS_URL: `http://127.0.0.1:${address.port}/`, MIDST_CANARY_TIMEOUT: '5000' },
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
