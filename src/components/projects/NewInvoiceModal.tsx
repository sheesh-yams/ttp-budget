'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInvoice } from '@/server/actions/invoices'
import { formatMoney } from '@/lib/money'
import type { ProposalContent, PaymentMilestone, InvoiceLineItem } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  clientId: string
  proposal: ProposalForInvoice
  liveTotalCents: number // fallback if no snapshot
  /** Pre-select a specific milestone by index (0-based). */
  defaultMilestoneIdx?: number
}

type InvoiceOption =
  | { type: 'milestone'; milestone: PaymentMilestone; amountCents: number }
  | { type: 'full'; amountCents: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
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
  defaultMilestoneIdx,
}: Props) {
  const router = useRouter()

  // Parse proposal content
  const content = proposal.content as ProposalContent & { budgetSnapshot?: BudgetSnapshot }
  const sections = content?.sections ?? []
  const termsSection = sections.find(s => s.type === 'terms')
  const milestones: PaymentMilestone[] =
    termsSection?.type === 'terms' ? termsSection.milestones : []
  const snapshot = (proposal.content as unknown as Record<string, unknown>)?.budgetSnapshot as BudgetSnapshot | undefined
  const totalCents = snapshot?.totalCents ?? liveTotalCents

  // Build options: one per milestone + "Full invoice"
  const options: InvoiceOption[] = [
    ...milestones.map(m => ({
      type: 'milestone' as const,
      milestone: m,
      amountCents: Math.round(totalCents * m.percentPct / 100),
    })),
    { type: 'full', amountCents: totalCents },
  ]

  // State
  const [selectedIdx, setSelectedIdx] = useState(defaultMilestoneIdx ?? 0)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [taxPct, setTaxPct] = useState(0)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const selected = options[selectedIdx] ?? options[0]
  const selectedAmount = selected?.amountCents ?? 0
  const taxCents = Math.round(selectedAmount * taxPct / 100)
  const totalWithTax = selectedAmount + taxCents

  function getAutoTitle() {
    if (!selected) return `Invoice — ${projectName}`
    if (selected.type === 'full') return `Invoice — ${projectName}`
    return `${selected.milestone.name} — ${projectName}`
  }

  function getKind(): 'DEPOSIT' | 'PROGRESS' | 'FINAL' | 'STANDALONE' {
    if (!selected || selected.type === 'full') return 'STANDALONE'
    const pct = selected.milestone.percentPct
    if (pct <= 35) return 'DEPOSIT'
    if (pct >= 80) return 'FINAL'
    return 'PROGRESS'
  }

  function buildLineItems(): InvoiceLineItem[] {
    if (!selected) return []

    if (selected.type === 'full' && snapshot?.accounts) {
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
      return items.length > 0 ? items : fallbackLineItem(selectedAmount, projectName)
    }

    // Milestone → single line item
    const label = selected.type === 'milestone' ? selected.milestone.name : projectName
    return [{
      id: crypto.randomUUID(),
      description: label,
      quantity: 1,
      unit: 'FLAT' as InvoiceLineItem['unit'],
      rateCents: selectedAmount,
      lineTotalCents: selectedAmount,
    }]
  }

  async function handleSubmit() {
    setError('')
    const invoiceTitle = title.trim() || getAutoTitle()
    if (!invoiceTitle) { setError('Title is required'); return }
    if (!dueDate) { setError('Due date is required'); return }
    setSubmitting(true)
    try {
      const lineItems = buildLineItems()
      const result = await createInvoice({
        projectId,
        clientId,
        budgetId: proposal.budgetId,
        kind: getKind(),
        title: invoiceTitle,
        dueDate,
        lineItems,
        subtotalCents: selectedAmount,
        taxPct,
        taxCents,
        discountCents: 0,
        totalCents: totalWithTax,
        notes: notes.trim() || undefined,
      })
      if (result.success) {
        // Reset form
        setTitle('')
        setTaxPct(0)
        setNotes('')
        setSelectedIdx(0)
        setDueDate(defaultDueDate())
        onOpenChange(false)
        router.refresh()
      } else {
        const r = result as { success: false; error: string }
        setError(r.error)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Proposal context */}
          <p className="text-xs text-muted-foreground">
            From proposal: <span className="font-medium text-foreground">{proposal.title}</span>
          </p>

          {/* Milestone / amount picker */}
          <div>
            <Label className="mb-2 block text-sm">What are you invoicing for?</Label>
            <div className="space-y-2">
              {options.map((opt, idx) => {
                const label = opt.type === 'full'
                  ? 'Full invoice'
                  : opt.milestone.name
                const pct = opt.type === 'milestone'
                  ? `${opt.milestone.percentPct}%`
                  : '100%'
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
          <div className="rounded-lg bg-muted/40 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Invoice total{taxPct > 0 ? ` (incl. ${taxPct}% tax)` : ''}
            </span>
            <span className="text-xl font-bold tabular-nums">{formatMoney(totalWithTax)}</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? 'Creating…' : 'Create Invoice'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fallbackLineItem(amountCents: number, label: string): InvoiceLineItem[] {
  return [{
    id: crypto.randomUUID(),
    description: label,
    quantity: 1,
    unit: 'FLAT' as InvoiceLineItem['unit'],
    rateCents: amountCents,
    lineTotalCents: amountCents,
  }]
}
