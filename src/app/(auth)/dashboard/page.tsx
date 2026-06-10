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
  const [projectsRaw, invoicesAll, invoicesWidget, proposals] = await Promise.all([
    db.project.findMany({
      where:   { workspaceId, archivedAt: null },
      include: {
        client:     true,
        // Grab the single most-recently-updated record from each related table
        budgets:     { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        proposals:   { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        invoices:    { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        callSheets:  { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
        actualSheets:{ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
      },
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

  // Sort by most recent activity across the project + all related models
  const projects = projectsRaw
    .map(({ budgets, proposals: proj_proposals, invoices: proj_invoices, callSheets, actualSheets, ...p }) => {
      const candidates: Date[] = [
        p.updatedAt,
        budgets[0]?.updatedAt,
        proj_proposals[0]?.updatedAt,
        proj_invoices[0]?.updatedAt,
        callSheets[0]?.updatedAt,
        actualSheets[0]?.updatedAt,
      ].filter((d): d is Date => d != null)
      const lastActivity = candidates.reduce((max, d) => (d > max ? d : max), candidates[0])
      return { ...p, lastActivity }
    })
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
    .slice(0, 10)

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
