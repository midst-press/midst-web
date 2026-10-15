/*
 * The publisher's patrons routes (docs/app-api.md, "Patrons"; #58). Every patron has a visibility, and only public
 * ones are named on the site. The list is replaced whole, on the patronsEtag the page last read; a 409 means
 * someone else saved it first.
 *
 * Who may set what is the back end's rule, and it refuses anything else, saying why. The form offers only what the
 * rule allows, so a publisher is not offered a choice that would be refused: public and private either way, and
 * undetermined settled as either; never back to undetermined, which only the Patreon sync sets.
 */
import { Call } from './publisher'

export type Visibility = 'public' | 'private' | 'undetermined'

export interface Patron {
  id: string
  name: string
  visibility: Visibility
}

export interface PatronsList {
  patronsEtag: string
  patrons: Patron[]
  closing: string | null
}

/** A patron as the form sends it: a new one has no id. */
export interface PatronEdit {
  id?: string
  name: string
  visibility: Visibility
}

export const VISIBILITY_WORDS: Record<Visibility, string> = {
  public: 'Public: named on the site',
  private: 'Private: not named',
  undetermined: 'Undetermined: not yet asked',
}

/** The visibilities a publisher may choose for a patron saved as `saved`, or for a new one (null). */
export const visibilitiesFor = (saved: Visibility | null): Visibility[] =>
  saved === 'undetermined' ? ['undetermined', 'public', 'private'] : ['public', 'private']

export const loadPatronsList = (call: Call) => call<PatronsList>('/publisher/patrons')

export const savePatronsList = (call: Call, patrons: PatronEdit[], closing: string | null, patronsEtag: string) =>
  call<PatronsList>('/publisher/patrons', { method: 'PUT', body: { patronsEtag, patrons, closing } })

/** The closing line as typed: trimmed, and null when it is blank. */
export const closingFromText = (text: string): string | null => text.trim() || null
