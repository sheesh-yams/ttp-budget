import type { Project, Invoice } from '@prisma/client'
import { formatMoney } from '@/lib/money'

interface Props {
  projects: Project[]
  invoices: Invoice[]
}

export function DashboardMetrics({ projects, invoices }: Props) {
  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length

  const outstanding = invoices
    .filter((i) => ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status))
    .reduce((sum, i) => sum + i.totalCents - i.amountPaidCents, 0)

  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length

  const proposalsSent = 0 // TODO: wire from proposals prop in Phase 2

  const collectedThisMonth = invoices
    .filter((i) => {
      if (i.status !== 'PAID' || !i.paidAt) return false
      const now = new Date()
      const paid = new Date(i.paidAt)
      return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()
    })
    .reduce((sum, i) => sum + i.totalCents, 0)

  const metrics = [
    {
      label: 'Active projects',
      value: activeProjects.toString(),
      sub: `${projects.length} total`,
      subColor: 'text-muted-foreground',
    },
    {
      label: 'Outstanding invoices',
      value: formatMoney(outstanding),
      sub: overdueCount > 0 ? `${overdueCount} overdue` : 'All on track',
      subColor: overdueCount > 0 ? 'text-red-600' : 'text-muted-foreground',
    },
    {
      label: 'Proposals sent',
      value: proposalsSent.toString(),
      sub: 'Awaiting approval',
      subColor: 'text-muted-foreground',
    },
    {
      label: 'Collected this month',
      value: formatMoney(collectedThisMonth),
      sub: 'Cash received',
      subColor: 'text-emerald-700',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-xl border border-border bg-white p-4"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
            {m.label}
          </p>
          <p className="mt-1.5 text-[22px] font-medium tabular text-foreground">
            {m.value}
          </p>
          <p className={`mt-0.5 text-[11px] ${m.subColor}`}>{m.sub}</p>
        </div>
      ))}
    </div>
  )
}
