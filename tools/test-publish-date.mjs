// node --test tools/test-publish-date.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalDate, isoPublishDate } from './publish-date.mjs'

const ID = '0f1e2d3c-4b5a-4968-8776-655443322110'

test('M/D/YYYY becomes zero-padded YYYY-MM-DD', () => {
  assert.equal(isoPublishDate('8/5/2021', ID), '2021-08-05')
  assert.equal(isoPublishDate('12/24/2020', ID), '2020-12-24')
  assert.equal(isoPublishDate('02/09/2021', ID), '2021-02-09')
})

test('YYYY-MM-DD passes through, null and missing stay null', () => {
  assert.equal(isoPublishDate('2026-10-01', ID), '2026-10-01')
  assert.equal(isoPublishDate(null, ID), null)
  assert.equal(isoPublishDate(undefined, ID), null)
})

test('a date that is not real is refused, by poem id', () => {
  for (const bad of ['2/30/2021', '13/1/2021', '2021-02-29', '0/10/2021']) {
    assert.throws(() => isoPublishDate(bad, ID), new RegExp(`${ID} is not a real date`), bad)
  }
  assert.equal(isoPublishDate('2/29/2024', ID), '2024-02-29')
})

test('any other shape is refused, and the message holds only the id', () => {
  for (const bad of ['Spring', '2021/02/09', '9.2.2021', '', '1/2/21', ' 8/5/2021', '2021-08-05 ', '8/5/2021\n']) {
    assert.throws(() => isoPublishDate(bad, ID), err => err.message === `publishDate of poem ${ID} is neither M/D/YYYY nor YYYY-MM-DD`, bad)
  }
})

test('only a string is read: a wrong JSON type is refused, not coerced', () => {
  for (const bad of [['8/5/2021'], 20210805, { d: '8/5/2021' }, true]) {
    assert.throws(() => isoPublishDate(bad, ID), new RegExp(`${ID} is not a string`), JSON.stringify(bad))
  }
  assert.equal(isoPublishDate('8/5/2021', ID), '2021-08-05')  // control: the same date as a string
})

test('every four-digit year keeps four digits, and the calendar is not remapped', () => {
  assert.equal(isoPublishDate('0100-01-01', ID), '0100-01-01')
  assert.equal(isoPublishDate('1/1/0100', ID), '0100-01-01')
  assert.equal(isoPublishDate('0999-12-31', ID), '0999-12-31')
  assert.equal(isoPublishDate('0050-03-01', ID), '0050-03-01')
  // leap years by the Gregorian rule, including the century years Date.UTC's remapping would have confused
  assert.equal(isoPublishDate('2/29/2000', ID), '2000-02-29')
  assert.equal(isoPublishDate('0004-02-29', ID), '0004-02-29')
  for (const bad of ['2/29/1900', '0100-02-29', '0000-00-01', '0001-04-31']) {
    assert.throws(() => isoPublishDate(bad, ID), /is not a real date/, bad)
  }
})

test('date is converted by the same rule, and its errors name the date field (#81)', () => {
  assert.equal(canonicalDate('8/5/2021', 'date', ID), '2021-08-05')
  assert.equal(canonicalDate('2021-08-05', 'date', ID), '2021-08-05')
  assert.equal(canonicalDate(null, 'date', ID), null)
  assert.throws(() => canonicalDate('Spring', 'date', ID), err => err.message === `date of poem ${ID} is neither M/D/YYYY nor YYYY-MM-DD`)
  assert.throws(() => canonicalDate('2/30/2021', 'date', ID), err => err.message === `date of poem ${ID} is not a real date`)
})

test('every bundled poem file stores both dates canonically, or not at all (#81)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { default: canonical } = await import('../src/poems/canonical-date.js')
  const dir = new URL('../src/poems/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  assert.ok(files.length > 0)
  for (const f of files) {
    const meta = JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
    for (const field of ['date', 'publishDate']) {
      if (meta[field] === undefined || meta[field] === null) continue
      assert.ok(canonical.isCanonicalDate(meta[field]), `${field} in a bundled file is not YYYY-MM-DD`)  // never the file name: it holds a title
    }
  }
})
