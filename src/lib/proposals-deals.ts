// Loads the /proposals deal rows for one workspace. Kept out of the page so
// scripts can check the numbers against live data. Every query is filtered by
// workspaceId explicitly (Phase has no workspaceId column of its own).

import { Prisma, type PrismaClient } from '@prisma/client'
import { primaryPhaseTotals, PRIMARY_PHASE_TOTALS_SELECT, type PrimaryPhaseRow } from '@/lib/primary-phase-totals'
import { frozenTotalCents, pickProposal, type DealRow } from '@/lib/proposals-board'

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export async function loadDeals(db: PrismaClient, workspaceId: string, opts: {
  /** Project ids with Proposals access; null = all. */
  visible:  string[] | null
  /** Project ids with Proposals edit; null = all. */
  editable: string[] | null
  showMoney: boolean
  /** Only this client's deals (the client page). */
  clientId?: string
}): Promise<DealRow[]> {
  const { visible, editable, showMoney, clientId } = opts
  // Deals: every live project with a proposal, plus leads with none yet.
  const projects = await db.project.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      ...(visible ? { id: { in: visible } } : {}),
      ...(clientId ? { clientId } : {}),
      OR: [{ proposals: { some: {} } }, { status: 'LEAD' }],
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, status: true,
      client: { select: { id: true, name: true, logoUrl: true } },
      // Any sent invoice makes a lead booked work (see isBooked in projects-table).
      invoices: { where: { status: { notIn: ['DRAFT', 'VOID'] } }, select: { id: true }, take: 1 },
      teamMembers: {
        where:   { unassignedAt: null, projectRole: { systemKey: 'ACCOUNT_MANAGER' } },
        orderBy: { assignedAt: 'asc' },
        take:    1,
        select:  { userId: true, user: { select: { name: true, email: true, avatarUrl: true } } },
      },
      proposals: {
        select: {
          id: true, title: true, publicToken: true, status: true, version: true, viewCount: true,
          sentAt: true, lastViewedAt: true, expiresAt: true, approvedAt: true, declinedAt: true,
          updatedAt: true, signatureName: true, approvedTotalCents: true,
        },
      },
    },
  })
  const projectIds = projects.map(p => p.id)
  const picked = new Map(projects.map(p => [p.id, pickProposal(p.proposals)]))

  // Live budget totals: the value of drafts and not-started leads, and whether
  // a lead has a budget at all. Phase has no workspaceId, so scope by project.
  const phases = projectIds.length
    ? await db.phase.findMany({ where: { isPrimary: true, budget: { workspaceId, projectId: { in: projectIds } } }, select: PRIMARY_PHASE_TOTALS_SELECT })
    : []
  const liveTotal = primaryPhaseTotals(phases as unknown as PrimaryPhaseRow[])

  // Sent proposals are worth what the client was shown: the total frozen into
  // content at send. Read just those two JSON fields, not the whole content.
  const frozenIds = showMoney
    ? [...picked.values()].flatMap(x => (x && x.rep.status !== 'DRAFT' && x.rep.approvedTotalCents == null ? [x.rep.id] : []))
    : []
  const frozen = new Map<string, number | null>()
  if (frozenIds.length) {
    const rows = await db.$queryRaw<{ id: string; top: unknown; snap: unknown }[]>`
      SELECT id, content->'totalCents' AS "top", content->'budgetSnapshot'->'totalCents' AS "snap"
      FROM "Proposal" WHERE "workspaceId" = ${workspaceId} AND id IN (${Prisma.join(frozenIds)})`
    for (const r of rows) frozen.set(r.id, frozenTotalCents({ totalCents: r.top, budgetSnapshot: { totalCents: r.snap } }))
  }

  // Won / lost dates for decisions without their own timestamp (manual wins
  // never set approvedAt; LOST has no column). Latest audit event per proposal.
  const repIds = [...picked.values()].flatMap(x => (x && ['APPROVED', 'LOST'].includes(x.rep.status) ? [x.rep.id] : []))
  const decided = new Map<string, Date>()
  if (repIds.length) {
    const events = await db.auditEvent.findMany({
      where:   { workspaceId, entityType: 'Proposal', entityId: { in: repIds }, action: { in: ['proposal.approved', 'proposal.lost'] } },
      orderBy: { createdAt: 'asc' },
      select:  { entityId: true, action: true, createdAt: true },
    })
    const want = new Map([...picked.values()].flatMap(x => (x ? [[x.rep.id, x.rep.status === 'APPROVED' ? 'proposal.approved' : 'proposal.lost'] as const] : [])))
    for (const e of events) if (e.entityId && want.get(e.entityId) === e.action) decided.set(e.entityId, e.createdAt)
  }

  const rows: DealRow[] = projects.flatMap(p => {
    const pick = picked.get(p.id) ?? null
    // A project with no proposal is a deal only while it's an unbilled lead
    // (not invoice-first or already-invoiced work).
    if (!pick && (p.status !== 'LEAD' || p.invoices.length > 0)) return []
    const live = liveTotal.get(p.id) ?? 0
    const r = pick?.rep
    const value = !r || r.status === 'DRAFT' ? live : (r.approvedTotalCents ?? frozen.get(r.id) ?? live)
    const am = p.teamMembers[0]
    return [{
      key:     r?.id ?? `p:${p.id}`,
      project: { id: p.id, name: p.name, status: p.status },
      client:  p.client,
      owner:   am ? { userId: am.userId, ...am.user } : null,
      proposal: r ? {
        id: r.id, title: r.title, token: r.publicToken, status: r.status, version: r.version,
        otherVersions: pick!.others, draftAbove: pick!.draftAbove, viewCount: r.viewCount,
        sentAt: iso(r.sentAt), lastViewedAt: iso(r.lastViewedAt), expiresAt: iso(r.expiresAt),
        approvedAt: iso(r.approvedAt), declinedAt: iso(r.declinedAt), updatedAt: r.updatedAt.toISOString(),
        decidedAt: iso(decided.get(r.id) ?? null),
        signatureName: r.signatureName,
      } : null,
      hasBudget:  live > 0,
      valueCents: showMoney ? value : null,
      canEdit:    editable === null || editable.includes(p.id),
    }]
  })

  return rows
}
