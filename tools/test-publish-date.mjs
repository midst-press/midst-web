// node --test tools/test-publish-date.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isoPublishDate } from './publish-date.mjs'

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
  for (const bad of ['Spring', '2021/02/09', '9.2.2021', '', '1/2/21']) {
    assert.throws(() => isoPublishDate(bad, ID), err => err.message === `publishDate of poem ${ID} is neither M/D/YYYY nor YYYY-MM-DD`, bad)
  }
})
