import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'
import {
  PatronsList, Visibility, VISIBILITY_WORDS, closingFromText, loadPatronsList, savePatronsList, visibilitiesFor,
} from '../app/patrons'

// The "Patrons" part of the publisher's page (#58): every patron, in the order the site names them, each with a
// visibility; only public ones are named on the site. Saving replaces the whole list, and the back end then writes
// the site's copy of the public names.

export const SAVED = 'Saved. The site shows the public names within a minute.'
export const CONFLICT = 'Someone else saved the patrons list while you were editing. It has been reloaded; please make your change again.'
export const NOT_RELOADED = 'The patrons list changed on the server and could not be reloaded, so these changes cannot be saved. Reloading replaces them with the server’s list: note anything you want to keep first.'
export const RELOADED = 'The list has been reloaded.'

interface Props {
  call: Call
  onExpired: (error: unknown) => void // forgets the session on a 401, as the rest of the page does
}

// A row of the form. `saved` is the visibility the server holds for this patron, null for one added here; it
// decides which visibilities the row offers.
interface Row {
  key: number
  id?: string
  saved: Visibility | null
  name: string
  visibility: Visibility
}

let nextKey = 0
const rowsOf = (list: PatronsList): Row[] =>
  list.patrons.map(p => ({ key: nextKey++, id: p.id, saved: p.visibility, name: p.name, visibility: p.visibility }))

function PublisherPatrons({ call, onExpired }: Props): ReactElement {
  const [saved, setSaved] = useState<PatronsList | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [closing, setClosing] = useState('')
  const [newName, setNewName] = useState('')
  const [newVisibility, setNewVisibility] = useState<Visibility>('public')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // True when the server's list moved and this page could not fetch it: what is shown may be saved over by
  // nobody, so Save waits until the list is reloaded.
  const [stale, setStale] = useState(false)

  const show = (list: PatronsList) => {
    setSaved(list)
    setStale(false)
    setRows(rowsOf(list))
    setClosing(list.closing ?? '')
  }

  const loadFailed = (error: unknown) => (error instanceof ApiError ? error.message : 'The patrons could not be loaded.')

  // Loads the list and shows it, replacing whatever the form holds. A failure goes to the page (a 401 forgets the
  // session) and is returned, so each caller says what it means there. Resolves to the error, or null when it loaded.
  const load = async (): Promise<unknown> => {
    try {
      show(await loadPatronsList(call))
      return null
    } catch (error) {
      onExpired(error)
      return error
    }
  }

  useEffect(() => {
    load().then(error => { if (error) setProblem(loadFailed(error)) })
    // Loaded once; a save shows what the server then holds.
  }, [])

  // The publisher's way back from a failed load: try again, here or after a save the page could not follow.
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
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return
    const next = rows.slice()
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    setRows(next)
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setRows([...rows, { key: nextKey++, saved: null, name, visibility: newVisibility }])
    setNewName('')
  }

  const save = async () => {
    if (!saved || stale) return
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      const body = rows.map(({ id, name, visibility }) => ({ ...(id ? { id } : {}), name: name.trim(), visibility }))
      show(await savePatronsList(call, body, closingFromText(closing), saved.patronsEtag))
      setNotice(SAVED)
    } catch (error) {
      onExpired(error)
      if (error instanceof ApiError && (error.status === 409 || error.code === 'public_copy_failed')) {
        // The list moved on the server (someone else's save, or this one's): show what it now holds, and say so only
        // if it was in fact reloaded.
        // If it cannot be fetched, the form keeps the publisher's unsaved changes and Save waits for a reload.
        const reloadFailed = await load()
        if (reloadFailed) {
          setStale(true)
          setProblem(NOT_RELOADED)
        } else {
          setProblem(error.status === 409 ? CONFLICT : error.message)
        }
      } else {
        setProblem(error instanceof ApiError ? error.message : 'The patrons list was not saved. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3>Patrons</h3>
      <p>Only public patrons are named on the site, in this order, followed by the closing line.</p>
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
      {(stale || (saved === null && problem)) && (
        <p><button type="button" disabled={busy} onClick={reload}>Reload the list</button></p>
      )}
      {saved === null ? (!problem && <p>Loading…</p>) : (
        <>
          {rows.length === 0 ? <p>There are no patrons yet.</p> : (
            <ol className="publisher-list" aria-label="Patrons">
              {rows.map((row, i) => (
                <li key={row.key}>
                  <input
                    type="text"
                    aria-label={`Name of patron ${i + 1}`}
                    value={row.name}
                    onChange={e => edit(row.key, { name: e.target.value })}
                    disabled={busy}
                  />
                  <select
                    aria-label={`Visibility of patron ${i + 1}`}
                    value={row.visibility}
                    onChange={e => edit(row.key, { visibility: e.target.value as Visibility })}
                    disabled={busy}
                  >
                    {visibilitiesFor(row.saved).map(v => <option key={v} value={v}>{VISIBILITY_WORDS[v]}</option>)}
                  </select>
                  <span className="publisher-actions">
                    <button type="button" aria-label={`Move patron ${i + 1} up`} disabled={busy || i === 0} onClick={() => move(i, i - 1)}>Up</button>
                    <button type="button" aria-label={`Move patron ${i + 1} down`} disabled={busy || i === rows.length - 1} onClick={() => move(i, i + 1)}>Down</button>
                    <button type="button" aria-label={`Remove patron ${i + 1}`} disabled={busy} onClick={() => setRows(rows.filter(r => r.key !== row.key))}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <form className="submit-form" onSubmit={add} aria-label="Add a patron">
            <p>
              <label>Name <input type="text" value={newName} onChange={e => setNewName(e.target.value)} disabled={busy} /></label>
              {' '}
              <label>
                Visibility
                <select value={newVisibility} onChange={e => setNewVisibility(e.target.value as Visibility)} disabled={busy}>
                  {visibilitiesFor(null).map(v => <option key={v} value={v}>{VISIBILITY_WORDS[v]}</option>)}
                </select>
              </label>
              {' '}
              <button type="submit" disabled={busy || !newName.trim()}>Add</button>
            </p>
          </form>
          <p>
            <label>
              Shown after the public names (leave empty for none)
              <input type="text" aria-label="Closing line" value={closing} onChange={e => setClosing(e.target.value)} disabled={busy} />
            </label>
          </p>
          <p><button type="button" className="app-button" disabled={busy || stale} onClick={save}>Save patrons</button></p>
        </>
      )}
    </>
  )
}

export default PublisherPatrons
