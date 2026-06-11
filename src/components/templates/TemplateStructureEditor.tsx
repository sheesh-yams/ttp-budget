'use client'

import { useState, useCallback, useTransition } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Plus, Trash2, Search, Star, ChevronDown, ChevronRight, GripVertical, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { saveTemplateStructure } from '@/server/actions/templates'
import { searchRateCards } from '@/server/actions/budgets'
import { centsToRate, rateToCents, formatMoney } from '@/lib/money'
import type { TemplateStructure, TemplateAccount, TemplateItem, RateCardOption } from '@/types'
import type { RateUnit } from '@prisma/client'

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS: { value: RateUnit; label: string }[] = [
  { value: 'HOUR',     label: 'Hour' },
  { value: 'HALF_DAY', label: 'Half-day' },
  { value: 'DAY',      label: 'Day' },
  { value: 'WEEK',     label: 'Week' },
  { value: 'FLAT',     label: 'Flat' },
  { value: 'EACH',     label: 'Each' },
  { value: 'MILE',     label: 'Mile' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function itemTotal(item: TemplateItem): number {
  const base = item.qty * item.rateCents
  return Math.round(base * (1 + item.markupPct / 100))
}

function accountTotal(account: TemplateAccount): number {
  return account.items.reduce((s, i) => s + itemTotal(i), 0)
}

function structureTotal(structure: TemplateStructure): number {
  return structure.accounts.reduce((s, a) => s + accountTotal(a), 0)
}

function blankItem(): TemplateItem {
  return { id: uid(), description: '', qty: 1, unit: 'DAY', rateCents: 0, markupPct: 0, notes: '' }
}

function blankAccount(name: string): TemplateAccount {
  return { id: uid(), name, items: [], children: [] }
}

// ─── Add/Edit line item modal ─────────────────────────────────────────────────

interface ItemModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: TemplateItem
  onSave: (item: TemplateItem) => void
}

function ItemModal({ open, onOpenChange, initial, onSave }: ItemModalProps) {
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<RateCardOption[]>([])
  const [searching, setSearching]     = useState(false)
  const [selected, setSelected]       = useState<RateCardOption | null>(null)

  const [description, setDescription] = useState(initial?.description ?? '')
  const [qty, setQty]                 = useState(String(initial?.qty ?? 1))
  const [unit, setUnit]               = useState<RateUnit>(initial?.unit ?? 'DAY')
  const [rate, setRate]               = useState(initial ? centsToRate(initial.rateCents) : '')
  const [markup, setMarkup]           = useState(String(initial?.markupPct ?? 0))
  const [notes, setNotes]             = useState(initial?.notes ?? '')
  const [error, setError]             = useState('')

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await searchRateCards(q)
    setSearching(false)
    if (res.success) setResults(res.data as RateCardOption[])
  }, [])

  function pickRate(card: RateCardOption) {
    setSelected(card)
    setDescription(card.role)
    setUnit(card.defaultUnit)
    setRate(centsToRate(card.defaultRateCents))
    setResults([])
    setQuery('')
  }

  function handleSave() {
    if (!description.trim()) { setError('Description is required'); return }
    const rateCents = rateToCents(rate)
    if (isNaN(rateCents)) { setError('Invalid rate'); return }
    onSave({
      id:          initial?.id ?? uid(),
      description: description.trim(),
      rateCardId:  selected?.id ?? initial?.rateCardId,
      qty:         Math.max(0, parseFloat(qty) || 1),
      unit,
      rateCents,
      markupPct:   parseFloat(markup) || 0,
      notes:       notes.trim(),
    })
    onOpenChange(false)
  }

  function handleClose(v: boolean) {
    if (!v) setError('')
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit line item' : 'Add line item'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Rate card search */}
          <div className="space-y-1.5">
            <Label>Search rate cards</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="e.g. DP, Gaffer, Camera…"
                value={query}
                onChange={e => { setQuery(e.target.value); doSearch(e.target.value) }}
              />
            </div>
            {results.length > 0 && (
              <div className="rounded-lg border bg-white shadow-sm divide-y max-h-44 overflow-y-auto">
                {results.map(card => (
                  <button
                    key={card.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors"
                    onClick={() => pickRate(card)}
                  >
                    {card.isFavorite && <Star className="h-3 w-3 flex-shrink-0 text-amber-400 fill-amber-400" />}
                    <span className="flex-1 font-medium">{card.role}</span>
                    <span className="text-muted-foreground tabular-nums">{formatMoney(card.defaultRateCents)}/{card.defaultUnit.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            )}
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
            {selected && (
              <p className="flex items-center gap-1.5 text-xs text-violet-700">
                <Check className="h-3 w-3" /> Using <span className="font-medium">{selected.role}</span> rate card
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Director of Photography"
            />
          </div>

          {/* Qty + Unit + Rate + Markup */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={v => setUnit(v as RateUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rate ($)</Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={rate}
                onChange={e => setRate(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Markup %</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={markup}
                onChange={e => setMarkup(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any context for this line item"
            />
          </div>

          {/* Live total */}
          {rate && qty && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Line total: </span>
              <span className="font-semibold tabular-nums">
                {formatMoney(Math.round(
                  (parseFloat(qty) || 1) * rateToCents(rate) * (1 + (parseFloat(markup) || 0) / 100)
                ))}
              </span>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? 'Save changes' : 'Add item'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Account section ──────────────────────────────────────────────────────────

interface AccountSectionProps {
  account: TemplateAccount
  onUpdate: (updated: TemplateAccount) => void
  onDelete: () => void
}

function AccountSection({ account, onUpdate, onDelete }: AccountSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(account.name)
  const [addingItem, setAddingItem] = useState(false)
  const [editingItem, setEditingItem] = useState<TemplateItem | null>(null)
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()

  function saveName() {
    if (nameInput.trim()) onUpdate({ ...account, name: nameInput.trim() })
    setEditingName(false)
  }

  function handleAddItem(item: TemplateItem) {
    onUpdate({ ...account, items: [...account.items, item] })
  }

  function handleUpdateItem(idx: number, item: TemplateItem) {
    const items = [...account.items]
    items[idx] = item
    onUpdate({ ...account, items })
  }

  function handleDeleteItem(idx: number) {
    const items = account.items.filter((_, i) => i !== idx)
    onUpdate({ ...account, items })
  }

  const total = accountTotal(account)

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {ConfirmDialog}
      {/* Account header */}
      <div className="flex items-center gap-2 bg-secondary/40 px-4 py-2.5 border-b border-border">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
        <button
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          onClick={() => setCollapsed(v => !v)}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
        </button>

        {editingName ? (
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none border-b border-violet-400"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
          />
        ) : (
          <button
            className="flex-1 text-left text-sm font-semibold text-foreground hover:text-violet-700 transition-colors"
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
          >
            {account.name}
            {account.code && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{account.code}</span>}
          </button>
        )}

        <span className="ml-auto text-[12px] font-medium tabular-nums text-muted-foreground">
          {total > 0 ? formatMoney(total) : '—'}
        </span>
        <span className="text-[11px] text-muted-foreground ml-2">
          {account.items.length} {account.items.length === 1 ? 'item' : 'items'}
        </span>
        <button
          onClick={async () => {
            const ok = await confirmDialog(`"${account.name}" and all its items will be removed.`, { title: 'Delete section?', key: 'template-delete-section' })
            if (ok) onDelete()
          }}
          className="ml-2 rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Items table */}
      {!collapsed && (
        <>
          {account.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[11px] font-medium text-muted-foreground">
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right w-16">Qty</th>
                  <th className="px-3 py-2 text-right w-20">Unit</th>
                  <th className="px-3 py-2 text-right w-24">Rate</th>
                  <th className="px-3 py-2 text-right w-16">Markup</th>
                  <th className="px-3 py-2 text-right w-24">Total</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {account.items.map((item, idx) => (
                  <tr key={item.id} className="border-b border-violet-50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground text-[13px]">{item.description}</p>
                      {item.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{item.notes}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[13px]">{item.qty}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-muted-foreground">
                      {UNITS.find(u => u.value === item.unit)?.label ?? item.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[13px]">{formatMoney(item.rateCents)}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-muted-foreground">
                      {item.markupPct > 0 ? `${item.markupPct}%` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-[13px]">
                      {formatMoney(itemTotal(item))}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-0.5 justify-end">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M11.333 2a1.886 1.886 0 1 1 2.667 2.667L4.667 14H2v-2.667L11.333 2z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteItem(idx)}
                          className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {account.items.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              No line items yet.
            </div>
          )}

          <div className="border-t border-violet-50 px-4 py-2">
            <button
              onClick={() => setAddingItem(true)}
              className="flex items-center gap-1.5 text-[12px] font-medium text-violet-600 hover:text-violet-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add line item
            </button>
          </div>
        </>
      )}

      {/* Modals */}
      <ItemModal
        open={addingItem}
        onOpenChange={setAddingItem}
        onSave={handleAddItem}
      />
      {editingItem && (
        <ItemModal
          key={editingItem.id}
          open={!!editingItem}
          onOpenChange={v => { if (!v) setEditingItem(null) }}
          initial={editingItem}
          onSave={item => {
            const idx = account.items.findIndex(i => i.id === editingItem.id)
            if (idx !== -1) handleUpdateItem(idx, item)
            setEditingItem(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────

interface Props {
  templateId: string
  initialStructure: TemplateStructure
}

export function TemplateStructureEditor({ templateId, initialStructure }: Props) {
  const [structure, setStructure] = useState<TemplateStructure>(initialStructure)
  const [saving, startSave] = useTransition()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [newAccountName, setNewAccountName] = useState('')
  const [addingAccount, setAddingAccount] = useState(false)

  function updateAccount(idx: number, updated: TemplateAccount) {
    const accounts = [...structure.accounts]
    accounts[idx] = updated
    setStructure({ ...structure, accounts })
    setSaved(false)
  }

  function deleteAccount(idx: number) {
    const accounts = structure.accounts.filter((_, i) => i !== idx)
    setStructure({ ...structure, accounts })
    setSaved(false)
  }

  function handleAddAccount() {
    if (!newAccountName.trim()) return
    const account = blankAccount(newAccountName.trim())
    setStructure({ ...structure, accounts: [...structure.accounts, account] })
    setNewAccountName('')
    setAddingAccount(false)
    setSaved(false)
  }

  function handleSave() {
    setSaveError('')
    startSave(async () => {
      const res = await saveTemplateStructure(templateId, structure)
      if (res.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setSaveError((res as { success: false; error: string }).error)
      }
    })
  }

  const total = structureTotal(structure)
  const itemCount = structure.accounts.reduce((s, a) => s + a.items.length, 0)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-foreground">Budget structure</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {structure.accounts.length} {structure.accounts.length === 1 ? 'section' : 'sections'} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
            {total > 0 && <span className="ml-2 font-medium text-foreground">{formatMoney(total)} total</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[12px] text-green-600 font-medium">Saved ✓</span>}
          {saveError && <span className="text-[12px] text-red-600">{saveError}</span>}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save structure'}
          </Button>
        </div>
      </div>

      {/* Accounts */}
      {structure.accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
          <p className="text-sm font-medium text-foreground">No sections yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add a section (e.g. Camera, Crew, Post) to start building this template.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {structure.accounts.map((account, idx) => (
            <AccountSection
              key={account.id}
              account={account}
              onUpdate={updated => updateAccount(idx, updated)}
              onDelete={() => deleteAccount(idx)}
            />
          ))}
        </div>
      )}

      {/* Add section */}
      {addingAccount ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder="Section name (e.g. Camera, Crew, Post)"
            value={newAccountName}
            onChange={e => setNewAccountName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddAccount()
              if (e.key === 'Escape') { setAddingAccount(false); setNewAccountName('') }
            }}
            className="max-w-xs"
          />
          <Button size="sm" onClick={handleAddAccount} disabled={!newAccountName.trim()}>Add</Button>
          <Button size="sm" variant="outline" onClick={() => { setAddingAccount(false); setNewAccountName('') }}>Cancel</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAddingAccount(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add section
        </Button>
      )}
    </div>
  )
}
