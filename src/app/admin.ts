/*
 * The admin's routes (docs/app-api.md, "Admin"): see everyone, invite, change groups, disable and enable.
 * A change that would leave the pool with no admin is answered 409 `last_admin`.
 */
import { Call } from './publisher'

export const GROUPS = ['poet', 'publisher', 'admin'] as const

export type PersonStatus = 'invited' | 'active' | 'disabled'

export interface Person {
  username: string
  name: string
  email: string
  groups: string[]
  status: PersonStatus
}

export const loadPeople = (call: Call) => call<{ users: Person[] }>('/admin/users')

export const invite = (call: Call, name: string, email: string, groups: string[]) =>
  call<Person>('/admin/users', { method: 'POST', body: { name, email, groups } })

export const setGroups = (call: Call, username: string, groups: string[]) =>
  call<Person>(`/admin/users/${encodeURIComponent(username)}/groups`, { method: 'PUT', body: { groups } })

export const disable = (call: Call, username: string) =>
  call<Person>(`/admin/users/${encodeURIComponent(username)}/disable`, { method: 'POST' })

export const enable = (call: Call, username: string) =>
  call<Person>(`/admin/users/${encodeURIComponent(username)}/enable`, { method: 'POST' })
