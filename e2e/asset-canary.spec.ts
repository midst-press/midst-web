import { test, expect } from '@playwright/test'
import { createServer } from 'http'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'

const root = join(__dirname, '..')

// Three poem records (the second with an accented author, the third unpublished) and a server that
// answers 200 for the stored keys and 403 for everything else, as the production origin does.
async function withCanary(
  stored: string[],
  body: (canary: {
    run: () => Promise<{ code: number | null, output: string }>
    requests: { method?: string, path: string }[]
    refuse: (path: string) => void
  }) => Promise<void>,
) {
  const dir = join(root, 'test-results', `canary-assets-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  for (const [file, author, published] of [['01', 'Ordinary', true], ['02', 'Synthétique', true], ['03', 'Skipped', false]] as const) {
    writeFileSync(join(dir, `${file}.json`), JSON.stringify({ author, title: 'x', published }))
  }
  const keys = new Set(stored)
  const requests: { method?: string, path: string }[] = []
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url || '')
    requests.push({ method: request.method, path })
    response.statusCode = keys.has(path) ? 200 : 403
    response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const run = () => new Promise<{ code: number | null, output: string }>((resolve, reject) => {
    // BASE requires a trailing slash, just as the production origin does.
    const child = spawn(process.execPath, [join(root, 'tools/poem-canary.mjs')], {
      cwd: root, env: { ...process.env, MIDST_POEMS_DIR: dir, MIDST_ASSETS_URL: `http://127.0.0.1:${address.port}/`, MIDST_CANARY_TIMEOUT: '5000' },
    })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    child.on('error', reject)
    child.on('exit', code => resolve({ code, output }))
  })
  try {
    await body({ run, requests, refuse: path => { keys.delete(path) } })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

const ORDINARY = ['/ordinary/ordinary.md', '/ordinary/ordinary--x.midst.zip']

test('the actual canary traverses alternate keys and still detects a missing timelapse', async () => {
  // The accented poem is stored decomposed; its record is composed.
  const timelapse = '/synthétique/synthétique--x.midst.zip'
  await withCanary([...ORDINARY, '/synthétique/synthétique.md', timelapse], async ({ run, requests, refuse }) => {
    const good = await run()
    expect(good.code).toBe(0)
    expect(good.output).toContain('timelapses reachable: 2/2')
    expect(requests).toHaveLength(6)
    expect(requests.every(request => request.method === 'HEAD')).toBe(true)
    requests.length = 0
    refuse(timelapse)
    const bad = await run()
    expect(bad.code).toBe(1)
    expect(bad.output).toContain('timelapses reachable: 1/2')
    expect(bad.output).toContain('poem 2:')
    expect(bad.output).not.toContain('Synthétique')
    expect(bad.output).not.toContain('synthétique')
    expect(requests).toHaveLength(6)
    expect(requests.every(request => request.method === 'HEAD')).toBe(true)
  })
})

// Issue #36, item 2. The site asks for a key all composed, then all decomposed, so an object whose
// folder is in one form and whose file name is in the other answers neither and a reader cannot open
// that poem. No such object exists today. The fetch does not try the mixed spellings (every reader of
// every accented poem would pay for them); the canary is what says so if one is ever uploaded.
test('the canary reports a timelapse stored with its folder and file name in different Unicode forms', async () => {
  await withCanary(
    [...ORDINARY, '/synthétique/synthétique.md', '/synthétique/synthétique--x.midst.zip'],
    async ({ run, requests }) => {
      const mixed = await run()
      expect(mixed.code).toBe(1)
      expect(mixed.output).toContain('timelapses reachable: 1/2')
      expect(mixed.output).toContain('poem 2:')
      expect(mixed.output).not.toContain('Synthétique')
      expect(mixed.output).not.toContain('synthétique')
      // Neither spelling it asked for is the stored one.
      const asked = requests.filter(request => request.path.endsWith('.midst.zip') && request.path !== ORDINARY[1])
      expect(asked.map(request => request.path).sort()).toEqual(
        ['/synthétique/synthétique--x.midst.zip', '/synthétique/synthétique--x.midst.zip'].sort(),
      )
    },
  )
})
