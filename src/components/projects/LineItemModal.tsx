'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { Search, BookUser } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { searchRateCards, upsertLineItem } from '@/server/actions/budgets'
import { searchContacts, type ContactSearchResult } from '@/server/actions/rolodex'
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
  // Magical Crew Workflow: linked Rolodex contact
  contactId?:  string | null
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

  // Rolodex contact search (CREW only)
  const [contactQuery,     setContactQuery]     = useState('')
  const [contactResults,   setContactResults]   = useState<ContactSearchResult[]>([])
  const [contactSearching, setContactSearching] = useState(false)
  const [selectedContact,  setSelectedContact]  = useState<ContactSearchResult | null>(null)
  // True when the item being edited already has a contactId; cleared when user unlinks
  const [editHasContact,   setEditHasContact]   = useState(false)

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
      setSelectedContact(null)
      setContactQuery('')
      setContactResults([])
      setEditHasContact(!!(editItem.contactId))
      setError('')
    }
  }, [editItem, open])

  // ── Rate card search ────────────────────────────────────────────────────────

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

  // ── Rolodex contact search ──────────────────────────────────────────────────

  const doContactSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setContactResults([]); return }
    setContactSearching(true)
    const res = await searchContacts(q)
    setContactSearching(false)
    setContactResults(res)
  }, [])

  function handleContactQueryChange(q: string) {
    setContactQuery(q)
    doContactSearch(q)
  }

  function handleSelectContact(c: ContactSearchResult) {
    setSelectedContact(c)
    setEditHasContact(false) // clear "existing" flag once a new contact is chosen
    // Pre-fill description if still empty
    if (!description.trim()) setDescription(c.name)
    // Override rate + unit from contact defaults when available
    if (c.defaultRateCents != null) setRate(centsToRate(c.defaultRateCents))
    setUnit(c.defaultRateUnit as RateUnit)
    setContactQuery('')
    setContactResults([])
  }

  function handleUnlinkContact() {
    setSelectedContact(null)
    setEditHasContact(false)
    setContactQuery('')
    setContactResults([])
  }

  // ── Category change ─────────────────────────────────────────────────────────

  function handleCategoryChange(v: string) {
    const newCat = v === '__none__' ? '' : v as LineItemCategory
    setCategory(newCat)
    // Clear contact linkage when switching away from CREW
    if (newCat !== 'CREW') {
      setSelectedContact(null)
      setEditHasContact(false)
      setContactQuery('')
      setContactResults([])
    }
  }

  // ── Reset + close ───────────────────────────────────────────────────────────

  function reset() {
    setQuery(''); setResults([]); setSelected(null)
    setDescription(''); setQuantity('1'); setDays('1')
    setUnit('DAY'); setRate(''); setCategory('')
    setMarkup(''); setNotes(''); setError('')
    setContactQuery(''); setContactResults([]); setSelectedContact(null); setEditHasContact(false)
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

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

    // contactId resolution:
    //   selectedContact  → newly picked in this session → use its id
    //   editHasContact   → editing, contact unchanged → preserve editItem.contactId
    //   neither          → null (no assignment or explicitly unlinked)
    const resolvedContactId =
      selectedContact?.id ??
      (isEdit && editHasContact ? (editItem!.contactId ?? null) : null)

    startTransition(async () => {
      const res = await upsertLineItem(isEdit ? editItem!.id : null, {
        accountId:        effectiveAccountId,
        description:      description.trim(),
        quantity:         finalQty,
        unit,
        rateCents,
        rateCardId:       selected?.id ?? (isEdit ? editItem!.rateCardId : null),
        markupPct:        markup ? parseFloat(markup) / 100 : null,
        notes:            notes.trim() || null,
        quantityFormula,
        lineItemCategory: category || null,
        contactId:        resolvedContactId,
      })
      if (res.success) {
        onSaved()
        handleOpenChange(false)
        return
      }
      setError((res as { success: false; error: string }).error)
    })
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const isCrew = category === 'CREW'
  const hasLinkedContact = selectedContact !== null || editHasContact

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
                    {card.isFavorite && <span className="text-yellow-500 text-xs">★</span>}
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
                onValueChange={handleCategoryChange}
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

          {/* ── Rolodex contact search (CREW items only) ────────────────────── */}
          {isCrew && (
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5">
                <BookUser className="h-3.5 w-3.5 text-muted-foreground" />
                Assign from Rolodex
              </Label>

              {/* Edit mode: existing contact linked, no new one selected yet */}
              {editHasContact && !selectedContact && (
                <p className="text-xs text-muted-foreground bg-primary/5 rounded px-2.5 py-1.5 flex items-center gap-1.5">
                  <BookUser className="h-3 w-3 flex-shrink-0" />
                  Contact currently linked.{' '}
                  Search below to replace, or{' '}
                  <button type="button" className="text-destructive hover:underline" onClick={handleUnlinkContact}>
                    unlink
                  </button>.
                </p>
              )}

              {/* Newly selected contact */}
              {selectedContact && (
                <p className="text-xs text-muted-foreground bg-primary/5 rounded px-2.5 py-1.5 flex items-center gap-1.5 flex-wrap">
                  <BookUser className="h-3 w-3 flex-shrink-0" />
                  <span className="font-medium text-foreground">{selectedContact.name}</span>
                  <span className="text-muted-foreground">· {selectedContact.primaryRole}</span>
                  {selectedContact.hasKit && selectedContact.kitRateCents && (
                    <span className="text-amber-600 font-medium">
                      · Kit ${(selectedContact.kitRateCents / 100).toLocaleString()}/day will be auto-added
                    </span>
                  )}
                  <button type="button" className="text-destructive hover:underline ml-auto" onClick={handleUnlinkContact}>
                    unlink
                  </button>
                </p>
              )}

              {/* Search input — hidden once a contact is locked in */}
              {!hasLinkedContact && (
                <>
                  <div className="relative">
                    <BookUser className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search by name or role…"
                      value={contactQuery}
                      onChange={e => handleContactQueryChange(e.target.value)}
                    />
                  </div>
                  {contactResults.length > 0 && (
                    <div className="rounded-md border bg-popover shadow-md">
                      {contactResults.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectContact(c)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="flex-1 font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.primaryRole}</span>
                          {c.hasKit && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 rounded px-1 py-0.5">
                              Kit
                            </span>
                          )}
                          {c.defaultRateCents != null && (
                            <span className="text-xs font-mono text-muted-foreground">
                              ${(c.defaultRateCents / 100).toLocaleString()}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {contactSearching && <p className="text-xs text-muted-foreground">Searching…</p>}
                </>
              )}
            </div>
          )}

          {isCrew && !hasLinkedContact && !selectedContact && (
            <p className="text-[11px] text-muted-foreground bg-primary/5 rounded-md px-3 py-2">
              <strong>Crew</strong> items are importable into call sheets. Assign from Rolodex above to auto-add this person to the Teams page and pull their day rate.
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
