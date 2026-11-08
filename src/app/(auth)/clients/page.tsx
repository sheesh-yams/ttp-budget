import { db } from '@/lib/db'
import { requireWorkspaceArea } from '@/lib/project-access'
import { ViewOnly } from '@/components/ui/view-only'
import { getWorkspaceId } from '@/lib/auth'
import { ClientsPageClient } from '@/components/clients/ClientsPageClient'
import { clientMoney } from '@/lib/client-money'

export const metadata = { title: 'Clients' }

export default async function ClientsPage() {
  // Roles 2b: the workspace clients permission.
  const access = await requireWorkspaceArea('clients')
  const workspaceId = await getWorkspaceId()
  // Margin-blind roles: no money figures (same gate as Projects).
  const showMoney = access.can('dashboardMoney')

  const clients = await db.client.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { name: 'asc' },
    include: {
      projects: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          phase: true,
          archivedAt: true,
          updatedAt: true,
          teamMembers: {
            where:  { unassignedAt: null, projectRole: { systemKey: 'ACCOUNT_MANAGER' } },
            orderBy: { assignedAt: 'asc' },
            select: { user: { select: { name: true, email: true, avatarUrl: true } } },
            take: 1,
          },
        },
      },
      // Money comes from every invoice, archived projects included — that
      // money is real (same call as the Dashboard).
      invoices: {
        select: { status: true, totalCents: true, amountPaidCents: true, dueDate: true, paidAt: true, updatedAt: true },
      },
    },
  })

  const now = new Date()
  const enriched = clients.map(client => {
    const live = client.projects.filter(p => !p.archivedAt)
    const activeProjects = live.filter(p => p.status === 'ACTIVE').length
    const money = clientMoney(client.invoices, now)

    // "Last engagement": the latest invoice or live-project activity.
    let lastEngagementAt: Date | null = null
    for (const d of [...client.invoices.map(i => i.updatedAt), ...live.map(p => p.updatedAt)]) {
      if (!lastEngagementAt || d > lastEngagementAt) lastEngagementAt = d
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
      projectCount:     live.length,
      activeProjects,
      collectedCents:   showMoney ? money.collectedCents : null,
      outstandingCents: showMoney ? money.outstandingCents : null,
      lastEngagementAt: lastEngagementAt?.toISOString() ?? null,
      projects: live.map(p => ({
        id:             p.id,
        name:           p.name,
        status:         p.status,
        phase:          p.phase,
        accountManager: p.teamMembers[0]?.user ?? null,
      })),
    }
  })

  return (
    <ViewOnly readOnly={!access.can('clients', 'EDIT')} what="clients">
      <ClientsPageClient clients={enriched} />
    </ViewOnly>
  )
}
