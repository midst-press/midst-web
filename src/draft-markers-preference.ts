// Whether the player draws the draft markers (midst-web #296), a switch beside the playback controls. On by default.
// The reader's choice is kept in this browser only, as the language is (src/i18n.ts): never in the URL, a cookie or
// anything the server sees. Storage can be refused (a private window, blocked site data); then the markers are shown
// and a change lasts for this page only. Every player on the page reads one value, so a switch in one poem holds for all.
import { useSyncExternalStore } from 'react'

export const DRAFT_MARKERS_KEY = 'midst.showDraftMarkers'

/** The reader's stored choice: false only when they turned the markers off here; true otherwise. */
export function storedShowDraftMarkers(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(DRAFT_MARKERS_KEY) !== 'false'
  } catch {
    return true
  }
}

let current: boolean | undefined
const listeners = new Set<() => void>()
const read = (): boolean => (current ??= storedShowDraftMarkers())

/** Show or hide the draft markers in every player, and keep the choice in this browser. False when storage refused it. */
export function setShowDraftMarkers(show: boolean): boolean {
  current = show
  listeners.forEach(listener => listener())
  try {
    localStorage.setItem(DRAFT_MARKERS_KEY, String(show))
    return true
  } catch {
    return false
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The current choice, re-rendering when any player changes it. */
export const useShowDraftMarkers = (): boolean => useSyncExternalStore(subscribe, read, read)

/** For tests: forget the in-memory value, so the next read comes from storage. */
export const resetDraftMarkersPreference = () => {
  current = undefined
}
