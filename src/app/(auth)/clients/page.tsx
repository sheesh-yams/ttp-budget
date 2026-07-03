import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { ClientsPageClient } from '@/components/clients/ClientsPageClient'

export const metadata = { title: 'Clients' }

export default async function ClientsPage() {
  const workspaceId = await getWorkspaceId()

  const clients = await db.client.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { name: 'asc' },
    include: {
      projects: {
        where: { archivedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          invoices: {
            select: {
              totalCents: true,
              status: true,
              updatedAt: true,
            },
          },
          teamMembers: {
            where:  { unassignedAt: null, role: 'ACCOUNT_MANAGER' },
            select: { user: { select: { name: true, email: true, avatarUrl: true } } },
            take: 1,
          },
        },
      },
    },
  })

  const PAID_STATUSES       = new Set(['PAID'])
  const OUTSTANDING_STATUSES = new Set(['SENT', 'VIEWED', 'OVERDUE'])

  const enriched = clients.map(client => {
    let ltvCents         = 0
    let outstandingCents = 0
    let activeProjects   = 0
    let lastEngagementAt: Date | null = null

    for (const project of client.projects) {
      if (project.status === 'ACTIVE') activeProjects++

      for (const inv of project.invoices) {
        if (PAID_STATUSES.has(inv.status))       ltvCents         += inv.totalCents
        if (OUTSTANDING_STATUSES.has(inv.status)) outstandingCents += inv.totalCents

        // Track most recent invoice activity as the "last engagement" signal
        if (!lastEngagementAt || inv.updatedAt > lastEngagementAt) {
          lastEngagementAt = inv.updatedAt
        }
      }

      // Fall back to project update time if no invoices
      if (!lastEngagementAt || project.updatedAt > lastEngagementAt) {
        lastEngagementAt = project.updatedAt
      }
    }

    return {
      id:               client.id,
      name:             client.name,
      legalName:        (client as unknown as { legalName: string | null }).legalName,
      logoUrl:          client.logoUrl,
      contactName:      client.contactName,
      contactEmail:     client.contactEmail,
      contactPhone:     client.contactPhone,
      billingAddress:   client.billingAddress,
      website:          (client as unknown as { website: string | null }).website,
      notes:            client.notes,
      specialNotes:     (client as unknown as { specialNotes: string | null }).specialNotes,
      createdAt:        client.createdAt.toISOString(),
      projectCount:     client.projects.length,
      activeProjects,
      ltvCents,
      outstandingCents,
      lastEngagementAt: lastEngagementAt?.toISOString() ?? null,
      projects: client.projects.map(p => ({
        id:             p.id,
        name:           p.name,
        status:         p.status,
        accountManager: p.teamMembers[0]?.user ?? null,
      })),
    }
  })

  return <ClientsPageClient clients={enriched} />
}
