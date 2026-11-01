// The draft markers over the timeline (#389): moved out of MidstPlayer unchanged.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IMidstFile } from '../../store/types'
import { DraftMarker, groupDraftMarkers } from './timeline'
import { i18n } from '../../i18n'

// Half the 24px minimum target size (WCAG 2.2, 2.5.8) of a draft marker on a phone (#256).
const MARKER_REACH = 12
// Same breakpoint as player.css's phone rules (#254): below it a marker is its tick alone, and below it
// (#256 (b), Annelyse's "One tick") ticks nearer than 24px apart merge into one tap target.
const PHONE_QUERY = '(max-width: 599px)'

interface Props {
  data: IMidstFile | null
  markers: DraftMarker[]
  maxStep: number
  show: boolean
  activePlayer: boolean
  // eslint-disable-next-line no-unused-vars -- the name says what the argument is
  onJump: (index: number) => void
}

export default function DraftMarkers({ data, markers, maxStep, show, activePlayer, onJump }: Props) {
  // A label is centred over its marker, which would push one near either end of the timeline past
  // the end of the control bar. Slide only the label back inside; its pointer stays on the marker.
  const markerRow = useRef<HTMLDivElement | null>(null)
  // #256 (b) (Annelyse, "One tick"): on a phone, markers whose ticks would land nearer than 24px apart are one
  // tap target, listing their drafts in a popover instead of fighting for the same space. Desktop never merges
  // (groups are always one marker each there). rowWidth/isPhone are measured below, with the labels, and
  // re-read on every resize, since the breakpoint can be crossed either way.
  const [rowWidth, setRowWidth] = useState(0)
  const [isPhone, setIsPhone] = useState(false)
  const groups = useMemo(() => {
    const centres = markers.map(marker => marker.index / Math.max(1, maxStep) * rowWidth)
    return isPhone ? groupDraftMarkers(centres, MARKER_REACH * 2) : markers.map((_, i) => [i])
  }, [markers, maxStep, rowWidth, isPhone])
  const [openGroupKey, setOpenGroupKey] = useState<number | null>(null)
  const openGroupRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const row = markerRow.current
    const bar = row && row.closest('.controls')
    if (!row || !bar) return
    const fit = () => {
      const bounds = bar.getBoundingClientRect()
      row.querySelectorAll<HTMLElement>('.draft-marker-name').forEach(name => {
        name.style.transform = ''
        const box = name.getBoundingClientRect()
        const shift = box.left < bounds.left ? bounds.left - box.left : box.right > bounds.right ? bounds.right - box.right : 0
        if (shift) name.style.transform = `translateX(${shift}px)`
      })
      // On a phone a marker is its tick alone, tapped through a 24px box around it (#256, the stylesheet's
      // --reach-left/--reach-right default of 12px each side). Ticks nearer than that merge into one (groupDraftMarkers),
      // so no two remaining ticks' boxes overlap and none needs narrowing. The width and the breakpoint decide the groups.
      setRowWidth(row.clientWidth)
      setIsPhone(typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches)
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(bar)
    return () => observer.disconnect()
    // A hidden row measures nothing, so the labels and tap boxes are fitted again when it is shown (#296).
  }, [markers, maxStep, show])

  // Another poem, or the player put away, or the markers hidden: no open list is left behind.
  useEffect(() => setOpenGroupKey(null), [data, maxStep])
  useEffect(() => { if (!show) setOpenGroupKey(null) }, [show])

  // A group's drafts list (#256 (b)): a tap outside it closes it, as the speed popup does. Escape is
  // handled on the tick button itself, which has focus whenever a keyboard reader could press it.
  useEffect(() => {
    if (openGroupKey == null) return
    const outside = (event: PointerEvent) => {
      if (!openGroupRef.current?.contains(event.target as Node)) setOpenGroupKey(null)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [openGroupKey])

  return (
    <div className="draft-markers" ref={markerRow} hidden={!show}>
      {groups.map(group => {
        const leader = markers[group[0]]
        // Between a marker-list change and the layout effect above catching up with it (next paint):
        // nothing to draw for a stale group yet.
        if (!leader) return null
        if (group.length === 1) {
          return <button key={group[0]} type="button" className="draft-marker"
            style={{ left: `${leader.index / Math.max(1, maxStep) * 100}%` }}
            title={leader.label} aria-label={i18n._('player.jumpTo', { draft: leader.label })} disabled={!activePlayer}
            onClick={() => onJump(leader.index)}>
            <span className="draft-marker-name">{leader.label}</span></button>
        }
        // #256 (b) (Annelyse, "One tick"): on a phone, ticks nearer than 24px apart are one tap target, at
        // the group's leftmost marker. The list is a sibling of the tick button, not nested inside it: a
        // button cannot contain another button.
        const open = openGroupKey === group[0]
        return <div key={group[0]} className="draft-marker draft-marker-group" ref={open ? openGroupRef : undefined}
          style={{ left: `${leader.index / Math.max(1, maxStep) * 100}%` }}>
          <button type="button" className="draft-marker-group-button"
            aria-haspopup="true" aria-expanded={open} disabled={!activePlayer}
            title={i18n._('player.draftsHere', { count: group.length })}
            aria-label={i18n._('player.draftsHere', { count: group.length })}
            onClick={() => setOpenGroupKey(current => current === group[0] ? null : group[0])}
            onKeyDown={event => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              setOpenGroupKey(null)
              event.currentTarget.focus()
            }} />
          {open && (
            <div className="draft-marker-group-popup" role="menu"
              aria-label={i18n._('player.draftsHere', { count: group.length })}>
              {group.map(gi => <button key={gi} type="button" role="menuitem" className="draft-marker-group-item"
                onClick={() => {
                  onJump(markers[gi].index)
                  setOpenGroupKey(null)
                }}>{markers[gi].label}</button>)}
            </div>
          )}
        </div>
      })}
    </div>
  )
}
