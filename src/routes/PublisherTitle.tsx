import React, { ReactElement, useState } from 'react'
import { ApiError } from '../app/api'
import { Call, TitleAndName, saveTitleAndName } from '../app/publisher'
import { useAppCall } from '../app/useAppCall'

// An unpublished poem's title and the name it is shown under (#372; midst-infra #232), beside its process note and
// photo. Saved on the pair shown, so a change someone else made meanwhile is refused rather than overwritten.

const CONFLICT = 'The title or name changed since the page was loaded. Reload the page to see it.'

interface Props {
  call: Call
  poemId: string
  shown: TitleAndName
  disabled: boolean
  onExpired: (error: unknown) => void
  /** After a save, so the page shows the poem under its new title. */
  onSaved: () => void
}

function PublisherTitle({ call, poemId, shown, disabled, onExpired, onSaved }: Props): ReactElement {
  // null: closed; otherwise the pair being edited.
  const [open, setOpen] = useState<TitleAndName | null>(null)
  // Busy, notice and problem as on every app page; a 401 goes to the page (#387).
  const { busy, notice, problem, setNotice, setProblem, run } = useAppCall({ onExpired })

  const toggle = () => {
    setNotice(null)
    setProblem(null)
    setOpen(open ? null : { title: shown.title, author: shown.author })
  }

  const save = async () => {
    if (!open) return
    await run(async () => {
      await saveTitleAndName(call, poemId, { title: open.title.trim(), author: open.author.trim() }, shown)
      setOpen(null)
      setNotice('Title and name saved.')
      onSaved()
    }, 'The title and name could not be saved. Please try again.',
    error => (error instanceof ApiError && error.code === 'conflict' ? CONFLICT : undefined))
  }

  const unchanged = open !== null && open.title.trim() === shown.title && open.author.trim() === shown.author
  return (
    <div className="publisher-title">
      <button type="button" disabled={disabled || busy} onClick={toggle} aria-expanded={open !== null}
        aria-label={`Title and name for ${shown.title}`}>Title and name</button>
      {open && (
        <form onSubmit={event => { event.preventDefault(); save() }}>
          <p><label>Title <input type="text" required maxLength={200} value={open.title}
            onChange={e => setOpen({ ...open, title: e.target.value })} disabled={disabled || busy} /></label></p>
          <p><label>Name as it should appear <input type="text" required maxLength={200} value={open.author}
            onChange={e => setOpen({ ...open, author: e.target.value })} disabled={disabled || busy} /></label></p>
          <button type="submit" className="app-button" disabled={disabled || busy || unchanged}>Save title and name</button>
        </form>
      )}
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
    </div>
  )
}

export default PublisherTitle
