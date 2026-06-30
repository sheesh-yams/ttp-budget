'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { requireRole } from '@/lib/auth'
import type { ActionResult } from '@/types'
import { computeEntryTimes } from '@/lib/schedule-compute'
import type { IntExt, TimeOfDay, BannerType } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocationInput {
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

interface SceneInput {
  sceneNumber?: string
  setting: string
  description?: string
  synopsis?: string
  intExt?: IntExt
  timeOfDay?: TimeOfDay
  pageCount?: string
  pageEighths?: number
  estimatedDuration?: number
  locationId?: string
  notes?: string
  castContactIds?: string[]
  colorOverride?: string
  archived?: boolean
}

interface ScheduleEntryInput {
  kind: 'SCENE' | 'BANNER'
  shootDayId?: string
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
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const loc = await sdb.location.create({ data: input as unknown as Parameters<typeof sdb.location.create>[0]['data'] })
    return { success: true, data: { id: loc.id } }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function updateLocation(id: string, patch: Partial<LocationInput>): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const loc = await sdb.location.findFirst({ where: { id } })
    if (!loc) return { success: false, error: 'Not found' }
    await sdb.location.update({ where: { id }, data: patch })
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function deleteLocation(id: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const loc = await sdb.location.findFirst({ where: { id } })
    if (!loc) return { success: false, error: 'Not found' }
    await sdb.location.delete({ where: { id } })
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function listLocations(): Promise<ActionResult<{ id: string; name: string; address: string | null }[]>> {
  try {
    const sdb = await getScopedDb()
    const locs = await sdb.location.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true },
    })
    return { success: true, data: locs }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

// ── ShootDay ──────────────────────────────────────────────────────────────────

export async function createShootDay(
  projectId: string,
  input: { date: Date; label?: string; orderIndex?: number },
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({ where: { id: projectId } })
    if (!project) return { success: false, error: 'Project not found' }
    const day = await sdb.shootDay.create({ data: { projectId, ...input } as unknown as Parameters<typeof sdb.shootDay.create>[0]['data'] })
    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: { id: day.id } }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function updateShootDay(
  id: string,
  patch: { date?: Date; label?: string; startTime?: string; primaryLocationId?: string | null },
): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const day = await sdb.shootDay.findFirst({ where: { id } })
    if (!day) return { success: false, error: 'Not found' }
    await sdb.shootDay.update({ where: { id }, data: patch })
    if (patch.startTime !== undefined) {
      await recomputeShootDayEntries(id, day.workspaceId)
    }
    revalidatePath(`/projects/${day.projectId}`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function deleteShootDay(
  id: string,
  moveEntriesToBoneyard: boolean,
): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
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
    revalidatePath(`/projects/${day.projectId}`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function reorderShootDays(projectId: string, orderedIds: string[]): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({ where: { id: projectId } })
    if (!project) return { success: false, error: 'Project not found' }
    await db.$transaction(
      orderedIds.map((dayId, idx) =>
        db.shootDay.update({ where: { id: dayId }, data: { orderIndex: idx } }),
      ),
    )
    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export async function createScene(projectId: string, input: SceneInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({ where: { id: projectId } })
    if (!project) return { success: false, error: 'Project not found' }
    const scene = await sdb.scene.create({ data: { projectId, ...input } as unknown as Parameters<typeof sdb.scene.create>[0]['data'] })
    return { success: true, data: { id: scene.id } }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function updateScene(id: string, patch: Partial<SceneInput>): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const scene = await sdb.scene.findFirst({ where: { id }, include: { entries: { select: { shootDayId: true } } } })
    if (!scene) return { success: false, error: 'Not found' }
    await sdb.scene.update({ where: { id }, data: patch })
    if (patch.estimatedDuration !== undefined) {
      const shootDayIds = [...new Set(scene.entries.map(e => e.shootDayId).filter(Boolean))] as string[]
      for (const sdId of shootDayIds) {
        await recomputeShootDayEntries(sdId, scene.workspaceId)
      }
    }
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function archiveScene(id: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const scene = await sdb.scene.findFirst({ where: { id } })
    if (!scene) return { success: false, error: 'Not found' }
    await sdb.scene.update({ where: { id }, data: { archived: true } })
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function unarchiveScene(id: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const scene = await sdb.scene.findFirst({ where: { id } })
    if (!scene) return { success: false, error: 'Not found' }
    await sdb.scene.update({ where: { id }, data: { archived: false } })
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function deleteScene(id: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const scene = await sdb.scene.findFirst({ where: { id } })
    if (!scene) return { success: false, error: 'Not found' }
    await sdb.scene.delete({ where: { id } })
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export async function createSchedule(projectId: string, name: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({ where: { id: projectId } })
    if (!project) return { success: false, error: 'Project not found' }
    const existing = await sdb.schedule.findMany({ where: { projectId }, select: { id: true } })
    const isPrimary = existing.length === 0
    const schedule = await sdb.schedule.create({ data: { projectId, name, isPrimary } as unknown as Parameters<typeof sdb.schedule.create>[0]['data'] })
    revalidatePath(`/projects/${projectId}/schedule`)
    return { success: true, data: { id: schedule.id } }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function renameSchedule(id: string, name: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const schedule = await sdb.schedule.findFirst({ where: { id } })
    if (!schedule) return { success: false, error: 'Not found' }
    await sdb.schedule.update({ where: { id }, data: { name } })
    revalidatePath(`/projects/${schedule.projectId}/schedule`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function setPrimarySchedule(projectId: string, scheduleId: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({ where: { id: projectId } })
    if (!project) return { success: false, error: 'Project not found' }
    await db.$transaction([
      db.schedule.updateMany({ where: { projectId }, data: { isPrimary: false } }),
      db.schedule.update({ where: { id: scheduleId }, data: { isPrimary: true } }),
    ])
    revalidatePath(`/projects/${projectId}/schedule`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function updateColumnPrefs(scheduleId: string, prefs: Record<string, boolean>): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const schedule = await sdb.schedule.findFirst({ where: { id: scheduleId } })
    if (!schedule) return { success: false, error: 'Not found' }
    await sdb.schedule.update({ where: { id: scheduleId }, data: { columnPrefs: prefs } })
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const schedule = await sdb.schedule.findFirst({ where: { id } })
    if (!schedule) return { success: false, error: 'Not found' }
    if (schedule.isPrimary) return { success: false, error: 'Cannot delete the primary schedule. Set another schedule as primary first.' }
    await sdb.schedule.delete({ where: { id } })
    revalidatePath(`/projects/${schedule.projectId}/schedule`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

// ── ScheduleEntry ─────────────────────────────────────────────────────────────

export async function createScheduleEntry(
  scheduleId: string,
  input: ScheduleEntryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const schedule = await sdb.schedule.findFirst({ where: { id: scheduleId } })
    if (!schedule) return { success: false, error: 'Schedule not found' }
    const entry = await sdb.scheduleEntry.create({ data: { scheduleId, ...input } as unknown as Parameters<typeof sdb.scheduleEntry.create>[0]['data'] })
    if (input.shootDayId) {
      await recomputeShootDayEntries(input.shootDayId, schedule.workspaceId)
    }
    revalidatePath(`/projects/${schedule.projectId}/schedule`)
    return { success: true, data: { id: entry.id } }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function updateScheduleEntry(
  id: string,
  patch: Partial<ScheduleEntryInput>,
): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const entry = await sdb.scheduleEntry.findFirst({ where: { id }, include: { schedule: true } })
    if (!entry) return { success: false, error: 'Not found' }
    await sdb.scheduleEntry.update({ where: { id }, data: patch })
    if (entry.shootDayId) {
      await recomputeShootDayEntries(entry.shootDayId, entry.workspaceId)
    }
    revalidatePath(`/projects/${entry.schedule.projectId}/schedule`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function moveScheduleEntry(input: {
  entryId: string
  toShootDayId: string | null
  toOrderIndex: number
}): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const entry = await sdb.scheduleEntry.findFirst({ where: { id: input.entryId }, include: { schedule: true } })
    if (!entry) return { success: false, error: 'Not found' }
    const sourceShootDayId = entry.shootDayId

    await sdb.scheduleEntry.update({
      where: { id: input.entryId },
      data: { shootDayId: input.toShootDayId, orderIndex: input.toOrderIndex },
    })

    const toRecompute = [...new Set([sourceShootDayId, input.toShootDayId].filter(Boolean))] as string[]
    for (const sdId of toRecompute) {
      await recomputeShootDayEntries(sdId, entry.workspaceId)
    }
    revalidatePath(`/projects/${entry.schedule.projectId}/schedule`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function moveScheduleEntries(input: {
  entryIds: string[]
  toShootDayId: string | null
  toOrderIndex: number
}): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const entries = await sdb.scheduleEntry.findMany({
      where: { id: { in: input.entryIds } },
      include: { schedule: true },
    })
    if (entries.length !== input.entryIds.length) return { success: false, error: 'One or more entries not found' }

    const sourceShootDayIds = [...new Set(entries.map(e => e.shootDayId).filter(Boolean))] as string[]
    const workspaceId = entries[0]!.workspaceId
    const projectId = entries[0]!.schedule.projectId

    await db.$transaction(
      input.entryIds.map((id, i) =>
        db.scheduleEntry.update({
          where: { id },
          data: { shootDayId: input.toShootDayId, orderIndex: input.toOrderIndex + i },
        }),
      ),
    )

    const toRecompute = [...new Set([...sourceShootDayIds, input.toShootDayId].filter(Boolean))] as string[]
    for (const sdId of toRecompute) {
      await recomputeShootDayEntries(sdId, workspaceId)
    }
    revalidatePath(`/projects/${projectId}/schedule`)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function deleteScheduleEntry(id: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
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
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}

export async function recomputeShootDay(shootDayId: string): Promise<ActionResult> {
  try {
    await requireRole(['OWNER', 'PRODUCER'])
    const sdb = await getScopedDb()
    const day = await sdb.shootDay.findFirst({ where: { id: shootDayId } })
    if (!day) return { success: false, error: 'Not found' }
    await recomputeShootDayEntries(shootDayId, day.workspaceId)
    return { success: true, data: null }
  } catch {
    return { success: false, error: 'NOT_IMPLEMENTED' }
  }
}
