import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'
import { TAG_NAME_MAX, TAGS_MAX, Tag, TagsList, loadTags, saveTags } from '../app/tags'
import TagMark from '../components/TagMark'
import { useAppCall } from '../app/useAppCall'

// The "Tags" part of the publisher's page (#310): named, coloured marks for a collection, such as a folio. Saving
// replaces the whole list; a tag still on a published poem cannot be removed until it is taken off those poems.

// The site reads the tags with a one-minute cache, when its Table of Contents is opened (src/tags.ts).
export const SAVED = 'Saved. The site shows the tags within a minute.'
export const CONFLICT = 'Someone else saved the tags while you were editing. They have been reloaded; please make your change again.'
export const NOT_RELOADED = 'The tags could not be reloaded, so these changes cannot be saved. Reload them, noting anything you want to keep first.'
export const RELOADED = 'The tags have been reloaded.'
export const inUse = (names: string[]) =>
  `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} still on a published poem. Take ${names.length === 1 ? 'it' : 'them'} off those poems before removing ${names.length === 1 ? 'it' : 'them'}.`
const DEFAULT_COLOUR = '#2e8b57'

interface Props {
  call: Call
  onExpired: (error: unknown) => void // forgets the session on a 401, as the rest of the page does
  onTags: (list: TagsList) => void // the tags as the server holds them, each time they are loaded or saved
}

// A row of the form; `id` is absent for a tag added here.
interface Row {
  key: number
  id?: string
  name: string
  colour: string
}

let nextKey = 0
const rowsOf = (tags: Tag[]): Row[] => tags.map(t => ({ key: nextKey++, id: t.id, name: t.name, colour: t.colour }))

function PublisherTags({ call, onExpired, onTags }: Props): ReactElement {
  const [saved, setSaved] = useState<TagsList | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [newName, setNewName] = useState('')
  const [newColour, setNewColour] = useState(DEFAULT_COLOUR)
  // Busy, notice and problem as on every app page; a 401 goes to the page (#387).
  const { busy, notice, problem, setNotice, run, load } = useAppCall({ onExpired })
  // True when the server's tags moved and this page could not fetch them: Save waits until they are reloaded.
  const [stale, setStale] = useState(false)

  const show = (list: TagsList) => {
    setSaved(list)
    setStale(false)
    setRows(rowsOf(list.tags))
    onTags(list)
  }

  const LOAD_FAILED = 'The tags could not be loaded.'
  const fetchTags = async () => show(await loadTags(call))

  useEffect(() => {
    load(fetchTags, LOAD_FAILED)
  }, [])

  const reload = () =>
    run(async () => {
      await fetchTags()
      setNotice(RELOADED)
    }, LOAD_FAILED, () => (stale ? NOT_RELOADED : undefined))

  const edit = (key: number, change: Partial<Row>) => setRows(rows.map(row => (row.key === key ? { ...row, ...change } : row)))

  const add = (event: FormEvent) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setRows([...rows, { key: nextKey++, name, colour: newColour }])
    setNewName('')
  }

  const save = async () => {
    if (!saved || stale) return
    await run(async () => {
      const body = rows.map(({ id, name, colour }) => ({ ...(id ? { id } : {}), name: name.trim(), colour }))
      show(await saveTags(call, body, saved.tagsEtag))
      setNotice(SAVED)
    }, 'The tags were not saved. Please try again.', async error => {
      if (error instanceof ApiError && error.code === 'in_use') {
        // Nothing was saved, and the form keeps the edits: name the tags, as the page shows them, to put back.
        const ids = Array.isArray(error.body.tagIds) ? error.body.tagIds : []
        const names = saved.tags.filter(tag => ids.includes(tag.id)).map(tag => tag.name)
        return names.length ? inUse(names) : error.message
      }
      if (error instanceof ApiError && error.status === 409) {
        try {
          await fetchTags()
          return CONFLICT
        } catch (reloadError) {
          onExpired(reloadError)
          setStale(true)
          return NOT_RELOADED
        }
      }
      return undefined
    })
  }

  const tooLong = rows.some(row => row.name.trim().length > TAG_NAME_MAX)
  return (
    <>
      <h3>Tags</h3>
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
      {(stale || (saved === null && problem)) && (
        <p><button type="button" disabled={busy} onClick={reload}>Reload the tags</button></p>
      )}
      {saved === null ? (!problem && <p>Loading…</p>) : (
        <>
          {rows.length === 0 ? <p>There are no tags yet.</p> : (
            <ul className="publisher-list" aria-label="Tags">
              {rows.map((row, i) => (
                <li key={row.key}>
                  <input type="text" aria-label={`Name of tag ${i + 1}`} value={row.name} maxLength={TAG_NAME_MAX}
                    onChange={e => edit(row.key, { name: e.target.value })} disabled={busy} />
                  {' '}
                  <input type="color" aria-label={`Colour of tag ${i + 1}`} value={row.colour}
                    onChange={e => edit(row.key, { colour: e.target.value.toLowerCase() })} disabled={busy} />
                  {' '}
                  <TagMark name={row.name.trim() || ' '} colour={row.colour} />
                  <span className="publisher-actions">
                    <button type="button" aria-label={`Remove tag ${i + 1}`} disabled={busy}
                      onClick={() => setRows(rows.filter(r => r.key !== row.key))}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form className="submit-form" onSubmit={add} aria-label="Add a tag">
            <p>
              <label>Name <input type="text" value={newName} maxLength={TAG_NAME_MAX} onChange={e => setNewName(e.target.value)} disabled={busy} /></label>
              {' '}
              <label>Colour <input type="color" value={newColour} onChange={e => setNewColour(e.target.value.toLowerCase())} disabled={busy} /></label>
              {' '}
              <button type="submit" disabled={busy || !newName.trim() || rows.length >= TAGS_MAX}>Add</button>
            </p>
          </form>
          <p><button type="button" className="app-button" disabled={busy || stale || tooLong} onClick={save}>Save tags</button></p>
        </>
      )}
    </>
  )
}

export default PublisherTags
