import React, { ReactElement, useState } from 'react'
import { ApiError } from '../app/api'
import { Call, DraftNote, readNote, saveNote } from '../app/publisher'
import NoteEditor from '../components/NoteEditor'
import { useAppCall } from '../app/useAppCall'

// An unpublished poem's process note, for the publisher to edit to house style (#312). The API keeps the poet's own
// note and every earlier edit; the published copy is made from the latest when the poem is published.

const CONFLICT = 'The note changed since you opened it. Open it again to see it.'

interface Props {
  call: Call
  poemId: string
  title: string
  disabled: boolean
  onExpired: (error: unknown) => void
}

function PublisherNote({ call, poemId, title, disabled, onExpired }: Props): ReactElement {
  // null: closed; otherwise the note as loaded, and the text being edited.
  const [open, setOpen] = useState<{ loaded: DraftNote, text: string } | null>(null)
  // Busy, notice and problem as on every app page; a 401 goes to the page (#387).
  const { busy, notice, problem, setNotice, setProblem, run } = useAppCall({ onExpired })
  const conflict = (error: unknown) => (error instanceof ApiError && error.code === 'conflict' ? CONFLICT : undefined)

  const toggle = async () => {
    if (open) {
      setNotice(null)
      setProblem(null)
      setOpen(null)
      return
    }
    await run(async () => {
      const loaded = await readNote(call, poemId)
      setOpen({ loaded, text: loaded.processNote ?? '' })
    }, 'The note could not be loaded. Please try again.', conflict)
  }

  const save = async () => {
    if (!open) return
    await run(async () => {
      const saved = await saveNote(call, poemId, open.text, open.loaded.noteVersion)
      setOpen({ loaded: saved, text: saved.processNote ?? '' })
      setNotice('Note saved.')
    }, 'The note could not be saved. Please try again.', conflict)
  }

  const unchanged = open !== null && open.text === (open.loaded.processNote ?? '')
  return (
    <div className="publisher-note">
      <button type="button" disabled={disabled || busy} onClick={toggle} aria-expanded={open !== null}
        aria-label={`Process note for ${title}`}>Process note</button>
      {open && (
        <form onSubmit={event => { event.preventDefault(); save() }}>
          <NoteEditor id={`publisher-note-${poemId}`} label={`Process note for ${title}`} value={open.text}
            onChange={text => setOpen({ ...open, text })} disabled={disabled || busy} />
          <button type="submit" className="app-button" disabled={disabled || busy || unchanged}>Save note</button>
        </form>
      )}
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
    </div>
  )
}

export default PublisherNote
