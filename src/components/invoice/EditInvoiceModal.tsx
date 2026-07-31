'use client'

/**
 * EditInvoiceModal
 *
 * Lets the user add/remove/edit line items on any non-PAID, non-VOID invoice.
 * Typical uses: adding overtime, reimbursements, or extras agreed during a shoot.
 *
 * Props
 *   invoiceId       — the invoice to edit
 *   invoiceNumber   — displayed in the title
 *   existingItems   — current lineItems from the DB
 *   currentTaxPct   — current taxPct (editable)
 *   currentNotes    — current notes field (editable)
 *   currentTitle    — current invoice title (editable)
 *   currentDueDate  — ISO string, editable
 *   trigger         — render-prop so any element can open the modal
 *   onSaved         — called after a successful save
 */

import { useState, useTransition } from 'react'
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatMoney } from '@/lib/money'
import { updateInvoiceLineItems } from '@/server/actions/invoices'
import type { InvoiceLineItem } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

const UNITS = ['FLAT', 'HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'EACH', 'MILE'] as const
type Unit = typeof UNITS[number]

const UNIT_LABELS: Record<Unit, string> = {
  FLAT:     'Flat',
  HOUR:     'Hour',
  HALF_DAY: 'Half day',
  DAY:      'Day',
  WEEK:     'Week',
  EACH:     'Each',
  MILE:     'Mile',
}

interface EditInvoiceModalProps {
  invoiceId:      string
  invoiceNumber:  string
  existingItems:  InvoiceLineItem[]
  currentTaxPct:  number
  currentNotes?:  string | null
  currentTitle?:  string | null
  currentDueDate: string       // ISO string
  trigger:        (open: () => void) => React.ReactNode
  onSaved?:       () => void
}

// Editable row type (rate/qty as strings so inputs don't fight)
interface Row {
  id:          string
  description: string
  quantity:    string
  unit:        Unit
  rate:        string   // display dollars, e.g. "1250.00"
  notes:       string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rowTotal(row: Row): number {
  const qty  = parseFloat(row.quantity) || 0
  const rate = Math.round((parseFloat(row.rate) || 0) * 100)
  return Math.round(qty * rate)
}

function toRow(li: InvoiceLineItem): Row {
  return {
    id:          li.id,
    description: li.description,
    quantity:    String(li.quantity),
    unit:        li.unit as Unit,
    rate:        (li.rateCents / 100).toFixed(2),
    notes:       li.notes ?? '',
  }
}

function blankRow(): Row {
  return {
    id:          crypto.randomUUID(),
    description: '',
    quantity:    '1',
    unit:        'FLAT',
    rate:        '',
    notes:       '',
  }
}

function toLineItem(row: Row): InvoiceLineItem {
  const qty      = parseFloat(row.quantity) || 0
  const rateCents = Math.round((parseFloat(row.rate) || 0) * 100)
  return {
    id:             row.id,
    description:    row.description,
    quantity:       qty,
    unit:           row.unit,
    rateCents,
    lineTotalCents: Math.round(qty * rateCents),
    notes:          row.notes || undefined,
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export function EditInvoiceModal({
  invoiceId,
  invoiceNumber,
  existingItems,
  currentTaxPct,
  currentNotes,
  currentTitle,
  currentDueDate,
  trigger,
  onSaved,
}: EditInvoiceModalProps) {
  const [open, setOpen]       = useState(false)
  const [isPending, start]    = useTransition()
  const [error, setError]     = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)

  // Form state — initialised when modal opens
  const [rows, setRows]       = useState<Row[]>([])
  const [taxPct, setTaxPct]   = useState(currentTaxPct)
  const [notes, setNotes]     = useState(currentNotes ?? '')
  const [title, setTitle]     = useState(currentTitle ?? '')
  const [dueDate, setDueDate] = useState(currentDueDate.split('T')[0])

  function handleOpen() {
    setRows(existingItems.length > 0 ? existingItems.map(toRow) : [blankRow()])
    setTaxPct(currentTaxPct)
    setNotes(currentNotes ?? '')
    setTitle(currentTitle ?? '')
    setDueDate(currentDueDate.split('T')[0])
    setError(null)
    setSaved(false)
    setOpen(true)
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, blankRow()])
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotalCents = rows.reduce((s, r) => s + rowTotal(r), 0)
  const taxCents      = Math.round(subtotalCents * taxPct / 100)
  const totalCents    = subtotalCents + taxCents

  function handleSave() {
    // Validate
    const emptyDesc = rows.some(r => !r.description.trim())
    if (emptyDesc) { setError('All line items need a description.'); return }
    const badRate = rows.some(r => (parseFloat(r.rate) || 0) <= 0)
    if (badRate)  { setError('All line items need a rate greater than zero.'); return }
    if (!dueDate) { setError('Due date is required.'); return }
    setError(null)

    start(async () => {
      const result = await updateInvoiceLineItems(
        invoiceId,
        rows.map(toLineItem),
        taxPct,
        notes,
        title || undefined,
        dueDate,
      )
      if (result.success) {
        setSaved(true)
        setTimeout(() => {
          setOpen(false)
          onSaved?.()
        }, 1200)
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  return (
    <>
      {trigger(handleOpen)}

      <Dialog open={open} onOpenChange={v => { if (!v && !isPending) setOpen(false) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>
              Edit Invoice
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">{invoiceNumber}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Success */}
          {saved && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-semibold">Invoice updated!</p>
            </div>
          )}

          {!saved && (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                {/* Title + due date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ei-title">Invoice title</Label>
                    <Input
                      id="ei-title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Optional title…"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ei-due">Due date</Label>
                    <Input
                      id="ei-due"
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Line Items</Label>
                    <button
                      type="button"
                      onClick={addRow}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add item
                    </button>
                  </div>

                  {/* Header row */}
                  <div className="grid gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1"
                    style={{ gridTemplateColumns: '1fr 70px 100px 110px 90px 28px' }}
                  >
                    <span>Description</span>
                    <span>Qty</span>
                    <span>Unit</span>
                    <span className="text-right">Rate ($)</span>
                    <span className="text-right">Total</span>
                    <span />
                  </div>

                  <div className="space-y-2">
                    {rows.map((row, idx) => (
                      <div
                        key={row.id}
                        className="grid gap-2 items-center"
                        style={{ gridTemplateColumns: '1fr 70px 100px 110px 90px 28px' }}
                      >
                        {/* Description */}
                        <Input
                          value={row.description}
                          onChange={e => updateRow(idx, { description: e.target.value })}
                          placeholder="e.g. Overtime crew, Reimbursement…"
                          className="h-8 text-sm"
                        />

                        {/* Qty */}
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={row.quantity}
                          onChange={e => updateRow(idx, { quantity: e.target.value })}
                          className="h-8 text-sm text-right"
                        />

                        {/* Unit */}
                        <select
                          value={row.unit}
                          onChange={e => updateRow(idx, { unit: e.target.value as Unit })}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {UNITS.map(u => (
                            <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                          ))}
                        </select>

                        {/* Rate */}
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={row.rate}
                          onChange={e => updateRow(idx, { rate: e.target.value })}
                          placeholder="0.00"
                          className="h-8 text-sm text-right"
                        />

                        {/* Line total */}
                        <div className="text-right text-sm font-medium tabular-nums text-foreground pr-1">
                          {rowTotal(row) > 0 ? formatMoney(rowTotal(row)) : '—'}
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          disabled={rows.length === 1}
                          className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-25 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Notes per item (shown below each row that has notes or a collapsed toggle) */}
                  {rows.some((_, i) => i >= 0) && (
                    <div className="mt-3 space-y-2">
                      {rows.map((row, idx) => (
                        <div key={`notes-${row.id}`} className="pl-1">
                          <input
                            type="text"
                            value={row.notes}
                            onChange={e => updateRow(idx, { notes: e.target.value })}
                            placeholder={`Notes for "${row.description || 'item'}" (optional)`}
                            className="w-full h-7 rounded border border-input bg-background px-2.5 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="rounded-xl border bg-muted/30 px-5 py-4 space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      Tax
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={taxPct}
                        onChange={e => setTaxPct(Number(e.target.value))}
                        className="h-6 w-16 text-xs text-right px-2"
                      />
                      <span className="text-xs">%</span>
                    </span>
                    <span className="tabular-nums">{formatMoney(taxCents)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-foreground pt-2 border-t">
                    <span>Invoice total</span>
                    <span className="tabular-nums text-lg">{formatMoney(totalCents)}</span>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="ei-notes">Notes to client (optional)</Label>
                  <Textarea
                    id="ei-notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Visible on the invoice…"
                    className="mt-1 resize-none text-sm"
                  />
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t shrink-0">
                {error && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isPending || rows.length === 0}>
                    {isPending
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Saving…</>
                      : 'Save Invoice'
                    }
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
