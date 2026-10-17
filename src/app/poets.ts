/*
 * The publisher's poet routes (docs/app-api.md, "Poets"; Stuart, 14 Oct): the publisher registers poets and
 * never sees a password. Cognito emails the poet a temporary password, and the poet chooses their own at
 * first sign-in.
 */
import { Call } from './publisher'

export interface Person {
  username: string
  name: string
  email: string
  groups: string[]
  status: 'invited' | 'active' | 'disabled'
}

export const STATUS_WORDS: Record<Person['status'], string> = {
  invited: 'Invited, has not signed in yet',
  active: 'Signed in',
  disabled: 'Disabled',
}

// Resend and disable act only on poet-only accounts; the API refuses them, 403, for anyone also in another
// group (docs/app-api.md, "Poets"), so the page offers them only here (#122).
export const poetOnly = (person: Pick<Person, 'groups'>): boolean => person.groups.length === 1 && person.groups[0] === 'poet'

const at = (username: string) => `/publisher/poets/${encodeURIComponent(username)}`

export const listPoets = (call: Call) => call<{ poets: Person[] }>('/publisher/poets')
export const registerPoet = (call: Call, name: string, email: string) =>
  call<Person>('/publisher/poets', { method: 'POST', body: { name, email } })
export const resendInvitation = (call: Call, username: string) => call<Person>(`${at(username)}/resend`, { method: 'POST' })
export const disablePoet = (call: Call, username: string) => call<Person>(`${at(username)}/disable`, { method: 'POST' })
