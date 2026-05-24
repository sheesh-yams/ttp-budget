import type { Project, Proposal } from '@prisma/client'
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
  proposals: Proposal[]
}

export function DashboardMetrics({ projects, invoices, proposals }: Props) {
  const now = new Date()

  // ── Proposals sent (active with client, not yet closed) ───────────────────
  const proposalsSent = proposals.filter(p =>
    ['SENT', 'VIEWED'].includes(p.status)
  ).length

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
      valueColor: proposalsSent > 0 ? '#5D00A4' : '#2C2C2A',
      sub:        proposalsSent === 0
        ? 'None out right now'
        : `${proposalsSent} awaiting approval`,
      subColor:   proposalsSent > 0 ? '#7C3AED' : '#888780',
    },
    {
      label:      'Active projects',
      value:      String(pipelineProjects.length),
      valueColor: pipelineProjects.length > 0 ? '#2C2C2A' : '#BBBBBB',
      sub:        inProductionCount > 0
        ? `${inProductionCount} in production`
        : pipelineProjects.length > 0
        ? `${pipelineProjects.length} in pipeline`
        : 'No active projects',
      subColor: '#888780',
    },
    {
      label:      'Outstanding invoices',
      value:      formatMoney(outstanding),
      valueColor: '#2C2C2A',
      sub:        overdueCount > 0 ? `${overdueCount} overdue` : 'All on track',
      subColor:   overdueCount > 0 ? '#dc2626' : '#888780',
    },
    {
      label:      'Collected this month',
      value:      formatMoney(collectedThisMonth),
      valueColor: collectedThisMonth > 0 ? '#059669' : '#2C2C2A',
      sub:        'Cash received',
      subColor:   '#888780',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-[10px] bg-white px-4 py-4"
          style={{ border: '0.5px solid #E8E0F0' }}
        >
          <p className="text-[10.5px] font-medium uppercase tracking-[0.07em]" style={{ color: '#888780' }}>
            {m.label}
          </p>
          <p
            className="mt-2 text-[26px] font-semibold leading-none tabular-nums"
            style={{ color: m.valueColor }}
          >
            {m.value}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: m.subColor }}>
            {m.sub}
          </p>
        </div>
      ))}
    </div>
  )
}
