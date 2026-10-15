import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'
import { PatronsList, closingFromText, loadPatronsList, namesFromText, savePatronsList } from '../app/patrons'

// The "Patrons" part of the publisher's page (#58): the names the site thanks on its home and Funding pages, one
// per line in the order shown there, and the line shown after them. Saving replaces the whole list.

export const SAVED = 'Saved. The site shows the new list within a minute.'
export const CONFLICT = 'Someone else saved the patrons list while you were editing. It has been reloaded; please make your change again.'

interface Props {
  call: Call
  onExpired: (error: unknown) => void // forgets the session on a 401, as the rest of the page does
}

function PublisherPatrons({ call, onExpired }: Props): ReactElement {
  const [saved, setSaved] = useState<PatronsList | null>(null)
  const [names, setNames] = useState('')
  const [closing, setClosing] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const show = (list: PatronsList) => {
    setSaved(list)
    setNames(list.patrons.join('\n'))
    setClosing(list.closing ?? '')
  }

  useEffect(() => {
    loadPatronsList(call).then(show, error => {
      onExpired(error)
      setProblem(error instanceof ApiError ? error.message : 'The patrons could not be loaded.')
    })
    // Loaded once; a save shows what the server then holds.
  }, [])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!saved) return
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      show(await savePatronsList(call, namesFromText(names), closingFromText(closing), saved.patronsEtag))
      setNotice(SAVED)
    } catch (error) {
      onExpired(error)
      if (error instanceof ApiError && error.status === 409) {
        setProblem(CONFLICT)
        await loadPatronsList(call).then(show, () => undefined)
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
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
      {saved === null ? (!problem && <p>Loading…</p>) : (
        <form className="submit-form" onSubmit={save} aria-label="Patrons">
          <p>
            <label>
              Names, one per line, in the order the site shows them
              <textarea rows={12} value={names} onChange={e => setNames(e.target.value)} disabled={busy} />
            </label>
          </p>
          <p>
            <label>
              Shown after the names (leave empty for none)
              <input type="text" value={closing} onChange={e => setClosing(e.target.value)} disabled={busy} />
            </label>
          </p>
          <p><button type="submit" className="app-button" disabled={busy}>Save patrons</button></p>
        </form>
      )}
    </>
  )
}

export default PublisherPatrons
