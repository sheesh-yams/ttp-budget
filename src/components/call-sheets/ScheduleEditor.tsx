'use client'

import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import type { ScheduleBlock, CrewDept, TalentMember } from '@/server/actions/call-sheets'
import { WhoNeededPicker } from './WhoNeededPicker'

interface Props {
  schedule: ScheduleBlock[]
  onChange: (schedule: ScheduleBlock[]) => void
  readonly?: boolean
  crew?:     CrewDept[]
  talent?:   TalentMember[]
}

/** Normalise a block so startTime is always defined (backward-compat with old `time` field). */
function startOf(block: ScheduleBlock): string {
  return block.startTime ?? block.time ?? ''
}

/** Suggest a time 30 min after the given HH:MM string. */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function ScheduleEditor({ schedule, onChange, readonly = false, crew = [], talent = [] }: Props) {
  function add() {
    const last = schedule.at(-1)
    const lastEnd = last?.endTime ?? startOf(last ?? { startTime: '07:00', label: '' })
    const nextStart = addMinutes(lastEnd, 0)   // pick up right after last block ends
    const nextEnd   = addMinutes(nextStart, 30)
    onChange([...schedule, { startTime: nextStart, endTime: nextEnd, label: '', whoNeeded: '' }])
  }

  function remove(i: number) {
    onChange(schedule.filter((_, idx) => idx !== i))
  }

  function update(i: number, field: keyof ScheduleBlock, value: string) {
    onChange(schedule.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
  }

  function moveUp(i: number) {
    if (i === 0) return
    const next = [...schedule]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
  }

  function moveDown(i: number) {
    if (i === schedule.length - 1) return
    const next = [...schedule]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    onChange(next)
  }

  // ── Readonly view ──────────────────────────────────────────────────────────
  if (readonly) {
    return (
      <div className="space-y-0 divide-y rounded-lg border">
        {schedule.map((block, i) => (
          <div key={i} className="flex items-start gap-4 px-4 py-2.5">
            <div className="shrink-0 pt-0.5 min-w-[80px]">
              <span className="font-mono text-sm font-semibold text-foreground">
                {startOf(block)}
                {block.endTime && (
                  <span className="font-normal text-muted-foreground"> – {block.endTime}</span>
                )}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground">{block.label}</p>
              {block.whoNeeded && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium">Who: </span>{block.whoNeeded}
                </p>
              )}
              {block.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">{block.notes}</p>
              )}
            </div>
          </div>
        ))}
        {schedule.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground italic">No schedule added yet.</p>
        )}
      </div>
    )
  }

  // ── Editable view ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Column headers */}
      {schedule.length > 0 && (
        <div className="grid grid-cols-[20px_112px_8px_80px_1fr_1fr_24px] gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span />
          <span>Start</span>
          <span />
          <span>End</span>
          <span>Description</span>
          <span>Who&apos;s Needed</span>
          <span />
        </div>
      )}

      {schedule.map((block, i) => (
        <div key={i} className="group/block space-y-1">
          <div className="flex items-center gap-2">
            {/* Reorder */}
            <div className="flex flex-col gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity">
              <button type="button" onClick={() => moveUp(i)} disabled={i === 0}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20">
                <ChevronUp className="h-2.5 w-2.5" />
              </button>
              <button type="button" onClick={() => moveDown(i)} disabled={i === schedule.length - 1}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20">
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
            </div>

            {/* Start time */}
            <input
              type="time"
              value={startOf(block)}
              onChange={e => update(i, 'startTime', e.target.value)}
              className="w-28 shrink-0 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm font-mono shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <span className="text-muted-foreground text-xs shrink-0">–</span>

            {/* End time */}
            <input
              type="time"
              value={block.endTime ?? ''}
              onChange={e => update(i, 'endTime', e.target.value)}
              className="w-24 shrink-0 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm font-mono shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Label */}
            <input
              placeholder="Block description…"
              value={block.label}
              onChange={e => update(i, 'label', e.target.value)}
              className="flex-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Who's needed */}
            <WhoNeededPicker
              value={block.whoNeeded ?? ''}
              crew={crew}
              talent={talent}
              onChange={v => update(i, 'whoNeeded', v)}
            />

            {/* Remove */}
            <button type="button" onClick={() => remove(i)}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover/block:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Notes sub-row */}
          <input
            placeholder="Notes (optional)"
            value={block.notes ?? ''}
            onChange={e => update(i, 'notes', e.target.value)}
            className="w-full bg-transparent pl-8 px-2 py-0.5 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
          />
        </div>
      ))}

      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors pt-1">
        <Plus className="h-3.5 w-3.5" />
        Add block
      </button>
    </div>
  )
}
