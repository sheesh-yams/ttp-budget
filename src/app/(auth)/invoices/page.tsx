import Link from 'next/link'
import { ExternalLink, FileText, Receipt } from 'lucide-react'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import type { InvoiceStatus } from '@/types'

export const metadata = { title: 'Invoices — TTP Budget' }

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
  DEPOSIT:    'Deposit',
  PROGRESS:   'Progress',
  FINAL:      'Final',
  STANDALONE: '—',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InvoicesPage() {
  const user = await getCurrentUser()

  const invoices = await db.invoice.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      kind: true,
      totalCents: true,
      amountPaidCents: true,
      dueDate: true,
      issueDate: true,
      publicToken: true,
      sentAt: true,
      paidAt: true,
      project: {
        select: {
          id: true,
          name: true,
          client: { select: { name: true } },
        },
      },
    },
  })

  const now = new Date()

  // ── Summary metrics ──────────────────────────────────────────────────────────
  const activeInvoices = invoices.filter(i => i.status !== 'VOID')
  const totalInvoiced  = activeInvoices.reduce((s, i) => s + i.totalCents, 0)
  const totalPaid      = activeInvoices.reduce((s, i) => s + i.amountPaidCents, 0)
  const totalOutstanding = totalInvoiced - totalPaid
  const overdueCount   = activeInvoices.filter(
    i => !['PAID', 'VOID'].includes(i.status) && new Date(i.dueDate) < now
  ).length

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} across all projects
          </p>
        </div>
      </div>

      {/* ── Summary cards ── */}
      {invoices.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Total invoiced" value={formatMoney(totalInvoiced)} />
          <MetricCard label="Collected" value={formatMoney(totalPaid)} valueClass="text-green-600" />
          <MetricCard
            label="Outstanding"
            value={formatMoney(totalOutstanding)}
            valueClass={totalOutstanding > 0 ? 'text-amber-600' : undefined}
          />
          <MetricCard
            label="Overdue"
            value={String(overdueCount)}
            valueClass={overdueCount > 0 ? 'text-red-600' : undefined}
            suffix={overdueCount === 1 ? 'invoice' : 'invoices'}
          />
        </div>
      )}

      {/* ── Table / empty state ── */}
      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Receipt className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No invoices yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a project, create a proposal, and use the invoice button to get started.
          </p>
          <Link
            href="/projects"
            className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Projects
          </Link>
        </div>
      ) : (
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
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const isOverdue =
                  !['PAID', 'VOID'].includes(inv.status) &&
                  new Date(inv.dueDate) < now
                const isPartial =
                  inv.amountPaidCents > 0 &&
                  inv.amountPaidCents < inv.totalCents
                const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.DRAFT

                const badgeColor = isOverdue
                  ? 'bg-red-100 text-red-700'
                  : isPartial
                  ? 'bg-amber-100 text-amber-700'
                  : cfg.color
                const badgeLabel = isOverdue
                  ? 'Overdue'
                  : isPartial
                  ? 'Partial'
                  : cfg.label

                const balanceDue = inv.totalCents - inv.amountPaidCents

                return (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                    {/* Invoice # + title */}
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-xs font-medium text-foreground">{inv.number}</p>
                      {inv.title && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{inv.title}</p>
                      )}
                    </td>

                    {/* Project */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <Link
                        href={`/projects/${inv.project.id}`}
                        className="hover:underline hover:text-foreground"
                      >
                        {inv.project.name}
                      </Link>
                    </td>

                    {/* Client */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {inv.project.client.name}
                    </td>

                    {/* Kind */}
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {KIND_LABELS[inv.kind] ?? inv.kind}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}>
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
                      {inv.dueDate.toLocaleDateString('en-US', {
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
      )}
    </div>
  )
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  valueClass,
  suffix,
}: {
  label: string
  value: string
  valueClass?: string
  suffix?: string
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass ?? 'text-foreground'}`}>
        {value}
      </p>
      {suffix && <p className="text-xs text-muted-foreground mt-0.5">{suffix}</p>}
    </div>
  )
}
