'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { Search, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { searchRateCards, upsertLineItem } from '@/server/actions/budgets'
import { centsToRate, rateToCents, parseQtyFormula } from '@/lib/money'
import type { RateCardOption } from '@/types'
import type { RateUnit } from '@prisma/client'

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS: { value: RateUnit; label: string }[] = [
  { value: 'HOUR',     label: 'Hour' },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'DAY',      label: 'Day' },
  { value: 'WEEK',     label: 'Week' },
  { value: 'FLAT',     label: 'Flat' },
  { value: 'EACH',     label: 'Each' },
  { value: 'MILE',     label: 'Mile' },
]

type LineItemCategory = 'CREW' | 'LOCATION' | 'EQUIPMENT' | 'SERVICE' | 'DELIVERABLE'

const CATEGORIES: { value: LineItemCategory; label: string }[] = [
  { value: 'CREW',        label: 'Crew' },
  { value: 'EQUIPMENT',   label: 'Equipment / Gear' },
  { value: 'LOCATION',    label: 'Location' },
  { value: 'SERVICE',     label: 'Service' },
  { value: 'DELIVERABLE', label: 'Deliverable' },
]

// Minimal shape we need from the existing item when editing
export interface EditableLineItem {
  id: string
  accountId: string
  description: string
  quantity:   number | string
  unit:       RateUnit
  rateCents:  number
  rateCardId: string | null
  markupPct:  number | string | null
  notes:      string | null
  quantityFormula: string | null
  lineItemCategory?: LineItemCategory | null
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass to pre-fill for editing. Omit (or null) for add mode. */
  editItem?: EditableLineItem | null
  /** Required when editItem is null (add mode) */
  accountId?: string
  onSaved: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LineItemModal({ open, onOpenChange, editItem, accountId, onSaved }: Props) {
  const [pending, startTransition] = useTransition()
  const isEdit = !!editItem

  // Rate card search
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<RateCardOption[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<RateCardOption | null>(null)

  // Form fields
  const [description, setDescription] = useState('')
  const [quantity,    setQuantity]    = useState('1')
  const [days,        setDays]        = useState('1')
  const [unit,        setUnit]        = useState<RateUnit>('DAY')
  const [rate,        setRate]        = useState('')
  const [category,    setCategory]    = useState<LineItemCategory | ''>('')
  const [markup,      setMarkup]      = useState('')
  const [notes,       setNotes]       = useState('')
  const [error,       setError]       = useState('')

  // Populate fields when entering edit mode
  useEffect(() => {
    if (editItem && open) {
      const formula = editItem.quantityFormula
      const match = formula?.match(/^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)$/)
      const [hc, daysVal] = parseQtyFormula(Number(editItem.quantity), formula ?? null)
      setDescription(editItem.description)
      setQuantity(match ? match[1] : String(hc))
      setDays(match ? match[2] : daysVal > 1 ? String(daysVal) : '1')
      setUnit(editItem.unit)
      setRate(centsToRate(editItem.rateCents))
      setCategory((editItem.lineItemCategory as LineItemCategory) ?? '')
      setMarkup(editItem.markupPct ? String(Math.round(Number(editItem.markupPct) * 100)) : '')
      setNotes(editItem.notes ?? '')
      setSelected(null)
      setQuery('')
      setResults([])
      setError('')
    }
  }, [editItem, open])

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
    setQuery(''); setResults([]); setSelected(null)
    setDescription(''); setQuantity('1'); setDays('1')
    setUnit('DAY'); setRate(''); setCategory('')
    setMarkup(''); setNotes(''); setError('')
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function handleSubmit() {
    if (!description.trim()) { setError('Description is required'); return }
    const qty     = parseFloat(quantity)
    const daysVal = Math.max(1, parseInt(days) || 1)
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive number'); return }
    const rateCents = rateToCents(rate)
    if (isNaN(rateCents)) { setError('Enter a valid rate'); return }
    setError('')

    const finalQty = qty * daysVal
    const quantityFormula = daysVal > 1 ? `${qty}x${daysVal}` : null
    const effectiveAccountId = editItem?.accountId ?? accountId ?? ''

    startTransition(async () => {
      const res = await upsertLineItem(isEdit ? editItem!.id : null, {
        accountId:       effectiveAccountId,
        description:     description.trim(),
        quantity:        finalQty,
        unit,
        rateCents,
        rateCardId:      selected?.id ?? (isEdit ? editItem!.rateCardId : null),
        markupPct:       markup ? parseFloat(markup) / 100 : null,
        notes:           notes.trim() || null,
        quantityFormula,
        lineItemCategory: category || null,
      })
      if (res.success) {
        onSaved()
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
          <DialogTitle>{isEdit ? 'Edit line item' : 'Add line item'}</DialogTitle>
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
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
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

          {/* Qty / Days / Unit / Rate row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="li-qty">Qty</Label>
              <Input
                id="li-qty"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-days">Days</Label>
              <Input
                id="li-days"
                type="number"
                min="1"
                step="1"
                placeholder="1"
                value={days}
                onChange={e => setDays(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={v => setUnit(v as RateUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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

          {/* Category / Markup / Notes */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select
                value={category || '__none__'}
                onValueChange={v => setCategory(v === '__none__' ? '' : v as LineItemCategory)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          {category === 'CREW' && (
            <p className="text-[11px] text-muted-foreground bg-primary/5 rounded-md px-3 py-2">
              Items in the <strong>Crew</strong> category will be importable directly into call sheets.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save changes' : 'Add line item')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
