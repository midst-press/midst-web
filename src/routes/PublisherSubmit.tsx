import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { Call } from '../app/publisher'
import { Person, listPoets } from '../app/poets'
import { PHOTO_TYPES, fileProblem, photoProblem, submitPoem } from '../app/submit'
import NoteEditor from '../components/NoteEditor'
import { useAppCall } from '../app/useAppCall'

// Submit a poem for a poet (#372; midst-infra #232; Stuart, 27 Oct: poets email Annelyse their poem, and she does on
// their behalf what the author portal does). The author portal's form, with a choice of registered poet. The poem goes
// to Review like any submission and appears in that poet's "Your submissions".

const putFile = async (url: string, headers: Record<string, string>, file: Blob) => {
  const response = await fetch(url, { method: 'PUT', headers, body: file })
  return { ok: response.ok }
}

interface Props {
  call: Call
  onExpired: (error: unknown) => void
  /** After a poem is sent, so the page can bring its Review count up to date. */
  onSent?: () => void
}

function PublisherSubmit({ call, onExpired, onSent }: Props): ReactElement {
  // The poets who can be chosen: every registered poet whose account is not disabled.
  const [poets, setPoets] = useState<Person[] | null>(null)
  const [poet, setPoet] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [processNote, setProcessNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [formKey, setFormKey] = useState(0) // remakes the file inputs after a poem is sent
  // Busy, notice and problem as on every app page; a 401 goes to the page (#387).
  const { busy, notice, problem, setNotice, setProblem, run, load } = useAppCall({ onExpired })

  useEffect(() => {
    load(async () => {
      const r = await listPoets(call)
      setPoets(r.poets.filter(p => p.status !== 'disabled' && p.groups.includes('poet')))
    }, 'The poets could not be loaded.')
    // Loaded once per visit.
  }, [])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!file || !poet) return
    const wrong = fileProblem(file) ?? (photo ? photoProblem(photo) : null)
    if (wrong) { setProblem(wrong); setNotice(null); return }
    await run(async () => {
      const sent = await submitPoem(call, putFile, { title: title.trim(), author: author.trim(), processNote }, file, photo, poet)
      const name = poets?.find(p => p.username === poet)?.name || 'the poet'
      setNotice(`Sent “${sent.title}” for ${name}. It is waiting in Review.`)
      setPoet('')
      setTitle('')
      setAuthor('')
      setProcessNote('')
      setFile(null)
      setPhoto(null)
      setFormKey(k => k + 1)
      onSent?.()
    }, 'The poem could not be sent. Please try again.')
  }

  return (
    <section className="publisher-submit" aria-label="Submit a poem for a poet">
      <h3>Submit a poem for a poet</h3>
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
      {poets === null ? (problem ? null : <p>Loading…</p>) : poets.length === 0 ? <p>Register the poet below first.</p> : (
        <form className="submit-form" onSubmit={send} key={formKey}>
          <p><label>Poet <select required value={poet} onChange={e => setPoet(e.target.value)} disabled={busy}>
            <option value="">Choose a poet</option>
            {poets.map(p => <option key={p.username} value={p.username}>{p.name ? `${p.name} (${p.email})` : p.email}</option>)}
          </select></label></p>
          <p><label>Title <input type="text" required value={title} onChange={e => setTitle(e.target.value)} disabled={busy} /></label></p>
          <p><label>Their name as it should appear <input type="text" required value={author} onChange={e => setAuthor(e.target.value)} disabled={busy} /></label></p>
          <NoteEditor id="publisher-submit-note" label="Process Note" value={processNote} onChange={setProcessNote} disabled={busy} />
          <p><label>The poem, as a Midst file (.midst) <input type="file" accept=".midst" required onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} /></label></p>
          <p><label>A photo of the poet, if they sent one (JPEG, PNG or WebP, at most 5 MB) <input type="file" accept={PHOTO_TYPES.join(',')} onChange={e => setPhoto(e.target.files?.[0] ?? null)} disabled={busy} /></label></p>
          <p><button type="submit" className="app-button" disabled={busy || !file || !poet}>{busy ? 'Sending…' : 'Submit poem'}</button></p>
        </form>
      )}
    </section>
  )
}

export default PublisherSubmit
