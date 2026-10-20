/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import ReplacesChoice, { replaceable } from '../routes/PublisherReplaces'
import { Poem } from '../app/publisher'

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
