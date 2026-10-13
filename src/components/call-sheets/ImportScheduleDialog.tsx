'use client'

// "Import from stripboard" on a call sheet, when the project has more than
// one shoot day: pick which day's schedule to bring in.

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { parseLocalDate } from '@/lib/time-format'
import type { ImportableShootDay } from '@/server/actions/call-sheets'

export function ImportScheduleDialog({ open, days, defaultDayId, replacing, pending, error, onCancel, onImport }: {
  open: boolean
  days: ImportableShootDay[]
  defaultDayId: string | null
  /** Rows already on the call sheet that the import replaces. */
  replacing: number
  pending: boolean
  error?: string | null
  onCancel: () => void
  onImport: (day: ImportableShootDay) => void
}) {
  const [chosen, setChosen] = useState<string | null>(defaultDayId)
  useEffect(() => { if (open) setChosen(defaultDayId) }, [open, defaultDayId])
  const day = days.find(d => d.id === chosen) ?? null

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !pending) onCancel() }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Import schedule — which day?</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5" role="radiogroup" aria-label="Shoot day">
          {days.map(d => {
            const on = d.id === chosen
            return (
              <button
                key={d.id} type="button" role="radio" aria-checked={on}
                onClick={() => setChosen(d.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${on
                  ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
              >
                <span className="min-w-0">
                  <span className="font-medium text-foreground">Day {d.dayNumber}{d.label ? ` — ${d.label}` : ''}</span>
                  <span className="ml-2 text-muted-foreground">
                    {parseLocalDate(d.date)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${d.itemCount ? 'text-muted-foreground' : 'text-muted-foreground/60 italic'}`}>
                  {d.itemCount ? `${d.itemCount} item${d.itemCount === 1 ? '' : 's'}` : 'nothing scheduled'}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {replacing > 0 ? `Replaces the ${replacing} row${replacing === 1 ? '' : 's'} on this call sheet. ` : ''}
          The call sheet is linked to that day (so “Sync from stripboard” keeps it up to date) and its date changes to match.
        </p>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button onClick={() => day && onImport(day)} disabled={!day || pending}>
            {pending ? 'Importing…' : day ? `Import Day ${day.dayNumber}` : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
