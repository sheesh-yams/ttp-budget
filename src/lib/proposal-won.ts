// Side effects of a proposal being won, shared by the manual "Won" status
// change (updateProposalStatus) and the client e-signature approval route so
// both paths behave identically. Plain module, not 'use server', so nothing
// here is exposed as a callable server action.

import { revalidatePath } from 'next/cache'
import type { ScopedDb } from '@/lib/db-scoped'

export async function applyProposalWonEffects(sdb: ScopedDb, proposalId: string, projectId: string) {
  // Won proposal → promote project Lead → Active
  await sdb.project.updateMany({
    where: { id: projectId, status: 'LEAD' },
    data:  { status: 'ACTIVE' },
  })

  // Fire-and-forget: delete unassigned placeholders not in the new proposal,
  // flag assigned members whose role disappeared, add missing placeholders.
  reconcileTeamFromWonProposal(projectId, proposalId, sdb).catch(() => {})
}

// ─── Won proposal → Teams page reconciliation ────────────────────────────────
// Called fire-and-forget from applyProposalWonEffects.
//
// Rules:
//  • Unassigned placeholder whose role is NOT in the new proposal  → delete
//  • Assigned member whose role IS in the new proposal             → clear mismatchFlag
//  • Assigned member whose role is NOT in the new proposal         → set mismatchFlag (red card)
//  • Role in new proposal with fewer slots than needed             → add unassigned placeholders

async function reconcileTeamFromWonProposal(
  projectId: string,
  proposalId: string,
  sdb: ScopedDb,
) {
  // Fetch the proposal's budgetId
  const proposal = await sdb.proposal.findFirst({
    where: { id: proposalId },
    select: { budgetId: true },
  })
  if (!proposal?.budgetId) return

  // Get primary phase
  const phase =
    (await sdb.phase.findFirst({ where: { budgetId: proposal.budgetId as string, isPrimary: true }, select: { id: true } })) ??
    (await sdb.phase.findFirst({ where: { budgetId: proposal.budgetId as string }, orderBy: { order: 'asc' }, select: { id: true } }))
  if (!phase) return

  // Get CREW line items — same filter as importCrewFromBudget
  const crewWhere = {
    OR: [
      { lineItemCategory: 'CREW' },
      { lineItemCategory: null, rateCard: { category: { in: ['CREW', 'TALENT'] } } },
    ],
  } as import('@prisma/client').Prisma.LineItemWhereInput

  const accounts = await sdb.account.findMany({
    where:   { phaseId: phase.id, parentId: null },
    orderBy: { order: 'asc' },
    select:  {
      name:      true,
      lineItems: {
        where:   crewWhere,
        orderBy: { order: 'asc' },
        select:  { description: true, quantity: true, quantityFormula: true, rateCents: true, unit: true },
      },
      children: {
        orderBy: { order: 'asc' },
        select:  {
          name:      true,
          lineItems: {
            where:   crewWhere,
            orderBy: { order: 'asc' },
            select:  { description: true, quantity: true, quantityFormula: true, rateCents: true, unit: true },
          },
        },
      },
    },
  })

  function headcountOf(qty: unknown, formula: string | null): number {
    const match = formula?.match(/^(\d+(?:\.\d+)?)[x×]/)
    if (match) return Math.max(1, Math.round(Number(match[1])))
    return Math.max(1, Math.round(Number(qty)))
  }

  // Build: role → { dept, count, rateCents, unit }
  const proposalRoles = new Map<string, { dept: string; count: number; rateCents: number | null; unit: string }>()
  for (const acc of accounts) {
    const allItems = [
      ...acc.lineItems.map(i => ({ dept: acc.name, item: i })),
      ...acc.children.flatMap(c => c.lineItems.map(i => ({ dept: c.name, item: i }))),
    ]
    for (const { dept, item } of allItems) {
      const hc  = headcountOf(item.quantity, item.quantityFormula)
      const key = item.description
      const cur = proposalRoles.get(key)
      if (cur) cur.count += hc
      else proposalRoles.set(key, { dept, count: hc, rateCents: item.rateCents, unit: item.unit })
    }
  }

  const proposalRoleNames = new Set(proposalRoles.keys())

  // Load current team
  const currentMembers = await sdb.projectMember.findMany({
    where:  { projectId },
    select: { id: true, name: true, role: true, department: true, order: true },
  })

  const isAssigned = (m: { name: string }) => m.name !== 'Unassigned'

  const toDelete:       string[] = []
  const toMismatch:     string[] = []
  const toClearMismatch: string[] = []

  for (const m of currentMembers) {
    if (proposalRoleNames.has(m.role)) {
      toClearMismatch.push(m.id)
    } else if (isAssigned(m)) {
      toMismatch.push(m.id)
    } else {
      toDelete.push(m.id)
    }
  }

  // Execute changes
  if (toDelete.length > 0)       await sdb.projectMember.deleteMany({ where: { id: { in: toDelete } } })
  if (toMismatch.length > 0)     await sdb.projectMember.updateMany({ where: { id: { in: toMismatch } }, data: { mismatchFlag: true } })
  if (toClearMismatch.length > 0) await sdb.projectMember.updateMany({ where: { id: { in: toClearMismatch } }, data: { mismatchFlag: false } })

  // Add placeholders for roles that need more slots than currently exist
  const remaining = currentMembers.filter(m => !toDelete.includes(m.id))
  const currentRoleCount = new Map<string, number>()
  for (const m of remaining) currentRoleCount.set(m.role, (currentRoleCount.get(m.role) ?? 0) + 1)

  let maxOrder = Math.max(-1, ...currentMembers.map(m => m.order))
  const toCreate: Parameters<typeof sdb.projectMember.createMany>[0]['data'] = []

  for (const [role, { dept, count, rateCents, unit }] of proposalRoles.entries()) {
    const existing  = currentRoleCount.get(role) ?? 0
    const needed    = Math.max(0, count - existing)
    for (let i = 0; i < needed; i++) {
      toCreate.push({
        projectId,
        contactId:    null,
        name:         'Unassigned',
        role,
        department:   dept,
        email:        null,
        phone:        null,
        rateCents:    rateCents,
        rateUnit:     unit as import('@prisma/client').RateUnit,
        callTime:     null,
        mismatchFlag: false,
        order:        ++maxOrder,
      })
    }
  }

  if (toCreate.length > 0) await sdb.projectMember.createMany({ data: toCreate })

  revalidatePath(`/projects/${projectId}/crew`)
}
