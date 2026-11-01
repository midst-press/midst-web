// The playback speed button and its popup (#389): moved out of MidstPlayer unchanged.
import React, { useEffect, useRef, useState } from 'react'
import { IMidstFile } from '../../store/types'
import { MAX_FPS, MIN_FPS } from './usePlayback'
import { i18n } from '../../i18n'

const displayFPS = (fps: number) => String(Math.round(fps * 10) / 10)

interface Props {
  data: IMidstFile | null
  maxStep: number
  fps: number
  canPlay: boolean
  activePlayer: boolean
  // eslint-disable-next-line no-unused-vars -- the name says what the argument is
  onChange: (fps: number) => void
}

export default function SpeedControl({ data, maxStep, fps, canPlay, activePlayer, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const control = useRef<HTMLDivElement | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const slider = useRef<HTMLInputElement | null>(null)

  // Another poem, or the player put away: the popup closes.
  useEffect(() => setOpen(false), [data, maxStep])
  useEffect(() => { if (!activePlayer) setOpen(false) }, [activePlayer])

  useEffect(() => {
    if (!open) return
    slider.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return (
    <div className="playback-speed-control" ref={control}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        setOpen(false)
        button.current?.focus()
      }}>
      <button type="button" className="control-button" aria-label={i18n._('player.playbackSpeed')}
        ref={button} aria-expanded={open} disabled={!canPlay}
        onClick={() => setOpen(current => !current)}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 19a10 10 0 1 1 18 0Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m12 13 4-4M6 13H5m3-6L7 6m5-1V4m6 9h1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="13" r="2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="playback-speed-popup" role="group" aria-label={i18n._('player.playbackSpeedControls')}>
          <span aria-hidden="true">{MAX_FPS}</span>
          <input type="range" className="playback-speed-slider" ref={slider}
            aria-label={i18n._('player.playbackFrameRate')} aria-orientation="vertical"
            aria-valuetext={i18n._('player.framesPerSecond', { fps: displayFPS(fps) })}
            min={MIN_FPS} max={MAX_FPS} step="any" value={fps} disabled={!canPlay}
            onChange={event => onChange(Number(event.target.value))} />
          <span aria-hidden="true">{MIN_FPS}</span>
          <output className="playback-speed-value" aria-live="off">{i18n._('player.fpsShort', { fps: displayFPS(fps) })}</output>
        </div>
      )}
    </div>
  )
}
