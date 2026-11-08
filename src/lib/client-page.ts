// Loads one client's page (/clients/[id]). Kept out of the page so a script
// can check the numbers against live data. Every query is filtered by
// workspaceId explicitly (Phase has no workspaceId column of its own — it's
// reached through its budget). Visibility is decided by the caller and passed
// in as project-id lists, the same lists the /proposals and /invoices pages use.

import type { Prisma, PrismaClient } from '@prisma/client'
import { primaryPhaseTotals, PRIMARY_PHASE_TOTALS_SELECT, type PrimaryPhaseRow } from '@/lib/primary-phase-totals'
import { addedScopeCents } from '@/lib/project-value'
import { clientMoney, type ClientMoney } from '@/lib/client-money'
import { buildClientActivity, type ActivityEntry } from '@/lib/client-activity'

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

/** Project ids with an area; null = every project; false = the area is hidden. */
export type AreaVisibility = string[] | null | false

export interface ClientPageProject {
  id: string; name: string; status: string; phase: string
  archived: boolean
  shootStart: string | null
  createdAt: string
  /** Null without money access. */
  valueCents: number | null
  collectedCents: number | null
}

export interface ClientPageInvoice {
  id: string; number: string; title: string | null; status: string
  totalCents: number; amountPaidCents: number
  issueDate: string; dueDate: string; publicToken: string
  /** Archived = hidden from invoice lists, still counted in totals. */
  archived: boolean
  project: { id: string; name: string }
}

export interface ClientPageData {
  client: {
    id: string; name: string; legalName: string | null; logoUrl: string | null
    contactName: string | null; contactEmail: string | null; contactPhone: string | null
    billingAddress: string | null; website: string | null
    notes: string | null; specialNotes: string | null
    archived: boolean; createdAt: string
  }
  projects: ClientPageProject[]
  /** Empty when the invoices area is hidden. */
  invoices: ClientPageInvoice[]
  /** Null without money access. Over every invoice on the projects they can see. */
  money: ClientMoney | null
  activity: ActivityEntry[]
}

export async function loadClientPage(db: PrismaClient, workspaceId: string, clientId: string, opts: {
  /** Which projects the viewer can open (ASSIGNED scope → their assignments). */
  projectWhere: Prisma.ProjectWhereInput
  showMoney:    boolean
  invoices:     AreaVisibility
  proposals:    AreaVisibility
  delivery:     AreaVisibility
  now?:         Date
}): Promise<ClientPageData | null> {
  const now = opts.now ?? new Date()
  const client = await db.client.findFirst({
    where: { id: clientId, workspaceId },
    select: {
      id: true, name: true, legalName: true, logoUrl: true, contactName: true, contactEmail: true,
      contactPhone: true, billingAddress: true, website: true, notes: true, specialNotes: true,
      archivedAt: true, createdAt: true,
    },
  })
  if (!client) return null

  const projects = await db.project.findMany({
    where:   { AND: [{ workspaceId, clientId }, opts.projectWhere] },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, status: true, phase: true, archivedAt: true, shootStartDate: true, createdAt: true,
      proposals: { where: { status: 'APPROVED' }, select: { approvedTotalCents: true }, take: 1 },
    },
  })
  const projectIds = projects.map(p => p.id)
  const projectName = new Map(projects.map(p => [p.id, p.name]))
  const allowed = (v: AreaVisibility) => (v === false ? [] : v === null ? projectIds : projectIds.filter(id => v.includes(id)))

  // Every invoice on the projects they can open — for the money figures.
  const allInvoices = projectIds.length ? await db.invoice.findMany({
    where:   { workspaceId, clientId, projectId: { in: projectIds } },
    orderBy: { issueDate: 'desc' },
    select: {
      id: true, number: true, title: true, status: true, totalCents: true, amountPaidCents: true,
      issueDate: true, dueDate: true, sentAt: true, paidAt: true, firstViewedAt: true, publicToken: true,
      projectId: true, isScopeAddition: true, archivedAt: true,
    },
  }) : []

  const phases = opts.showMoney && projectIds.length
    ? await db.phase.findMany({ where: { isPrimary: true, budget: { workspaceId, projectId: { in: projectIds } } }, select: PRIMARY_PHASE_TOTALS_SELECT })
    : []
  const budgetTotal = primaryPhaseTotals(phases as unknown as PrimaryPhaseRow[])

  const invoiceIds = new Set(allowed(opts.invoices))
  const invoices = allInvoices.filter(i => invoiceIds.has(i.projectId))

  const proposalIds = allowed(opts.proposals)
  const proposals = proposalIds.length ? await db.proposal.findMany({
    where:  { workspaceId, projectId: { in: proposalIds }, status: { not: 'DRAFT' } },
    select: { projectId: true, title: true, status: true, sentAt: true, firstViewedAt: true, approvedAt: true, declinedAt: true },
  }) : []

  const deliveryIds = allowed(opts.delivery)
  const views = deliveryIds.length ? await db.deliverableVersion.findMany({
    where:   { workspaceId, firstClientViewAt: { not: null }, deliverable: { deliveryPage: { projectId: { in: deliveryIds } } } },
    orderBy: { firstClientViewAt: 'desc' },
    take:    50,
    select:  { firstClientViewAt: true, deliverable: { select: { title: true, deliveryPage: { select: { projectId: true } } } } },
  }) : []

  return {
    client: {
      id: client.id, name: client.name, legalName: client.legalName, logoUrl: client.logoUrl,
      contactName: client.contactName, contactEmail: client.contactEmail, contactPhone: client.contactPhone,
      billingAddress: client.billingAddress, website: client.website,
      notes: client.notes, specialNotes: client.specialNotes,
      archived: !!client.archivedAt, createdAt: client.createdAt.toISOString(),
    },
    projects: projects.map(p => {
      const inv = allInvoices.filter(i => i.projectId === p.id)
      const budget = budgetTotal.get(p.id) ?? 0
      // Same as the Projects page: budget (or the won total without one) plus
      // added scope, never less than what's been billed.
      const expected = (budget > 0 ? budget : (p.proposals[0]?.approvedTotalCents ?? 0)) + addedScopeCents(inv)
      const invoiced = inv.reduce((s, i) => s + (i.status === 'VOID' || i.status === 'DRAFT' ? 0 : i.totalCents), 0)
      return {
        id: p.id, name: p.name, status: p.status, phase: p.phase,
        archived: !!p.archivedAt || p.status === 'ARCHIVED',
        shootStart: iso(p.shootStartDate)?.slice(0, 10) ?? null,
        createdAt: p.createdAt.toISOString(),
        valueCents:     opts.showMoney ? Math.max(expected, invoiced) : null,
        collectedCents: opts.showMoney ? inv.reduce((s, i) => s + (i.status === 'VOID' ? 0 : i.amountPaidCents), 0) : null,
      }
    }),
    invoices: invoices.map(i => ({
      id: i.id, number: i.number, title: i.title, status: i.status,
      totalCents: i.totalCents, amountPaidCents: i.amountPaidCents,
      issueDate: i.issueDate.toISOString(), dueDate: i.dueDate.toISOString(), publicToken: i.publicToken,
      archived: !!i.archivedAt,
      project: { id: i.projectId, name: projectName.get(i.projectId) ?? '' },
    })),
    money: opts.showMoney ? clientMoney(allInvoices, now) : null,
    activity: buildClientActivity({
      projects,
      proposals: proposals.map(p => ({ ...p, projectName: projectName.get(p.projectId) ?? '' })),
      invoices:  invoices.filter(i => !i.archivedAt).map(i => ({ projectId: i.projectId, number: i.number, sentAt: i.sentAt, firstViewedAt: i.firstViewedAt, paidAt: i.paidAt })),
      deliverables: views.map(v => ({ projectId: v.deliverable.deliveryPage.projectId, title: v.deliverable.title, firstClientViewAt: v.firstClientViewAt })),
    }),
  }
}
