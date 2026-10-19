// node --test tools/test-still-head.mjs
// .gitea/scripts/still_head.sh, run with a stand-in curl: the answer it writes, and that it never stops a job it
// cannot judge (midst-infra #102).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '.gitea', 'scripts', 'still_head.sh')
const HEAD = 'a'.repeat(40)
const NEWER = 'b'.repeat(40)
const PR_URL = 'http://gitea.invalid/api/v1/repos/zq/zq/pulls/7'

// A curl that logs its arguments and answers with CURL_BODY, or fails with CURL_RC.
const CURL = `#!/bin/bash
printf '%s\\n' "$*" >> "$CURL_LOG"
[ "\${CURL_RC:-0}" = 0 ] || { echo "curl: (22) The requested URL returned error: 500" >&2; exit "$CURL_RC"; }
printf '%s' "$CURL_BODY"
`

const run = (env, curl = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'still-head-'))
  writeFileSync(join(dir, 'curl'), CURL)
  chmodSync(join(dir, 'curl'), 0o755)
  const out = join(dir, 'output')
  const log = join(dir, 'curl.log')
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      GITHUB_OUTPUT: out,
      CURL_LOG: log,
      CURL_BODY: curl.body ?? '',
      CURL_RC: String(curl.rc ?? 0),
      ...env,
    },
  })
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    output: existsSync(out) ? readFileSync(out, 'utf8') : null,
    curlCalls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
  }
}

const pr = { EVENT_NAME: 'pull_request', RUN_HEAD: HEAD, PR_URL, TOKEN: 'zq-token' }
const answering = sha => ({ body: JSON.stringify({ number: 7, head: { sha } }) })

test('a push run is always current and asks nothing', () => {
  const r = run({ EVENT_NAME: 'push' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.output, 'current=true\n')
  assert.deepEqual(r.curlCalls, [])
})

test('a PR run whose head is still the PR head is current', () => {
  const r = run(pr, answering(HEAD))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.output, 'current=true\n')
  assert.equal(r.curlCalls.length, 1)
  assert.match(r.curlCalls[0], /Authorization: token zq-token/)
  assert.ok(r.curlCalls[0].endsWith(PR_URL), r.curlCalls[0])
})

test('a PR run whose head has moved stops, and says from what to what', () => {
  const r = run(pr, answering(NEWER))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.output, 'current=false\n')
  assert.match(r.stdout, new RegExp(`::notice::.*moved from ${HEAD} to ${NEWER}`))
})

test('a PR that cannot be read runs the job in full, and says so', () => {
  const r = run(pr, { rc: 22 })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.output, 'current=true\n')
  assert.match(r.stdout, /::warning::could not read the PR/)
  assert.match(r.stderr, /returned error: 500/)
})

test('an answer with no head sha runs the job in full, and says so', () => {
  const r = run(pr, { body: '{"message":"not found"}' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.output, 'current=true\n')
  assert.match(r.stdout, /::warning::.*has no head sha/)
})

test('an answer that is not JSON runs the job in full', () => {
  const r = run(pr, { body: '<html>bad gateway</html>' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.output, 'current=true\n')
  assert.match(r.stdout, /::warning::.*has no head sha/)
})

for (const name of ['RUN_HEAD', 'PR_URL', 'TOKEN']) {
  test(`a PR run without ${name} is a calling error, exit 2, and answers nothing`, () => {
    const r = run({ ...pr, [name]: '' }, answering(HEAD))
    assert.equal(r.status, 2)
    assert.match(r.stderr, new RegExp(`${name} is not set`))
    assert.equal(r.output, null)
  })
}

test('without GITHUB_OUTPUT it is a calling error, exit 2', () => {
  const r = run({ ...pr, GITHUB_OUTPUT: '' }, answering(HEAD))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /GITHUB_OUTPUT is not set/)
})
