import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { ApiError } from '../app/api'
import { Call } from '../app/publisher'
import { Person, STATUS_WORDS, disablePoet, listPoets, registerPoet, resendInvitation } from '../app/poets'

// The "Poets" part of the publisher's page: register a poet by name and email, resend the invitation, disable.
// The publisher never sees or sets a password (docs/app-api.md, "Poets").

interface Props {
  call: Call
  onExpired: (error: unknown) => void // forgets the session on a 401, as the rest of the page does
}

function PublisherPoets({ call, onExpired }: Props): ReactElement {
  const [poets, setPoets] = useState<Person[] | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const reload = async () => setPoets((await listPoets(call)).poets)

  useEffect(() => {
    reload().catch(error => { onExpired(error); setProblem(error instanceof ApiError ? error.message : 'The poets could not be loaded.') })
    // Loaded once; each change reloads.
  }, [])

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      await action()
      setNotice(done)
      return true
    } catch (error) {
      onExpired(error)
      setProblem(error instanceof ApiError ? error.message : 'That did not work. Please try again.')
      return false
    } finally {
      await reload().catch(() => undefined)
      setBusy(false)
    }
  }

  const register = async (event: FormEvent) => {
    event.preventDefault()
    const [n, e] = [name.trim(), email.trim()]
    if (await run(() => registerPoet(call, n, e), `Registered ${n}. They will get an email with a temporary password and a link to sign in.`)) {
      setName('')
      setEmail('')
    }
  }

  return (
    <>
      <h3>Poets</h3>
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
      <form className="submit-form" onSubmit={register} aria-label="Register a poet">
        <p><label>Name <input type="text" required value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label></p>
        <p><label>Email <input type="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label></p>
        <p><button type="submit" className="app-button" disabled={busy}>Register poet</button></p>
      </form>
      {poets === null ? <p>Loading…</p> : poets.length === 0 ? <p>No poets are registered yet.</p> : (
        <ul className="publisher-list" aria-label="Registered poets">
          {poets.map(poet => (
            <li key={poet.username}>
              <span className="publisher-poem"><strong>{poet.name}</strong> <span className="publisher-author">{poet.email}</span></span>
              <span className="publisher-actions">
                {STATUS_WORDS[poet.status]}
                {poet.status === 'invited' && (
                  <button type="button" disabled={busy} onClick={() => run(() => resendInvitation(call, poet.username), `Sent the invitation to ${poet.name} again.`)}>
                    Resend invitation
                  </button>
                )}
                {poet.status !== 'disabled' && (
                  <button type="button" disabled={busy} onClick={() => run(() => disablePoet(call, poet.username), `Disabled ${poet.name}.`)}>
                    Disable
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default PublisherPoets
