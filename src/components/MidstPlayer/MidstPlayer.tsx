import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { IMidstFile } from '../../store/types'
import { ChangeObj, reconstructHTML } from './helpers'
import { Glide, glideTo, gliding, scrollParent, targetScrollTop } from './follow'
import './player.css'
import { installFonts } from '../../fonts'

// Lato and Helvetica Neue for the player, wherever it is mounted (the site entry also calls this).
installFonts()

const extensions = [StarterKit.configure({
  bulletList: false, orderedList: false, blockquote: false, code: false,
  codeBlock: false, heading: false, horizontalRule: false, listItem: false, strike: false,
})]

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
  const glide = useRef<Glide | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const generation = useRef(0)
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
    cancelGlide()
  }, [data, maxStep, haltPlayback])

  useEffect(() => {
    if (!activePlayer || !cursorFollowing) cancelGlide()
    if (!activePlayer) { haltPlayback(); setPlaying(false) }
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
    const interval = setInterval(() => {
      if (generation.current !== run) return
      setStep(value => generation.current !== run || gliding(glide.current) ? value : Math.min(value + 1, maxStep))
    }, 60)
    timer.current = interval
    return () => { generation.current += 1; clearInterval(interval); if (timer.current === interval) timer.current = undefined }
  }, [playing, activePlayer, maxStep])

  useEffect(() => () => {
    haltPlayback()
    cancelGlide()
  }, [haltPlayback])

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
  // Continuous bounding: clamp the label so it stays within the timeline container.
  // Measure the rendered label width and bound left between 0 and 100% minus label width.
  const timestampRef = useRef<HTMLDivElement>(null)
  const [labelWidthPct, setLabelWidthPct] = useState(0)
  useEffect(() => {
    const el = timestampRef.current
    if (!el || !el.parentElement) return
    const containerWidth = el.parentElement.offsetWidth
    if (containerWidth > 0) setLabelWidthPct((el.offsetWidth / containerWidth) * 100)
  }, [frameTimestamp, playheadPercent])
  const clampedLeft = Math.max(0, Math.min(playheadPercent, 100 - labelWidthPct))
  const playheadLeft = `${clampedLeft}%`
  const playheadTransform = 'translateX(-50%)'

  // Spacebar plays and pauses the poem on screen, wherever focus is (GitHub #51). Before this the
  // key only worked once the play button had been clicked and so held focus; a freshly loaded page
  // has nothing focused. Every poem is mounted in the carousel, so only the active player listens.
  // A key pressed on a control keeps its own meaning: space on a focused button already clicks it.
  const playPauseRef = useRef(playPause)
  playPauseRef.current = playPause
  const canPlay = activePlayer && history.length >= 2
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
          <button type="button" aria-label={playing ? 'Pause' : 'Play'}
            className={`play-pause-button control-button${playing ? ' playing' : ''}`}
            onClick={playPause} disabled={!activePlayer || history.length < 2}>
            {playing ? <><span className="pause-rectangle" /><span className="pause-rectangle" /></> : '▶'}
          </button>
          <div className="timeline-control">
          <input type="range" aria-label="Timeline" className="progress-bar"
            min={0} max={maxStep} step={1} value={Math.min(step, maxStep)}
            disabled={!activePlayer || history.length < 2}
            onChange={event => { haltPlayback(); setPlaying(false); cancelGlide(); setStep(Number(event.target.value)) }} />
            <div className="draft-markers" ref={markerRow}>
              {markers.map((marker, i) => <button key={i} type="button" className="draft-marker"
                style={{ left: `${marker.index / Math.max(1, maxStep) * 100}%` }}
                title={marker.label} aria-label={`Jump to ${marker.label}`} disabled={!activePlayer}
                onClick={() => { haltPlayback(); setPlaying(false); cancelGlide(); setStep(marker.index) }}>
                <span className="draft-marker-name">{marker.label}</span></button>)}
            </div>
            {frameTimestamp != null && (
              <div ref={timestampRef} className="frame-timestamp" role="status" aria-label="Frame edit time"
                style={{ left: playheadLeft, transform: playheadTransform }}>
                {new Date(frameTimestamp).toLocaleString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </div>
            )}
            {frameTimestamp == null && currentFrame != null && (
              <div ref={timestampRef} className="frame-timestamp frame-timestamp--unavailable" role="status"
                aria-label="Frame edit time unavailable"
                style={{ left: playheadLeft, transform: playheadTransform }}>
                edit time unavailable
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
