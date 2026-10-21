/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import ReplacesChoice, { detailsFor, localToday, publishWithChoice, replaceable, replacementToSend } from '../routes/PublisherReplaces'
import { Call, Poem } from '../app/publisher'

// The publisher may publish a poem as the replacement for a published one by the same poet (#101; midst-infra #190).
// Titles and names are invented.

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const poem = (poemId: string, title: string, author: string): Poem =>
  ({ poemId, title, author, timelapseKey: `poems/${poemId}/t`, processNoteKey: null, publishDate: null, highlighted: false })

const NEW = poem('n1', 'Zq Tide Again', 'Qz Vel')
const SAME_A = poem('p1', 'Zq Tide', 'Qz Vel')
const SAME_B = poem('p2', 'Zq Shore', 'Qz Vel')
const OTHER = poem('p3', 'Zq Tide', 'Orrin Taf')

describe('replaceable', () => {
  it('offers only published poems by the same poet, never the poem itself', () => {
    expect(replaceable(NEW, [SAME_A, OTHER, SAME_B]).map(p => p.poemId)).toEqual(['p1', 'p2'])
    expect(replaceable(SAME_A, [SAME_A, SAME_B]).map(p => p.poemId)).toEqual(['p2'])
    expect(replaceable(NEW, [OTHER])).toEqual([])
  })
})

describe('ReplacesChoice', () => {
  const render = (props: Partial<React.ComponentProps<typeof ReplacesChoice>> = {}) => {
    const onChange = jest.fn()
    act(() => root.render(
      <ReplacesChoice poem={NEW} published={[SAME_A, OTHER, SAME_B]} value="" disabled={false} onChange={onChange} {...props} />,
    ))
    return onChange
  }

  it('starts at None and lists the same poet\'s published poems, and no one else\'s', () => {
    render()
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('')
    expect([...select.options].map(o => [o.value, o.textContent])).toEqual([
      ['', 'None'], ['p1', 'Zq Tide by Qz Vel'], ['p2', 'Zq Shore by Qz Vel'],
    ])
    expect(container.textContent).not.toContain('Orrin Taf')
  })

  it('reports the chosen poem, and None as no poem', () => {
    const onChange = render()
    const select = container.querySelector('select') as HTMLSelectElement
    act(() => { select.value = 'p2'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    act(() => { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(onChange.mock.calls).toEqual([['p2'], ['']])
  })

  it('shows nothing when there is no poem to replace', () => {
    render({ published: [OTHER] })
    expect(container.innerHTML).toBe('')
  })

  it('is disabled while the page is busy', () => {
    render({ disabled: true })
    expect((container.querySelector('select') as HTMLSelectElement).disabled).toBe(true)
  })
})

// cora-2f1e43dc, review of #290: never send a replacement the page no longer shows, and never send one twice.
describe('what publish sends', () => {
  it('sends the chosen poem only while it is still offered', () => {
    expect(replacementToSend(NEW, [SAME_A, OTHER], 'p1')).toBe('p1')
    expect(replacementToSend(NEW, [OTHER], 'p1')).toBeUndefined() // the chosen poem left the list
    expect(replacementToSend(NEW, [SAME_A, OTHER], 'p3')).toBeUndefined() // another poet's
    expect(replacementToSend(NEW, [SAME_A], '')).toBeUndefined()
    expect(replacementToSend(NEW, [SAME_A], undefined)).toBeUndefined()
  })

  it('sends no replaces key for a choice no longer offered, and forgets the choice once published', async () => {
    const call = jest.fn(async () => ({ listEtag: 'e2', published: [] })) as unknown as Call & jest.Mock
    const forget = jest.fn()
    await publishWithChoice(call, 'e1', NEW, [OTHER], 'p1', { publishDate: '2026-10-21', highlighted: false }, forget)
    expect(call.mock.calls).toEqual([['/publisher/publish', { method: 'POST', body: { poemId: 'n1', listEtag: 'e1', publishDate: '2026-10-21', highlighted: false } }]])
    expect(forget.mock.calls).toEqual([['n1']])
  })

  it('sends a choice still offered, and a failed publish keeps it', async () => {
    const call = jest.fn(async () => { throw new Error('refused') }) as unknown as Call & jest.Mock
    const forget = jest.fn()
    await expect(publishWithChoice(call, 'e1', NEW, [SAME_A], 'p1', { publishDate: '2026-10-21', highlighted: false }, forget)).rejects.toThrow('refused')
    expect(call.mock.calls).toEqual([['/publisher/publish', { method: 'POST', body: { poemId: 'n1', listEtag: 'e1', publishDate: '2026-10-21', highlighted: false, replaces: 'p1' } }]])
    expect(forget).not.toHaveBeenCalled()
  })
})

describe('the date and highlight a publish starts from (#305)', () => {
  const P = (poemId: string, fields: Partial<Poem>): Poem => ({
    poemId, title: 'Zq', author: 'Qz', timelapseKey: '', processNoteKey: null, publishDate: null, highlighted: false, ...fields,
  })
  const today = '2026-10-21'

  it('a new poem starts from today, not highlighted', () => {
    expect(detailsFor(P('n', { title: 'Vb' }), [P('a', {})], undefined, today)).toEqual({ publishDate: today, highlighted: false })
  })

  it('a republished poem starts from what it had', () => {
    expect(detailsFor(P('n', { title: 'Vb', publishDate: '2020-01-02', highlighted: true }), [], undefined, today))
      .toEqual({ publishDate: '2020-01-02', highlighted: true })
  })

  it('a poem replacing a chosen one starts from that one\'s', () => {
    const old = P('a', { title: 'Other', publishDate: '2019-05-06', highlighted: true })
    expect(detailsFor(P('n', { title: 'Vb' }), [old], 'a', today)).toEqual({ publishDate: '2019-05-06', highlighted: true })
  })

  it('a likely revision, same author and title, starts from the published one\'s', () => {
    const old = P('a', { title: ' zq ', publishDate: '2018-07-08', highlighted: true })
    expect(detailsFor(P('n', {}), [old], undefined, today)).toEqual({ publishDate: '2018-07-08', highlighted: true })
    expect(detailsFor(P('n', {}), [{ ...old, author: 'Other' }], undefined, today)).toEqual({ publishDate: today, highlighted: false })
  })

  it('today is the date where the publisher is', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
