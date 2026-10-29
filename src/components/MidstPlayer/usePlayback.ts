// The player's playback (#389): which frame is shown, playing or paused, the frame rate, and the glide that follows the
// writing. Moved out of MidstPlayer unchanged; the component keeps the editor and the controls.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from '@tiptap/react'
import { Glide, glideTo, gliding, scrollParent, targetScrollTop } from '@midst-press/midst-format/follow'
import { IMidstFile } from '../../store/types'

export const MIN_FPS = 1
export const MAX_FPS = 60
export const DEFAULT_FPS = 11 // the web player opens at 11 fps (Annelyse, GitHub #89; midst-web #327)

interface Options {
  data: IMidstFile | null
  frames: IMidstFile['editorTimelineFrames']
  editor: Editor | null
  activePlayer: boolean
  cursorFollowing: boolean
}

export function usePlayback({ data, frames, editor, activePlayer, cursorFollowing }: Options) {
  const maxStep = Math.max(0, frames.length - 1)
  const canPlay = activePlayer && frames.length >= 2
  const [step, setStep] = useState(maxStep)
  const [playing, setPlaying] = useState(false)
  const [fps, setFPS] = useState(DEFAULT_FPS)
  const glide = useRef<Glide | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const generation = useRef(0)
  const lastTick = useRef(0)
  const haltPlayback = useCallback(() => {
    generation.current += 1
    if (timer.current) clearInterval(timer.current)
    timer.current = undefined
  }, [])

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
    editor.commands.setContent(frames[Math.min(step, maxStep)]?.content ?? '', {
      emitUpdate: false,
      parseOptions: { preserveWhitespace: true },
    })
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

  useEffect(() => () => {
    haltPlayback()
    cancelGlide()
  }, [haltPlayback])

  /** The timeline and the skip buttons: only when the poem can play. */
  const seekTo = (index: number) => {
    if (!canPlay || !Number.isFinite(index)) return
    jumpTo(Math.max(0, Math.min(Math.trunc(index), maxStep)))
  }

  /** A draft marker: straight to its frame (its button is off when the player is not active). */
  const jumpTo = (index: number) => {
    haltPlayback()
    setPlaying(false)
    cancelGlide()
    setStep(index)
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

  return { step, maxStep, canPlay, playing, fps, seekTo, jumpTo, changeFPS, playPause }
}
