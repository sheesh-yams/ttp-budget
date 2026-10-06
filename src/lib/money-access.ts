// Money permission gates (roles Phase 2a — proposals, invoices, actuals,
// contract). Server-only; plain module, not 'use server'.
//
// Same pattern as production-access.ts: every money action takes some id
// (proposal, invoice, actual sheet/entry, receipt, budget, contract section…).
// This resolves it to its project in the ACTIVE workspace and checks the
// caller's level for an area there. An id outside the workspace — or on a
// project the caller can't open — answers "not found", never confirming it
// exists.

import { db } from '@/lib/db'
import { getAccess, getProjectAccess, type ProjectAccess } from '@/lib/access'
import { atLeast, type Level, type ProjectArea } from '@/lib/permissions'

export type MoneyTarget =
  | { projectId: string }
  | { proposalId: string }
  | { invoiceId: string }
  | { budgetId: string }
  | { actualSheetId: string }
  | { actualEntryId: string }
  | { receiptId: string }
  | { contractSectionId: string }

export type MoneyGate = {
  ok:          boolean
  error:       { success: false; error: string } | null
  userId:      string
  workspaceId: string
  projectId:   string | null
  project:     ProjectAccess | null
}

/** The project the target belongs to, in this workspace. Exported for tests. */
export async function moneyTargetProjectId(target: MoneyTarget, workspaceId: string): Promise<string | null> {
  // Prisma drops `{ id: undefined }` — refuse empty / non-string ids outright.
  const id = Object.values(target)[0] as unknown
  if (typeof id !== 'string' || id.length === 0) return null
  const ws = { workspaceId }
  const pid = (row: { projectId: string } | null) => row?.projectId ?? null

  if ('projectId' in target)     return (await db.project.findFirst({ where: { id, ...ws }, select: { id: true } }))?.id ?? null
  if ('proposalId' in target)    return pid(await db.proposal.findFirst({ where: { id, ...ws }, select: { projectId: true } }))
  if ('invoiceId' in target)     return pid(await db.invoice.findFirst({ where: { id, ...ws }, select: { projectId: true } }))
  if ('budgetId' in target)      return pid(await db.budget.findFirst({ where: { id, ...ws }, select: { projectId: true } }))
  if ('actualSheetId' in target) return pid(await db.actualSheet.findFirst({ where: { id, ...ws }, select: { projectId: true } }))
  if ('receiptId' in target)     return pid(await db.receipt.findFirst({ where: { id, ...ws }, select: { projectId: true } }))
  if ('actualEntryId' in target) {
    // ActualEntry has no workspaceId — scope through its sheet.
    const e = await db.actualEntry.findFirst({ where: { id, actualSheet: ws }, select: { actualSheet: { select: { projectId: true } } } })
    return e?.actualSheet.projectId ?? null
  }
  const s = await db.proposalContractSection.findFirst({ where: { id, ...ws }, select: { proposal: { select: { projectId: true } } } })
  return s?.proposal.projectId ?? null
}

/**
 * Gate a money action. Same shape as the access.ts gates, plus the project and
 * the caller's ProjectAccess. `also` adds further area requirements (e.g. the
 * wrap report needs Budget margin as well as Actuals).
 */
export async function requireMoneyPermission(
  target: MoneyTarget, area: ProjectArea, level: Level,
  also: { area: ProjectArea; level: Level }[] = [],
): Promise<MoneyGate> {
  const access = await getAccess()
  const base = { userId: access.userId, workspaceId: access.workspaceId }
  const notFound: MoneyGate = { ...base, ok: false, error: { success: false, error: 'Not found' }, projectId: null, project: null }

  const projectId = await moneyTargetProjectId(target, access.workspaceId)
  if (!projectId) return notFound
  const project = await getProjectAccess(projectId)
  if (!project) return notFound

  const ok = project.can(area, level) && also.every(r => project.can(r.area, r.level))
  return { ...base, ok, error: ok ? null : { success: false, error: 'UNAUTHORIZED_ROLE' }, projectId, project }
}

/**
 * Which projects' rows a workspace-wide money list (/invoices, /proposals) may
 * show: those where the caller has the project area. Null = every project —
 * the baseline already grants it on every project they can open with ALL
 * scope (the common Owner / Producer case, no filter needed).
 */
export async function projectsWithArea(area: ProjectArea, level: Level = 'VIEW'): Promise<string[] | null> {
  const access = await getAccess()
  if (access.isOwner) return null
  if (access.projectScope === 'ALL' && atLeast(access.baseline[area], level)) return null

  // Otherwise only projects they're on can grant it (via the baseline under
  // ASSIGNED scope, or a project role) — check each with the real resolver.
  const [team, assigned] = await Promise.all([
    db.projectTeamMember.findMany({ where: { userId: access.userId, workspaceId: access.workspaceId, unassignedAt: null }, select: { projectId: true } }),
    db.projectAssignment.findMany({ where: { userId: access.userId, project: { workspaceId: access.workspaceId } }, select: { projectId: true } }),
  ])
  const candidates = [...new Set([...team, ...assigned].map(r => r.projectId))]
  const checked = await Promise.all(candidates.map(async id => ((await getProjectAccess(id))?.can(area, level) ? id : null)))
  return checked.filter((id): id is string => id !== null)
}
