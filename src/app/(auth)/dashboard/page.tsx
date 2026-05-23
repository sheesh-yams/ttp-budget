import { Suspense } from 'react'
import { auth } from '@clerk/nextjs/server'
import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics'
import { RecentProjects } from '@/components/dashboard/RecentProjects'
import { InvoiceTracker } from '@/components/dashboard/InvoiceTracker'
import { ProposalQueue } from '@/components/dashboard/ProposalQueue'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const workspaceId = await getWorkspaceId()

  // Parallel data fetches
  const [projects, invoices, proposals] = await Promise.all([
    db.project.findMany({
      where: { workspaceId, archivedAt: null },
      include: { client: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    db.invoice.findMany({
      where: { workspaceId },
      include: { client: true, project: true },
      orderBy: { dueDate: 'asc' },
      take: 8,
    }),
    db.proposal.findMany({
      where: { workspaceId, status: { in: ['SENT', 'VIEWED', 'APPROVED'] } },
      include: { project: { include: { client: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ])

  return (
    <div className="space-y-6">
      <DashboardMetrics projects={projects} invoices={invoices} />
      <RecentProjects projects={projects} />
      <div className="grid grid-cols-2 gap-4">
        <InvoiceTracker invoices={invoices} />
        <ProposalQueue proposals={proposals} />
      </div>
    </div>
  )
}
