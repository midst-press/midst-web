/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PublisherPatrons, { CONFLICT, NOT_RELOADED, RELOADED, SAVED } from '../routes/PublisherPatrons'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'

// The publisher edits the patrons (#58): every patron with a visibility, in order. A save sends the whole list on
// the etag it was loaded at, and the page says whether it worked; when the server's list moved, the page shows it,
// or says plainly that it could not. Names are invented.

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

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const LOADED = {
  patronsEtag: '"p1"',
  patrons: [
    { id: A, name: 'Zq Vel', visibility: 'public' },
    { id: B, name: 'Orrin Taf', visibility: 'private' },
    { id: C, name: 'Lumb Quell', visibility: 'undetermined' },
  ],
  closing: 'Anonymous donors',
}
const SENT = LOADED.patrons
const RELOAD_401 = new ApiError(401, 'unauthenticated', 'Please sign in again.')

// A Call whose answers are given per request, in order; every request is recorded.
const server = (...answers: Array<unknown | Error>) => {
  const call = jest.fn(async () => {
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next
  })
  return call as unknown as Call & jest.Mock
}

const render = async (call: Call, onExpired = jest.fn()) => {
  await act(async () => {
    root.render(<PublisherPatrons call={call} onExpired={onExpired} />)
  })
  return onExpired
}

const field = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement & HTMLSelectElement
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text || b.getAttribute('aria-label') === text) as HTMLButtonElement
const names = () => [...container.querySelectorAll('ol input[type="text"]')].map(i => (i as HTMLInputElement).value)
const options = (n: number) => [...field(`Visibility of patron ${n}`).options].map(o => o.value)
const status = () => container.querySelector('[role="status"]')?.textContent ?? null
const alert = () => container.querySelector('[role="alert"]')?.textContent ?? null

// Changes a controlled field the way React listens for it.
const set = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
const click = async (b: HTMLButtonElement) => { await act(async () => { b.click() }) }
const addPatron = async (name: string, visibility: string) => {
  const form = container.querySelector('form[aria-label="Add a patron"]') as HTMLFormElement
  act(() => {
    set(form.querySelector('input') as HTMLInputElement, name)
    set(form.querySelector('select') as HTMLSelectElement, visibility)
  })
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}
const sentBody = (call: jest.Mock, i: number) => call.mock.calls[i][1].body

it('loads every patron in order, each with their visibility, and the closing line', async () => {
  await render(server(LOADED))
  expect(names()).toEqual(['Zq Vel', 'Orrin Taf', 'Lumb Quell'])
  expect([1, 2, 3].map(n => field(`Visibility of patron ${n}`).value)).toEqual(['public', 'private', 'undetermined'])
  expect(field('Closing line').value).toBe('Anonymous donors')
})

it('offers only what the rule allows: never undetermined for a public or private patron; either for an undetermined one', async () => {
  await render(server(LOADED))
  expect(options(1)).toEqual(['public', 'private'])
  expect(options(2)).toEqual(['public', 'private'])
  expect(options(3)).toEqual(['undetermined', 'public', 'private'])
  const add = container.querySelector('form[aria-label="Add a patron"] select') as HTMLSelectElement
  expect([...add.options].map(o => o.value)).toEqual(['public', 'private'])
})

it('saves visibility changes, a new patron without an id, a reorder and a removal, on the loaded etag, and says it worked', async () => {
  const after = { patronsEtag: '"p2"', patrons: [], closing: null }
  const call = server(LOADED, after)
  await render(call)
  act(() => {
    set(field('Visibility of patron 3'), 'private') // a patron who said no
    set(field('Visibility of patron 1'), 'private')
  })
  await click(button('Remove patron 2'))
  await click(button('Move patron 2 up'))
  await addPatron('  Vex Morrow ', 'public')
  act(() => set(field('Closing line'), '  '))
  await click(button('Save patrons'))
  expect(call.mock.calls[1][0]).toBe('/publisher/patrons')
  expect(sentBody(call, 1)).toEqual({
    patronsEtag: '"p1"',
    patrons: [
      { id: C, name: 'Lumb Quell', visibility: 'private' },
      { id: A, name: 'Zq Vel', visibility: 'private' },
      { name: 'Vex Morrow', visibility: 'public' },
    ],
    closing: null,
  })
  expect(status()).toBe(SAVED)
  expect(alert()).toBeNull()
})

it('a second save uses the etag the first one returned', async () => {
  const call = server(LOADED, { ...LOADED, patronsEtag: '"p2"' }, { ...LOADED, patronsEtag: '"p3"' })
  await render(call)
  await click(button('Save patrons'))
  await click(button('Save patrons'))
  expect(sentBody(call, 2).patronsEtag).toBe('"p2"')
})

it('when the API refuses a change, shows its reason, keeps the edits, and does not say it saved', async () => {
  const reason = '"Zq Vel" cannot be set back to undetermined: only the Patreon sync marks someone undetermined.'
  await render(server(LOADED, new ApiError(400, 'refused', reason)))
  act(() => set(field('Name of patron 1'), 'Zq V.'))
  await click(button('Save patrons'))
  expect(alert()).toBe(reason)
  expect(status()).toBeNull()
  expect(names()[0]).toBe('Zq V.')
})

describe('when someone else saved first (409)', () => {
  const conflict = new ApiError(409, 'conflict', 'The patrons list changed since you loaded it.')
  const theirs = { patronsEtag: '"p9"', patrons: [{ id: B, name: 'Orrin Taf', visibility: 'public' }], closing: null }

  it('reloads their list, says so, and the next save uses the reloaded etag', async () => {
    const call = server(LOADED, conflict, theirs, { ...theirs, patronsEtag: '"p10"' })
    await render(call)
    await click(button('Save patrons'))
    expect(alert()).toBe(CONFLICT)
    expect(status()).toBeNull()
    expect(call.mock.calls[2]).toEqual(['/publisher/patrons'])
    expect(names()).toEqual(['Orrin Taf'])
    await click(button('Save patrons'))
    expect(sentBody(call, 3).patronsEtag).toBe('"p9"')
  })

  it.each([
    ['no answer', new ApiError(0, 'network', 'The app could not be reached.')],
    ['a server error', new ApiError(500, 'server', 'Something went wrong.')],
  ])('if the reload gets %s: does not claim it reloaded, keeps the unsaved edits, and will not save until reloaded', async (_why, failure) => {
    const call = server(LOADED, conflict, failure, theirs)
    const onExpired = await render(call)
    act(() => set(field('Name of patron 1'), 'Zq V.'))
    await click(button('Save patrons'))
    expect(alert()).toBe(NOT_RELOADED)
    expect(alert()).not.toBe(CONFLICT)
    expect(names()[0]).toBe('Zq V.')
    expect(button('Save patrons').disabled).toBe(true)
    expect(onExpired).toHaveBeenCalledWith(failure)
    // The way back: reload, which shows the server's list and allows saving on its etag.
    await click(button('Reload the list'))
    expect(status()).toBe(RELOADED)
    expect(alert()).toBeNull()
    expect(names()).toEqual(['Orrin Taf'])
    expect(button('Save patrons').disabled).toBe(false)
    expect(button('Reload the list')).toBeUndefined()
  })

  it('if the reload is refused as signed out (401), hands that 401 to the page', async () => {
    const onExpired = await render(server(LOADED, conflict, RELOAD_401))
    await click(button('Save patrons'))
    expect(onExpired).toHaveBeenLastCalledWith(RELOAD_401)
    expect(alert()).toBe(NOT_RELOADED)
  })

  it('a reload that fails again says so again, and still will not save', async () => {
    const failure = new ApiError(0, 'network', 'The app could not be reached.')
    await render(server(LOADED, conflict, failure, failure))
    await click(button('Save patrons'))
    await click(button('Reload the list'))
    expect(alert()).toBe(NOT_RELOADED)
    expect(status()).toBeNull()
    expect(button('Save patrons').disabled).toBe(true)
  })
})

it('when the list was saved but the site’s copy was not, says exactly that and reloads, so saving again can retry it', async () => {
  const message = 'The list was saved, but the site’s copy of it was not updated. Save again to update it.'
  const call = server(LOADED, new ApiError(500, 'public_copy_failed', message), { ...LOADED, patronsEtag: '"p2"' }, LOADED)
  await render(call)
  await click(button('Save patrons'))
  expect(alert()).toBe(message)
  expect(status()).toBeNull()
  await click(button('Save patrons'))
  expect(sentBody(call, 3).patronsEtag).toBe('"p2"')
})

it('when the save fails some other way, says it was not saved and keeps the edits', async () => {
  await render(server(LOADED, new TypeError('broken')))
  act(() => set(field('Name of patron 1'), 'Zq V.'))
  await click(button('Save patrons'))
  expect(alert()).toBe('The patrons list was not saved. Please try again.')
  expect(status()).toBeNull()
  expect(names()[0]).toBe('Zq V.')
})

it('hands a failed save to the page, so a 401 forgets the session there', async () => {
  const onExpired = await render(server(LOADED, RELOAD_401))
  await click(button('Save patrons'))
  expect(onExpired).toHaveBeenCalledWith(RELOAD_401)
})

it('when the list cannot be loaded at all, says why, offers no form to save over it, and offers to try again', async () => {
  const call = server(new ApiError(403, 'forbidden', 'Your account cannot do that.'), LOADED)
  const onExpired = await render(call)
  expect(alert()).toBe('Your account cannot do that.')
  expect(button('Save patrons')).toBeUndefined()
  expect(onExpired).toHaveBeenCalled()
  await click(button('Reload the list'))
  expect(names()).toEqual(['Zq Vel', 'Orrin Taf', 'Lumb Quell'])
})

it('adds nothing for a blank name', async () => {
  await render(server(LOADED))
  await addPatron('   ', 'public')
  expect(names()).toHaveLength(3)
})
