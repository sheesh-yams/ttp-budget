import type { Project, Invoice, Proposal } from '@prisma/client'
import { formatMoney } from '@/lib/money'

interface Props {
  projects:  Project[]
  invoices:  Invoice[]
  proposals: Proposal[]
}

export function DashboardMetrics({ projects, invoices, proposals }: Props) {
  const activeProjects = projects.filter(p => p.status === 'ACTIVE').length

  const outstanding = invoices
    .filter(i => ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status))
    .reduce((sum, i) => sum + i.totalCents - i.amountPaidCents, 0)

  const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length

  const proposalsSent = proposals.filter(p => ['SENT', 'VIEWED'].includes(p.status)).length

  const collectedThisMonth = invoices
    .filter(i => {
      if (i.status !== 'PAID' || !i.paidAt) return false
      const now  = new Date()
      const paid = new Date(i.paidAt)
      return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()
    })
    .reduce((sum, i) => sum + i.totalCents, 0)

  const metrics = [
    {
      label:    'Active projects',
      value:    activeProjects.toString(),
      sub:      `${projects.length} total`,
      subColor: '#888780',
      accent:   '#5D00A4',
    },
    {
      label:    'Outstanding invoices',
      value:    formatMoney(outstanding),
      sub:      overdueCount > 0 ? `${overdueCount} overdue` : 'All on track',
      subColor: overdueCount > 0 ? '#dc2626' : '#888780',
      accent:   overdueCount > 0 ? '#dc2626' : '#5D00A4',
    },
    {
      label:    'Proposals sent',
      value:    proposalsSent.toString(),
      sub:      'Awaiting approval',
      subColor: '#888780',
      accent:   '#5D00A4',
    },
    {
      label:    'Collected this month',
      value:    formatMoney(collectedThisMonth),
      sub:      'Cash received',
      subColor: '#059669',
      accent:   '#04FFCC',
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
            className="mt-2 text-[26px] font-semibold leading-none"
            style={{ fontVariantNumeric: 'tabular-nums', color: '#2C2C2A' }}
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
