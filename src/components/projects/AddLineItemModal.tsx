'use client'

import { useState, useTransition, useCallback } from 'react'
import { Search, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { searchRateCards, upsertLineItem } from '@/server/actions/budgets'
import { centsToRate, rateToCents } from '@/lib/money'
import type { RateCardOption } from '@/types'
import type { RateUnit } from '@prisma/client'

const UNITS: { value: RateUnit; label: string }[] = [
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
  accountId: string
  onAdded: () => void
}

export function AddLineItemModal({ open, onOpenChange, accountId, onAdded }: Props) {
  const [pending, startTransition] = useTransition()

  // Rate card search
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<RateCardOption[]>([])
  const [searching, setSearching]   = useState(false)
  const [selected, setSelected]     = useState<RateCardOption | null>(null)

  // Form fields
  const [description, setDescription] = useState('')
  const [quantity, setQuantity]       = useState('1')
  const [unit, setUnit]               = useState<RateUnit>('DAY')
  const [rate, setRate]               = useState('')
  const [markup, setMarkup]           = useState('')
  const [notes, setNotes]             = useState('')
  const [error, setError]             = useState('')

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await searchRateCards(q)
    setSearching(false)
    if (res.success) setResults(res.data as RateCardOption[])
  }, [])

  function handleQueryChange(q: string) {
    setQuery(q)
    doSearch(q)
  }

  function handleSelectRate(card: RateCardOption) {
    setSelected(card)
    setDescription(card.role)
    setUnit(card.defaultUnit)
    setRate(centsToRate(card.defaultRateCents))
    setQuery('')
    setResults([])
  }

  function reset() {
    setQuery('')
    setResults([])
    setSelected(null)
    setDescription('')
    setQuantity('1')
    setUnit('DAY')
    setRate('')
    setMarkup('')
    setNotes('')
    setError('')
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function handleSubmit() {
    if (!description.trim()) { setError('Description is required'); return }
    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive number'); return }
    const rateCents = rateToCents(rate)
    if (isNaN(rateCents)) { setError('Enter a valid rate'); return }
    setError('')

    startTransition(async () => {
      const res = await upsertLineItem(null, {
        accountId,
        description: description.trim(),
        quantity: qty,
        unit,
        rateCents,
        rateCardId: selected?.id ?? null,
        markupPct: markup ? parseFloat(markup) / 100 : null,
        notes: notes.trim() || null,
      })
      if (res.success) {
        onAdded()
        handleOpenChange(false)
        return
      }
      setError((res as { success: false; error: string }).error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add line item</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Rate card search */}
          <div className="grid gap-1.5">
            <Label>Search rate cards</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by role (Director, DP, Editor…)"
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
              />
            </div>

            {/* Search results */}
            {results.length > 0 && (
              <div className="rounded-md border bg-popover shadow-md">
                {results.map(card => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelectRate(card)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    {card.isFavorite && <Star className="h-3 w-3 flex-shrink-0 text-yellow-500" />}
                    <span className="flex-1 font-medium">{card.role}</span>
                    <span className="text-xs text-muted-foreground">{card.defaultUnit}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      ${(card.defaultRateCents / 100).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <p className="text-xs text-muted-foreground">Searching…</p>
            )}
            {selected && (
              <p className="text-xs text-muted-foreground">
                Using rate card: <span className="font-medium text-foreground">{selected.role}</span>
                <button type="button" className="ml-2 text-destructive hover:underline" onClick={() => setSelected(null)}>
                  clear
                </button>
              </p>
            )}
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="li-desc">Description</Label>
            <Input
              id="li-desc"
              placeholder="e.g. Director — Shoot Day"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Qty / Unit / Rate row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="li-qty">Quantity</Label>
              <Input
                id="li-qty"
                type="number"
                min="0"
                step="0.5"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={v => setUnit(v as RateUnit)}>
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
            <div className="grid gap-1.5">
              <Label htmlFor="li-rate">Rate ($)</Label>
              <Input
                id="li-rate"
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={rate}
                onChange={e => setRate(e.target.value)}
              />
            </div>
          </div>

          {/* Markup + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="li-markup">Markup %</Label>
              <Input
                id="li-markup"
                type="number"
                min="0"
                max="200"
                step="5"
                placeholder="0"
                value={markup}
                onChange={e => setMarkup(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-notes">Notes</Label>
              <Input
                id="li-notes"
                placeholder="Optional"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? 'Adding…' : 'Add line item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
