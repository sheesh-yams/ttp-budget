'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileText, Receipt } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { updateInvoiceStatus } from '@/server/actions/invoices'
import type { InvoiceStatus } from '@/types'

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
  const [changingId, setChangingId] = useState<string | null>(null)
  const now = new Date()

  function handleStatusChange(id: string, status: InvoiceStatus) {
    setChangingId(id)
    startTransition(async () => {
      await updateInvoiceStatus(id, status)
      router.refresh()
      setChangingId(null)
    })
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
            <th className="px-4 py-2.5 text-left">Invoice</th>
            <th className="px-3 py-2.5 text-left">Project</th>
            <th className="px-3 py-2.5 text-left">Client</th>
            <th className="px-3 py-2.5 text-left w-24">Type</th>
            <th className="px-3 py-2.5 text-left w-32">Status</th>
            <th className="px-3 py-2.5 text-right w-28">Total</th>
            <th className="px-3 py-2.5 text-right w-28">Paid</th>
            <th className="px-3 py-2.5 text-left w-32">Due</th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => {
            const isOverdue =
              !['PAID', 'VOID'].includes(inv.status) && new Date(inv.dueDate) < now
            const isPartial =
              inv.amountPaidCents > 0 && inv.amountPaidCents < inv.totalCents
            const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.DRAFT
            const badgeColor = isOverdue
              ? 'bg-red-100 text-red-700'
              : isPartial
              ? 'bg-amber-100 text-amber-700'
              : cfg.color
            const balanceDue = inv.totalCents - inv.amountPaidCents
            const isBusy = changingId === inv.id && isPending

            return (
              <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
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

                {/* Status dropdown */}
                <td className="px-3 py-2.5">
                  <select
                    value={inv.status}
                    disabled={isBusy}
                    onChange={e => handleStatusChange(inv.id, e.target.value as InvoiceStatus)}
                    className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 ${badgeColor}`}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="SENT">Sent</option>
                    <option value="VIEWED">Viewed</option>
                    <option value="PAID">Paid</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="VOID">Void</option>
                  </select>
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
                    <Link
                      href={`/projects/${inv.project.id}`}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                      title="Go to project"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Link>
                    {inv.status !== 'DRAFT' && (
                      <>
                        <a
                          href={`/i/${inv.publicToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                          title="Open invoice"
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
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
