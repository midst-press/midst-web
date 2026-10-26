/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { combineReducers, createStore } from 'redux'
import Read from '../routes/Read'
import { reducer } from '../store/reducer'
import { IState, LOAD_POEM_LIST, REVERSE_SORT_ORDER, SET_SORT_TERM, SET_TAG_FILTER } from '../store/types'
import { SiteTag, tagsInUse, tocSections } from '../tags'

// Sorting and filtering the Table of Contents by tag (#310; Annelyse on GitHub midst-web#46, 26 Oct). Names invented.

const tag = (id: string, name: string, colour = '#2e8b57'): SiteTag => ({ id, name, colour })
// Named so that id order, colour order and name order all differ, and one name starts lower case and one accented.
const TAGS = new Map([tag('t1', 'Zq Mex'), tag('t2', 'éq Ira'), tag('t3', 'bq Arm'), tag('t4', 'Unused')].map(t => [t.id, t]))

const entry = (n: number, publishDate: string | null, tagIds: string[]) => ({
  poemId: `${n}${n}${n}${n}${n}${n}${n}${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, title: `Zq ${n}`, url: `zq-${n}`, author: `Qz ${n}`,
  highlighted: false, keys: { timelapse: `p${n}/t.zip`, processNote: null }, publishDate, tagIds,
})
// List order 1..6. Newest first: 3, 5, 1, 6, 2, then the undated 4.
const ENTRIES = [
  entry(1, '2020-01-01', ['t1']),
  entry(2, '2018-01-01', ['t1', 't2']), // two tags
  entry(3, '2024-01-01', []),
  entry(4, null, ['t3']),
  entry(5, '2022-01-01', ['gone', 'Mexico']), // ids that are not tags: shows no mark
  entry(6, '2019-01-01', ['t3']),
]

const loaded = (): IState => reducer(undefined, { type: LOAD_POEM_LIST, payload: { entries: ENTRIES } })
const titles = (poems: { title: string }[]) => poems.map(poem => poem.title.replace('Zq ', ''))
const shape = (sections: ReturnType<typeof tocSections>) =>
  sections.map(section => `${section.tag?.name ?? '-'}: ${titles(section.poems).join(' ')}`)

describe('tocSections', () => {
  const poems = loaded().poems
  const plain = { byTag: false, descending: false, ticked: [] as string[] }

  it('is one run in the poems\' order when nothing is ticked and the sort is not by tag', () => {
    expect(shape(tocSections(poems, TAGS, plain))).toEqual(['-: 3 5 1 6 2 4'])
  })

  it('with tags ticked, shows each poem carrying any of them, once, in the poems\' order', () => {
    expect(shape(tocSections(poems, TAGS, { ...plain, ticked: ['t1', 't3'] }))).toEqual(['-: 1 6 2 4'])
    expect(shape(tocSections(poems, TAGS, { ...plain, ticked: ['t2'] }))).toEqual(['-: 2'])
  })

  it('ticks nothing with an id that is not a tag, so ticking only such ids shows every poem', () => {
    expect(shape(tocSections(poems, TAGS, { ...plain, ticked: ['gone', 'Mexico'] }))).toEqual(['-: 3 5 1 6 2 4'])
    expect(shape(tocSections(poems, TAGS, { ...plain, ticked: ['gone', 't2'] }))).toEqual(['-: 2'])
  })

  it('sorted by tag: a group per tag by name, ignoring case and accents; a poem with two tags in both; untagged last', () => {
    expect(shape(tocSections(poems, TAGS, { ...plain, byTag: true }))).toEqual([
      'bq Arm: 6 4', 'éq Ira: 2', 'Zq Mex: 1 2', '-: 3 5',
    ])
  })

  it('reversed, reverses the groups only: each group keeps the poems\' order, and the untagged stay last', () => {
    expect(shape(tocSections(poems, TAGS, { ...plain, byTag: true, descending: true }))).toEqual([
      'Zq Mex: 1 2', 'éq Ira: 2', 'bq Arm: 6 4', '-: 3 5',
    ])
  })

  it('sorted by tag with tags ticked: only the ticked groups, and no untagged run', () => {
    expect(shape(tocSections(poems, TAGS, { byTag: true, descending: false, ticked: ['t1', 't2'] }))).toEqual([
      'éq Ira: 2', 'Zq Mex: 1 2',
    ])
  })

  it('before the tags are read, is one run: no filter and no groups', () => {
    expect(shape(tocSections(poems, null, { byTag: true, descending: false, ticked: ['t1'] }))).toEqual(['-: 3 5 1 6 2 4'])
  })

  it('tagsInUse: the tags some poem shows, by name; a tag no poem carries is not offered', () => {
    expect(tagsInUse(poems, TAGS).map(t => t.id)).toEqual(['t3', 't2', 't1'])
    expect(tagsInUse(poems, null)).toEqual([])
  })
})

describe('reducer, sorting by tag', () => {
  it('starts A to Z, and keeps the poems newest first in either direction', () => {
    const byTag = reducer(loaded(), { type: SET_SORT_TERM, payload: 'tag' })
    expect(byTag.sortOrder).toBe('ASC')
    expect(titles(byTag.poems)).toEqual(['3', '5', '1', '6', '2', '4'])
    const reversed = reducer(byTag, { type: REVERSE_SORT_ORDER })
    expect(reversed.sortOrder).toBe('DESC')
    expect(titles(reversed.poems)).toEqual(['3', '5', '1', '6', '2', '4'])
  })

  it('keeps the ticked tags, which start empty, and leaves the poems as they are', () => {
    const state = loaded()
    expect(state.tagFilter).toEqual([])
    const ticked = reducer(state, { type: SET_TAG_FILTER, payload: ['t1'] })
    expect(ticked.tagFilter).toEqual(['t1'])
    expect(ticked.poems).toBe(state.poems)
  })
})

describe('the Table of Contents', () => {
  let container: HTMLDivElement
  let root: Root
  const realFetch = globalThis.fetch

  beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true, json: async () => ({ version: 1, updated: '2026-10-26T00:00:00Z', tags: [...TAGS.values()] }),
    })) as unknown as typeof fetch
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    globalThis.fetch = realFetch
  })

  const lines = () => [...container.querySelectorAll('a.poem-line')].map(line => line.getAttribute('href')!.replace(/\/poem\/zq-(\d)\//, '$1'))
  const groups = () => [...container.querySelectorAll('.poem-group')].map(group => group.textContent)
  const options = () => [...container.querySelectorAll<HTMLInputElement>('.poem-tag-option input')]

  async function render() {
    const store = createStore(combineReducers({ app: reducer }))
    store.dispatch({ type: LOAD_POEM_LIST, payload: { entries: ENTRIES } })
    await act(async () => root.render(<Provider store={store}><MemoryRouter><Read /></MemoryRouter></Provider>))
    return store
  }

  it('offers a box for each tag a poem carries, by name, and ticking two shows the poems carrying either', async () => {
    const store = await render()
    expect(options().map(box => box.parentElement!.textContent)).toEqual(['bq Arm', 'éq Ira', 'Zq Mex'])
    await act(async () => options()[0].click())
    await act(async () => options()[2].click())
    expect(store.getState().app.tagFilter).toEqual(['t3', 't1'])
    expect(lines()).toEqual(['1', '6', '2', '4'])
    expect(groups()).toEqual([])
    await act(async () => options()[0].click())
    expect(lines()).toEqual(['1', '2'])
  })

  it('sorts by tag from its arrow, under a heading per group, and the arrow then reverses the groups', async () => {
    await render()
    const arrow = container.querySelector<HTMLElement>('.poem-tag-sort [role="button"]')!
    await act(async () => arrow.click())
    expect(groups()).toEqual(['bq Arm', 'éq Ira', 'Zq Mex'])
    expect(lines()).toEqual(['6', '4', '2', '1', '2', '3', '5'])
    await act(async () => arrow.click())
    expect(groups()).toEqual(['Zq Mex', 'éq Ira', 'bq Arm'])
  })

  it('shows no tag bar when no poem carries a tag', async () => {
    const store = createStore(combineReducers({ app: reducer }))
    store.dispatch({ type: LOAD_POEM_LIST, payload: { entries: [entry(1, '2020-01-01', []), entry(2, '2021-01-01', ['gone'])] } })
    await act(async () => root.render(<Provider store={store}><MemoryRouter><Read /></MemoryRouter></Provider>))
    expect(container.querySelector('.poem-tag-bar')).toBeNull()
    expect(lines()).toEqual(['2', '1'])
  })
})
