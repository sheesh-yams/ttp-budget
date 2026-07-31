'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, DollarSign, Send, Ban, Trash2, Receipt, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatMoney } from '@/lib/money'
import { voidInvoice, deleteInvoice } from '@/server/actions/invoices'
import { SendInvoiceModal } from '@/components/invoice/SendInvoiceModal'
import { PreviewPanel } from '@/components/invoice/PreviewPanel'
import { EditInvoiceModal } from '@/components/invoice/EditInvoiceModal'
import { RecordPaymentModal } from '@/components/invoice/RecordPaymentModal'
import type { InvoiceStatus, InvoiceLineItem } from '@/types'

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
  lineItems: unknown          // JSON array — cast as InvoiceLineItem[] when used
  taxPct: number | string     // Decimal from Prisma
  notes: string | null
}

interface Props {
  invoices: InvoiceRow[]
  projectId?: string
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

export function ProjectInvoices({ invoices, projectId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actingId, setActingId] = useState<string | null>(null)

  // Payment dialog
  const [payDialog, setPayDialog] = useState<InvoiceRow | null>(null)

  // Confirm dialog (void / delete)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'void' | 'delete'
    inv: InvoiceRow
  } | null>(null)

  function refresh() { router.refresh() }

  function handleConfirm() {
    if (!confirmDialog) return
    const { type, inv } = confirmDialog
    setActingId(inv.id)
    startTransition(async () => {
      const result = type === 'void'
        ? await voidInvoice(inv.id)
        : await deleteInvoice(inv.id)
      if (!result.success) {
        alert((result as { success: false; error: string }).error)
        setActingId(null)
        return
      }
      setConfirmDialog(null)
      setActingId(null)
      refresh()
    })
  }

  const totalOwed = invoices
    .filter(i => i.status !== 'VOID')
    .reduce((s, i) => s + i.totalCents - i.amountPaidCents, 0)

  // Empty state
  if (invoices.length === 0) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Invoices</h2>
        </div>
        <div className="rounded-xl border border-dashed p-6 flex flex-col items-center text-center">
          <Receipt className="h-7 w-7 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">No invoices yet</p>
          <p className="mt-1 text-xs text-muted-foreground mb-3">
            Create invoices from the payment schedule or directly from a proposal.
          </p>
          {projectId && (
            <Link
              href={`/projects/${projectId}/invoices`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Create Invoice
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Invoices</h2>
        <div className="flex items-center gap-3">
          {totalOwed > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatMoney(totalOwed)} outstanding
            </span>
          )}
          {projectId && (
            <Link
              href={`/projects/${projectId}/invoices`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Manage invoices →
            </Link>
          )}
        </div>
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
              const canEdit   = !['PAID', 'VOID'].includes(inv.status)
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
                      <PreviewPanel invoiceId={inv.id} invoiceNumber={inv.number} />

                      {/* Edit line items */}
                      {canEdit && (
                        <EditInvoiceModal
                          invoiceId={inv.id}
                          invoiceNumber={inv.number}
                          existingItems={(inv.lineItems as InvoiceLineItem[]) ?? []}
                          currentTaxPct={Number(inv.taxPct ?? 0)}
                          currentNotes={inv.notes}
                          currentTitle={inv.title}
                          currentDueDate={new Date(inv.dueDate).toISOString()}
                          onSaved={refresh}
                          trigger={open => (
                            <button
                              type="button"
                              onClick={open}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                              title="Edit invoice"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        />
                      )}

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
                          onClick={() => setPayDialog(inv)}
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
      <RecordPaymentModal
        invoice={payDialog}
        onClose={() => setPayDialog(null)}
        onRecorded={refresh}
      />

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
