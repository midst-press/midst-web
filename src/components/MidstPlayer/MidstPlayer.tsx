import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import extensions from '@midst-press/midst-format/extensions'
import { IMidstFile } from '../../store/types'
import { clampLabelCentre } from './timestamp-position'
import { editTime } from './edit-time'
import { draftMarkers } from './timeline'
import { usePlayback } from './usePlayback'
import DraftMarkers from './DraftMarkers'
import SpeedControl from './SpeedControl'
import './player.css'
import { installFonts } from '../../fonts'
import { ensureLocale, i18n } from '../../i18n'
import { LocaleContext } from '../../locale'

// Lato and Helvetica Neue for the player, wherever it is mounted (the site entry also calls this).
installFonts()
// Its words come from the catalog, so a language must be active before it renders.
ensureLocale()

interface Props {
  data: IMidstFile | null
  activePlayer: boolean
  cursorFollowing: boolean
  hasScrollbar: boolean
}

export default function MidstPlayer({ data, activePlayer, cursorFollowing, hasScrollbar }: Props) {
  // Each frame is a whole snapshot of the document (the loader validates both file forms into frames), so the
  // player shows a frame's content as it is; nothing is rebuilt from changes.
  const frames = useMemo(() => (data ? data.editorTimelineFrames : []), [data])
  const markers = useMemo(() => draftMarkers(data, frames.length), [data, frames.length])
  // Off by default. The switch shows them for this poem only, and only until the page is left or reloaded: nothing is
  // remembered, and another poem starts with them off (Annelyse, GitHub #85; midst-web #324).
  const [showMarkers, setShowMarkers] = useState(false)
  useEffect(() => setShowMarkers(false), [data])
  const editor = useEditor({
    extensions,
    content: '',
    editable: false,
    parseOptions: { preserveWhitespace: true },
    editorProps: { attributes: { class: 'editable', 'aria-label': i18n._('player.poemReplay') } },
  })

  // The editor's attributes are set when it is made, so a language chosen afterwards reaches its label here.
  const { locale } = useContext(LocaleContext)
  useEffect(() => {
    editor?.setOptions({ editorProps: { attributes: { class: 'editable', 'aria-label': i18n._('player.poemReplay') } } })
  }, [editor, locale])

  // Playback: the frame shown, playing or paused, the frame rate, and the glide that follows the writing (#389).
  const { step, maxStep, canPlay, playing, fps, seekTo, jumpTo, changeFPS, playPause } =
    usePlayback({ data, frames, editor, activePlayer, cursorFollowing })

  // The current frame's edit time, shown below the timeline. Follows the playhead.
  // A synthetic frame (empty history) has sourceHistoryLength 0 — not a real edit.
  // Distinguish synthetic from missing/invalid: require a finite timestamp, allow 0 and negatives.
  const currentFrame = frames[Math.min(step, maxStep)]
  const isSynthetic = (data?.sourceHistoryLength ?? 1) === 0
  const rawTimestamp = currentFrame?.timestamp
  const hasRealTimestamp = currentFrame != null && !isSynthetic
    && rawTimestamp != null && Number.isFinite(rawTimestamp)
  const frameTimestamp = hasRealTimestamp ? currentFrame!.timestamp : null
  const playheadPercent = maxStep > 0 ? Math.min(step, maxStep) / maxStep * 100 : 0
  // The time over the date, in the page's language (#225). labelText is what the timeline says to a screen reader,
  // and what the label's measuring depends on: not frameTimestamp, raw ms that differ every frame.
  const shownTime = frameTimestamp != null ? editTime(frameTimestamp, i18n.locale) : null
  const labelText = shownTime != null
    ? i18n._('player.editTime', { time: shownTime.time, date: shownTime.date })
    : currentFrame != null ? i18n._('player.editTimeUnavailable') : null
  // Continuous bounding: clamp the label's CENTRE so the label stays within the timeline container.
  // Measure the rendered label width; re-measure on container resize (ResizeObserver) so a paused
  // resize does not leave a stale width. Measurement runs on text change and resize, not per frame.
  const timestampRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [labelWidthPct, setLabelWidthPct] = useState(0)
  const measureLabel = useCallback(() => {
    const el = timestampRef.current
    const timeline = timelineRef.current
    if (!el || !timeline) return
    const containerWidth = timeline.offsetWidth
    if (containerWidth > 0) setLabelWidthPct((el.offsetWidth / containerWidth) * 100)
  }, [])
  useLayoutEffect(measureLabel, [labelText, measureLabel])
  // Observe the timeline, which is always rendered: a player mounted with no data has no label, and an effect
  // that ran once then would never observe a resize after the data arrived (#94). Observe the label too, while it
  // is rendered: its width changes without its text or the timeline changing when a web font from FONTS_URL
  // finishes loading, and a width measured in the fallback font clamps the label past the timeline's ends.
  const hasLabel = labelText != null
  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline) return
    // As the marker row's effect: without ResizeObserver the label is still measured on text change, and only
    // stops re-measuring on resize, rather than the effect throwing and the player not rendering (#146).
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measureLabel)
    observer.observe(timeline)
    if (timestampRef.current) observer.observe(timestampRef.current)
    return () => observer.disconnect()
  }, [measureLabel, hasLabel])
  const clampedCentre = clampLabelCentre(playheadPercent, labelWidthPct)
  const playheadLeft = `${clampedCentre}%`
  const playheadTransform = 'translateX(-50%)'

  // Spacebar plays and pauses the poem on screen, wherever focus is (GitHub #51). Before this the
  // key only worked once the play button had been clicked and so held focus; a freshly loaded page
  // has nothing focused. Every poem is mounted in the carousel, so only the active player listens.
  // A key pressed on a control keeps its own meaning: space on a focused button already clicks it. A link is not
  // one of those: Enter follows it and Space has no meaning there, so Space plays and pauses with a link focused,
  // such as an arrow just clicked to come to this poem (Annelyse, GitHub #109; midst-web #403).
  const playPauseRef = useRef(playPause)
  playPauseRef.current = playPause
  useEffect(() => {
    if (!canPlay) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || event.defaultPrevented) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as Element | null
      if (target && target.closest && target.closest('button, input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault() // otherwise the page scrolls
      playPauseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canPlay])

  return (
    <div className="midst-tiptap-player" data-player="tiptap">
      <div className={`editor${hasScrollbar ? '' : ' editor--hide-scrollbar'}`} style={{
        // Every poem is shown in the site's poem font, whatever the poet chose in the app (#380; Annelyse, GitHub #105).
        fontFamily: 'var(--font-poem, sans-serif)',
        // One size for every poem too (#380); the poet's own size is no longer used.
        fontSize: 'var(--poem-size, 16.8px)',
      }}>
        <EditorContent editor={editor} />
      </div>
      <div className="control-container">
        {/* Keys in the controls stay here, away from the document shortcut. Space plays and pauses wherever the focus is
            among them, and never works the control itself: a clicked control keeps focus, and Space there clicked it
            again (Annelyse, GitHub #87, #109: "spacebar ONLY plays/pauses"; midst-web #293, #325, #407). Enter and a
            click still work every control. */}
        <div className="controls" onKeyDown={event => {
          event.stopPropagation()
          if (event.key !== ' ' || event.defaultPrevented) return
          // The speed popup's frame-rate slider too: Space there plays and pauses, the speed stays, and the popup stays
          // open (Stuart, 3 Nov, GitHub #109; midst-web #410). Its arrow keys still change the speed.
          const target = event.target as Element
          // A button clicks itself on Space's keyup unless its keydown is cancelled, so Space on a button is always
          // cancelled, even when it then does nothing: a held key, a modifier, a poem that cannot play (Silas, review
          // of #408). The timeline keeps its own rule: Space does nothing to a range, so those are left alone.
          if (target.closest?.('button')) event.preventDefault()
          if (!canPlay || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
          event.preventDefault()
          playPause()
        }}>
          <div className="timeline-control" ref={timelineRef}>
          <input type="range" aria-label={i18n._('player.timeline')} aria-valuetext={labelText ?? undefined} className="progress-bar"
            min={0} max={maxStep} step={1} value={Math.min(step, maxStep)}
            disabled={!canPlay}
            onChange={event => seekTo(Number(event.target.value))} />
            <DraftMarkers data={data} markers={markers} maxStep={maxStep} show={showMarkers} activePlayer={activePlayer}
              onJump={jumpTo} />
            {labelText != null && (
              <div ref={timestampRef} data-guide="frame-edit-time" aria-hidden="true"
                className={`frame-timestamp${frameTimestamp == null ? ' frame-timestamp--unavailable' : ''}`}
                style={{ left: playheadLeft, transform: playheadTransform }}>
                {shownTime != null
                  ? <><span className="frame-timestamp-time">{shownTime.time}</span><span className="frame-timestamp-date">{shownTime.date}</span></>
                  : labelText}
              </div>
            )}
          </div>
          <div className="playback-controls">
            <button type="button" className="control-button" aria-label={i18n._('player.skipToStart')}
              disabled={!canPlay} onClick={() => seekTo(0)}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 5v14M19 5 8 12l11 7Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" aria-label={playing ? i18n._('player.pause') : i18n._('player.play')}
              className={`play-pause-button control-button${playing ? ' playing' : ''}`}
              onClick={playPause} disabled={!canPlay}>
              {playing ? <><span className="pause-rectangle" /><span className="pause-rectangle" /></> : '▶'}
            </button>
            <button type="button" className="control-button" aria-label={i18n._('player.skipToEnd')}
              disabled={!canPlay} onClick={() => seekTo(maxStep)}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19 5v14M5 5l11 7-11 7Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
              </svg>
            </button>
            <SpeedControl data={data} maxStep={maxStep} fps={fps} canPlay={canPlay} activePlayer={activePlayer}
              onChange={changeFPS} />
            {markers.length > 0 && (
              // Shows or hides this poem's draft markers (#324). Space plays and pauses, as everywhere in the controls.
              <button type="button" role="switch" aria-checked={showMarkers} className="control-button draft-markers-switch"
                aria-label={i18n._('player.showDraftMarkers')} title={i18n._('player.showDraftMarkers')}
                onClick={() => setShowMarkers(!showMarkers)}>
                {/* The editor's Bookmarks icon (Material Icons, @mui/icons-material, MIT), as the editor shows drafts. */}
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="m19 18 2 1V3c0-1.1-.9-2-2-2H8.99C7.89 1 7 1.9 7 3h10c1.1 0 2 .9 2 2zM15 5H5c-1.1 0-2 .9-2 2v16l7-3 7 3V7c0-1.1-.9-2-2-2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
