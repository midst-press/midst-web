/*
 * The publisher's patrons routes (docs/app-api.md, "Patrons"; #58). The list is replaced whole, on the
 * patronsEtag the page last read; a 409 means someone else saved it first.
 */
import { Call } from './publisher'

export interface PatronsList {
  patronsEtag: string
  patrons: string[]
  closing: string | null
}

export const loadPatronsList = (call: Call) => call<PatronsList>('/publisher/patrons')

export const savePatronsList = (call: Call, patrons: string[], closing: string | null, patronsEtag: string) =>
  call<PatronsList>('/publisher/patrons', { method: 'PUT', body: { patronsEtag, patrons, closing } })

/** The names typed one per line: each trimmed, blank lines left out, the order kept. */
export const namesFromText = (text: string): string[] =>
  text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')

/** The closing line as typed: trimmed, and null when it is blank. */
export const closingFromText = (text: string): string | null => text.trim() || null
