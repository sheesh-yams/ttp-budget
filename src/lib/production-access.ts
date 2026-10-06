// Production permission gates (roles Phase 2 — schedule, delivery, call
// sheets). Server-only; plain module, not 'use server'.
//
// Like budget-access.ts: every production action takes some id (shoot day,
// scene, schedule entry, delivery asset, call sheet…). This resolves it to its
// project in the ACTIVE workspace and checks the caller's level for an area
// there. An id outside the workspace — or on a project the caller can't open
// — answers "not found", never confirming it exists.

import { db } from '@/lib/db'
import { getAccess, getProjectAccess, type ProjectAccess } from '@/lib/access'
import type { Level, ProjectArea } from '@/lib/permissions'

export type ProductionTarget =
  | { projectId: string }
  | { shootDayId: string }
  | { sceneId: string }
  | { scheduleId: string }
  | { scheduleEntryId: string }
  | { scheduleEntryIds: string[] }
  | { deliveryPageId: string }
  | { deliverySectionId: string }
  | { deliveryAssetId: string }
  | { deliveryVersionId: string }
  | { callSheetId: string }

export type ProductionGate = {
  ok:          boolean
  error:       { success: false; error: string } | null
  userId:      string
  workspaceId: string
  projectId:   string | null
  project:     ProjectAccess | null
}

/** Every project the target touches. Exported for tests. */
export async function productionTargetProjectIds(target: ProductionTarget, workspaceId: string): Promise<string[] | null> {
  // Prisma drops `{ id: undefined }` — refuse empty / non-string ids outright.
  const ids = Object.values(target).flat() as unknown[]
  if (ids.length === 0 || ids.some(id => typeof id !== 'string' || id.length === 0)) return null
  const ws = { workspaceId }
  const one = (row: { projectId: string } | null) => (row ? [row.projectId] : null)

  if ('projectId' in target) {
    const p = await db.project.findFirst({ where: { id: target.projectId, ...ws }, select: { id: true } })
    return p ? [p.id] : null
  }
  if ('shootDayId' in target) return one(await db.shootDay.findFirst({ where: { id: target.shootDayId, ...ws }, select: { projectId: true } }))
  if ('sceneId' in target)    return one(await db.scene.findFirst({ where: { id: target.sceneId, ...ws }, select: { projectId: true } }))
  if ('scheduleId' in target) return one(await db.schedule.findFirst({ where: { id: target.scheduleId, ...ws }, select: { projectId: true } }))
  if ('scheduleEntryId' in target || 'scheduleEntryIds' in target) {
    const entryIds = 'scheduleEntryId' in target ? [target.scheduleEntryId] : [...new Set(target.scheduleEntryIds)]
    const rows = await db.scheduleEntry.findMany({ where: { id: { in: entryIds }, ...ws }, select: { schedule: { select: { projectId: true } } } })
    if (rows.length !== entryIds.length) return null
    return [...new Set(rows.map(r => r.schedule.projectId))]
  }
  if ('deliveryPageId' in target)    return one(await db.deliveryPage.findFirst({ where: { id: target.deliveryPageId, ...ws }, select: { projectId: true } }))
  if ('deliverySectionId' in target) {
    const s = await db.deliverableSection.findFirst({ where: { id: target.deliverySectionId, ...ws }, select: { deliveryPage: { select: { projectId: true } } } })
    return s ? [s.deliveryPage.projectId] : null
  }
  if ('deliveryAssetId' in target) {
    const a = await db.deliverableAsset.findFirst({ where: { id: target.deliveryAssetId, ...ws }, select: { deliveryPage: { select: { projectId: true } } } })
    return a ? [a.deliveryPage.projectId] : null
  }
  if ('deliveryVersionId' in target) {
    const v = await db.deliverableVersion.findFirst({ where: { id: target.deliveryVersionId, ...ws }, select: { deliverable: { select: { deliveryPage: { select: { projectId: true } } } } } })
    return v ? [v.deliverable.deliveryPage.projectId] : null
  }
  return one(await db.callSheet.findFirst({ where: { id: target.callSheetId, ...ws }, select: { projectId: true } }))
}

/**
 * Gate a production action. Same shape as the access.ts gates, plus the
 * project and the caller's ProjectAccess. Multi-project targets must pass on
 * every project.
 */
export async function requireProductionPermission(
  target: ProductionTarget, area: ProjectArea, level: Level,
): Promise<ProductionGate> {
  const access = await getAccess()
  const base = { userId: access.userId, workspaceId: access.workspaceId }
  const notFound: ProductionGate = { ...base, ok: false, error: { success: false, error: 'Not found' }, projectId: null, project: null }

  const projectIds = await productionTargetProjectIds(target, access.workspaceId)
  if (!projectIds || projectIds.length === 0) return notFound
  const projects = await Promise.all(projectIds.map(id => getProjectAccess(id)))
  if (projects.some(p => !p)) return notFound

  const ok = projects.every(p => p!.can(area, level))
  return {
    ...base,
    ok,
    error:     ok ? null : { success: false, error: 'UNAUTHORIZED_ROLE' },
    projectId: projectIds[0],
    project:   projects[0],
  }
}
