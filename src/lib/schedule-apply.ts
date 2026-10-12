// Server side of the stripboard's batched saving (applyScheduleChanges in
// src/server/actions/schedule.ts gates it; this module does the work).
//
// Loads the schedule's current state, replays the ops with the same reducer
// the browser used (applyScheduleOps), and writes only the difference — all
// in one transaction, so a batch lands whole or not at all.
//
// Trust model: ops come from the browser. Everything they can touch is loaded
// scoped to this workspace + schedule/project first; ops on ids outside that
// set change nothing (the reducer ignores unknown ids). Ids an op *points
// at* (a shoot day, a location) and new ids are checked explicitly.

import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { computeEntryTimes, isValidClockTime } from '@/lib/schedule-compute'
import {
  applyScheduleOps, isScheduleId,
  type ScheduleEntryRow, type ScheduleLocationRow, type ScheduleOp, type ScheduleSceneRow,
} from '@/lib/schedule-ops'

// ── Validation ────────────────────────────────────────────────────────────────

const id = z.string().min(1).max(64)
const newId = z.string().refine(isScheduleId, 'Bad id')
const clock = z.string().refine(isValidClockTime, 'Use a time like 09:30.')
const str = (max: number) => z.string().max(max)
/** A whole number pulled into range rather than rejected (a typed -5 or 5000
 *  must not become an op that fails on every retry). */
const clampInt = (max: number) => z.number().finite().transform(n => Math.min(max, Math.max(0, Math.round(n))))

// Limits are generous on purpose: a rejected op would block every later save
// (the queue keeps it for Retry), so they only stop abuse, never real typing.
const sceneInput = z.object({
  sceneNumber:       str(100).nullable().optional(),
  setting:           str(1000).optional(),
  description:       str(50000).nullable().optional(),
  synopsis:          str(50000).nullable().optional(),
  intExt:            z.enum(['INT', 'EXT', 'INT_EXT', 'CONTINUOUS']).optional(),
  timeOfDay:         z.enum(['DAY', 'NIGHT', 'DUSK', 'DAWN', 'MORNING', 'EVENING']).optional(),
  pageCount:         str(100).nullable().optional(),
  pageEighths:       clampInt(100000).nullable().optional(),
  estimatedDuration: clampInt(24 * 60 * 3).nullable().optional(),
  locationId:        id.nullable().optional(),
  locationDetail:    str(1000).nullable().optional(),
  notes:             str(50000).nullable().optional(),
  castContactIds:    z.array(id).max(1000).optional(),
  colorOverride:     str(100).nullable().optional(),
}).strict()

const newLocation = z.object({ locationId: newId, name: str(1000).min(1) }).strict()
const seq = z.number().int().nonnegative()

export const scheduleOpsSchema = z.array(z.discriminatedUnion('type', [
  z.object({ seq, type: z.literal('addBanner'), entryId: newId, shootDayId: id.nullable(),
    bannerType: z.enum(['MEAL_BREAK', 'COMPANY_MOVE', 'COFFEE_BREAK', 'NOTE', 'CUSTOM']),
    label: str(1000), durationMin: clampInt(24 * 60 * 3) }).strict(),
  z.object({ seq, type: z.literal('updateEntry'), entryId: id, patch: z.object({
    bannerLabel: str(1000).optional(),
    bannerDurationMin: clampInt(24 * 60 * 3).optional(),
    concurrentWithPrevious: z.boolean().optional(),
    fixedStartTime: clock.nullable().optional(),
  }).strict() }).strict(),
  z.object({ seq, type: z.literal('deleteEntry'), entryId: id }).strict(),
  z.object({ seq, type: z.literal('move'), entryIds: z.array(id).min(1).max(1000), toShootDayId: id.nullable(),
    order: z.array(id).max(1000), resetConcurrent: z.boolean().optional() }).strict(),
  z.object({ seq, type: z.literal('setSceneArchived'), sceneId: id, archived: z.boolean() }).strict(),
  z.object({ seq, type: z.literal('createScene'), sceneId: newId,
    input: sceneInput.extend({ setting: str(1000).min(1) }),
    entry: z.object({ entryId: newId, shootDayId: id.nullable() }).strict().optional(),
    newLocation: newLocation.optional() }).strict(),
  z.object({ seq, type: z.literal('updateScene'), sceneId: id, input: sceneInput,
    newLocation: newLocation.optional() }).strict(),
])).max(250)  // the editor sends bigger backlogs in chunks of 200

// ── Apply ─────────────────────────────────────────────────────────────────────

export class ScheduleApplyError extends Error {}

const ENTRY_FIELDS = ['shootDayId', 'orderIndex', 'concurrentWithPrevious', 'fixedStartTime', 'bannerLabel',
  'bannerDurationMin', 'computedStartTime', 'computedEndTime'] as const
const SCENE_FIELDS = ['sceneNumber', 'setting', 'description', 'synopsis', 'intExt', 'timeOfDay', 'pageCount',
  'pageEighths', 'estimatedDuration', 'locationId', 'locationDetail', 'notes', 'castContactIds', 'colorOverride', 'archived'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Applies a batch to one schedule. The caller has already checked schedule
 * EDIT on `projectId` and that `scheduleId` belongs to it.
 * Returns the shoot days whose times were rewritten.
 */
export async function applyScheduleBatch(args: {
  workspaceId: string
  projectId:   string
  scheduleId:  string
  ops:         ScheduleOp[]
}): Promise<{ touchedDays: string[] }> {
  const { workspaceId, projectId, scheduleId } = args
  let ops = args.ops
  if (ops.length === 0) return { touchedDays: [] }

  return db.$transaction(async tx => {
    // ── Load (scoped) ──
    const days = await tx.shootDay.findMany({ where: { projectId, workspaceId }, select: { id: true, startTime: true } })
    const dayIds = new Set(days.map(d => d.id))

    const rawEntries = await tx.scheduleEntry.findMany({
      where: { scheduleId, workspaceId },
      include: { scene: { include: { location: { select: { id: true, name: true } } } } },
    })
    const toRow = (e: typeof rawEntries[number]): ScheduleEntryRow => ({
      id: e.id, scheduleId: e.scheduleId, shootDayId: e.shootDayId, orderIndex: e.orderIndex, kind: e.kind,
      concurrentWithPrevious: e.concurrentWithPrevious, fixedStartTime: e.fixedStartTime,
      computedStartTime: e.computedStartTime, computedEndTime: e.computedEndTime, sceneId: e.sceneId,
      scene: e.scene ? {
        id: e.scene.id, sceneNumber: e.scene.sceneNumber, setting: e.scene.setting, description: e.scene.description,
        intExt: e.scene.intExt, timeOfDay: e.scene.timeOfDay, pageEighths: e.scene.pageEighths,
        estimatedDuration: e.scene.estimatedDuration, colorOverride: e.scene.colorOverride,
        castContactIds: e.scene.castContactIds, archived: e.scene.archived, location: e.scene.location,
        locationDetail: e.scene.locationDetail,
      } : null,
      bannerType: e.bannerType, bannerLabel: e.bannerLabel, bannerDurationMin: e.bannerDurationMin, bannerNote: e.bannerNote,
    })
    const entries = rawEntries.map(toRow)

    const sceneIdsInOps = new Set<string>()
    const locationIdsInOps = new Set<string>()
    const newIds = { entries: new Set<string>(), scenes: new Set<string>(), locations: new Set<string>() }
    for (const op of ops) {
      if (op.type === 'addBanner') newIds.entries.add(op.entryId)
      if (op.type === 'createScene') {
        newIds.scenes.add(op.sceneId)
        if (op.entry) newIds.entries.add(op.entry.entryId)
      }
      if ((op.type === 'createScene' || op.type === 'updateScene')) {
        if (op.newLocation) newIds.locations.add(op.newLocation.locationId)
        if (op.input.locationId) locationIdsInOps.add(op.input.locationId)
      }
      if (op.type === 'setSceneArchived' || op.type === 'updateScene' || op.type === 'createScene') sceneIdsInOps.add(op.sceneId)
    }
    // Ops may only point at this project's shoot days. One that's gone (deleted
    // meanwhile — or never was) must not block the batch: a new row goes to
    // the Boneyard and a move there is skipped.
    ops = ops.flatMap((op): ScheduleOp[] => {
      if (op.type === 'addBanner' && op.shootDayId && !dayIds.has(op.shootDayId)) return [{ ...op, shootDayId: null }]
      if (op.type === 'createScene' && op.entry?.shootDayId && !dayIds.has(op.entry.shootDayId)) return [{ ...op, entry: { ...op.entry, shootDayId: null } }]
      if (op.type === 'move' && op.toShootDayId && !dayIds.has(op.toShootDayId)) return []
      return [op]
    })

    const rawScenes = sceneIdsInOps.size ? await tx.scene.findMany({
      where: { id: { in: [...sceneIdsInOps] }, projectId, workspaceId },
      include: { location: { select: { id: true, name: true } } },
    }) : []
    const scenes: ScheduleSceneRow[] = rawScenes.map(s => ({
      id: s.id, sceneNumber: s.sceneNumber, setting: s.setting, description: s.description, synopsis: s.synopsis,
      intExt: s.intExt, timeOfDay: s.timeOfDay, pageCount: s.pageCount, pageEighths: s.pageEighths,
      estimatedDuration: s.estimatedDuration, locationId: s.locationId, location: s.location,
      locationDetail: s.locationDetail, notes: s.notes,
      castContactIds: s.castContactIds, colorOverride: s.colorOverride, archived: s.archived,
    }))
    const allLocationIds = [...new Set([...locationIdsInOps, ...newIds.locations])]
    const locations: ScheduleLocationRow[] = allLocationIds.length ? await tx.location.findMany({
      where: { id: { in: allLocationIds }, workspaceId }, select: { id: true, name: true, address: true },
    }) : []

    // New ids: already here = a replay (fine, the reducer skips them);
    // anywhere else = refuse.
    const [takenEntries, takenScenes, takenLocations] = await Promise.all([
      newIds.entries.size ? tx.scheduleEntry.findMany({ where: { id: { in: [...newIds.entries] } }, select: { id: true, scheduleId: true, workspaceId: true } }) : [],
      newIds.scenes.size ? tx.scene.findMany({ where: { id: { in: [...newIds.scenes] } }, select: { id: true, projectId: true, workspaceId: true } }) : [],
      newIds.locations.size ? tx.location.findMany({ where: { id: { in: [...newIds.locations] } }, select: { id: true, workspaceId: true } }) : [],
    ])
    if (takenEntries.some(e => e.scheduleId !== scheduleId || e.workspaceId !== workspaceId)
      || takenScenes.some(s => s.projectId !== projectId || s.workspaceId !== workspaceId)
      || takenLocations.some(l => l.workspaceId !== workspaceId)) {
      throw new ScheduleApplyError('Couldn’t save — please reload the schedule.')
    }
    // A scene may only point at this workspace's locations (or one made in this
    // batch); a location that's gone becomes "no location" instead of failing.
    const usable = (lid: string | null | undefined) => !lid || newIds.locations.has(lid) || locations.some(l => l.id === lid)
    ops = ops.map(op => (op.type === 'createScene' || op.type === 'updateScene') && !usable(op.input.locationId)
      ? { ...op, input: { ...op.input, locationId: null } } as ScheduleOp
      : op)

    // ── Replay ──
    const ctx = { scheduleId, dayStart: new Map(days.map(d => [d.id, d.startTime])) }
    const before = { entries, scenes, locations }
    const after = applyScheduleOps(before, ops, ctx)

    // ── Write the difference ──
    const beforeLoc = new Set(locations.map(l => l.id))
    for (const l of after.locations) {
      if (!beforeLoc.has(l.id)) await tx.location.create({ data: { id: l.id, workspaceId, name: l.name } })
    }

    const beforeScene = new Map(scenes.map(s => [s.id, s]))
    const durationChanged: string[] = []
    for (const s of after.scenes) {
      const was = beforeScene.get(s.id)
      const data: Record<string, unknown> = {}
      for (const f of SCENE_FIELDS) if (!was || !same(was[f], s[f])) data[f] = s[f]
      if (!was) {
        await tx.scene.create({ data: { id: s.id, workspaceId, projectId, ...data } as Prisma.SceneUncheckedCreateInput })
      } else if (Object.keys(data).length) {
        await tx.scene.update({ where: { id: s.id }, data })
        if ('estimatedDuration' in data) durationChanged.push(s.id)
      }
    }

    const beforeEntry = new Map(entries.map(e => [e.id, e]))
    const afterIds = new Set(after.entries.map(e => e.id))
    const touchedDays = new Set<string>()
    for (const e of after.entries) {
      const was = beforeEntry.get(e.id)
      if (!was) {
        await tx.scheduleEntry.create({ data: {
          id: e.id, workspaceId, scheduleId, shootDayId: e.shootDayId, orderIndex: e.orderIndex, kind: e.kind,
          sceneId: e.sceneId, bannerType: e.bannerType, bannerLabel: e.bannerLabel, bannerDurationMin: e.bannerDurationMin,
          concurrentWithPrevious: e.concurrentWithPrevious, fixedStartTime: e.fixedStartTime,
          computedStartTime: e.computedStartTime, computedEndTime: e.computedEndTime,
        } })
        if (e.shootDayId) touchedDays.add(e.shootDayId)
        continue
      }
      const data: Record<string, unknown> = {}
      for (const f of ENTRY_FIELDS) if (!same(was[f], e[f])) data[f] = e[f]
      if (Object.keys(data).length) {
        await tx.scheduleEntry.update({ where: { id: e.id }, data })
        if (e.shootDayId) touchedDays.add(e.shootDayId)
        if (was.shootDayId) touchedDays.add(was.shootDayId)
      }
    }
    const gone = entries.filter(e => !afterIds.has(e.id))
    if (gone.length) {
      await tx.scheduleEntry.deleteMany({ where: { id: { in: gone.map(e => e.id) }, scheduleId, workspaceId } })
      for (const e of gone) if (e.shootDayId) touchedDays.add(e.shootDayId)
    }

    // A scene's new length also moves its other schedules' days.
    if (durationChanged.length) {
      const others = await tx.scheduleEntry.findMany({
        where: { sceneId: { in: durationChanged }, workspaceId, scheduleId: { not: scheduleId }, shootDayId: { not: null } },
        select: { scheduleId: true, shootDayId: true },
      })
      const pairs = new Map(others.map(o => [`${o.scheduleId}:${o.shootDayId}`, o]))
      for (const { scheduleId: sid, shootDayId } of pairs.values()) {
        await recomputeScheduleDay(tx, workspaceId, sid, shootDayId!)
        touchedDays.add(shootDayId!)
      }
    }
    return { touchedDays: [...touchedDays] }
  }, { timeout: 20_000, maxWait: 10_000 })
}

/** Re-times one schedule's entries on one shoot day (inside a transaction). */
export async function recomputeScheduleDay(tx: Prisma.TransactionClient, workspaceId: string, scheduleId: string, shootDayId: string) {
  const day = await tx.shootDay.findFirst({ where: { id: shootDayId, workspaceId }, select: { startTime: true } })
  if (!day) return
  const entries = await tx.scheduleEntry.findMany({
    where: { shootDayId, scheduleId, workspaceId },
    orderBy: { orderIndex: 'asc' },
    include: { scene: { select: { estimatedDuration: true } } },
  })
  const firstId = entries[0]?.concurrentWithPrevious ? entries[0].id : null
  for (const u of computeEntryTimes(entries, day.startTime)) {
    const e = entries.find(x => x.id === u.id)!
    if (e.computedStartTime === u.computedStartTime && e.computedEndTime === u.computedEndTime && u.id !== firstId) continue
    await tx.scheduleEntry.update({
      where: { id: u.id },
      data: { computedStartTime: u.computedStartTime, computedEndTime: u.computedEndTime, ...(u.id === firstId ? { concurrentWithPrevious: false } : {}) },
    })
  }
}
