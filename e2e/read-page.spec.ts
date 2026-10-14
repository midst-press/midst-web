import { Page } from '@playwright/test'
import { test, expect } from './coverage'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { sortBy } from 'lodash'
import moment from 'moment'
import { slugify } from 'voca'
import names from '../src/poems/poem-names.js'
import published from '../src/poems'

// The Read page lists every published poem and nothing else, and its three sort arrows order the list
// as they say (midst-web #100, item 1). The risk is a poem missing from the list, or a sort that hides one.
//
// Failures report positions and counts, never a poem's title or address: those come from the poems'
// own metadata, and a CI log is not the place for them. (A failure's screenshot and trace are another
// matter: they show the page as it was.)

const poemsDir = join(__dirname, '../src/poems')
const records = readdirSync(poemsDir)
  .filter(file => file.endsWith('.json') && file !== 'order.json')
  .map(file => JSON.parse(readFileSync(join(poemsDir, file), 'utf8')))
const hrefOf = (poem: { title: string }) => `/poem/${names.poemUrl(poem.title)}/`

// What the reducer sorts on, derived the same way (src/store/reducer.ts, createPoem).
const keyed = published.map((poem: any) => ({
  href: hrefOf(poem),
  authorId: names.authorId(poem.author),
  slug: slugify(poem.title),
  publishDate: moment(poem.publishDate).valueOf(),
}))
const expectedOrder = (term: 'authorId' | 'slug' | 'publishDate', order: 'ASC' | 'DESC') => {
  const sorted = sortBy(keyed, term).map(poem => poem.href)
  return order === 'DESC' ? sorted.reverse() : sorted
}

async function listed(page: Page): Promise<string[]> {
  return page.locator('.table-of-contents a.poem-line').evaluateAll(links => links.map(a => a.getAttribute('href') || ''))
}

// Each row's poem id (data-poem-id). Two records can share an address, so the address alone cannot say
// which record a row shows; the id can.
async function listedIds(page: Page): Promise<string[]> {
  return page.locator('.table-of-contents a.poem-line').evaluateAll(links => links.map(a => a.getAttribute('data-poem-id') || ''))
}

// Where each listed poem should be, as numbers: [0, 1, 2, ...] when the order is right.
function positions(actual: string[], expected: string[]): number[] {
  return actual.map(href => expected.indexOf(href))
}
const inOrder = (n: number) => Array.from({ length: n }, (_, i) => i)

async function arrow(page: Page, column: 'poem-author' | 'poem-title' | 'poem-date') {
  return page.locator(`.poem-head .${column} .poem-head-arrow`)
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
  await page.goto('/read')
  await expect(page.locator('.table-of-contents a.poem-line').first()).toBeVisible()
})

test('every published poem is listed once, in the editor\'s order, and links to its own page', async ({ page }) => {
  // Controls on the data: there are unpublished records, some of them share an address with a published
  // poem (so the address cannot be the test of which record a row shows), and every published poem has
  // its own id (so the id can be).
  const publishedHrefs = new Set(published.map(hrefOf))
  const unpublishedRecords = records.filter(poem => poem.published === false)
  expect(unpublishedRecords.length).toBeGreaterThan(0)
  expect(published.length + unpublishedRecords.length).toBe(records.length)
  expect(unpublishedRecords.filter(poem => publishedHrefs.has(hrefOf(poem))).length).toBeGreaterThan(0)
  const publishedIds = published.map((poem: any) => poem.id)
  expect(publishedIds.every((id: unknown) => typeof id === 'string' && id)).toBe(true)
  expect(new Set(publishedIds).size).toBe(published.length)
  const unpublishedIds = unpublishedRecords.map(poem => poem.id).filter(Boolean)

  // Which records are listed, by id: every published one, once, in the editor's order, and nothing else.
  const ids = await listedIds(page)
  expect(ids.length).toBe(published.length)
  expect(positions(ids, publishedIds)).toEqual(inOrder(published.length))
  expect(ids.filter(id => unpublishedIds.includes(id)).length).toBe(0)

  // And each row links to that poem's own address.
  const hrefs = await listed(page)
  expect(positions(hrefs, published.map(hrefOf))).toEqual(inOrder(published.length))
})

test('a listed poem opens its own page', async ({ page }) => {
  // The page starts in the editor's order, which is the order of `published`.
  const choice = Math.floor(published.length / 2)
  await page.locator('.table-of-contents a.poem-line').nth(choice).click()
  // Compared as a position in the list, so a failure prints a number, not the poem's address.
  const at = async () => {
    const path = decodeURI(new URL(page.url()).pathname)
    // Against the addresses the metadata says each poem has, not the links the page rendered.
    return published.map(hrefOf).findIndex(href => decodeURI(href) === path || decodeURI(href) === `${path}/`)
  }
  await expect.poll(at).toBe(choice)
})

for (const [column, term] of [['poem-author', 'authorId'], ['poem-title', 'slug'], ['poem-date', 'publishDate']] as const) {
  test(`the ${column.replace('poem-', '')} arrow sorts by ${term}, and a second press reverses it`, async ({ page }) => {
    // The page starts with publishDate ascending as its sort state, so the date arrow's first press
    // reverses; the other two set their term and keep ascending.
    const first = term === 'publishDate' ? 'DESC' : 'ASC'
    const second = first === 'ASC' ? 'DESC' : 'ASC'
    const control = await arrow(page, column)

    await control.click()
    let hrefs = await listed(page)
    expect(hrefs.length).toBe(published.length)
    expect(positions(hrefs, expectedOrder(term, first))).toEqual(inOrder(published.length))
    await expect(control).toHaveClass(/poem-head-arrow-active/)
    if (first === 'ASC') await expect(control).toHaveClass(/poem-head-arrow-up/)
    else await expect(control).not.toHaveClass(/poem-head-arrow-up/)

    await control.click()
    hrefs = await listed(page)
    expect(hrefs.length).toBe(published.length)
    expect(positions(hrefs, expectedOrder(term, second))).toEqual(inOrder(published.length))
  })
}

test('sorting by one column and then another still lists every published poem once', async ({ page }) => {
  for (const column of ['poem-author', 'poem-title', 'poem-date', 'poem-author'] as const) {
    await (await arrow(page, column)).click()
    const hrefs = await listed(page)
    expect(hrefs.length).toBe(published.length)
    expect(new Set(hrefs).size).toBe(published.length)
  }
})
