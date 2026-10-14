import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { IMidstFile } from '../../store/types'
import { ChangeObj, reconstructHTML } from './helpers'
import { clampLabelCentre } from './timestamp-position'
import { Glide, glideTo, gliding, scrollParent, targetScrollTop } from './follow'
import './player.css'
import { installFonts } from '../../fonts'

// Lato and Helvetica Neue for the player, wherever it is mounted (the site entry also calls this).
installFonts()

const extensions = [StarterKit.configure({
  bulletList: false, orderedList: false, blockquote: false, code: false,
  codeBlock: false, heading: false, horizontalRule: false, listItem: false, strike: false,
})]

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

export default function MidstPlayer({ data, activePlayer, cursorFollowing, hasScrollbar }: Props) {
  // The loader validates B/C and exposes snapshots. Whole-document replacements preserve unchanged
  // frames too, unlike compareStrings's early return, without changing the editor's copied helpers.
  const history = useMemo<ChangeObj[]>(() => {
    return (data ? data.editorTimelineFrames : []).map(frame => {
      const change = { front: 0, end: 0, inserted: frame.content, t: new Date(frame.timestamp), pos: frame.cursorPosition }
      // step keeps `end` characters from the previous document. Zero retains none.
      return change
    })
  }, [data])
  const maxStep = Math.max(0, history.length - 1)
  const canPlay = activePlayer && history.length >= 2
  const markers = useMemo(() => {
    if (!data) return []
    const raw = data.presentation ? data.presentation.draftMarkers : data.meta.editorDraftMarkers
    if (!Array.isArray(raw)) return []
    const count = data.sourceHistoryLength === undefined ? history.length : data.sourceHistoryLength
    return raw.reduce<Array<{ index: number, label: string }>>((out, marker) => {
      if (!marker || typeof marker !== 'object') return out
      const index = data.presentation ? marker.index : marker.timelineIndex
      if (!Number.isSafeInteger(index) || index < 0 || index >= count) return out
      const label = typeof marker.name === 'string' && marker.name ? marker.name
        : typeof marker.defaultName === 'string' && marker.defaultName ? marker.defaultName : 'Draft'
      out.push({ index, label })
      return out
    }, [])
  }, [data, history.length])
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
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [markers, maxStep])
  const family = data && typeof data.meta.editorFontFamily === 'string' && data.meta.editorFontFamily.trim()
    ? data.meta.editorFontFamily : 'Helvetica'
  const size = data && Number.isFinite(data.meta.editorFontSize) && data.meta.editorFontSize > 0
    ? data.meta.editorFontSize : 14
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
    editorProps: { attributes: { class: 'editable', 'aria-label': 'Poem replay' } },
  })

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
    editor.commands.setContent(reconstructHTML('', history.slice(Math.min(step, maxStep), Math.min(step, maxStep) + 1), 0), false, { preserveWhitespace: true })
    const after = editor.state.doc
    const changed = after.content.findDiffStart(before.content)
    const scroller = scrollParent(editor.view.dom as HTMLElement)
    if (activePlayer && cursorFollowing && changed != null && scroller) {
      const point = editor.view.coordsAtPos(Math.min(changed, after.content.size))
      const to = targetScrollTop(point, scroller.getBoundingClientRect(), scroller.scrollTop, scroller.scrollHeight)
      if (to != null) glide.current = glideTo(scroller, to, glide.current)
    }
    if (step >= maxStep) { haltPlayback(); setPlaying(false) }
  }, [editor, history, step, maxStep, activePlayer, cursorFollowing, haltPlayback])

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
  const currentFrame = data?.editorTimelineFrames?.[Math.min(step, maxStep)]
  const isSynthetic = (data?.sourceHistoryLength ?? 1) === 0
  const rawTimestamp = currentFrame?.timestamp
  const hasRealTimestamp = currentFrame != null && !isSynthetic
    && rawTimestamp != null && Number.isFinite(rawTimestamp)
  const frameTimestamp = hasRealTimestamp ? currentFrame!.timestamp : null
  const playheadPercent = maxStep > 0 ? Math.min(step, maxStep) / maxStep * 100 : 0
  // The formatted label text — depend on this, not on frameTimestamp (raw ms, different every frame).
  const labelText = frameTimestamp != null
    ? new Date(frameTimestamp).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : currentFrame != null ? 'edit time unavailable' : null
  // Continuous bounding: clamp the label's CENTRE so the label stays within the timeline container.
  // Measure the rendered label width; re-measure on container resize (ResizeObserver) so a paused
  // resize does not leave a stale width. Measurement runs on text change and resize, not per frame.
  const timestampRef = useRef<HTMLDivElement>(null)
  const [labelWidthPct, setLabelWidthPct] = useState(0)
  const measureLabel = useCallback(() => {
    const el = timestampRef.current
    if (!el || !el.parentElement) return
    const containerWidth = el.parentElement.offsetWidth
    if (containerWidth > 0) setLabelWidthPct((el.offsetWidth / containerWidth) * 100)
  }, [])
  useEffect(measureLabel, [labelText, measureLabel])
  useEffect(() => {
    const el = timestampRef.current
    if (!el || !el.parentElement) return
    const observer = new ResizeObserver(measureLabel)
    observer.observe(el.parentElement)
    return () => observer.disconnect()
  }, [measureLabel])
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
          <div className="timeline-control">
          <input type="range" aria-label="Timeline" aria-valuetext={labelText ?? undefined} className="progress-bar"
            min={0} max={maxStep} step={1} value={Math.min(step, maxStep)}
            disabled={!canPlay}
            onChange={event => seekTo(Number(event.target.value))} />
            <div className="draft-markers" ref={markerRow}>
              {markers.map((marker, i) => <button key={i} type="button" className="draft-marker"
                style={{ left: `${marker.index / Math.max(1, maxStep) * 100}%` }}
                title={marker.label} aria-label={`Jump to ${marker.label}`} disabled={!activePlayer}
                onClick={() => { haltPlayback(); setPlaying(false); cancelGlide(); setStep(marker.index) }}>
                <span className="draft-marker-name">{marker.label}</span></button>)}
            </div>
            {labelText != null && (
              <div ref={timestampRef} data-guide="frame-edit-time" aria-hidden="true"
                className={`frame-timestamp${frameTimestamp == null ? ' frame-timestamp--unavailable' : ''}`}
                style={{ left: playheadLeft, transform: playheadTransform }}>
                {labelText}
              </div>
            )}
          </div>
          <div className="playback-controls">
            <button type="button" className="control-button" aria-label="Skip to start"
              disabled={!canPlay} onClick={() => seekTo(0)}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 5v14M19 5 8 12l11 7Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" aria-label={playing ? 'Pause' : 'Play'}
              className={`play-pause-button control-button${playing ? ' playing' : ''}`}
              onClick={playPause} disabled={!canPlay}>
              {playing ? <><span className="pause-rectangle" /><span className="pause-rectangle" /></> : '▶'}
            </button>
            <button type="button" className="control-button" aria-label="Skip to end"
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
              <button type="button" className="control-button" aria-label="Playback speed"
                ref={speedButton} aria-expanded={speedOpen} disabled={!canPlay}
                onClick={() => setSpeedOpen(open => !open)}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M3 19a10 10 0 1 1 18 0Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="m12 13 4-4M6 13H5m3-6L7 6m5-1V4m6 9h1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="13" r="2" fill="currentColor" />
                </svg>
              </button>
              {speedOpen && (
                <div className="playback-speed-popup" role="group" aria-label="Playback speed controls">
                  <span aria-hidden="true">{MAX_FPS}</span>
                  <input type="range" className="playback-speed-slider" ref={speedSlider}
                    aria-label="Playback frame rate" aria-orientation="vertical"
                    aria-valuetext={`${displayFPS(fps)} frames per second`}
                    min={MIN_FPS} max={MAX_FPS} step="any" value={fps} disabled={!canPlay}
                    onChange={event => changeFPS(Number(event.target.value))} />
                  <span aria-hidden="true">{MIN_FPS}</span>
                  <output className="playback-speed-value" aria-live="off">{displayFPS(fps)} fps</output>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
