import { db } from '@/lib/db'
import { requireWorkspaceArea } from '@/lib/project-access'
import { ViewOnly } from '@/components/ui/view-only'
import { getWorkspaceId } from '@/lib/auth'
import { ClientsPageClient } from '@/components/clients/ClientsPageClient'
import { clientMoney } from '@/lib/client-money'
import { toInvoiceList } from '@/lib/project-billing'
import { primaryPhaseTotals, PRIMARY_PHASE_TOTALS_SELECT, type PrimaryPhaseRow } from '@/lib/primary-phase-totals'

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
          // Newest won version — a project can have more than one approved.
          proposals: { where: { status: 'APPROVED' }, orderBy: { version: 'desc' }, select: { approvedTotalCents: true }, take: 1 },
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
        select: { status: true, totalCents: true, amountPaidCents: true, dueDate: true, paidAt: true, updatedAt: true, projectId: true, isScopeAddition: true },
      },
    },
  })

  // Live budget totals, for "not invoiced yet" on booked projects without a
  // signed total. Phase has no workspaceId — scoped through its budget.
  const phases = showMoney
    ? await db.phase.findMany({ where: { isPrimary: true, budget: { workspaceId, project: { archivedAt: null } } }, select: PRIMARY_PHASE_TOTALS_SELECT })
    : []
  const budgetTotal = primaryPhaseTotals(phases as unknown as PrimaryPhaseRow[])

  const now = new Date()
  const enriched = clients.map(client => {
    const live = client.projects.filter(p => !p.archivedAt)
    const activeProjects = live.filter(p => p.status === 'ACTIVE').length
    const money = clientMoney(client.invoices, now)
    const toInvoice = showMoney ? toInvoiceList(client.projects.map(p => ({
      id: p.id, name: p.name,
      budgetCents: budgetTotal.get(p.id) ?? 0,
      approvedTotalCents: p.proposals[0]?.approvedTotalCents ?? null,
      won: p.proposals.length > 0,
      archived: !!p.archivedAt || p.status === 'ARCHIVED',
      wrapped: p.status === 'WRAPPED',
      invoices: client.invoices.filter(i => i.projectId === p.id),
    }))) : null

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
      toInvoice,
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
