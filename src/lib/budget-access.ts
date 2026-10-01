// Budget permission gates (roles Phase 2). Server-only; plain module.
//
// Budget actions take every kind of id (line item, account, phase, section,
// budget). This resolves any of them to its project in the ACTIVE workspace
// and checks the caller's level for a budget area there:
//   budget.lines  — structure: accounts, sections, lines, qty, unit, phases
//   budget.costs  — rates and anything that sets them (rate cards, packages)
//   budget.margin — markup, agency fee, discount
// An id outside the workspace — or on a project the caller can't open —
// answers "not found", never confirming it exists.

import { db } from '@/lib/db'
import { getAccess, getProjectAccess, type ProjectAccess } from '@/lib/access'
import type { Level, ProjectArea } from '@/lib/permissions'

export type BudgetTarget =
  | { projectId: string }
  | { budgetId: string }
  | { phaseId: string }
  | { sectionId: string }
  | { accountId: string }
  | { lineItemId: string }
  | { lineItemIds: string[] }
  | { accountIds: string[] }

export type BudgetGate = {
  ok:          boolean
  error:       { success: false; error: string } | null
  userId:      string
  workspaceId: string
  /** The project the target belongs to (null when not found). */
  projectId:   string | null
  /** Every project a bulk target touches (one for single targets). */
  projectIds:  string[]
  /** The caller's access on that project, for field-level checks. */
  project:     ProjectAccess | null
}

/** All project ids the target touches (several only for the bulk forms). Exported for tests. */
export async function budgetTargetProjectIds(target: BudgetTarget, workspaceId: string): Promise<string[] | null> {
  // Prisma drops `{ id: undefined }` from a where — an empty id would match an
  // arbitrary row. Refuse it outright.
  const ids = Object.values(target).flat() as unknown[]
  if (ids.length === 0 || ids.some(id => typeof id !== 'string' || id.length === 0)) return null
  const ws = { workspaceId }
  if ('projectId' in target) {
    const p = await db.project.findFirst({ where: { id: target.projectId, ...ws }, select: { id: true } })
    return p ? [p.id] : null
  }
  if ('budgetId' in target) {
    const b = await db.budget.findFirst({ where: { id: target.budgetId, ...ws }, select: { projectId: true } })
    return b ? [b.projectId] : null
  }
  if ('phaseId' in target) {
    const ph = await db.phase.findFirst({ where: { id: target.phaseId, ...ws }, select: { budget: { select: { projectId: true } } } })
    return ph ? [ph.budget.projectId] : null
  }
  if ('sectionId' in target) {
    const s = await db.budgetSection.findFirst({ where: { id: target.sectionId, ...ws }, select: { phase: { select: { budget: { select: { projectId: true } } } } } })
    return s ? [s.phase.budget.projectId] : null
  }
  if ('accountId' in target || 'accountIds' in target) {
    const accIds = 'accountId' in target ? [target.accountId] : [...new Set(target.accountIds)]
    const rows = await db.account.findMany({ where: { id: { in: accIds }, ...ws }, select: { phase: { select: { budget: { select: { projectId: true } } } } } })
    if (rows.length !== accIds.length) return null
    return [...new Set(rows.map(r => r.phase.budget.projectId))]
  }
  const lineIds = 'lineItemId' in target ? [target.lineItemId] : [...new Set(target.lineItemIds)]
  const rows = await db.lineItem.findMany({
    where:  { id: { in: lineIds }, ...ws },
    select: { account: { select: { phase: { select: { budget: { select: { projectId: true } } } } } } },
  })
  if (rows.length !== lineIds.length) return null
  return [...new Set(rows.map(r => r.account.phase.budget.projectId))]
}

/**
 * Who may browse every project's budget (clone pickers list all of them, with
 * totals and rates): Producer-level — all projects, library, and margin in the
 * baseline. A project role only ever grants access to its own project.
 */
export function canBrowseAllBudgets(access: Awaited<ReturnType<typeof getAccess>>): boolean {
  return access.isOwner || (
    access.projectScope === 'ALL' &&
    access.can('library') &&
    access.baseline['budget.margin'] !== 'NONE'
  )
}

/**
 * Gate a budget action. Same shape as requireRole's gate, plus the project
 * and the caller's ProjectAccess for field-level decisions.
 * Targets spanning several projects must pass on every one of them.
 */
export async function requireBudgetPermission(
  target: BudgetTarget, area: ProjectArea, level: Level,
): Promise<BudgetGate> {
  const access = await getAccess()
  const base = { userId: access.userId, workspaceId: access.workspaceId }
  const notFound: BudgetGate = { ...base, ok: false, error: { success: false, error: 'Not found' }, projectId: null, projectIds: [], project: null }

  const projectIds = await budgetTargetProjectIds(target, access.workspaceId)
  if (!projectIds || projectIds.length === 0) return notFound

  const projects = await Promise.all(projectIds.map(id => getProjectAccess(id)))
  if (projects.some(p => !p)) return notFound

  const ok = projects.every(p => p!.can(area, level))
  return {
    ...base,
    ok,
    error:     ok ? null : { success: false, error: 'UNAUTHORIZED_ROLE' },
    projectId: projectIds[0],
    projectIds,
    project:   projects[0],
  }
}
