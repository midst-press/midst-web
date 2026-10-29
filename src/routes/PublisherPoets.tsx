import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { Call } from '../app/publisher'
import { Person, STATUS_WORDS, disablePoet, listPoets, poetOnly, registerPoet, resendInvitation } from '../app/poets'
import { useAppCall } from '../app/useAppCall'

// Disable asks first: only an admin can turn the account back on, so a mis-click would lock the poet out (#122). The
// wording is the one proposed to Annelyse (GitHub midst-web #65), and hers to change.
export const confirmDisable = (name: string) =>
  `Disable ${name}'s account? They won't be able to sign in until an admin turns it back on.`

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
  // Busy, notice and problem as on every app page; a 401 goes to the page (#387).
  const { busy, notice, problem, setNotice, run: runCall, load } = useAppCall({ onExpired })

  const reload = async () => setPoets((await listPoets(call)).poets)

  useEffect(() => {
    load(reload, 'The poets could not be loaded.')
    // Loaded once; each change reloads.
  }, [])

  // Every change reloads the list afterwards, whether it worked or not.
  const run = (action: () => Promise<unknown>, done: string) =>
    runCall(async () => {
      try {
        await action()
        setNotice(done)
      } finally {
        await reload().catch(() => undefined)
      }
    }, 'That did not work. Please try again.')

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
                {poetOnly(poet) && poet.status === 'invited' && (
                  <button type="button" disabled={busy} onClick={() => run(() => resendInvitation(call, poet.username), `Sent the invitation to ${poet.name} again.`)}>
                    Resend invitation
                  </button>
                )}
                {poetOnly(poet) && poet.status !== 'disabled' && (
                  <button type="button" disabled={busy} onClick={() => {
                    if (window.confirm(confirmDisable(poet.name))) run(() => disablePoet(call, poet.username), `Disabled ${poet.name}.`)
                  }}>
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
