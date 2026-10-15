/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PublisherPatrons, { CONFLICT, SAVED } from '../routes/PublisherPatrons'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'

// The publisher edits the patrons list (#58): it loads into the form, a save sends the whole list on the etag it
// was loaded at, and the page says whether the save worked. Names are invented.

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

const LOADED = { patronsEtag: '"p1"', patrons: ['Zq Vel', 'Orrin Taf'], closing: 'Anonymous donors' }

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

const textarea = () => container.querySelector('textarea') as HTMLTextAreaElement
const closingInput = () => container.querySelector('input[type="text"]') as HTMLInputElement
const status = () => container.querySelector('[role="status"]')?.textContent ?? null
const alert = () => container.querySelector('[role="alert"]')?.textContent ?? null

// Types into a controlled field the way React listens for it.
const type = (field: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

const submit = async () => {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

it('loads the list into the form: one name per line, in order, and the closing line', async () => {
  await render(server(LOADED))
  expect(textarea().value).toBe('Zq Vel\nOrrin Taf')
  expect(closingInput().value).toBe('Anonymous donors')
})

it('saves the whole list as typed, trimmed and without blank lines, on the loaded etag, and says it worked', async () => {
  const call = server(LOADED, { patronsEtag: '"p2"', patrons: ['Lumb Quell', 'Zq Vel'], closing: null })
  await render(call)
  act(() => {
    type(textarea(), ' Lumb Quell \n\nZq Vel\n')
    type(closingInput(), '  ')
  })
  await submit()
  expect(call.mock.calls[1]).toEqual([
    '/publisher/patrons',
    { method: 'PUT', body: { patronsEtag: '"p1"', patrons: ['Lumb Quell', 'Zq Vel'], closing: null } },
  ])
  expect(status()).toBe(SAVED)
  expect(alert()).toBeNull()
  expect(textarea().value).toBe('Lumb Quell\nZq Vel')
})

it('a second save uses the etag the first one returned', async () => {
  const call = server(LOADED, { ...LOADED, patronsEtag: '"p2"' }, { ...LOADED, patronsEtag: '"p3"' })
  await render(call)
  await submit()
  await submit()
  expect(call.mock.calls[2][1].body.patronsEtag).toBe('"p2"')
})

it('when someone else saved first, says so, does not say it saved, and reloads their list', async () => {
  const theirs = { patronsEtag: '"p9"', patrons: ['Orrin Taf'], closing: null }
  const call = server(LOADED, new ApiError(409, 'conflict', 'The patrons list changed since you loaded it.'), theirs)
  await render(call)
  act(() => type(textarea(), 'Lumb Quell'))
  await submit()
  expect(alert()).toBe(CONFLICT)
  expect(status()).toBeNull()
  expect(call.mock.calls[2]).toEqual(['/publisher/patrons'])
  expect(textarea().value).toBe('Orrin Taf')
})

it('when the save is refused, shows the reason, keeps what was typed, and does not say it saved', async () => {
  const call = server(LOADED, new ApiError(400, 'invalid', 'Each name must be one line of 1 to 200 characters.'))
  await render(call)
  act(() => type(textarea(), 'Lumb Quell'))
  await submit()
  expect(alert()).toBe('Each name must be one line of 1 to 200 characters.')
  expect(status()).toBeNull()
  expect(textarea().value).toBe('Lumb Quell')
})

it('when the save fails some other way, says it was not saved', async () => {
  await render(server(LOADED, new TypeError('broken')))
  await submit()
  expect(alert()).toBe('The patrons list was not saved. Please try again.')
  expect(status()).toBeNull()
})

it('hands a failure to the page, so a 401 forgets the session there', async () => {
  const expiredError = new ApiError(401, 'unauthenticated', 'Please sign in again.')
  const onExpired = await render(server(LOADED, expiredError))
  await submit()
  expect(onExpired).toHaveBeenCalledWith(expiredError)
})

it('when the list cannot be loaded, says why and offers no form to save over it', async () => {
  const onExpired = await render(server(new ApiError(403, 'forbidden', 'Your account cannot do that.')))
  expect(alert()).toBe('Your account cannot do that.')
  expect(container.querySelector('form')).toBeNull()
  expect(onExpired).toHaveBeenCalled()
})
