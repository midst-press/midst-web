import React, { ReactElement, useLayoutEffect, useRef, useState } from 'react'
import { MAX_NOTE_CHARACTERS, Markup, applyMarkup, renderProcessNote } from '../processNote'

// A process note's editor (#292, #312): a Markdown box with buttons that wrap the selection, and a preview below it
// (not in its place, so the box stays in reach of `required`), rendered as the review page renders a poet's note.

interface Props {
  id: string
  label: string
  value: string
  onChange: (text: string) => void
  disabled: boolean
}

function NoteEditor({ id, label, value, onChange, disabled }: Props): ReactElement {
  const [previewing, setPreviewing] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const [selection, setSelection] = useState<{ start: number, end: number } | null>(null)

  // After a button has changed the note, put the selection where applyMarkup says, once the text is in the box.
  useLayoutEffect(() => {
    if (!selection || !box.current) return
    box.current.focus()
    box.current.setSelectionRange(selection.start, selection.end)
    setSelection(null)
  }, [selection])

  const markUp = (kind: Markup) => {
    if (!box.current) return
    const edit = applyMarkup(value, box.current.selectionStart, box.current.selectionEnd, kind)
    if (edit.text.length > MAX_NOTE_CHARACTERS) return
    onChange(edit.text)
    setSelection({ start: edit.start, end: edit.end })
  }

  return (
    <div className="process-note-field">
      <label htmlFor={id}>{label}</label>
      <div className="process-note-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        <button type="button" className="app-button" onClick={() => markUp('bold')} disabled={disabled}>Bold</button>
        <button type="button" className="app-button" onClick={() => markUp('italic')} disabled={disabled}>Italic</button>
        <button type="button" className="app-button" onClick={() => markUp('link')} disabled={disabled}>Link</button>
        <button type="button" className="app-button" aria-pressed={previewing} onClick={() => setPreviewing(p => !p)} disabled={disabled}>Preview</button>
      </div>
      <textarea id={id} ref={box} required maxLength={MAX_NOTE_CHARACTERS} rows={10} value={value}
        onChange={e => onChange(e.target.value)} disabled={disabled} />
      {previewing && <div className="process-note-preview" aria-label={`${label} preview`} role="region"
        dangerouslySetInnerHTML={{ __html: renderProcessNote(value) }} />}
    </div>
  )
}

export default NoteEditor
