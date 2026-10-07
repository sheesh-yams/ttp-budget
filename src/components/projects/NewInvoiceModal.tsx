'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInvoice } from '@/server/actions/invoices'
import { formatMoney } from '@/lib/money'
import { calcInvoiceTotals, autoInvoiceDiscount, localISODate, addDaysISO } from '@/lib/invoice-totals'
import type { ProposalContent, PaymentMilestone, InvoiceLineItem } from '@/types'
import { InvoiceLineRowsEditor, blankRow, liToRow, rowToCents, rowToLineItem, rowsError, type Row } from '@/components/invoices/InvoiceLineRows'

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
  budgetMarkupPct?: number
  budgetTaxPct?: number
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

function defaultDueDate(days = 30, from = localISODate()) {
  return addDaysISO(from, days)
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

  // A full invoice itemised from the budget snapshot lists the budget's lines
  // at their pre-discount rates, so it carries the discount as its own row.
  // Everything else (a % milestone, or a full invoice without a snapshot) is a
  // single line at the already-discounted amount — the discount is in the price.
  function isItemized(opt: InvoiceOption | undefined): boolean {
    return !!opt && opt.type === 'full' && !!snapshot?.accounts?.some(a =>
      a.lineItems.length > 0 || a.children.some(c => c.lineItems.length > 0))
  }

  // Build line items for a given option
  function buildLineItemsForOption(opt: InvoiceOption): InvoiceLineItem[] {
    if (isItemized(opt) && snapshot?.accounts) {
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
      if (items.length > 0) {
        // The budget's lines don't include the budget-level agency fee (or
        // tax) — add them as one line so the invoice adds up to the approved
        // total. Without it a "Full invoice" came to the lines less the
        // discount (Daadi: $58,656 instead of $71,136).
        const linesCents = items.reduce((sum, li) => sum + li.lineTotalCents, 0)
        const gapCents   = opt.preDiscountAmountCents - linesCents
        if (gapCents > 0) {
          const pct    = Number(snapshot.budgetMarkupPct) || 0
          const hasTax = (Number(snapshot.budgetTaxPct) || 0) > 0
          const label  = hasTax
            ? 'Agency fee & tax'
            : pct > 0 ? `Agency fee (${Math.round(pct * 100)}%)` : 'Agency fee'
          items.push({
            id: crypto.randomUUID(),
            description: label,
            quantity: 1,
            unit: 'FLAT' as InvoiceLineItem['unit'],
            rateCents: gapCents,
            lineTotalCents: gapCents,
          })
        }
        return items
      }
    }
    // Milestone or fallback → single line item at the net amount: e.g. 50% of
    // the approved (post-discount) total. No discount row — it's already in.
    const label = opt.type === 'milestone' ? opt.milestone.name : projectName
    const amountCents = opt.amountCents
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
  const [issueDate, setIssueDate]       = useState(() => localISODate())
  const [dueDate, setDueDate]           = useState(() => defaultDueDate(invoiceExpiryDays))
  const [dueTouched, setDueTouched]     = useState(false)
  // null = automatic (see autoInvoiceDiscount); a number = what the user set.
  const [discountOverride, setDiscountOverride] = useState<number | null>(null)
  const [discountText, setDiscountText] = useState<string | null>(null) // while typing
  const [taxPct, setTaxPct]             = useState(0)
  const [notes, setNotes]               = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')
  const [showLineItems, setShowLineItems] = useState(false)

  // Re-init rows when selection changes
  useEffect(() => {
    const opt = options[selectedIdx]
    if (opt) setRows(buildLineItemsForOption(opt).map(liToRow))
    setDiscountOverride(null)
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
      setIssueDate(localISODate())
      setDueDate(defaultDueDate(invoiceExpiryDays))
      setDueTouched(false)
      setDiscountOverride(null)
      setError('')
      setShowLineItems(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMilestoneIdx])

  // ── Row helpers ──────────────────────────────────────────────────────────────

  const selected      = options[selectedIdx] ?? options[0]

  function addRow() {
    setRows(prev => [...prev, blankRow()])
    setShowLineItems(true)
  }

  // ── Derived totals (always from rows) ────────────────────────────────────────

  const rawSubtotal = rows.reduce((s, r) => s + rowToCents(r), 0)
  // Discount: only an itemised full invoice carries one (its lines are the
  // budget's pre-discount rates), and not if the amounts entered already equal
  // the discounted figure. A % milestone is prefilled at the net amount, so it
  // starts at 0 — the discount is already in the price. The user can always
  // set or remove it.
  const itemized = isItemized(selected)
  const auto = selected && itemized
    ? autoInvoiceDiscount({ subtotalCents: rawSubtotal, preDiscountAmountCents: selected.preDiscountAmountCents, netAmountCents: selected.amountCents })
    : { discountCents: 0, alreadyIncluded: false }
  const fullDiscountCents = selected && itemized ? Math.max(0, selected.preDiscountAmountCents - selected.amountCents) : 0
  const { subtotalCents, discountCents, taxCents, totalCents: totalWithTax } = calcInvoiceTotals({
    lineTotalsCents: rows.map(rowToCents),
    discountCents:   discountOverride ?? auto.discountCents,
    taxPct,
  })

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
    if (!issueDate) { setError('Invoice date is required'); return }
    if (dueDate < issueDate) { setError('The due date can’t be before the invoice date.'); return }
    const rowsProblem = rowsError(rows)
    if (rowsProblem) { setError(rowsProblem); return }

    setSubmitting(true)
    try {
      const lineItems = rows.map(rowToLineItem)
      const result = await createInvoice({
        projectId,
        clientId,
        budgetId: proposal.budgetId,
        kind: getKind(),
        title: invoiceTitle,
        issueDate,
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

            {showLineItems && <InvoiceLineRowsEditor rows={rows} onChange={setRows} />}
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

          {/* Invoice date + Due date + Tax */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="inv-issue">Invoice date</Label>
              <Input
                id="inv-issue"
                type="date"
                value={issueDate}
                onChange={e => {
                  const v = e.target.value
                  setIssueDate(v)
                  // Keep the usual payment window unless the due date was set by hand.
                  if (v && !dueTouched) setDueDate(defaultDueDate(invoiceExpiryDays, v))
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="inv-due">Due date</Label>
              <Input
                id="inv-due"
                type="date"
                value={dueDate}
                min={issueDate || undefined}
                onChange={e => { setDueDate(e.target.value); setDueTouched(true) }}
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
            {(fullDiscountCents > 0 || discountOverride !== null) && (
              <div className="flex items-center justify-between gap-3 text-sm text-green-600">
                <span className="flex items-center gap-2">
                  Discount
                  {discountCents > 0
                    ? <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setDiscountOverride(0)}>Remove</button>
                    : fullDiscountCents > 0 && (
                      <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setDiscountOverride(fullDiscountCents)}>
                        Apply {formatMoney(fullDiscountCents)}
                      </button>
                    )}
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  -$
                  <input
                    type="number" min={0} step="0.01"
                    value={discountText ?? (discountCents / 100).toFixed(2)}
                    onChange={e => {
                      setDiscountText(e.target.value)
                      setDiscountOverride(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)))
                    }}
                    onBlur={() => setDiscountText(null)}
                    className="w-24 rounded border border-input bg-background px-1.5 py-0.5 text-right text-sm text-green-700 tabular-nums"
                    aria-label="Discount amount"
                  />
                </span>
              </div>
            )}
            {auto.alreadyIncluded && discountOverride === null && (
              <p className="text-xs text-muted-foreground">
                The amount above already includes the budget discount ({formatMoney(fullDiscountCents)}), so it isn’t taken off again.
              </p>
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
