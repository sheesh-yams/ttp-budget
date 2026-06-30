'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { requireRole } from '@/lib/auth'
import type { ActionResult } from '@/types'
import { computeEntryTimes, buildScheduleSnapshot, snapshotToScheduleBlocks } from '@/lib/schedule-compute'
import type { IntExt, TimeOfDay, BannerType } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocationInput {
  name: string
  address?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
  latitude?: number
  longitude?: number
  parkingNotes?: string
  accessNotes?: string
  nearestHospital?: string
  hospitalAddress?: string
  hospitalPhone?: string
  hospitalDistance?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}

export interface SceneInput {
  sceneNumber?: string
  setting: string
  description?: string
  synopsis?: string
  intExt?: IntExt
  timeOfDay?: TimeOfDay
  pageCount?: string
  pageEighths?: number
  estimatedDuration?: number
  locationId?: string | null
  notes?: string
  castContactIds?: string[]
  colorOverride?: string | null
  archived?: boolean
}

interface ScheduleEntryInput {
  kind: 'SCENE' | 'BANNER'
  shootDayId?: string | null
  orderIndex?: number
  sceneId?: string
  bannerType?: BannerType
  bannerLabel?: string
  bannerDurationMin?: number
  bannerNote?: string
}

// ── Internal helper ────────────────────────────────────────────────────────────

async function recomputeShootDayEntries(shootDayId: string, workspaceId: string) {
  const day = await db.shootDay.findFirst({ where: { id: shootDayId, workspaceId } })
  if (!day) return
  const entries = await db.scheduleEntry.findMany({
    where: { shootDayId, workspaceId },
    orderBy: { orderIndex: 'asc' },
    include: { scene: { select: { estimatedDuration: true } } },
  })
  const updates = computeEntryTimes(entries, day.startTime)
  if (updates.length === 0) return
  await db.$transaction(
    updates.map(u =>
      db.scheduleEntry.update({
        where: { id: u.id },
        data: { computedStartTime: u.computedStartTime, computedEndTime: u.computedEndTime },
      }),
    ),
  )
}

// ── Location ──────────────────────────────────────────────────────────────────

export async function createLocation(input: LocationInput): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const loc = await sdb.location.create({ data: input as unknown as Parameters<typeof sdb.location.create>[0]['data'] })
  return { success: true, data: { id: loc.id } }
}

export async function updateLocation(id: string, patch: Partial<LocationInput>): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const loc = await sdb.location.findFirst({ where: { id } })
  if (!loc) return { success: false, error: 'Not found' }
  await sdb.location.update({ where: { id }, data: patch })
  return { success: true, data: null }
}

export async function deleteLocation(id: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const loc = await sdb.location.findFirst({ where: { id } })
  if (!loc) return { success: false, error: 'Not found' }
  const inUse = await db.scene.count({ where: { locationId: id } }) +
    await db.shootDay.count({ where: { primaryLocationId: id } }) +
    await db.callSheet.count({ where: { locationId: id } })
  if (inUse > 0) return { success: false, error: 'Location is in use — reassign references before deleting.' }
  await sdb.location.delete({ where: { id } })
  return { success: true, data: null }
}

export async function listLocations(): Promise<ActionResult<{ id: string; name: string; address: string | null }[]>> {
  const sdb = await getScopedDb()
  const locs = await sdb.location.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, address: true },
  })
  return { success: true, data: locs }
}

// ── ShootDay ──────────────────────────────────────────────────────────────────

export async function createShootDay(
  projectId: string,
  input: { date: Date; label?: string; orderIndex?: number },
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const project = await sdb.project.findFirst({ where: { id: projectId } })
  if (!project) return { success: false, error: 'Project not found' }
  const day = await sdb.shootDay.create({ data: { projectId, ...input } as unknown as Parameters<typeof sdb.shootDay.create>[0]['data'] })
  revalidatePath(`/projects/${projectId}/schedule`)
  return { success: true, data: { id: day.id } }
}

export async function updateShootDay(
  id: string,
  patch: { date?: Date; label?: string; startTime?: string | null; primaryLocationId?: string | null },
): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const day = await sdb.shootDay.findFirst({ where: { id } })
  if (!day) return { success: false, error: 'Not found' }
  await sdb.shootDay.update({ where: { id }, data: patch })
  if (patch.startTime !== undefined) {
    await recomputeShootDayEntries(id, day.workspaceId)
  }
  revalidatePath(`/projects/${day.projectId}/schedule`)
  return { success: true, data: null }
}

export async function deleteShootDay(id: string, moveEntriesToBoneyard: boolean): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const day = await sdb.shootDay.findFirst({ where: { id } })
  if (!day) return { success: false, error: 'Not found' }
  if (moveEntriesToBoneyard) {
    await db.scheduleEntry.updateMany({
      where: { shootDayId: id },
      data: { shootDayId: null, computedStartTime: null, computedEndTime: null },
    })
  }
  await sdb.shootDay.delete({ where: { id } })
  revalidatePath(`/projects/${day.projectId}/schedule`)
  return { success: true, data: null }
}

export async function reorderShootDays(projectId: string, orderedIds: string[]): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const project = await sdb.project.findFirst({ where: { id: projectId } })
  if (!project) return { success: false, error: 'Project not found' }
  await db.$transaction(
    orderedIds.map((dayId, idx) =>
      db.shootDay.update({ where: { id: dayId }, data: { orderIndex: idx } }),
    ),
  )
  revalidatePath(`/projects/${projectId}/schedule`)
  return { success: true, data: null }
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export async function createScene(projectId: string, input: SceneInput): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const project = await sdb.project.findFirst({ where: { id: projectId } })
  if (!project) return { success: false, error: 'Project not found' }
  const scene = await sdb.scene.create({ data: { projectId, ...input } as unknown as Parameters<typeof sdb.scene.create>[0]['data'] })
  return { success: true, data: { id: scene.id } }
}

export interface SceneEntryPayload {
  id: string
  scheduleId: string
  shootDayId: string | null
  orderIndex: number
  kind: 'SCENE'
  computedStartTime: string | null
  computedEndTime: string | null
  sceneId: string
  scene: {
    id: string
    sceneNumber: string | null
    setting: string
    description: string | null
    intExt: IntExt
    timeOfDay: TimeOfDay
    pageEighths: number | null
    estimatedDuration: number | null
    colorOverride: string | null
    castContactIds: string[]
    archived: boolean
    location: { id: string; name: string } | null
  }
  bannerType: null
  bannerLabel: null
  bannerDurationMin: null
  bannerNote: null
}

// Combines scene creation + schedule-entry creation into a single round trip
// (instead of two sequential server actions followed by a full page refresh),
// returning the fully-formed entry so the client can render it immediately.
export async function createSceneWithEntry(
  projectId: string,
  scheduleId: string,
  shootDayId: string | null,
  input: SceneInput,
): Promise<ActionResult<SceneEntryPayload>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const [project, schedule] = await Promise.all([
    sdb.project.findFirst({ where: { id: projectId } }),
    sdb.schedule.findFirst({ where: { id: scheduleId } }),
  ])
  if (!project) return { success: false, error: 'Project not found' }
  if (!schedule) return { success: false, error: 'Schedule not found' }

  const [scene, maxEntry, location] = await Promise.all([
    sdb.scene.create({ data: { projectId, ...input } as unknown as Parameters<typeof sdb.scene.create>[0]['data'] }),
    db.scheduleEntry.findFirst({
      where: { scheduleId, shootDayId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    }),
    input.locationId ? sdb.location.findFirst({ where: { id: input.locationId }, select: { id: true, name: true } }) : null,
  ])
  const orderIndex = (maxEntry?.orderIndex ?? -1) + 1

  const entry = await sdb.scheduleEntry.create({
    data: {
      scheduleId, shootDayId, kind: 'SCENE', sceneId: scene.id, orderIndex,
    } as unknown as Parameters<typeof sdb.scheduleEntry.create>[0]['data'],
  })

  let computedStartTime: string | null = null
  let computedEndTime: string | null = null
  if (shootDayId) {
    await recomputeShootDayEntries(shootDayId, schedule.workspaceId)
    const recomputed = await db.scheduleEntry.findFirst({
      where: { id: entry.id },
      select: { computedStartTime: true, computedEndTime: true },
    })
    computedStartTime = recomputed?.computedStartTime ?? null
    computedEndTime = recomputed?.computedEndTime ?? null
  }

  revalidatePath(`/projects/${projectId}/schedule`)

  return {
    success: true,
    data: {
      id: entry.id,
      scheduleId,
      shootDayId,
      orderIndex,
      kind: 'SCENE',
      computedStartTime,
      computedEndTime,
      sceneId: scene.id,
      scene: {
        id: scene.id,
        sceneNumber: scene.sceneNumber,
        setting: scene.setting,
        description: scene.description,
        intExt: scene.intExt,
        timeOfDay: scene.timeOfDay,
        pageEighths: scene.pageEighths,
        estimatedDuration: scene.estimatedDuration,
        colorOverride: scene.colorOverride,
        castContactIds: scene.castContactIds,
        archived: scene.archived,
        location: location ?? null,
      },
      bannerType: null,
      bannerLabel: null,
      bannerDurationMin: null,
      bannerNote: null,
    },
  }
}

export async function updateScene(id: string, patch: Partial<SceneInput>): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const scene = await sdb.scene.findFirst({
    where: { id },
    include: { entries: { select: { shootDayId: true } } },
  })
  if (!scene) return { success: false, error: 'Not found' }
  await sdb.scene.update({ where: { id }, data: patch })
  if (patch.estimatedDuration !== undefined) {
    const shootDayIds = [...new Set(scene.entries.map(e => e.shootDayId).filter(Boolean))] as string[]
    for (const sdId of shootDayIds) {
      await recomputeShootDayEntries(sdId, scene.workspaceId)
    }
  }
  return { success: true, data: null }
}

export async function archiveScene(id: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const scene = await sdb.scene.findFirst({ where: { id } })
  if (!scene) return { success: false, error: 'Not found' }
  await sdb.scene.update({ where: { id }, data: { archived: true } })
  return { success: true, data: null }
}

export async function unarchiveScene(id: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const scene = await sdb.scene.findFirst({ where: { id } })
  if (!scene) return { success: false, error: 'Not found' }
  await sdb.scene.update({ where: { id }, data: { archived: false } })
  return { success: true, data: null }
}

export async function deleteScene(id: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const scene = await sdb.scene.findFirst({ where: { id } })
  if (!scene) return { success: false, error: 'Not found' }
  await sdb.scene.delete({ where: { id } })
  return { success: true, data: null }
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export async function createSchedule(projectId: string, name: string): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const project = await sdb.project.findFirst({ where: { id: projectId } })
  if (!project) return { success: false, error: 'Project not found' }
  const existing = await sdb.schedule.findMany({ where: { projectId }, select: { id: true } })
  const isPrimary = existing.length === 0
  const schedule = await sdb.schedule.create({ data: { projectId, name, isPrimary } as unknown as Parameters<typeof sdb.schedule.create>[0]['data'] })
  revalidatePath(`/projects/${projectId}/schedule`)
  return { success: true, data: { id: schedule.id } }
}

export async function renameSchedule(id: string, name: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const schedule = await sdb.schedule.findFirst({ where: { id } })
  if (!schedule) return { success: false, error: 'Not found' }
  await sdb.schedule.update({ where: { id }, data: { name } })
  revalidatePath(`/projects/${schedule.projectId}/schedule`)
  return { success: true, data: null }
}

export async function setPrimarySchedule(projectId: string, scheduleId: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const project = await sdb.project.findFirst({ where: { id: projectId } })
  if (!project) return { success: false, error: 'Project not found' }
  await db.$transaction([
    db.schedule.updateMany({ where: { projectId }, data: { isPrimary: false } }),
    db.schedule.update({ where: { id: scheduleId }, data: { isPrimary: true } }),
  ])
  revalidatePath(`/projects/${projectId}/schedule`)
  return { success: true, data: null }
}

export async function updateColumnPrefs(scheduleId: string, prefs: Record<string, boolean>): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const schedule = await sdb.schedule.findFirst({ where: { id: scheduleId } })
  if (!schedule) return { success: false, error: 'Not found' }
  await sdb.schedule.update({ where: { id: scheduleId }, data: { columnPrefs: prefs } })
  return { success: true, data: null }
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const schedule = await sdb.schedule.findFirst({ where: { id } })
  if (!schedule) return { success: false, error: 'Not found' }
  if (schedule.isPrimary) return { success: false, error: 'Cannot delete the primary schedule. Set another schedule as primary first.' }
  await sdb.schedule.delete({ where: { id } })
  revalidatePath(`/projects/${schedule.projectId}/schedule`)
  return { success: true, data: null }
}

// ── ScheduleEntry ─────────────────────────────────────────────────────────────

export async function createScheduleEntry(
  scheduleId: string,
  input: ScheduleEntryInput,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const schedule = await sdb.schedule.findFirst({ where: { id: scheduleId } })
  if (!schedule) return { success: false, error: 'Schedule not found' }

  // Determine orderIndex: append at end of target shoot day (or boneyard)
  const maxEntry = await db.scheduleEntry.findFirst({
    where: { scheduleId, shootDayId: input.shootDayId ?? null },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  })
  const orderIndex = input.orderIndex ?? ((maxEntry?.orderIndex ?? -1) + 1)

  const entry = await sdb.scheduleEntry.create({
    data: { scheduleId, ...input, orderIndex } as unknown as Parameters<typeof sdb.scheduleEntry.create>[0]['data'],
  })

  if (input.shootDayId) {
    await recomputeShootDayEntries(input.shootDayId, schedule.workspaceId)
  }
  revalidatePath(`/projects/${schedule.projectId}/schedule`)
  return { success: true, data: { id: entry.id } }
}

export async function updateScheduleEntry(
  id: string,
  patch: Partial<ScheduleEntryInput>,
): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const entry = await sdb.scheduleEntry.findFirst({ where: { id }, include: { schedule: true } })
  if (!entry) return { success: false, error: 'Not found' }
  await sdb.scheduleEntry.update({ where: { id }, data: patch })
  if (entry.shootDayId) {
    await recomputeShootDayEntries(entry.shootDayId, entry.workspaceId)
  }
  revalidatePath(`/projects/${entry.schedule.projectId}/schedule`)
  return { success: true, data: null }
}

export async function moveScheduleEntry(input: {
  entryId: string
  toShootDayId: string | null
  beforeEntryId: string | null
}): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const entry = await sdb.scheduleEntry.findFirst({ where: { id: input.entryId }, include: { schedule: true } })
  if (!entry) return { success: false, error: 'Not found' }

  const { toShootDayId, beforeEntryId } = input
  const sourceShootDayId = entry.shootDayId

  // Get current entries in the target day (excluding the moving entry)
  const targetEntries = await db.scheduleEntry.findMany({
    where: { scheduleId: entry.scheduleId, shootDayId: toShootDayId, id: { not: input.entryId } },
    orderBy: { orderIndex: 'asc' },
    select: { id: true },
  })
  const insertIdx = beforeEntryId
    ? Math.max(0, targetEntries.findIndex(e => e.id === beforeEntryId))
    : targetEntries.length
  const newOrder = [...targetEntries.slice(0, insertIdx), { id: input.entryId }, ...targetEntries.slice(insertIdx)]

  await db.$transaction([
    ...newOrder.map((e, i) =>
      db.scheduleEntry.update({ where: { id: e.id }, data: { shootDayId: toShootDayId, orderIndex: i } }),
    ),
  ])

  const toRecompute = [...new Set([sourceShootDayId, toShootDayId].filter(Boolean))] as string[]
  for (const sdId of toRecompute) {
    await recomputeShootDayEntries(sdId, entry.workspaceId)
  }
  revalidatePath(`/projects/${entry.schedule.projectId}/schedule`)
  return { success: true, data: null }
}

export async function moveScheduleEntries(input: {
  entryIds: string[]
  toShootDayId: string | null
  beforeEntryId: string | null
}): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const entries = await sdb.scheduleEntry.findMany({
    where: { id: { in: input.entryIds } },
    include: { schedule: true },
  })
  if (entries.length !== input.entryIds.length) return { success: false, error: 'One or more entries not found' }
  // All entries must be from same schedule
  const scheduleIds = [...new Set(entries.map(e => e.scheduleId))]
  if (scheduleIds.length > 1) return { success: false, error: 'Cannot move entries from different schedules' }

  const movingSet = new Set(input.entryIds)
  const { toShootDayId, beforeEntryId } = input
  const sourceShootDayIds = [...new Set(entries.map(e => e.shootDayId).filter(Boolean))] as string[]
  const workspaceId = entries[0]!.workspaceId
  const projectId = entries[0]!.schedule.projectId

  const stayingEntries = await db.scheduleEntry.findMany({
    where: { scheduleId: scheduleIds[0]!, shootDayId: toShootDayId, id: { notIn: input.entryIds } },
    orderBy: { orderIndex: 'asc' },
    select: { id: true },
  })
  const insertIdx = beforeEntryId
    ? Math.max(0, stayingEntries.findIndex(e => e.id === beforeEntryId))
    : stayingEntries.length

  // Visual-order: preserve the order from entryIds (already sorted by caller)
  const newOrder = [
    ...stayingEntries.slice(0, insertIdx),
    ...input.entryIds.map(id => ({ id })),
    ...stayingEntries.slice(insertIdx),
  ]

  await db.$transaction(
    newOrder.map((e, i) =>
      db.scheduleEntry.update({ where: { id: e.id }, data: { shootDayId: toShootDayId, orderIndex: i } }),
    ),
  )

  // Re-index source days that lost entries
  for (const sdId of sourceShootDayIds.filter(id => id !== toShootDayId)) {
    const remaining = await db.scheduleEntry.findMany({
      where: { scheduleId: scheduleIds[0]!, shootDayId: sdId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    })
    if (remaining.length > 0) {
      await db.$transaction(
        remaining.map((e, i) => db.scheduleEntry.update({ where: { id: e.id }, data: { orderIndex: i } })),
      )
    }
  }

  const toRecompute = [...new Set([...sourceShootDayIds, toShootDayId].filter(Boolean))] as string[]
  for (const sdId of toRecompute) {
    await recomputeShootDayEntries(sdId, workspaceId)
  }
  revalidatePath(`/projects/${projectId}/schedule`)
  return { success: true, data: null }
}

export async function deleteScheduleEntry(id: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const entry = await sdb.scheduleEntry.findFirst({ where: { id }, include: { schedule: true } })
  if (!entry) return { success: false, error: 'Not found' }
  const shootDayId = entry.shootDayId
  await sdb.scheduleEntry.delete({ where: { id } })
  if (shootDayId) {
    await recomputeShootDayEntries(shootDayId, entry.workspaceId)
  }
  revalidatePath(`/projects/${entry.schedule.projectId}/schedule`)
  return { success: true, data: null }
}

export async function recomputeShootDay(shootDayId: string): Promise<ActionResult> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const day = await sdb.shootDay.findFirst({ where: { id: shootDayId } })
  if (!day) return { success: false, error: 'Not found' }
  await recomputeShootDayEntries(shootDayId, day.workspaceId)
  return { success: true, data: null }
}

// ── Call sheet schedule sync ───────────────────────────────────────────────────

export async function syncCallSheetSchedule(
  callSheetId: string,
): Promise<ActionResult<{ schedule: ReturnType<typeof snapshotToScheduleBlocks> }>> {
  const gate = await requireRole(['OWNER', 'PRODUCER'])
  if (!gate.ok) return gate.error!
  const sdb = await getScopedDb()
  const cs = await sdb.callSheet.findFirst({ where: { id: callSheetId } })
  if (!cs) return { success: false, error: 'Call sheet not found' }
  if (!cs.shootDayId) return { success: false, error: 'Call sheet is not linked to a shoot day' }

  // Find primary schedule for the project
  const primarySchedule = await sdb.schedule.findFirst({
    where: { projectId: cs.projectId, isPrimary: true },
  })
  if (!primarySchedule) return { success: false, error: 'No primary schedule for this project' }

  const entries = await db.scheduleEntry.findMany({
    where: { scheduleId: primarySchedule.id, shootDayId: cs.shootDayId },
    orderBy: { orderIndex: 'asc' },
    include: { scene: { include: { location: true } } },
  })

  const snapshot = buildScheduleSnapshot(entries)
  const blocks = snapshotToScheduleBlocks(snapshot)

  await sdb.callSheet.update({
    where: { id: callSheetId },
    data: {
      scheduleSnapshot: snapshot,
      scheduleSyncedAt: new Date(),
      schedule: blocks,
    } as unknown as Parameters<typeof sdb.callSheet.update>[0]['data'],
  })
  revalidatePath(`/projects/${cs.projectId}/call-sheets`)
  revalidatePath(`/projects/${cs.projectId}/call-sheets/${callSheetId}`)
  return { success: true, data: { schedule: blocks } }
}
