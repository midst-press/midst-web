import React, { ReactElement, useState } from 'react'
import { ApiError } from '../app/api'
import { Call, DraftPhoto, changePhoto, readPhoto } from '../app/publisher'
import { PHOTO_TYPES, photoProblem } from '../app/submit'

// An unpublished poem's author photo, for the publisher to add or change (#312, step 2b; Annelyse, 26 Oct). The API keeps
// the poet's photo and every earlier one; the published copy is made from the latest when the poem is published, and
// the poem page shows it at the foot of the process note.

const CONFLICT = 'The photo changed since you opened it. Open it again to see it.'

const putFile = async (url: string, headers: Record<string, string>, file: Blob) => {
  const response = await fetch(url, { method: 'PUT', headers, body: file })
  return { ok: response.ok }
}

interface Props {
  call: Call
  poemId: string
  title: string
  disabled: boolean
  onExpired: (error: unknown) => void
}

function PublisherPhoto({ call, poemId, title, disabled, onExpired }: Props): ReactElement {
  // null: closed; otherwise the photo as loaded.
  const [shown, setShown] = useState<DraftPhoto | null>(null)
  const [chosen, setChosen] = useState<File | null>(null)
  const [inputKey, setInputKey] = useState(0) // remakes the file input after a change
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const failed = (error: unknown, fallback: string) => {
    onExpired(error)
    setProblem(error instanceof ApiError && error.code === 'conflict' ? CONFLICT : error instanceof ApiError ? error.message : fallback)
  }

  const toggle = async () => {
    setNotice(null)
    setProblem(null)
    if (shown) { setShown(null); setChosen(null); return }
    setBusy(true)
    try {
      setShown(await readPhoto(call, poemId))
    } catch (error) {
      failed(error, 'The photo could not be loaded. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    if (!shown || !chosen) return
    setNotice(null)
    setProblem(null)
    const wrong = photoProblem(chosen)
    if (wrong) { setProblem(wrong); return }
    setBusy(true)
    try {
      await changePhoto(call, putFile, poemId, chosen, shown.photoVersion)
      setChosen(null)
      setInputKey(k => k + 1)
      setNotice('Photo saved.')
    } catch (error) {
      failed(error, 'The photo could not be saved. Please try again.')
      setBusy(false)
      return
    }
    // Saved. A failure from here on is only showing it: saying "could not be saved" would make the publisher send it twice.
    try {
      setShown(await readPhoto(call, poemId))
    } catch (error) {
      onExpired(error)
      setProblem('The photo was saved, but it could not be shown. Open it again to see it.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="publisher-photo">
      <button type="button" disabled={disabled || busy} onClick={toggle} aria-expanded={shown !== null}
        aria-label={`Author photo for ${title}`}>Author photo</button>
      {shown && (
        <form onSubmit={event => { event.preventDefault(); upload() }}>
          {shown.url
            ? <img src={shown.url} alt={`Author photo for ${title}`} style={{ display: 'block', maxWidth: '100%', maxHeight: '16rem' }} />
            : <p>No photo yet.</p>}
          <p><label>{shown.url ? 'A new photo' : 'A photo'} (JPEG, PNG or WebP, at most 5 MB) <input key={inputKey} type="file"
            accept={PHOTO_TYPES.join(',')} onChange={e => setChosen(e.target.files?.[0] ?? null)} disabled={disabled || busy} /></label></p>
          <button type="submit" className="app-button" disabled={disabled || busy || !chosen}>Save photo</button>
        </form>
      )}
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
    </div>
  )
}

export default PublisherPhoto
