import { test, expect } from './coverage'
import { Page } from '@playwright/test'
import { published, unpublished, route, scope, pathOf, hermetic } from './published-sequence'
import { NO_POEM_HERE } from '../src/routes/Poem'

// Previous and next poem (PoemNav.tsx). Midst-web #100, item 3. The risks: navigation that skips or
// repeats a poem, or a dead link at either end. The sequence is derived from the poem metadata, so a
// poem published or unpublished changes what these tests expect without editing them.
//
// The arrow keys move between poems only when POEM_ARROW_KEY is 'slide'; the site sets 'timeline',
// so that branch cannot run here and is not tested.

const forward = (page: Page) => page.locator('#poem-nav a:has(.arrow-forward)')
const back = (page: Page) => page.locator('#poem-nav a:has(.arrow-back)')

test('the sequence under test is the published poems, more than two of them', () => {
  expect(published.length).toBeGreaterThan(2)
  expect(new Set(published.map(route)).size, 'two published poems share a route').toBe(published.length)
})

test('at the first poem: back goes nowhere, forward goes to the second', async ({ page, baseURL }) => {
  const seen = await hermetic(page, baseURL!)
  await page.goto(route(published[0]))
  await expect(back(page)).toHaveClass(/disabled/)
  await expect(back(page)).not.toHaveAttribute('href')
  await expect(forward(page)).toHaveAttribute('href', route(published[1]))
})

test('at the last poem: forward goes nowhere, back goes to the one before', async ({ page, baseURL }) => {
  const seen = await hermetic(page, baseURL!)
  const last = published.length - 1
  await page.goto(route(published[last]))
  await expect(forward(page)).toHaveClass(/disabled/)
  await expect(forward(page)).not.toHaveAttribute('href')
  await expect(back(page)).toHaveAttribute('href', route(published[last - 1]))
})

test('forward from the first poem and back from the last visits every published poem once, in order', async ({ page, baseURL }) => {
  const seen = await hermetic(page, baseURL!)
  test.setTimeout(300_000)
  const expected = published.map(route)

  await page.goto(expected[0])
  const visited = [pathOf(page.url())]
  for (let i = 1; i < expected.length; i += 1) {
    await forward(page).click()
    await page.waitForURL(url => pathOf(url.toString()) === expected[i])
    visited.push(pathOf(page.url()))
  }
  expect(visited).toEqual(expected)
  await expect(forward(page)).toHaveClass(/disabled/)

  const returned = [pathOf(page.url())]
  for (let i = expected.length - 2; i >= 0; i -= 1) {
    await back(page).click()
    await page.waitForURL(url => pathOf(url.toString()) === expected[i])
    returned.push(pathOf(page.url()))
  }
  expect(returned).toEqual([...expected].reverse())
  await expect(back(page)).toHaveClass(/disabled/)
  expect(seen.externalPoemFiles().length, 'a poem file was asked of another host').toBe(0)
})

test('no unpublished poem is in the sequence a reader moves through', async ({ page, baseURL }) => {
  const seen = await hermetic(page, baseURL!)
  // PoemNav moves through the site's list of poems, which the carousel renders whole. An unpublished
  // poem absent from it cannot be anyone's previous or next. Its route is not its identity: a route is
  // the title alone, so some unpublished poems share one with a published poem by another author.
  expect(unpublished.length, 'there is no unpublished poem to check against').toBeGreaterThan(0)
  await page.goto(route(published[0]))
  await expect(page.locator(scope(published[0]))).toHaveCount(1)
  // One unpublished poem has the same author and title as a published one, so the same carousel class:
  // the DOM cannot tell them apart, and the count below is what covers it.
  const publishedScopes = new Set(published.map(scope))
  for (const file of unpublished.filter(f => !publishedScopes.has(scope(f)))) {
    await expect(page.locator(scope(file)), 'an unpublished poem is in the carousel').toHaveCount(0)
  }
  await expect(page.locator('.sliding-poems__poem')).toHaveCount(published.length)
})

// An old link to a poem since unpublished, whose title no published poem has.
const orphaned = unpublished.filter(file => !published.map(route).includes(route(file)))

test('the address of an unpublished poem does not break the site', async ({ page, baseURL }) => {
  const seen = await hermetic(page, baseURL!)
  expect(orphaned.length, 'every unpublished poem shares a published poem\'s address').toBeGreaterThan(0)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(route(orphaned[0]))
  // It says there is no poem here and shows none, and nothing throws. Before
  // #100 the page threw (PoemNav read `author` of undefined) and the whole site went blank.
  await expect(page.getByRole('alert')).toHaveText(NO_POEM_HERE)
  await expect(page.locator('.sliding-poems__poem')).toHaveCount(0)
  await expect(page.locator('#poem-nav')).toHaveCount(0)
  expect(errors).toEqual([])
})
