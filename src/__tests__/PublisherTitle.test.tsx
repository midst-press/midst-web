/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PublisherTitle from '../routes/PublisherTitle'
import PublisherSubmit from '../routes/PublisherSubmit'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'

// The publisher changes an unpublished poem's title and name, and sends a poem for a poet (#372; midst-infra #232).
// Names are invented.

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

const P = '11111111-1111-4111-8111-111111111111'
const SHOWN = { title: 'Zq xv', author: 'Qz Vb' }

const setValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent === label)!
const submit = async () => {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

async function openTitle(call: Call, onSaved = jest.fn()) {
  await act(async () => {
    root.render(<PublisherTitle call={call} poemId={P} shown={SHOWN} disabled={false} onExpired={() => undefined} onSaved={onSaved} />)
  })
  await act(async () => { button('Title and name').click() })
  const [title, author] = [...container.querySelectorAll('input')]
  return { title, author, onSaved }
}

describe('PublisherTitle', () => {
  it('opens with the pair shown, and saves the trimmed new pair on it', async () => {
    const call = jest.fn(async () => ({ title: 'Ta', author: 'Qz Vb' })) as unknown as Call & jest.Mock
    const { title, author, onSaved } = await openTitle(call)
    expect([title.value, author.value]).toEqual(['Zq xv', 'Qz Vb'])
    expect(button('Save title and name').disabled).toBe(true)
    await act(async () => { setValue(title, ' Ta ') })
    await submit()
    expect(call.mock.calls).toEqual([[`/publisher/poems/${P}/details`, { method: 'PUT', body: { title: 'Ta', author: 'Qz Vb', shown: SHOWN } }]])
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Title and name saved.')
  })

  it('says plainly when someone else changed it first, and does not reload as though saved', async () => {
    const call = jest.fn(async () => { throw new ApiError(409, 'conflict', 'x') }) as unknown as Call
    const { title, onSaved } = await openTitle(call)
    await act(async () => { setValue(title, 'Ta') })
    await submit()
    expect(container.querySelector('[role="alert"]')!.textContent).toMatch('changed since the page was loaded')
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('PublisherSubmit', () => {
  const poets = [
    { username: 'qz-vb', name: 'Qz Vb', email: 'qz@example.invalid', groups: ['poet'], status: 'active' },
    { username: 'off-1', name: 'Off Wy', email: 'off@example.invalid', groups: ['poet'], status: 'disabled' },
    { username: 'pb-1', name: 'Pb Xo', email: 'pb@example.invalid', groups: ['publisher'], status: 'active' },
  ]

  it('offers only poets whose accounts are not disabled, and sends the poem for the one chosen', async () => {
    const ticket = { submissionId: 's1', uploadUrl: 'https://up.example.invalid/k', uploadHeaders: {}, expiresAt: 'x' }
    const call = jest.fn(async (path: string) => (path === '/publisher/poets' ? { poets }
      : path === '/publisher/submissions' ? ticket : { submissionId: 's1', title: 'Zq xv', status: 'received' })) as unknown as Call & jest.Mock
    const fetchMock = jest.fn(async () => ({ ok: true }))
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
    const onSent = jest.fn()
    await act(async () => { root.render(<PublisherSubmit call={call} onExpired={() => undefined} onSent={onSent} />) })
    const select = container.querySelector('select')!
    expect([...select.options].map(o => o.value)).toEqual(['', 'qz-vb'])

    const [title, author, midst] = [...container.querySelectorAll('input')]
    await act(async () => {
      setValue(select, 'qz-vb')
      setValue(title, 'Zq xv')
      setValue(author, 'Qz Vb')
      Object.defineProperty(midst, 'files', { value: [new File(['zq'], 'zq.midst')] })
      midst.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await submit()
    const [path, init] = call.mock.calls[1]
    expect(path).toBe('/publisher/submissions')
    expect(init.body).toMatchObject({ poetUsername: 'qz-vb', title: 'Zq xv', author: 'Qz Vb', fileName: 'zq.midst' })
    expect(call.mock.calls[2][0]).toBe('/publisher/submissions/s1/complete')
    expect(onSent).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Sent “Zq xv” for Qz Vb. It is waiting in Review.')
  })
})
