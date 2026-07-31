'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInvoice } from '@/server/actions/invoices'
import { formatMoney } from '@/lib/money'
import type { ProposalContent, PaymentMilestone, InvoiceLineItem } from '@/types'

// ─── Line-item row types ───────────────────────────────────────────────────────

const UNITS = ['FLAT', 'HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'EACH', 'MILE'] as const
type Unit = typeof UNITS[number]

const UNIT_LABELS: Record<Unit, string> = {
  FLAT: 'Flat', HOUR: 'Hour', HALF_DAY: 'Half day',
  DAY: 'Day', WEEK: 'Week', EACH: 'Each', MILE: 'Mile',
}

interface Row {
  id:          string
  description: string
  quantity:    string
  unit:        Unit
  rate:        string   // display dollars
  notes:       string
}

function rowToCents(row: Row): number {
  const qty  = parseFloat(row.quantity) || 0
  const rate = Math.round((parseFloat(row.rate) || 0) * 100)
  return Math.round(qty * rate)
}

function liToRow(li: InvoiceLineItem): Row {
  return {
    id:          li.id,
    description: li.description,
    quantity:    String(li.quantity),
    unit:        li.unit as Unit,
    rate:        (li.rateCents / 100).toFixed(2),
    notes:       (li as unknown as { notes?: string }).notes ?? '',
  }
}

function blankRow(): Row {
  return { id: crypto.randomUUID(), description: '', quantity: '1', unit: 'FLAT', rate: '', notes: '' }
}

function rowToLineItem(row: Row): InvoiceLineItem {
  const qty       = parseFloat(row.quantity) || 0
  const rateCents = Math.round((parseFloat(row.rate) || 0) * 100)
  return {
    id:             row.id,
    description:    row.description,
    quantity:       qty,
    unit:           row.unit,
    rateCents,
    lineTotalCents: Math.round(qty * rateCents),
    ...(row.notes ? { notes: row.notes } : {}),
  } as InvoiceLineItem
}

// ─── Budget snapshot types ─────────────────────────────────────────────────────

interface SnapshotLineItem {
  id: string
  description: string
  quantity: number
  unit: string
  rateCents: number
  markupPct: number | null
}

interface SnapshotAccount {
  id: string
  name: string
  lineItems: SnapshotLineItem[]
  children: Array<{ id: string; name: string; lineItems: SnapshotLineItem[] }>
}

interface BudgetSnapshot {
  accounts: SnapshotAccount[]
  totalCents: number
}

interface ProposalForInvoice {
  id: string
  title: string
  budgetId: string
  content: unknown
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  clientId: string
  proposal: ProposalForInvoice
  /** Net of the budget's discount (if any) — the real amount the client owes. */
  liveTotalCents: number
  /** Full, un-prorated discount amount already baked into liveTotalCents above. */
  budgetDiscountCents?: number
  /** Pre-select a specific milestone by index (0-based). */
  defaultMilestoneIdx?: number
  invoiceExpiryDays?: number
}

type InvoiceOption =
  | { type: 'milestone'; milestone: PaymentMilestone; amountCents: number; preDiscountAmountCents: number }
  | { type: 'full'; amountCents: number; preDiscountAmountCents: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultDueDate(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function lineTotal(quantity: number, rateCents: number, markupPct: number | null) {
  const sub = Math.round(quantity * rateCents)
  if (!markupPct) return sub
  return Math.round(sub * (1 + markupPct))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NewInvoiceModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  clientId,
  proposal,
  liveTotalCents,
  budgetDiscountCents = 0,
  defaultMilestoneIdx,
  invoiceExpiryDays = 30,
}: Props) {
  const router = useRouter()

  // Parse proposal content
  const content = proposal.content as ProposalContent & { budgetSnapshot?: BudgetSnapshot }
  const sections = content?.sections ?? []
  const termsSection = sections.find(s => s.type === 'terms')
  const milestones: PaymentMilestone[] =
    termsSection?.type === 'terms' ? termsSection.milestones : []
  const snapshot = (proposal.content as unknown as Record<string, unknown>)?.budgetSnapshot as BudgetSnapshot | undefined
  // Always use the live gross budget total (includes markup + agency fee).
  // The snapshot.totalCents can be stale if the budget changed after the proposal was created.
  // liveTotalCents is already net of any budget-level discount; preDiscountTotalCents
  // adds the discount back so line-item rows (which must sum to a pre-discount
  // subtotal for Subtotal − Discount + Tax = Total to reconcile on the invoice)
  // have the right dollar value to work from.
  const totalCents            = liveTotalCents
  const preDiscountTotalCents = liveTotalCents + budgetDiscountCents

  // Build options: one per milestone + "Full invoice". amountCents is the net
  // (already-discounted) amount shown to the user; preDiscountAmountCents is
  // the same slice of the pre-discount total, used to build line-item rows.
  const options: InvoiceOption[] = [
    ...milestones.map(m => ({
      type: 'milestone' as const,
      milestone: m,
      amountCents:            Math.round(totalCents * m.percentPct),
      preDiscountAmountCents: Math.round(preDiscountTotalCents * m.percentPct),
    })),
    { type: 'full', amountCents: totalCents, preDiscountAmountCents: preDiscountTotalCents },
  ]

  // Build line items for a given option
  function buildLineItemsForOption(opt: InvoiceOption): InvoiceLineItem[] {
    if (opt.type === 'full' && snapshot?.accounts) {
      const items: InvoiceLineItem[] = []
      for (const acc of snapshot.accounts) {
        for (const item of acc.lineItems) {
          items.push({
            id: crypto.randomUUID(),
            description: item.description,
            quantity: item.quantity,
            unit: item.unit as InvoiceLineItem['unit'],
            rateCents: item.rateCents,
            lineTotalCents: lineTotal(item.quantity, item.rateCents, item.markupPct),
          })
        }
        for (const child of acc.children) {
          for (const item of child.lineItems) {
            items.push({
              id: crypto.randomUUID(),
              description: item.description,
              quantity: item.quantity,
              unit: item.unit as InvoiceLineItem['unit'],
              rateCents: item.rateCents,
              lineTotalCents: lineTotal(item.quantity, item.rateCents, item.markupPct),
            })
          }
        }
      }
      if (items.length > 0) return items
    }
    // Milestone or fallback → single line item, pre-discount dollar value
    // (the modal's own Discount row nets it back out — see subtotalCents/discountCents below)
    const label = opt.type === 'milestone' ? opt.milestone.name : projectName
    const amountCents = opt.preDiscountAmountCents
    return [{
      id: crypto.randomUUID(),
      description: label,
      quantity: 1,
      unit: 'FLAT' as InvoiceLineItem['unit'],
      rateCents: amountCents,
      lineTotalCents: amountCents,
    }]
  }

  // ── State ────────────────────────────────────────────────────────────────────

  const initIdx = defaultMilestoneIdx ?? 0
  const [selectedIdx, setSelectedIdx]   = useState(initIdx)
  const [rows, setRows]                 = useState<Row[]>(() => {
    const opt = options[initIdx] ?? options[0]
    return opt ? buildLineItemsForOption(opt).map(liToRow) : [blankRow()]
  })
  const [title, setTitle]               = useState('')
  const [dueDate, setDueDate]           = useState(() => defaultDueDate(invoiceExpiryDays))
  const [taxPct, setTaxPct]             = useState(0)
  const [notes, setNotes]               = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')
  const [showLineItems, setShowLineItems] = useState(false)

  // Re-init rows when selection changes
  useEffect(() => {
    const opt = options[selectedIdx]
    if (opt) setRows(buildLineItemsForOption(opt).map(liToRow))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx])

  // Reset all state when modal opens with a new defaultMilestoneIdx
  useEffect(() => {
    if (open) {
      const idx = defaultMilestoneIdx ?? 0
      setSelectedIdx(idx)
      const opt = options[idx] ?? options[0]
      if (opt) setRows(buildLineItemsForOption(opt).map(liToRow))
      setTitle('')
      setTaxPct(0)
      setNotes('')
      setDueDate(defaultDueDate(invoiceExpiryDays))
      setError('')
      setShowLineItems(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMilestoneIdx])

  // ── Row helpers ──────────────────────────────────────────────────────────────

  const selected      = options[selectedIdx] ?? options[0]

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, blankRow()])
    setShowLineItems(true)
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Derived totals (always from rows) ────────────────────────────────────────

  const subtotalCents = rows.reduce((s, r) => s + rowToCents(r), 0)
  // Discount for the currently selected option — prorated for a milestone slice,
  // or the full budget discount for "Full invoice". Falls out of the pre-discount
  // vs. net amounts computed above; works the same for both branches of
  // buildLineItemsForOption (detailed snapshot items or a single summary row).
  const discountCents = selected ? Math.max(0, selected.preDiscountAmountCents - selected.amountCents) : 0
  const taxCents       = Math.round((subtotalCents - discountCents) * taxPct / 100)
  const totalWithTax   = subtotalCents - discountCents + taxCents

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getAutoTitle() {
    if (!selected) return `Invoice — ${projectName}`
    if (selected.type === 'full') return `Invoice — ${projectName}`
    return `${selected.milestone.name} — ${projectName}`
  }

  function getKind(): 'DEPOSIT' | 'PROGRESS' | 'FINAL' | 'STANDALONE' {
    if (!selected || selected.type === 'full') return 'STANDALONE'
    const pct = selected.milestone.percentPct
    if (pct <= 0.35) return 'DEPOSIT'
    if (pct >= 0.80) return 'FINAL'
    return 'PROGRESS'
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setError('')
    const invoiceTitle = title.trim() || getAutoTitle()
    if (!invoiceTitle) { setError('Title is required'); return }
    if (!dueDate) { setError('Due date is required'); return }
    if (rows.length === 0) { setError('At least one line item is required'); return }
    const emptyDesc = rows.some(r => !r.description.trim())
    if (emptyDesc) { setError('All line items need a description.'); return }
    const badRate = rows.some(r => (parseFloat(r.rate) || 0) <= 0)
    if (badRate) { setError('All line items need a rate greater than zero.'); return }

    setSubmitting(true)
    try {
      const lineItems = rows.map(rowToLineItem)
      const result = await createInvoice({
        projectId,
        clientId,
        budgetId: proposal.budgetId,
        kind: getKind(),
        title: invoiceTitle,
        dueDate,
        lineItems,
        subtotalCents,
        taxPct,
        taxCents,
        discountCents,
        totalCents: totalWithTax,
        notes: notes.trim() || undefined,
      })
      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        setError((result as { success: false; error: string }).error)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>New Invoice</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Proposal context */}
          <p className="text-xs text-muted-foreground">
            From proposal: <span className="font-medium text-foreground">{proposal.title}</span>
          </p>

          {/* Milestone / amount picker */}
          <div>
            <Label className="mb-2 block text-sm">What are you invoicing for?</Label>
            <div className="space-y-2">
              {options.map((opt, idx) => {
                const label = opt.type === 'full' ? 'Full invoice' : opt.milestone.name
                const pct   = opt.type === 'milestone' ? `${Math.round(opt.milestone.percentPct * 100)}%` : '100%'
                const isSelected = selectedIdx === idx

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                      isSelected
                        ? 'border-[#5D00A4] bg-[#F5EDFA] text-[#5D00A4]'
                        : 'border-border hover:border-[#c9a8f0] hover:bg-muted/30 text-foreground'
                    }`}
                  >
                    <div>
                      <span className="font-medium">{label}</span>
                      <span className={`ml-2 text-xs ${isSelected ? 'text-[#8B4FC3]' : 'text-muted-foreground'}`}>
                        {pct} of {formatMoney(totalCents)}
                      </span>
                    </div>
                    <span className="font-semibold tabular-nums">{formatMoney(opt.amountCents)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setShowLineItems(v => !v)}
                className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1"
              >
                Line Items
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  ({rows.length} item{rows.length !== 1 ? 's' : ''})
                </span>
                <span className="text-xs text-muted-foreground">
                  {showLineItems ? '▲' : '▼'}
                </span>
              </button>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Add item
              </button>
            </div>

            {showLineItems && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                {/* Header */}
                <div
                  className="grid gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                  style={{ gridTemplateColumns: '1fr 60px 90px 100px 80px 24px' }}
                >
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span className="text-right">Rate ($)</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>

                {rows.map((row, idx) => (
                  <div key={row.id}>
                    <div
                      className="grid gap-2 items-center"
                      style={{ gridTemplateColumns: '1fr 60px 90px 100px 80px 24px' }}
                    >
                      <Input
                        value={row.description}
                        onChange={e => updateRow(idx, { description: e.target.value })}
                        placeholder="e.g. Deposit, Overtime…"
                        className="h-7 text-xs"
                      />
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={row.quantity}
                        onChange={e => updateRow(idx, { quantity: e.target.value })}
                        className="h-7 text-xs text-right"
                      />
                      <select
                        value={row.unit}
                        onChange={e => updateRow(idx, { unit: e.target.value as Unit })}
                        className="h-7 rounded-md border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {UNITS.map(u => (
                          <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={row.rate}
                        onChange={e => updateRow(idx, { rate: e.target.value })}
                        placeholder="0.00"
                        className="h-7 text-xs text-right"
                      />
                      <div className="text-right text-xs font-medium tabular-nums text-foreground pr-1">
                        {rowToCents(row) > 0 ? formatMoney(rowToCents(row)) : '—'}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length === 1}
                        className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Per-item notes */}
                    <input
                      type="text"
                      value={row.notes}
                      onChange={e => updateRow(idx, { notes: e.target.value })}
                      placeholder={`Notes for "${row.description || 'item'}" (optional)`}
                      className="mt-1 w-full h-6 rounded border border-input bg-background px-2 text-[11px] text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="inv-title">Title</Label>
            <Input
              id="inv-title"
              placeholder={getAutoTitle()}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave blank to use auto-generated title.</p>
          </div>

          {/* Due date + Tax */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inv-due">Due date</Label>
              <Input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="inv-tax">Tax %</Label>
              <Input
                id="inv-tax"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={taxPct}
                onChange={e => setTaxPct(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="inv-notes">Notes (optional)</Label>
            <textarea
              id="inv-notes"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes visible to the client…"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Total preview */}
          <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span>Discount</span>
                <span className="tabular-nums">-{formatMoney(discountCents)}</span>
              </div>
            )}
            {taxPct > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Tax ({taxPct}%)</span>
                <span className="tabular-nums">{formatMoney(taxCents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-bold text-foreground pt-1 border-t">
              <span>Invoice total</span>
              <span className="text-xl tabular-nums">{formatMoney(totalWithTax)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
            {submitting ? 'Creating…' : 'Create Invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
