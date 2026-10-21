/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PublisherTags, { CONFLICT, NOT_RELOADED, SAVED, inUse } from '../routes/PublisherTags'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'

// The publisher edits the tags (#310): each with a name and a colour. A save sends the whole list on the etag it was
// loaded at; a tag still on a published poem is refused by name, and the edits stay. Names are invented.

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

const LOADED = {
  tagsEtag: '"t1"',
  tags: [{ id: 'ta', name: 'Zq Green', colour: '#006400' }, { id: 'tb', name: 'Zq Pale', colour: '#fafad2' }],
}

const server = (...answers: Array<unknown | Error>) => {
  const call = jest.fn(async () => {
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next
  })
  return call as unknown as Call & jest.Mock
}

const render = async (call: Call, onTags = jest.fn(), onExpired = jest.fn()) => {
  await act(async () => {
    root.render(<PublisherTags call={call} onExpired={onExpired} onTags={onTags} />)
  })
  return { onTags, onExpired }
}

const field = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text || b.getAttribute('aria-label') === text) as HTMLButtonElement
const names = () => [...container.querySelectorAll('ul input[type="text"]')].map(i => (i as HTMLInputElement).value)
const status = () => container.querySelector('[role="status"]')?.textContent ?? null
const alert = () => container.querySelector('[role="alert"]')?.textContent ?? null
const set = (element: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
const click = async (b: HTMLButtonElement) => { await act(async () => { b.click() }) }
const addTag = async (name: string, colour: string) => {
  const form = container.querySelector('form[aria-label="Add a tag"]') as HTMLFormElement
  act(() => {
    set(form.querySelector('input[type="text"]') as HTMLInputElement, name)
    set(form.querySelector('input[type="color"]') as HTMLInputElement, colour)
  })
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

it('loads the tags, each with its colour and its mark in black or white text, and hands them to the page', async () => {
  const { onTags } = await render(server(LOADED))
  expect(names()).toEqual(['Zq Green', 'Zq Pale'])
  expect(field('Colour of tag 1').value).toBe('#006400')
  const marks = [...container.querySelectorAll('ul .tag-mark')] as HTMLElement[]
  expect(marks.map(m => [m.textContent, m.style.color])).toEqual([['Zq Green', 'rgb(255, 255, 255)'], ['Zq Pale', 'rgb(0, 0, 0)']])
  expect(onTags).toHaveBeenCalledWith(LOADED)
})

it('saves a rename, a new colour, a new tag without an id and a removal, on the loaded etag, and says it worked', async () => {
  const after = { tagsEtag: '"t2"', tags: [{ id: 'ta', name: 'Zq Mexico', colour: '#008000' }, { id: 'tn', name: 'Zq New', colour: '#ff0000' }] }
  const call = server(LOADED, after)
  const { onTags } = await render(call)
  act(() => {
    set(field('Name of tag 1'), '  Zq Mexico ')
    set(field('Colour of tag 1'), '#008000')
  })
  await click(button('Remove tag 2'))
  await addTag('Zq New', '#ff0000')
  await click(button('Save tags'))
  expect(call.mock.calls[1]).toEqual(['/publisher/tags', {
    method: 'PUT',
    body: { tagsEtag: '"t1"', tags: [{ id: 'ta', name: 'Zq Mexico', colour: '#008000' }, { name: 'Zq New', colour: '#ff0000' }] },
  }])
  expect(status()).toBe(SAVED)
  expect(names()).toEqual(['Zq Mexico', 'Zq New'])
  expect(onTags).toHaveBeenLastCalledWith(after)
})

it('a tag still on a published poem is refused by its name, nothing is reloaded, and the edits stay', async () => {
  const refused = new ApiError(409, 'in_use', 'A tag still on a published poem cannot be deleted.', { error: 'in_use', tagIds: ['tb'] })
  const call = server(LOADED, refused)
  await render(call)
  await click(button('Remove tag 2'))
  await click(button('Save tags'))
  expect(alert()).toBe(inUse(['Zq Pale']))
  expect(call.mock.calls).toHaveLength(2)
  expect(names()).toEqual(['Zq Green'])
})

it('when someone else saved first, the tags are reloaded and the page says so', async () => {
  const theirs = { tagsEtag: '"t9"', tags: [{ id: 'tz', name: 'Zq Theirs', colour: '#000000' }] }
  const call = server(LOADED, new ApiError(409, 'conflict', 'The tags changed since you loaded them.'), theirs)
  await render(call)
  await addTag('Zq Mine', '#ffffff')
  await click(button('Save tags'))
  expect(alert()).toBe(CONFLICT)
  expect(names()).toEqual(['Zq Theirs'])
})

it('when the reload after a conflict fails, the edits stay and Save waits for a reload', async () => {
  const call = server(LOADED, new ApiError(409, 'conflict', 'x'), new ApiError(0, 'network', 'unreachable'))
  await render(call)
  await addTag('Zq Mine', '#ffffff')
  await click(button('Save tags'))
  expect(alert()).toBe(NOT_RELOADED)
  expect(names()).toEqual(['Zq Green', 'Zq Pale', 'Zq Mine'])
  expect(button('Save tags').disabled).toBe(true)
  expect(button('Reload the tags')).toBeTruthy()
})

it('a 401 is handed to the page, which forgets the session', async () => {
  const expired = new ApiError(401, 'unauthenticated', 'Please sign in again.')
  const { onExpired } = await render(server(expired))
  expect(onExpired).toHaveBeenCalledWith(expired)
  expect(alert()).toBe('Please sign in again.')
})
