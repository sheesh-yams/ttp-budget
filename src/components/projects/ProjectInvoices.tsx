'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, DollarSign, Send, Eye, Ban, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney } from '@/lib/money'
import { recordPayment, voidInvoice, deleteInvoice } from '@/server/actions/invoices'
import { SendInvoiceModal } from '@/components/invoice/SendInvoiceModal'
import { PreviewPanel } from '@/components/invoice/PreviewPanel'
import type { InvoiceStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: string
  number: string
  title: string | null
  status: InvoiceStatus
  kind: string
  totalCents: number
  amountPaidCents: number
  dueDate: Date | string
  publicToken: string
  sentAt: Date | string | null
}

interface Props {
  invoices: InvoiceRow[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  DRAFT:   { label: 'Draft',   color: 'bg-gray-100 text-gray-600' },
  SENT:    { label: 'Sent',    color: 'bg-blue-100 text-blue-700' },
  VIEWED:  { label: 'Viewed',  color: 'bg-violet-100 text-violet-700' },
  PAID:    { label: 'Paid',    color: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Overdue', color: 'bg-red-100 text-red-700' },
  VOID:    { label: 'Void',    color: 'bg-gray-100 text-gray-400' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectInvoices({ invoices }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actingId, setActingId] = useState<string | null>(null)

  // Payment dialog
  const [payDialog, setPayDialog] = useState<InvoiceRow | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payRef, setPayRef]       = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)
  const [payError, setPayError]   = useState('')

  // Confirm dialog (void / delete)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'void' | 'delete'
    inv: InvoiceRow
  } | null>(null)

  function refresh() { router.refresh() }

  function openPayDialog(inv: InvoiceRow) {
    const remaining = inv.totalCents - inv.amountPaidCents
    setPayAmount((remaining / 100).toFixed(2))
    setPayMethod('')
    setPayRef('')
    setPayError('')
    setPayDialog(inv)
  }

  async function handlePay() {
    if (!payDialog) return
    setPayError('')
    const amountCents = Math.round(parseFloat(payAmount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) {
      setPayError('Enter a valid amount')
      return
    }
    setPaySubmitting(true)
    try {
      const result = await recordPayment(
        payDialog.id, amountCents,
        payMethod.trim() || undefined,
        payRef.trim()   || undefined,
      )
      if (result.success) { setPayDialog(null); refresh() }
      else setPayError((result as { success: false; error: string }).error)
    } finally {
      setPaySubmitting(false)
    }
  }

  function handleConfirm() {
    if (!confirmDialog) return
    const { type, inv } = confirmDialog
    setActingId(inv.id)
    startTransition(async () => {
      if (type === 'void')   await voidInvoice(inv.id)
      if (type === 'delete') await deleteInvoice(inv.id)
      setConfirmDialog(null)
      setActingId(null)
      refresh()
    })
  }

  if (invoices.length === 0) return null

  const totalOwed = invoices
    .filter(i => i.status !== 'VOID')
    .reduce((s, i) => s + i.totalCents - i.amountPaidCents, 0)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Invoices</h2>
        {totalOwed > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatMoney(totalOwed)} outstanding
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Invoice</th>
              <th className="px-3 py-2.5 text-left w-28">Status</th>
              <th className="px-3 py-2.5 text-right w-28">Total</th>
              <th className="px-3 py-2.5 text-right w-28">Paid</th>
              <th className="px-3 py-2.5 text-left w-32">Due</th>
              <th className="w-36" />
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.DRAFT
              const isPartial  = inv.amountPaidCents > 0 && inv.amountPaidCents < inv.totalCents
              const isOverdue  = !['PAID', 'VOID'].includes(inv.status) && new Date(inv.dueDate) < new Date()
              const badgeClass = isOverdue ? 'bg-red-100 text-red-700' : isPartial ? 'bg-amber-100 text-amber-700' : cfg.color
              const badgeLabel = isPartial ? 'Partial' : isOverdue ? 'Overdue' : cfg.label

              const canSend   = inv.status === 'DRAFT' || inv.status === 'SENT'
              const canPay    = !['DRAFT', 'PAID', 'VOID'].includes(inv.status)
              const canVoid   = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE'].includes(inv.status)
              const canDelete = inv.status === 'DRAFT'
              const isBusy    = actingId === inv.id && isPending

              return (
                <tr key={inv.id} className={`border-b last:border-0 hover:bg-muted/30 ${isBusy ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-foreground font-mono text-xs">{inv.number}</p>
                    {inv.title && (
                      <p className="text-xs text-muted-foreground mt-0.5">{inv.title}</p>
                    )}
                  </td>

                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                      {badgeLabel}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground">
                    {formatMoney(inv.totalCents)}
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {inv.amountPaidCents > 0 ? (
                      <span className="text-green-600 font-medium">{formatMoney(inv.amountPaidCents)}</span>
                    ) : '—'}
                  </td>

                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {new Date(inv.dueDate).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>

                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-0.5 justify-end">

                      {/* Preview */}
                      <PreviewPanel
                        invoiceId={inv.id}
                        invoiceNumber={inv.number}
                      />

                      {/* Send */}
                      {canSend && (
                        <SendInvoiceModal
                          invoiceId={inv.id}
                          onSent={refresh}
                          trigger={open => (
                            <button
                              type="button"
                              onClick={open}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                              title={inv.status === 'SENT' ? 'Resend invoice' : 'Send invoice'}
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          )}
                        />
                      )}

                      {/* Record payment */}
                      {canPay && (
                        <button
                          type="button"
                          onClick={() => openPayDialog(inv)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                          title="Record payment"
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Open public link */}
                      {inv.status !== 'DRAFT' && (
                        <a
                          href={`/i/${inv.publicToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                          title="Open client link"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {/* Void */}
                      {canVoid && !canDelete && (
                        <button
                          type="button"
                          onClick={() => setConfirmDialog({ type: 'void', inv })}
                          disabled={isBusy}
                          className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 inline-flex disabled:opacity-40"
                          title="Void invoice"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Delete (DRAFT only) */}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setConfirmDialog({ type: 'delete', inv })}
                          disabled={isBusy}
                          className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 inline-flex disabled:opacity-40"
                          title="Delete draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Payment dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!payDialog} onOpenChange={open => { if (!open) setPayDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {payDialog && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/40 px-4 py-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding balance</span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(payDialog.totalCents - payDialog.amountPaidCents)}
                </span>
              </div>
              <div>
                <Label htmlFor="pay-amount">Amount received ($)</Label>
                <Input id="pay-amount" type="number" min={0.01} step={0.01}
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pay-method">Payment method (optional)</Label>
                <Input id="pay-method" placeholder="Wire, ACH, Check…"
                  value={payMethod} onChange={e => setPayMethod(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pay-ref">Reference # (optional)</Label>
                <Input id="pay-ref" placeholder="Wire confirmation, check #…"
                  value={payRef} onChange={e => setPayRef(e.target.value)} className="mt-1" />
              </div>
              {payError && <p className="text-sm text-red-600">{payError}</p>}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setPayDialog(null)}>Cancel</Button>
                <Button onClick={handlePay} disabled={paySubmitting} className="flex-1">
                  {paySubmitting ? 'Saving…' : 'Record Payment'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Void / Delete confirm dialog ───────────────────────────────── */}
      <Dialog open={!!confirmDialog} onOpenChange={open => { if (!open) setConfirmDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === 'delete' ? 'Delete Draft Invoice' : 'Void Invoice'}
            </DialogTitle>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-muted-foreground">
                {confirmDialog.type === 'delete'
                  ? `Permanently delete draft invoice ${confirmDialog.inv.number}? This cannot be undone.`
                  : `Mark invoice ${confirmDialog.inv.number} as void? The invoice link will still work but will show as voided.`
                }
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleConfirm}
                  disabled={isPending}
                >
                  {isPending
                    ? 'Working…'
                    : confirmDialog.type === 'delete' ? 'Delete' : 'Void Invoice'
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
