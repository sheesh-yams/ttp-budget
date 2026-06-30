'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, UtensilsCrossed, Coffee, Truck, StickyNote, Pencil } from 'lucide-react'
import type { BannerType } from '@prisma/client'

export interface BannerPreset {
  type: BannerType
  label: string
  defaultLabel: string
  defaultDuration: number
  icon: React.ReactNode
}

export const BANNER_PRESETS: BannerPreset[] = [
  { type: 'MEAL_BREAK',   label: 'Meal Break',    defaultLabel: 'Lunch',        defaultDuration: 60, icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
  { type: 'COFFEE_BREAK', label: 'Coffee Break',  defaultLabel: 'Coffee',       defaultDuration: 15, icon: <Coffee className="h-3.5 w-3.5" /> },
  { type: 'COMPANY_MOVE', label: 'Company Move',  defaultLabel: 'Company Move', defaultDuration: 30, icon: <Truck className="h-3.5 w-3.5" /> },
  { type: 'NOTE',         label: 'Note',          defaultLabel: '',             defaultDuration: 0,  icon: <StickyNote className="h-3.5 w-3.5" /> },
  { type: 'CUSTOM',       label: 'Custom',        defaultLabel: '',             defaultDuration: 0,  icon: <Pencil className="h-3.5 w-3.5" /> },
]

interface Props {
  onSelect: (preset: BannerPreset, label: string, duration: number) => void
}

export function BannerMenu({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [customLabel, setCustomLabel]     = useState('')
  const [customDuration, setCustomDuration] = useState('')
  const [noteLabel, setNoteLabel]         = useState('')
  const [active, setActive]               = useState<BannerType | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handlePreset(p: BannerPreset) {
    if (p.type === 'CUSTOM' || p.type === 'NOTE') {
      setActive(p.type)
      return
    }
    onSelect(p, p.defaultLabel, p.defaultDuration)
    setOpen(false)
  }

  function handleCustomSubmit(p: BannerPreset) {
    const label = (p.type === 'NOTE' ? noteLabel : customLabel).trim() || p.defaultLabel
    const dur = p.type === 'NOTE' ? 0 : (parseInt(customDuration) || p.defaultDuration)
    onSelect(p, label, dur)
    setOpen(false)
    setActive(null)
    setCustomLabel('')
    setCustomDuration('')
    setNoteLabel('')
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-dashed border-muted-foreground/30"
        onClick={() => { setOpen(v => !v); setActive(null) }}
      >
        <ChevronDown className="h-3 w-3" />
        Add Banner
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-52 rounded-xl border border-border bg-popover shadow-xl py-1">
          {active ? (
            <div className="px-3 py-2 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {BANNER_PRESETS.find(p => p.type === active)?.label}
              </p>
              {active === 'NOTE' ? (
                <input
                  autoFocus
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="Note label"
                  value={noteLabel}
                  onChange={e => setNoteLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(BANNER_PRESETS.find(p => p.type === 'NOTE')!) }}
                />
              ) : (
                <>
                  <input
                    autoFocus
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                    placeholder="Label"
                    value={customLabel}
                    onChange={e => setCustomLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(BANNER_PRESETS.find(p => p.type === 'CUSTOM')!) }}
                  />
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                    placeholder="Duration (min)"
                    value={customDuration}
                    onChange={e => setCustomDuration(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(BANNER_PRESETS.find(p => p.type === 'CUSTOM')!) }}
                  />
                </>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded bg-primary px-2 py-1 text-xs text-white font-medium"
                  onClick={() => handleCustomSubmit(BANNER_PRESETS.find(p => p.type === active)!)}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setActive(null); setCustomLabel(''); setCustomDuration(''); setNoteLabel('') }}
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            BANNER_PRESETS.map(p => (
              <button
                key={p.type}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                onClick={() => handlePreset(p)}
              >
                <span className="text-muted-foreground">{p.icon}</span>
                {p.label}
                {p.type !== 'NOTE' && p.type !== 'CUSTOM' && (
                  <span className="ml-auto text-xs text-muted-foreground">{p.defaultDuration}m</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
