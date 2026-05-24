import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics'
import { RecentProjects } from '@/components/dashboard/RecentProjects'
import { InvoiceTracker } from '@/components/dashboard/InvoiceTracker'
import { ProposalQueue } from '@/components/dashboard/ProposalQueue'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const workspaceId = await getWorkspaceId()

  // ── Parallel fetches ─────────────────────────────────────────────────────────
  // invoicesAll  → lightweight, no relations, used for metric calculations
  // invoicesWidget → includes relations, limited to 5, used for the tracker widget
  const [projects, invoicesAll, invoicesWidget, proposals] = await Promise.all([
    db.project.findMany({
      where:   { workspaceId, archivedAt: null },
      include: { client: true },
      orderBy: { updatedAt: 'desc' },
      take:    10,
    }),
    db.invoice.findMany({
      where:   { workspaceId },
      select:  {
        status:          true,
        totalCents:      true,
        amountPaidCents: true,
        dueDate:         true,
        paidAt:          true,
        updatedAt:       true,
      },
    }),
    db.invoice.findMany({
      where:   { workspaceId },
      include: { client: true, project: true },
      orderBy: { dueDate: 'asc' },
      take:    5,
    }),
    db.proposal.findMany({
      where:   { workspaceId, status: { in: ['SENT', 'VIEWED', 'APPROVED'] } },
      include: { project: { include: { client: true } } },
      orderBy: { updatedAt: 'desc' },
      take:    5,
    }),
  ])

  return (
    <div className="space-y-6">
      <DashboardMetrics projects={projects} invoices={invoicesAll} proposals={proposals} />
      <RecentProjects projects={projects} />
      <div className="grid grid-cols-2 gap-4">
        <InvoiceTracker invoices={invoicesWidget} />
        <ProposalQueue proposals={proposals} />
      </div>
    </div>
  )
}
