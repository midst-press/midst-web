// tools/check-site-strings.mjs: each form of written-out words is found, catalog calls and computed values are not,
// and the CLI reports lines and kinds, never the words. Invented text only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { findings } from './check-site-strings.mjs'

const kinds = source => findings('x.tsx', source).map(f => `${f.line}:${f.kind}`)

test('JSX text is found; space between tags is not', () => {
  assert.deepEqual(kinds('const a = <p>Zq words</p>\nconst b = <div>\n  <span />\n</div>'), ['1:text'])
})

test('a word attribute is found in each written form', () => {
  const forms = [
    '<b aria-label="Zq" />', "<b title={'Zq'} />", '<b alt={`Zq`} />', '<b placeholder={`Zq ${n}`} />',
    "<b aria-valuetext={on ? t('a') : 'Zq'} />", "<b aria-label={'Zq ' + n} />", "<b title={hint || 'Zq'} />",
    "<b title={hint ?? 'Zq'} />", "<b alt={on && 'Zq'} />", "<b aria-description={('Zq' as string)} />",
    "<b title={['Zq']} />", "<b aria-label={n + ' Zq'} />", '<b alt={`${n} Zq`} />',
  ]
  for (const form of forms) assert.deepEqual(kinds(`const x = ${form}`), [`1:${form.split(/[ =]/)[1]}`], form)
})

test('a JSX expression child holding words is text', () => {
  assert.deepEqual(kinds("const x = <p>{'Zq'}</p>\nconst y = <p>{on ? 'Zq' : null}</p>"), ['1:text', '2:text'])
})

test('catalog calls, references, computed values, empty strings and other attributes are not found', () => {
  const clean = [
    "<b aria-label={t('player.timeline')} />", '<b title={marker.label} />', '<b alt={`${a}${b}`} />',
    '<b aria-label="" />', '<b className="zq-class" />', '<b data-guide="zq-hook" />', "<p>{t('zq.key')}</p>",
    '<p>{count}</p>', '<b title />',
  ]
  for (const form of clean) assert.deepEqual(kinds(`const x = ${form}`), [], form)
})

test('the CLI scans src/**/*.tsx except tests, prints lines and kinds only, and fails unless --report-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'site-strings-'))
  try {
    mkdirSync(join(root, 'src', 'routes'), { recursive: true })
    mkdirSync(join(root, 'src', '__tests__'), { recursive: true })
    writeFileSync(join(root, 'src', 'routes', 'Page.tsx'), 'export const P = () => <p title="Zq secret">Zq words</p>\n')
    writeFileSync(join(root, 'src', '__tests__', 'Page.test.tsx'), 'const x = <p>Zq test</p>\n')
    writeFileSync(join(root, 'src', '__tests__', 'helper.tsx'), 'const x = <p>Zq helper</p>\n')
    writeFileSync(join(root, 'src', 'routes', 'Page.spec.tsx'), 'const x = <p>Zq spec</p>\n')
    writeFileSync(join(root, 'src', 'routes', 'Page.test.tsx'), 'const x = <p>Zq test beside the page</p>\n')
    writeFileSync(join(root, 'src', 'plain.ts'), "export const s = 'Zq not tsx'\n")
    const run = args => spawnSync(process.execPath, [join(process.cwd(), 'tools', 'check-site-strings.mjs'), '--root', root, ...args],
      { encoding: 'utf8' })
    const failing = run([])
    assert.equal(failing.status, 1, failing.stdout + failing.stderr)
    assert.deepEqual(failing.stdout.trim().split('\n'), [
      'src/routes/Page.tsx:1: title is written out; it belongs in the catalog.',
      'src/routes/Page.tsx:1: text is written out; it belongs in the catalog.',
      'Site words outside the catalog: 2',
    ])
    assert.doesNotMatch(failing.stdout, /Zq/, 'the words themselves are never printed')
    const report = run(['--report-only'])
    assert.equal(report.status, 0)
    assert.match(report.stdout, /Site words outside the catalog: 2 \(report only, not failing\)/)
    assert.equal(run(['--bogus']).status, 2)
    assert.equal(run(['src/missing.tsx']).status, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
