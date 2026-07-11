'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type SortField = 'sceneNumber' | 'pages' | 'intExt' | 'timeOfDay' | 'location'
export type SortDir = 'asc' | 'desc'

const FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'sceneNumber', label: 'Scene #' },
  { value: 'pages', label: 'Page count' },
  { value: 'intExt', label: 'INT/EXT' },
  { value: 'timeOfDay', label: 'Time of Day' },
  { value: 'location', label: 'Location' },
]

interface Props {
  open: boolean
  onClose: () => void
  onApply: (field: SortField, dir: SortDir) => void
}

export function SortDialog({ open, onClose, onApply }: Props) {
  const [mounted, setMounted] = useState(false)
  const [field, setField] = useState<SortField>('sceneNumber')
  const [dir, setDir] = useState<SortDir>('asc')

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (open) { setField('sceneNumber'); setDir('asc') } }, [open])

  if (!mounted || !open) return null

  const modal = (
    // z-[1300]: matches select.tsx/popover.tsx/confirm-dialog.tsx — this is
    // portaled to document.body, so it must outrank DialogContent's z-[1200]
    // if ever opened from inside a shadcn Dialog.
    <div className="fixed inset-0 z-[1300] flex items-start justify-center overflow-y-auto py-10">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">Sort scenes</h2>
          <button type="button" onClick={onClose} className="rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Reorders the scenes in the current day. This doesn&apos;t touch banners or other days.
          </p>

          <div>
            <p className="text-xs font-medium mb-1.5">Sort by</p>
            <div className="space-y-1">
              {FIELD_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="sort-field"
                    checked={field === opt.value}
                    onChange={() => setField(opt.value)}
                    className="accent-primary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium mb-1.5">Direction</p>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sort-dir" checked={dir === 'asc'} onChange={() => setDir('asc')} className="accent-primary" />
                Ascending
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sort-dir" checked={dir === 'desc'} onChange={() => setDir('desc')} className="accent-primary" />
                Descending
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
          <Button onClick={() => onApply(field, dir)} size="sm">Apply</Button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
