'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, ExternalLink, Receipt, Send, Ban, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatMoney } from '@/lib/money'
import { voidInvoice, deleteInvoice } from '@/server/actions/invoices'
import { SendInvoiceModal } from '@/components/invoice/SendInvoiceModal'
import { PreviewPanel } from '@/components/invoice/PreviewPanel'
import { EditInvoiceModal } from '@/components/invoice/EditInvoiceModal'
import type { InvoiceStatus, InvoiceLineItem } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceListRow {
  id: string
  number: string
  title: string | null
  status: InvoiceStatus
  kind: string
  totalCents: number
  amountPaidCents: number
  dueDate: Date | string
  publicToken: string
  lineItems?: unknown
  taxPct?: number | null
  notes?: string | null
  project: {
    id: string
    name: string
    client: { name: string }
  }
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

const KIND_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit', PROGRESS: 'Progress', FINAL: 'Final', STANDALONE: '—',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicesTable({ invoices }: { invoices: InvoiceListRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actingId, setActingId]   = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Confirm dialog (void / delete)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'void' | 'delete'
    inv: InvoiceListRow
  } | null>(null)

  const now = new Date()

  function refresh() { router.refresh() }

  function handleConfirm() {
    if (!confirmDialog) return
    const { type, inv } = confirmDialog
    setActingId(inv.id)
    setActionError(null)
    startTransition(async () => {
      const result = type === 'void'
        ? await voidInvoice(inv.id)
        : await deleteInvoice(inv.id)
      if (!result.success) {
        setActionError((result as { success: false; error: string }).error)
        setActingId(null)
        return
      }
      setConfirmDialog(null)
      setActingId(null)
      refresh()
    })
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Invoice</th>
              <th className="px-3 py-2.5 text-left">Project</th>
              <th className="px-3 py-2.5 text-left">Client</th>
              <th className="px-3 py-2.5 text-left w-24">Type</th>
              <th className="px-3 py-2.5 text-left w-28">Status</th>
              <th className="px-3 py-2.5 text-right w-28">Total</th>
              <th className="px-3 py-2.5 text-right w-28">Paid</th>
              <th className="px-3 py-2.5 text-left w-32">Due</th>
              <th className="w-40" />
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const isOverdue  = !['PAID', 'VOID'].includes(inv.status) && new Date(inv.dueDate) < now
              const isPartial  = inv.amountPaidCents > 0 && inv.amountPaidCents < inv.totalCents
              const cfg        = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.DRAFT
              const badgeColor = isOverdue ? 'bg-red-100 text-red-700' : isPartial ? 'bg-amber-100 text-amber-700' : cfg.color
              const badgeLabel = isPartial ? 'Partial' : isOverdue ? 'Overdue' : cfg.label
              const balanceDue = inv.totalCents - inv.amountPaidCents

              const canEdit   = !['PAID', 'VOID'].includes(inv.status)
              const canSend   = inv.status === 'DRAFT' || inv.status === 'SENT'
              const canVoid   = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE'].includes(inv.status)
              const canDelete = inv.status === 'DRAFT'
              const isBusy    = actingId === inv.id && isPending

              return (
                <tr key={inv.id} className={`border-b last:border-0 hover:bg-muted/30 ${isBusy ? 'opacity-50' : ''}`}>

                  {/* Invoice # */}
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs font-medium text-foreground">{inv.number}</p>
                    {inv.title && <p className="mt-0.5 text-xs text-muted-foreground">{inv.title}</p>}
                  </td>

                  {/* Project */}
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <Link href={`/projects/${inv.project.id}`} className="hover:underline hover:text-foreground">
                      {inv.project.name}
                    </Link>
                  </td>

                  {/* Client */}
                  <td className="px-3 py-2.5 text-muted-foreground">{inv.project.client.name}</td>

                  {/* Kind */}
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{KIND_LABELS[inv.kind] ?? inv.kind}</td>

                  {/* Status badge (read-only — actions are in the actions column) */}
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}>
                      {badgeLabel}
                    </span>
                  </td>

                  {/* Total */}
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground">
                    {formatMoney(inv.totalCents)}
                  </td>

                  {/* Paid / balance */}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {inv.amountPaidCents > 0 ? (
                      <span className="text-green-600 font-medium">{formatMoney(inv.amountPaidCents)}</span>
                    ) : balanceDue > 0 && inv.status !== 'DRAFT' ? (
                      <span className="text-muted-foreground">{formatMoney(balanceDue)} due</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Due date */}
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {new Date(inv.dueDate).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-0.5 justify-end">

                      {/* Preview */}
                      <PreviewPanel invoiceId={inv.id} invoiceNumber={inv.number} />

                      {/* Edit line items */}
                      {canEdit && (
                        <EditInvoiceModal
                          invoiceId={inv.id}
                          invoiceNumber={inv.number}
                          existingItems={(inv.lineItems as InvoiceLineItem[] | null) ?? []}
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

                      {/* Go to project */}
                      <Link
                        href={`/projects/${inv.project.id}`}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                        title="Go to project"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Link>

                      {/* Public link + PDF (non-DRAFT) */}
                      {inv.status !== 'DRAFT' && (
                        <>
                          <a
                            href={`/i/${inv.publicToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                            title="Open client invoice"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <a
                            href={`/api/pdf/invoice/${inv.publicToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                            title="Download PDF"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </a>
                        </>
                      )}

                      {/* Void (SENT/VIEWED/OVERDUE — not DRAFT which has Delete instead) */}
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
              {actionError && (
                <p className="text-sm text-red-600">{actionError}</p>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setConfirmDialog(null); setActionError(null) }}>
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
    </>
  )
}
