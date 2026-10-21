import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'
import { TAG_NAME_MAX, TAGS_MAX, Tag, TagsList, loadTags, saveTags, textColourFor } from '../app/tags'

// The "Tags" part of the publisher's page (#310): named, coloured marks for a collection, such as a folio. Saving
// replaces the whole list; a tag still on a published poem cannot be removed until it is taken off those poems.

// Only "Saved.": the site does not show tags until its half of #310 ships, which says more (cora-2f1e43dc, river-2fc1630e).
export const SAVED = 'Saved.'
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

/** A tag's mark as the site will show it: its colour, with black or white text, whichever reads. */
export function TagMark({ name, colour }: { name: string, colour: string }): ReactElement {
  return <span className="tag-mark" style={{ backgroundColor: colour, color: textColourFor(colour) }}>{name}</span>
}

function PublisherTags({ call, onExpired, onTags }: Props): ReactElement {
  const [saved, setSaved] = useState<TagsList | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [newName, setNewName] = useState('')
  const [newColour, setNewColour] = useState(DEFAULT_COLOUR)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // True when the server's tags moved and this page could not fetch them: Save waits until they are reloaded.
  const [stale, setStale] = useState(false)

  const show = (list: TagsList) => {
    setSaved(list)
    setStale(false)
    setRows(rowsOf(list.tags))
    onTags(list)
  }

  const loadFailed = (error: unknown) => (error instanceof ApiError ? error.message : 'The tags could not be loaded.')

  // Resolves to the error, or null when it loaded.
  const load = async (): Promise<unknown> => {
    try {
      show(await loadTags(call))
      return null
    } catch (error) {
      onExpired(error)
      return error
    }
  }

  useEffect(() => {
    load().then(error => { if (error) setProblem(loadFailed(error)) })
  }, [])

  const reload = async () => {
    setBusy(true)
    setNotice(null)
    setProblem(null)
    const error = await load()
    if (error) setProblem(stale ? NOT_RELOADED : loadFailed(error))
    else setNotice(RELOADED)
    setBusy(false)
  }

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
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      const body = rows.map(({ id, name, colour }) => ({ ...(id ? { id } : {}), name: name.trim(), colour }))
      show(await saveTags(call, body, saved.tagsEtag))
      setNotice(SAVED)
    } catch (error) {
      onExpired(error)
      if (error instanceof ApiError && error.code === 'in_use') {
        // Nothing was saved, and the form keeps the edits: name the tags, as the page shows them, to put back.
        const ids = Array.isArray(error.body.tagIds) ? error.body.tagIds : []
        const names = saved.tags.filter(tag => ids.includes(tag.id)).map(tag => tag.name)
        setProblem(names.length ? inUse(names) : error.message)
      } else if (error instanceof ApiError && error.status === 409) {
        const reloadFailed = await load()
        if (reloadFailed) {
          setStale(true)
          setProblem(NOT_RELOADED)
        } else {
          setProblem(CONFLICT)
        }
      } else {
        setProblem(error instanceof ApiError ? error.message : 'The tags were not saved. Please try again.')
      }
    } finally {
      setBusy(false)
    }
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
