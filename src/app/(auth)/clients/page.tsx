import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ClientsPageClient } from '@/components/clients/ClientsPageClient'
import { sumAccount, type AccountInput } from '@/lib/totals'

export const metadata = { title: 'Clients — TTP Budget' }

export default async function ClientsPage() {
  const user = await getCurrentUser()

  const clients = await db.client.findMany({
    where: { workspaceId: user.workspaceId, archivedAt: null },
    orderBy: { name: 'asc' },
    include: {
      projects: {
        where: { archivedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          budgets: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            include: {
              phases: {
                where: { isPrimary: true },
                take: 1,
                include: {
                  accounts: {
                    where: { parentId: null },
                    include: {
                      lineItems: true,
                      children: { include: { lineItems: true } },
                    },
                  },
                },
              },
            },
          },
          proposals: {
            select: { id: true, status: true },
          },
        },
      },
      _count: { select: { invoices: true } },
    },
  })

  // Compute per-client totals server-side
  const enriched = clients.map(client => {
    let totalBudgetCents = 0
    let activeProjects   = 0

    for (const project of client.projects) {
      if (project.status === 'ACTIVE') activeProjects++
      const phase = project.budgets[0]?.phases[0]
      if (phase) {
        totalBudgetCents += phase.accounts.reduce(
          (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
          0
        )
      }
    }

    return {
      id:               client.id,
      name:             client.name,
      contactName:      client.contactName,
      contactEmail:     client.contactEmail,
      contactPhone:     client.contactPhone,
      notes:            client.notes,
      createdAt:        client.createdAt.toISOString(),
      projectCount:     client.projects.length,
      activeProjects,
      totalBudgetCents,
      invoiceCount:     client._count.invoices,
      recentProjectName: client.projects[0]?.name ?? null,
      recentProjectStatus: client.projects[0]?.status ?? null,
    }
  })

  return <ClientsPageClient clients={enriched} />
}
