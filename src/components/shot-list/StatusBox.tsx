'use client'

import { useState } from 'react'
import { Check, Ban } from 'lucide-react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import type { ShotStatusValue } from '@/lib/shot-list'

const LABEL: Record<ShotStatusValue, string> = { TO_SHOOT: 'To shoot', DONE: 'Done', SKIPPED: 'Skipped' }

/**
 * Click: To shoot ↔ Done. Right-click (or long-press on a phone): menu with
 * Skipped. Read-only viewers see the box without any of that.
 */
export function StatusBox({
  status, onChange, disabled, size = 20,
}: {
  status:    ShotStatusValue
  onChange?: (s: ShotStatusValue) => void
  disabled?: boolean
  size?:     number
}) {
  const [menu, setMenu] = useState(false)
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const interactive = !!onChange && !disabled

  const box = (
    <button
      type="button"
      aria-label={`Status: ${LABEL[status]}${interactive ? ' — click to toggle done, right-click for more' : ''}`}
      disabled={!interactive}
      onClick={e => { e.stopPropagation(); if (interactive) onChange!(status === 'DONE' ? 'TO_SHOOT' : 'DONE') }}
      onContextMenu={e => { if (!interactive) return; e.preventDefault(); e.stopPropagation(); setMenu(true) }}
      onTouchStart={() => { if (interactive) setPressTimer(setTimeout(() => setMenu(true), 500)) }}
      onTouchEnd={() => { if (pressTimer) clearTimeout(pressTimer) }}
      style={{ width: size, height: size }}
      className={[
        'grid shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors',
        status === 'DONE' ? 'border-primary bg-primary text-white' : status === 'SKIPPED' ? 'border-[#D8D5D0] bg-white text-[#B0ACA6]' : 'border-[#CFCBC5] bg-white',
        interactive ? 'cursor-pointer hover:border-primary' : 'cursor-default',
      ].join(' ')}
    >
      {status === 'DONE' && <Check className="h-3 w-3" strokeWidth={3} />}
      {status === 'SKIPPED' && <Ban className="h-3 w-3" strokeWidth={2.5} />}
    </button>
  )

  if (!interactive) return box
  return (
    <Popover open={menu} onOpenChange={setMenu}>
      <PopoverAnchor asChild>{box}</PopoverAnchor>
      <PopoverContent align="start" className="w-40 rounded-[4px] p-1" onClick={e => e.stopPropagation()}>
        {(['TO_SHOOT', 'DONE', 'SKIPPED'] as const).map(s => (
          <button
            key={s} type="button"
            onClick={() => { setMenu(false); if (s !== status) onChange!(s) }}
            className={`flex w-full items-center gap-2 rounded-[3px] px-2.5 py-1.5 text-left text-sm hover:bg-[#FAF9F7] ${s === status ? 'font-medium' : ''}`}
          >
            <StatusBox status={s} size={14} />
            {LABEL[s]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
