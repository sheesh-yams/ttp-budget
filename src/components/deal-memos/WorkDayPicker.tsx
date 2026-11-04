'use client'

import { useEffect, useRef, useState } from 'react'

const PRESET_WORK_DAYS = [10, 12] as const

/**
 * 10-hour / 12-hour / Custom. Custom turns into a small hours input in place
 * (whole hours, 1–24 — e.g. a 4- or 6-hour shoot), saved on Enter or blur;
 * a memo already on a non-preset day opens with it showing.
 */
export function WorkDayPicker({ value, disabled, onChange }: {
  value: number; disabled: boolean; onChange: (hours: number) => void
}) {
  const isPreset = (PRESET_WORK_DAYS as readonly number[]).includes(value)
  const [custom, setCustom] = useState(!isPreset)
  const [draft, setDraft]   = useState(isPreset ? '' : String(value))
  const inputRef = useRef<HTMLInputElement>(null)
  // Follow the saved value whenever it changes (a preset click, Enter on a
  // custom number, or another tab): 10/12 light their button, anything else
  // shows in the custom input.
  useEffect(() => { setCustom(!isPreset); setDraft(isPreset ? '' : String(value)) }, [value, isPreset])

  const pill = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm transition-colors ${active ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-input text-muted-foreground hover:bg-muted/60'}`

  // Saved on Enter / blur, not per keystroke — typing "14" mustn't save a
  // 1-hour day on the way. Out of range snaps back to what's saved.
  function commit() {
    const n = Number(draft)
    const revert = () => { setCustom(!isPreset); setDraft(isPreset ? '' : String(value)) }
    // Empty (a number input also reports junk as '') or out of range: show what's saved.
    if (draft === '' || !Number.isInteger(n) || n < 1 || n > 24) return revert()
    if (n === value) return revert()   // e.g. typed 10 on a 10-hour memo → back to its button
    onChange(n)
  }

  return (
    <div className="flex gap-1">
      {PRESET_WORK_DAYS.map(h => (
        <button key={h} type="button" disabled={disabled}
          onClick={() => { setCustom(false); setDraft(''); onChange(h) }}
          className={pill(!custom && value === h)}>
          {h}-hour
        </button>
      ))}
      {custom ? (
        <label className={`${pill(true)} flex cursor-text items-center py-0`}>
          <input ref={inputRef} type="number" min={1} max={24} step={1} inputMode="numeric" disabled={disabled}
            value={draft} placeholder="8" aria-label="Custom work day (hours)"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={commit}
            style={{ width: `${Math.max(1, (draft || '8').length) + 0.4}ch` }}
            className="bg-transparent py-1.5 text-right tabular-nums outline-none placeholder:text-primary/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span>-hour</span>
        </label>
      ) : (
        <button type="button" disabled={disabled}
          onClick={() => { setCustom(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
          className={pill(false)}>
          Custom
        </button>
      )}
    </div>
  )
}
