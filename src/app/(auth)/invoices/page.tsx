import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { InvoicesTable } from '@/components/invoices/InvoicesTable'

export const metadata = { title: 'Invoices — TTP Budget' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InvoicesPage() {
  const workspaceId = await getWorkspaceId()

  const invoices = await db.invoice.findMany({
    where: { workspaceId },
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
      lineItems: true,
      taxPct: true,
      notes: true,
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
          <InvoicesTable invoices={invoices.map(inv => ({
          ...inv,
          dueDate:   inv.dueDate.toISOString(),
          issueDate: inv.issueDate?.toISOString() ?? inv.dueDate.toISOString(),
          sentAt:    inv.sentAt?.toISOString() ?? null,
          paidAt:    inv.paidAt?.toISOString() ?? null,
          taxPct:    Number(inv.taxPct ?? 0),
          notes:     inv.notes ?? null,
        }))} />
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
