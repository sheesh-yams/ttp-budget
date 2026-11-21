import Link from 'next/link'
import type { Project } from '@prisma/client'
import { formatMoney } from '@/lib/money'

// ── Lightweight invoice shape (no relations needed for metrics) ───────────────
interface InvoiceLite {
  status:          string
  totalCents:      number
  amountPaidCents: number
  dueDate:         Date | string
  paidAt:          Date | string | null
  updatedAt:       Date | string
}

interface Props {
  projects:  Project[]
  invoices:  InvoiceLite[]
  /** Open proposals (SENT / VIEWED) on non-archived projects — counted server-side. */
  proposalsSentCount: number
}

export function DashboardMetrics({ projects, invoices, proposalsSentCount }: Props) {
  const now = new Date()

  // ── Proposals sent (active with client, not yet closed) ───────────────────
  const proposalsSent = proposalsSentCount

  // ── Active projects (LEAD + ACTIVE = everything in the pipeline) ──────────
  const pipelineProjects  = projects.filter(p => ['LEAD', 'ACTIVE'].includes(p.status))
  const inProductionCount = projects.filter(p => p.status === 'ACTIVE').length

  // ── Outstanding invoices ──────────────────────────────────────────────────
  const activeInvoices = invoices.filter(i => i.status !== 'VOID')
  const outstanding = activeInvoices
    .filter(i => ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status))
    .reduce((sum, i) => sum + Math.max(0, i.totalCents - i.amountPaidCents), 0)
  const overdueCount = activeInvoices.filter(
    i => i.status !== 'PAID' && i.status !== 'VOID' && new Date(i.dueDate) < now
  ).length

  // ── Collected this month ──────────────────────────────────────────────────
  // Uses paidAt when set, falls back to updatedAt so partially-paid invoices
  // where paidAt wasn't explicitly recorded still show up.
  const collectedThisMonth = invoices.reduce((sum, i) => {
    if (i.amountPaidCents <= 0) return sum
    const dateStr = i.paidAt ?? i.updatedAt
    const d = new Date(dateStr)
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      return sum + i.amountPaidCents
    }
    return sum
  }, 0)

  // ── Metric definitions — funnel order ─────────────────────────────────────
  const metrics = [
    {
      label:      'Proposals sent',
      value:      String(proposalsSent),
      valueColor: proposalsSent > 0 ? 'var(--primary-text)' : 'var(--color-body)',
      sub:        proposalsSent === 0
        ? 'None out right now'
        : `${proposalsSent} awaiting approval`,
      subColor:   proposalsSent > 0 ? 'var(--tone-violet)' : 'var(--color-muted)',
      href:       '/proposals',
    },
    {
      label:      'Active projects',
      value:      String(pipelineProjects.length),
      valueColor: pipelineProjects.length > 0 ? 'var(--color-body)' : 'var(--text-faint)',
      sub:        inProductionCount > 0
        ? `${inProductionCount} in production`
        : pipelineProjects.length > 0
        ? `${pipelineProjects.length} in pipeline`
        : 'No active projects',
      subColor: 'var(--color-muted)',
      href:     undefined,
    },
    {
      label:      'Outstanding invoices',
      value:      formatMoney(outstanding),
      valueColor: 'var(--color-body)',
      sub:        overdueCount > 0 ? `${overdueCount} overdue` : 'All on track',
      subColor:   overdueCount > 0 ? 'var(--tone-red-2)' : 'var(--color-muted)',
      href:       '/invoices',
    },
    {
      label:      'Collected this month',
      value:      formatMoney(collectedThisMonth),
      valueColor: collectedThisMonth > 0 ? 'var(--tone-green-2)' : 'var(--color-body)',
      sub:        'Cash received',
      subColor:   'var(--color-muted)',
      href:       undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <MetricTile key={m.label} {...m} />
      ))}
    </div>
  )
}

function MetricTile({
  label, value, valueColor, sub, subColor, href,
}: {
  label: string
  value: string
  valueColor: string
  sub: string
  subColor: string
  href?: string
}) {
  const content = (
    <>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.07em]" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
      <p
        className="mt-2 text-[22px] md:text-[26px] font-semibold leading-none tabular-nums break-words"
        style={{ color: valueColor }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px]" style={{ color: subColor }}>
        {sub}
      </p>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block min-w-0 rounded-[10px] bg-white px-3.5 py-3.5 md:px-4 md:py-4 transition-colors hover:bg-muted/40"
        style={{ border: '0.5px solid var(--color-border)' }}
      >
        {content}
      </Link>
    )
  }

  return (
    <div className="min-w-0 rounded-[10px] bg-white px-3.5 py-3.5 md:px-4 md:py-4" style={{ border: '0.5px solid var(--color-border)' }}>
      {content}
    </div>
  )
}
