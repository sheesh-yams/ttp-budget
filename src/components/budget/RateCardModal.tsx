'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { upsertRateCard } from '@/server/actions/rates'
import { centsToRate, rateToCents } from '@/lib/money'
import type { RateCard } from '@prisma/client'

const CATEGORIES = [
  { value: 'CREW',           label: 'Crew' },
  { value: 'EQUIPMENT',      label: 'Equipment' },
  { value: 'POST',           label: 'Post' },
  { value: 'LOCATION',       label: 'Location' },
  { value: 'TALENT',         label: 'Talent' },
  { value: 'TRAVEL',         label: 'Travel' },
  { value: 'CATERING',       label: 'Catering' },
  { value: 'INSURANCE',      label: 'Insurance' },
  { value: 'PRODUCTION_FEE', label: 'Production fee' },
  { value: 'MISC',           label: 'Misc' },
]

const UNITS = [
  { value: 'HOUR',     label: 'Hour' },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'DAY',      label: 'Day' },
  { value: 'WEEK',     label: 'Week' },
  { value: 'FLAT',     label: 'Flat' },
  { value: 'EACH',     label: 'Each' },
  { value: 'MILE',     label: 'Mile' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  card?: RateCard | null
  onSaved: () => void
}

export function RateCardModal({ open, onOpenChange, card, onSaved }: Props) {
  const [pending, startTransition] = useTransition()

  const [role,     setRole]     = useState('')
  const [category, setCategory] = useState('CREW')
  const [unit,     setUnit]     = useState('DAY')
  const [rate,     setRate]     = useState('')
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')

  // Reset form whenever the modal opens (or the card being edited changes)
  useEffect(() => {
    if (open) {
      setRole(card?.role ?? '')
      setCategory(card?.category ?? 'CREW')
      setUnit(card?.defaultUnit ?? 'DAY')
      setRate(card ? centsToRate(card.defaultRateCents) : '')
      setNotes(card?.notes ?? '')
      setError('')
    }
  }, [open, card])

  function handleSubmit() {
    if (!role.trim()) { setError('Role / description is required'); return }
    const rateCents = rateToCents(rate)
    if (isNaN(rateCents) || rateCents < 0) { setError('Enter a valid rate'); return }
    setError('')

    startTransition(async () => {
      const res = await upsertRateCard(card?.id ?? null, {
        role:             role.trim(),
        category:         category as RateCard['category'],
        defaultUnit:      unit     as RateCard['defaultUnit'],
        defaultRateCents: rateCents,
        notes:            notes.trim() || null,
      })
      if (res.success) {
        onSaved()
        onOpenChange(false)
        return
      }
      setError((res as { success: false; error: string }).error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{card ? 'Edit rate card' : 'Add rate card'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Role */}
          <div className="grid gap-1.5">
            <Label htmlFor="rc-role">Role / description</Label>
            <Input
              id="rc-role"
              placeholder="e.g. Director of Photography"
              value={role}
              onChange={e => setRole(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            />
          </div>

          {/* Category + Unit row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Default unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rate */}
          <div className="grid gap-1.5">
            <Label htmlFor="rc-rate">Default rate ($)</Label>
            <Input
              id="rc-rate"
              type="number"
              min="0"
              step="50"
              placeholder="0"
              value={rate}
              onChange={e => setRate(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            />
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="rc-notes">Notes</Label>
            <Input
              id="rc-notes"
              placeholder="Optional"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? 'Saving…' : card ? 'Save changes' : 'Add rate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
