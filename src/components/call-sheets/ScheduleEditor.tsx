'use client'

import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import type { ScheduleBlock } from '@/server/actions/call-sheets'

interface Props {
  schedule: ScheduleBlock[]
  onChange: (schedule: ScheduleBlock[]) => void
  readonly?: boolean
}

export function ScheduleEditor({ schedule, onChange, readonly = false }: Props) {
  function add() {
    const lastTime = schedule.at(-1)?.time ?? '07:00'
    // Suggest 30 min after last block
    const [h, m] = lastTime.split(':').map(Number)
    const totalMin = h * 60 + m + 30
    const nextTime = `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
    onChange([...schedule, { time: nextTime, label: '' }])
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

  if (readonly) {
    return (
      <div className="space-y-0 divide-y rounded-lg border">
        {schedule.map((block, i) => (
          <div key={i} className="flex items-start gap-4 px-4 py-2.5">
            <span className="font-mono text-sm font-semibold text-foreground w-12 shrink-0 pt-0.5">{block.time}</span>
            <div>
              <p className="text-sm text-foreground">{block.label}</p>
              {block.notes && <p className="text-xs text-muted-foreground mt-0.5">{block.notes}</p>}
            </div>
          </div>
        ))}
        {schedule.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground italic">No schedule added yet.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {schedule.map((block, i) => (
        <div key={i} className="group/block flex items-start gap-2">
          {/* Reorder */}
          <div className="flex flex-col gap-0.5 pt-1 opacity-0 group-hover/block:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => moveUp(i)}
              disabled={i === 0}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => moveDown(i)}
              disabled={i === schedule.length - 1}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* Time */}
          <input
            type="time"
            value={block.time}
            onChange={e => update(i, 'time', e.target.value)}
            className="w-24 shrink-0 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm font-mono shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {/* Label + notes */}
          <div className="flex-1 space-y-1">
            <input
              placeholder="Block description…"
              value={block.label}
              onChange={e => update(i, 'label', e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              placeholder="Notes (optional)"
              value={block.notes ?? ''}
              onChange={e => update(i, 'notes', e.target.value)}
              className="w-full bg-transparent px-2 py-0.5 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-transparent focus:border-input"
            />
          </div>

          {/* Remove */}
          <button
            type="button"
            onClick={() => remove(i)}
            className="mt-1.5 rounded p-0.5 text-muted-foreground opacity-0 group-hover/block:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors pt-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add block
      </button>
    </div>
  )
}
