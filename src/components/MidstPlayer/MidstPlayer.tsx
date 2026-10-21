import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import extensions from '@midst-press/midst-format/extensions'
import { IMidstFile } from '../../store/types'
import { clampLabelCentre } from './timestamp-position'
import { editTime } from './edit-time'
import { draftMarkers, playerFont } from './timeline'
import { Glide, glideTo, gliding, scrollParent, targetScrollTop } from '@midst-press/midst-format/follow'
import './player.css'
import { installFonts } from '../../fonts'
import { ensureLocale, i18n } from '../../i18n'
import { LocaleContext } from '../../locale'

// Lato and Helvetica Neue for the player, wherever it is mounted (the site entry also calls this).
installFonts()
// Its words come from the catalog, so a language must be active before it renders.
ensureLocale()

const MIN_FPS = 1
const MAX_FPS = 60
const DEFAULT_FPS = 1000 / 60
const displayFPS = (fps: number) => String(Math.round(fps * 10) / 10)

interface Props {
  data: IMidstFile | null
  activePlayer: boolean
  cursorFollowing: boolean
  hasScrollbar: boolean
}

// Half the 24px minimum target size (WCAG 2.2, 2.5.8) of a draft marker on a phone (#256).
const MARKER_REACH = 12

export default function MidstPlayer({ data, activePlayer, cursorFollowing, hasScrollbar }: Props) {
  // Each frame is a whole snapshot of the document (the loader validates both file forms into frames), so the
  // player shows a frame's content as it is; nothing is rebuilt from changes.
  const frames = useMemo(() => (data ? data.editorTimelineFrames : []), [data])
  const maxStep = Math.max(0, frames.length - 1)
  const canPlay = activePlayer && frames.length >= 2
  const markers = useMemo(() => draftMarkers(data, frames.length), [data, frames.length])
  // A label is centred over its marker, which would push one near either end of the timeline past
  // the end of the control bar. Slide only the label back inside; its pointer stays on the marker.
  const markerRow = useRef<HTMLDivElement | null>(null)
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
      // On a phone a marker is its tick alone, tapped through a box around it (#256). The box reaches 12px each
      // side, making 24px, unless a neighbouring tick is nearer than 24px: then the two boxes meet halfway, so a
      // tap reaches the nearer tick. The stylesheet uses these only below 600px.
      const width = row.clientWidth
      const centres = markers.map(marker => marker.index / Math.max(1, maxStep) * width)
      const order = centres.map((_, i) => i).sort((a, b) => centres[a] - centres[b])
      const buttons = row.querySelectorAll<HTMLElement>('.draft-marker')
      order.forEach((i, k) => {
        const toLeft = k > 0 ? (centres[i] - centres[order[k - 1]]) / 2 : MARKER_REACH
        const toRight = k < order.length - 1 ? (centres[order[k + 1]] - centres[i]) / 2 : MARKER_REACH
        buttons[i]?.style.setProperty('--reach-left', `${Math.min(MARKER_REACH, toLeft)}px`)
        buttons[i]?.style.setProperty('--reach-right', `${Math.min(MARKER_REACH, toRight)}px`)
      })
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [markers, maxStep])
  const { family, size } = playerFont(data)
  const [step, setStep] = useState(maxStep)
  const [playing, setPlaying] = useState(false)
  const [fps, setFPS] = useState(DEFAULT_FPS)
  const [speedOpen, setSpeedOpen] = useState(false)
  const speedControl = useRef<HTMLDivElement | null>(null)
  const speedButton = useRef<HTMLButtonElement | null>(null)
  const speedSlider = useRef<HTMLInputElement | null>(null)
  const glide = useRef<Glide | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const generation = useRef(0)
  const lastTick = useRef(0)
  const haltPlayback = useCallback(() => {
    generation.current += 1
    if (timer.current) clearInterval(timer.current)
    timer.current = undefined
  }, [])
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

  function cancelGlide() {
    if (glide.current) cancelAnimationFrame(glide.current.frame)
    glide.current = null
  }

  useEffect(() => {
    haltPlayback()
    setStep(maxStep)
    setPlaying(false)
    setSpeedOpen(false)
    cancelGlide()
  }, [data, maxStep, haltPlayback])

  useEffect(() => {
    if (!activePlayer || !cursorFollowing) cancelGlide()
    if (!activePlayer) { haltPlayback(); setPlaying(false); setSpeedOpen(false) }
  }, [activePlayer, cursorFollowing, haltPlayback])

  useEffect(() => {
    if (!editor) return
    const before = editor.state.doc
    // Each adapter entry is a full replacement, so reconstruct just this entry: seeking a long
    // archive must not replay every earlier snapshot on every 60ms tick.
    editor.commands.setContent(frames[Math.min(step, maxStep)]?.content ?? '', false, { preserveWhitespace: true })
    const after = editor.state.doc
    const changed = after.content.findDiffStart(before.content)
    const scroller = scrollParent(editor.view.dom as HTMLElement)
    if (activePlayer && cursorFollowing && changed != null && scroller) {
      const point = editor.view.coordsAtPos(Math.min(changed, after.content.size))
      const to = targetScrollTop(point, scroller.getBoundingClientRect(), scroller.scrollTop, scroller.scrollHeight)
      if (to != null) glide.current = glideTo(scroller, to, glide.current)
    }
    if (step >= maxStep) { haltPlayback(); setPlaying(false) }
  }, [editor, frames, step, maxStep, activePlayer, cursorFollowing, haltPlayback])

  useEffect(() => {
    if (!playing || !activePlayer || maxStep === 0) return
    const run = ++generation.current
    const period = Math.ceil(1000 / fps)
    const tick = () => {
      if (generation.current !== run) return
      // A glide holds the frame, not the playback clock.
      lastTick.current = performance.now()
      setStep(value => generation.current !== run || gliding(glide.current) ? value : Math.min(value + 1, maxStep))
    }
    // Keep the next deadline anchored to the previous tick, not to a speed change.
    const delay = Math.ceil(lastTick.current + period - performance.now())
    if (delay <= 0) {
      timer.current = setInterval(tick, period)
      tick()
    } else if (delay === period) {
      timer.current = setInterval(tick, period)
    } else {
      let firstTickFired = false
      timer.current = setInterval(() => {
        if (generation.current !== run || firstTickFired) return
        firstTickFired = true
        if (timer.current) clearInterval(timer.current)
        timer.current = setInterval(tick, period)
        tick()
      }, delay)
    }
    return haltPlayback
  }, [playing, activePlayer, maxStep, fps, haltPlayback])

  useEffect(() => {
    if (!speedOpen) return
    speedSlider.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!speedControl.current?.contains(event.target as Node)) setSpeedOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [speedOpen])

  useEffect(() => () => {
    haltPlayback()
    cancelGlide()
  }, [haltPlayback])

  const seekTo = (index: number) => {
    if (!canPlay || !Number.isFinite(index)) return
    haltPlayback()
    setPlaying(false)
    cancelGlide()
    setStep(Math.max(0, Math.min(Math.trunc(index), maxStep)))
  }

  const changeFPS = (next: number) => {
    if (!canPlay || !Number.isFinite(next) || next < MIN_FPS || next > MAX_FPS || next === fps) return
    // Invalidate a queued old-rate tick immediately, without pausing or cancelling the glide.
    haltPlayback()
    setFPS(next)
  }

  const playPause = () => {
    if (playing) {
      haltPlayback()
      // Freeze the frame this click saw as well as invalidating pending timer callbacks.
      setStep(step)
      setPlaying(false)
      return
    }
    if (step >= maxStep) {
      cancelGlide()
      setStep(0)
    }
    lastTick.current = performance.now()
    setPlaying(true)
  }

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
  // A key pressed on a control keeps its own meaning: space on a focused button already clicks it.
  const playPauseRef = useRef(playPause)
  playPauseRef.current = playPause
  useEffect(() => {
    if (!canPlay) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || event.defaultPrevented) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as Element | null
      if (target && target.closest && target.closest('button, a[href], input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault() // otherwise the page scrolls
      playPauseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canPlay])

  return (
    <div className="midst-tiptap-player" data-player="tiptap">
      <div className={`editor${hasScrollbar ? '' : ' editor--hide-scrollbar'}`} style={{
        fontFamily: `${family}, ${family === 'Courier' ? 'monospace' : /Bell|Garamond|Times/.test(family) ? 'serif' : 'sans-serif'}`,
        fontSize: size,
      }}>
        <EditorContent editor={editor} />
      </div>
      <div className="control-container">
        <div className="controls" onKeyDown={event => event.stopPropagation()}>
          <div className="timeline-control" ref={timelineRef}>
          <input type="range" aria-label={i18n._('player.timeline')} aria-valuetext={labelText ?? undefined} className="progress-bar"
            min={0} max={maxStep} step={1} value={Math.min(step, maxStep)}
            disabled={!canPlay}
            onKeyDown={event => {
              // Scrubbing leaves this range focused; its controls bar stops the document shortcut.
              if (!canPlay || event.key !== ' ' || event.repeat || event.defaultPrevented) return
              if (event.altKey || event.ctrlKey || event.metaKey) return
              event.preventDefault()
              playPause()
            }}
            onChange={event => seekTo(Number(event.target.value))} />
            <div className="draft-markers" ref={markerRow}>
              {markers.map((marker, i) => <button key={i} type="button" className="draft-marker"
                style={{ left: `${marker.index / Math.max(1, maxStep) * 100}%` }}
                title={marker.label} aria-label={i18n._('player.jumpTo', { draft: marker.label })} disabled={!activePlayer}
                onClick={() => { haltPlayback(); setPlaying(false); cancelGlide(); setStep(marker.index) }}>
                <span className="draft-marker-name">{marker.label}</span></button>)}
            </div>
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
            <div className="playback-speed-control" ref={speedControl}
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setSpeedOpen(false) }}
              onKeyDown={event => {
                if (event.key !== 'Escape' || !speedOpen) return
                event.preventDefault()
                setSpeedOpen(false)
                speedButton.current?.focus()
              }}>
              <button type="button" className="control-button" aria-label={i18n._('player.playbackSpeed')}
                ref={speedButton} aria-expanded={speedOpen} disabled={!canPlay}
                onClick={() => setSpeedOpen(open => !open)}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M3 19a10 10 0 1 1 18 0Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="m12 13 4-4M6 13H5m3-6L7 6m5-1V4m6 9h1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="13" r="2" fill="currentColor" />
                </svg>
              </button>
              {speedOpen && (
                <div className="playback-speed-popup" role="group" aria-label={i18n._('player.playbackSpeedControls')}>
                  <span aria-hidden="true">{MAX_FPS}</span>
                  <input type="range" className="playback-speed-slider" ref={speedSlider}
                    aria-label={i18n._('player.playbackFrameRate')} aria-orientation="vertical"
                    aria-valuetext={i18n._('player.framesPerSecond', { fps: displayFPS(fps) })}
                    min={MIN_FPS} max={MAX_FPS} step="any" value={fps} disabled={!canPlay}
                    onChange={event => changeFPS(Number(event.target.value))} />
                  <span aria-hidden="true">{MIN_FPS}</span>
                  <output className="playback-speed-value" aria-live="off">{i18n._('player.fpsShort', { fps: displayFPS(fps) })}</output>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
