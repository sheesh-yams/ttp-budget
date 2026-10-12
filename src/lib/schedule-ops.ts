// Stripboard changes as a log of ops — applied instantly on screen and saved
// together after a pause (applyScheduleChanges). Plain module, shared by the
// browser (optimistic display) and the server (which replays the same ops on
// the schedule's current state and writes the difference), so both always
// agree on order and times. Tested in src/lib/__tests__/schedule-ops.test.ts.
//
// Ops are idempotent: replaying one over a state that already contains it
// changes nothing (adds skip existing ids, deletes skip missing ones, moves
// land in the same place). So re-applying pending ops over every server
// refresh — even one that already includes them — is safe.

import type { BannerType, IntExt, TimeOfDay } from '@prisma/client'
import { computeEntryTimes } from '@/lib/schedule-compute'

// ── Shapes ────────────────────────────────────────────────────────────────────

export interface ScheduleSceneSnap {
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
  /** Free-text place: within `location`, or on its own. */
  locationDetail: string | null
}

export interface ScheduleEntryRow {
  id: string
  scheduleId: string
  shootDayId: string | null
  orderIndex: number
  kind: 'SCENE' | 'BANNER'
  /** Runs at the same time as the entry above (ignored on a day's first entry). */
  concurrentWithPrevious: boolean
  /** Exact start set by hand ("HH:mm"); null = automatic. */
  fixedStartTime: string | null
  computedStartTime: string | null
  computedEndTime: string | null
  sceneId: string | null
  scene: ScheduleSceneSnap | null
  bannerType: BannerType | null
  bannerLabel: string | null
  bannerDurationMin: number | null
  bannerNote: string | null
}

export interface ScheduleSceneRow {
  id: string
  sceneNumber: string | null
  setting: string
  description: string | null
  synopsis: string | null
  intExt: IntExt
  timeOfDay: TimeOfDay
  pageCount: string | null
  pageEighths: number | null
  estimatedDuration: number | null
  locationId: string | null
  location: { id: string; name: string } | null
  locationDetail: string | null
  notes: string | null
  castContactIds: string[]
  colorOverride: string | null
  archived: boolean
}

export interface ScheduleLocationRow { id: string; name: string; address: string | null }

/** Scene fields an op may set (undefined = unchanged). */
export interface SceneOpInput {
  sceneNumber?: string | null
  setting?: string
  description?: string | null
  synopsis?: string | null
  intExt?: IntExt
  timeOfDay?: TimeOfDay
  pageCount?: string | null
  pageEighths?: number | null
  estimatedDuration?: number | null
  locationId?: string | null
  locationDetail?: string | null
  notes?: string | null
  castContactIds?: string[]
  colorOverride?: string | null
}

export interface EntryPatch {
  bannerLabel?: string
  bannerDurationMin?: number
  concurrentWithPrevious?: boolean
  fixedStartTime?: string | null
}

type OpBody =
  | { type: 'addBanner'; entryId: string; shootDayId: string | null; bannerType: BannerType; label: string; durationMin: number }
  | { type: 'updateEntry'; entryId: string; patch: EntryPatch }
  | { type: 'deleteEntry'; entryId: string }
  /** `order` = the target day's full order after the move (see moveOrder), so
   *  a replay lands the same way even if a neighbour has gone since. */
  | { type: 'move'; entryIds: string[]; toShootDayId: string | null; order: string[]; resetConcurrent?: boolean }
  | { type: 'setSceneArchived'; sceneId: string; archived: boolean }
  | { type: 'createScene'; sceneId: string; input: SceneOpInput & { setting: string }; entry?: { entryId: string; shootDayId: string | null }; newLocation?: { locationId: string; name: string } }
  | { type: 'updateScene'; sceneId: string; input: SceneOpInput; newLocation?: { locationId: string; name: string } }

export type ScheduleOpBody = OpBody
export type ScheduleOp = OpBody & { seq: number }

export interface ScheduleState {
  entries:   ScheduleEntryRow[]
  scenes:    ScheduleSceneRow[]
  locations: ScheduleLocationRow[]
}

export interface ScheduleOpsContext {
  scheduleId: string
  /** Shoot day id → call time, for re-timing. */
  dayStart:   Map<string, string | null>
}

// ── Ids ───────────────────────────────────────────────────────────────────────

/** A cuid-shaped id made in the browser, so a new row is real from the start. */
export function newScheduleId(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'c' + Array.from(bytes, b => (b % 36).toString(36)).join('')
}

export function isScheduleId(v: unknown): v is string {
  return typeof v === 'string' && /^c[a-z0-9]{24}$/.test(v)
}

// ── Reducer ───────────────────────────────────────────────────────────────────

/** The target day's order after moving `ids` there, before `beforeEntryId`
 *  (null = at the end) — what a move op records. */
export function moveOrder(entries: ScheduleEntryRow[], ids: string[], toShootDayId: string | null, beforeEntryId: string | null): string[] {
  const moving = new Set(ids)
  const staying = entries.filter(e => e.shootDayId === toShootDayId && !moving.has(e.id))
    .sort((a, b) => a.orderIndex - b.orderIndex).map(e => e.id)
  const at = beforeEntryId ? staying.indexOf(beforeEntryId) : -1
  const idx = at >= 0 ? at : staying.length
  return [...staying.slice(0, idx), ...ids, ...staying.slice(idx)]
}

function sceneSnap(s: ScheduleSceneRow): ScheduleSceneSnap {
  return {
    id: s.id, sceneNumber: s.sceneNumber, setting: s.setting, description: s.description,
    intExt: s.intExt, timeOfDay: s.timeOfDay, pageEighths: s.pageEighths,
    estimatedDuration: s.estimatedDuration, colorOverride: s.colorOverride,
    castContactIds: s.castContactIds, archived: s.archived, location: s.location,
    locationDetail: s.locationDetail,
  }
}

function patchScene(row: ScheduleSceneRow, input: SceneOpInput, locations: ScheduleLocationRow[]): ScheduleSceneRow {
  const next = { ...row }
  for (const [k, v] of Object.entries(input)) if (v !== undefined) (next as Record<string, unknown>)[k] = v
  if (input.locationId !== undefined) {
    const loc = input.locationId ? locations.find(l => l.id === input.locationId) : null
    next.location = loc ? { id: loc.id, name: loc.name } : null
  }
  return next
}

function inContainer(e: ScheduleEntryRow, dayId: string | null) {
  return e.shootDayId === dayId
}

function ordered(entries: ScheduleEntryRow[], dayId: string | null) {
  return entries.filter(e => inContainer(e, dayId)).sort((a, b) => a.orderIndex - b.orderIndex)
}

function appendIndex(entries: ScheduleEntryRow[], dayId: string | null) {
  return entries.filter(e => inContainer(e, dayId)).reduce((m, e) => Math.max(m, e.orderIndex), -1) + 1
}

function applyOne(state: ScheduleState, op: OpBody, ctx: ScheduleOpsContext): ScheduleState {
  let { entries, scenes, locations } = state
  switch (op.type) {
    case 'addBanner': {
      if (entries.some(e => e.id === op.entryId)) return state
      entries = [...entries, {
        id: op.entryId, scheduleId: ctx.scheduleId, shootDayId: op.shootDayId,
        orderIndex: appendIndex(entries, op.shootDayId), kind: 'BANNER',
        concurrentWithPrevious: false, fixedStartTime: null,
        computedStartTime: null, computedEndTime: null, sceneId: null, scene: null,
        bannerType: op.bannerType, bannerLabel: op.label, bannerDurationMin: op.durationMin, bannerNote: null,
      }]
      return { entries, scenes, locations }
    }
    case 'updateEntry': {
      // A hand-set start replaces "alongside the item above".
      const patch: EntryPatch = op.patch.fixedStartTime ? { ...op.patch, concurrentWithPrevious: false } : op.patch
      entries = entries.map(e => e.id === op.entryId ? { ...e, ...patch } : e)
      return { entries, scenes, locations }
    }
    case 'deleteEntry':
      return { entries: entries.filter(e => e.id !== op.entryId), scenes, locations }
    case 'move': {
      const moving = op.entryIds.filter(id => entries.some(e => e.id === id))
      if (moving.length === 0) return state
      const movingSet = new Set(moving)
      const to = op.toShootDayId
      const sources = new Set(entries.filter(e => movingSet.has(e.id)).map(e => e.shootDayId))
      const changedDay = new Set(entries.filter(e => movingSet.has(e.id) && e.shootDayId !== to).map(e => e.id))
      // The recorded order, limited to the rows being moved and the ones already
      // in the target day; anything else in that day (added since) goes last.
      const inTarget = new Set(ordered(entries, to).map(e => e.id))
      const listedSet = new Set<string>()
      for (const id of op.order) if (movingSet.has(id) || inTarget.has(id)) listedSet.add(id)
      const listed = [...listedSet]
      const order = [
        ...listed,
        ...moving.filter(id => !listedSet.has(id)),
        ...ordered(entries, to).map(e => e.id).filter(id => !listedSet.has(id) && !movingSet.has(id)),
      ]
      const pos = new Map(order.map((id, i) => [id, i]))
      entries = entries.map(e => {
        const i = pos.get(e.id)
        if (i === undefined) return e
        // Dropped in the Boneyard (no timing), when changing day, and on a sort.
        const clear = to === null || op.resetConcurrent || changedDay.has(e.id)
        return { ...e, shootDayId: to, orderIndex: i, ...(clear ? { concurrentWithPrevious: false } : {}) }
      })
      // Close the gaps left in the days they came from.
      for (const src of sources) {
        if (src === to) continue
        const rest = new Map(ordered(entries, src).map((e, i) => [e.id, i]))
        entries = entries.map(e => rest.has(e.id) ? { ...e, orderIndex: rest.get(e.id)! } : e)
      }
      return { entries, scenes, locations }
    }
    case 'setSceneArchived': {
      scenes = scenes.map(s => s.id === op.sceneId ? { ...s, archived: op.archived } : s)
      entries = entries.map(e => e.scene?.id === op.sceneId ? { ...e, scene: { ...e.scene, archived: op.archived } } : e)
      return { entries, scenes, locations }
    }
    case 'createScene': {
      if (op.newLocation && !locations.some(l => l.id === op.newLocation!.locationId)) {
        locations = [...locations, { id: op.newLocation.locationId, name: op.newLocation.name, address: null }]
      }
      if (!scenes.some(s => s.id === op.sceneId)) {
        const blank: ScheduleSceneRow = {
          id: op.sceneId, sceneNumber: null, setting: op.input.setting, description: null, synopsis: null,
          intExt: 'INT', timeOfDay: 'DAY', pageCount: null, pageEighths: null, estimatedDuration: null,
          locationId: null, location: null, locationDetail: null, notes: null, castContactIds: [], colorOverride: null, archived: false,
        }
        scenes = [...scenes, patchScene(blank, op.input, locations)]
      }
      const row = scenes.find(s => s.id === op.sceneId)!
      if (op.entry && !entries.some(e => e.id === op.entry!.entryId)) {
        entries = [...entries, {
          id: op.entry.entryId, scheduleId: ctx.scheduleId, shootDayId: op.entry.shootDayId,
          orderIndex: appendIndex(entries, op.entry.shootDayId), kind: 'SCENE',
          concurrentWithPrevious: false, fixedStartTime: null,
          computedStartTime: null, computedEndTime: null, sceneId: row.id, scene: sceneSnap(row),
          bannerType: null, bannerLabel: null, bannerDurationMin: null, bannerNote: null,
        }]
      }
      return { entries, scenes, locations }
    }
    case 'updateScene': {
      if (op.newLocation && !locations.some(l => l.id === op.newLocation!.locationId)) {
        locations = [...locations, { id: op.newLocation.locationId, name: op.newLocation.name, address: null }]
      }
      scenes = scenes.map(s => s.id === op.sceneId ? patchScene(s, op.input, locations) : s)
      const row = scenes.find(s => s.id === op.sceneId)
      if (row) entries = entries.map(e => e.sceneId === op.sceneId ? { ...e, scene: sceneSnap(row) } : e)
      return { entries, scenes, locations }
    }
  }
}

/** Days (and the Boneyard, null) an op changes — only these are renumbered
 *  and re-timed, so a save never rewrites days nobody touched. */
function touchedBy(state: ScheduleState, op: OpBody): (string | null)[] {
  const dayOf = (id: string) => state.entries.find(e => e.id === id)
  switch (op.type) {
    case 'addBanner':   return [op.shootDayId]
    case 'updateEntry':
    case 'deleteEntry': { const e = dayOf(op.entryId); return e ? [e.shootDayId] : [] }
    case 'move':        return [op.toShootDayId, ...op.entryIds.flatMap(id => { const e = dayOf(id); return e ? [e.shootDayId] : [] })]
    case 'createScene': return op.entry ? [op.entry.shootDayId] : []
    case 'updateScene': return state.entries.filter(e => e.sceneId === op.sceneId).map(e => e.shootDayId)
    case 'setSceneArchived': return []
  }
}

/** Re-times the given shoot days (Boneyard entries keep what they had) and
 *  drops a leftover "alongside" flag on each one's first entry. */
export function retimeDays(entries: ScheduleEntryRow[], ctx: ScheduleOpsContext, only: Set<string | null>): ScheduleEntryRow[] {
  const byDay = new Map<string, ScheduleEntryRow[]>()
  for (const e of entries) if (e.shootDayId && only.has(e.shootDayId)) byDay.set(e.shootDayId, [...(byDay.get(e.shootDayId) ?? []), e])
  const patch = new Map<string, Partial<ScheduleEntryRow>>()
  for (const [dayId, list] of byDay) {
    const day = list.sort((a, b) => a.orderIndex - b.orderIndex)
    if (day[0]?.concurrentWithPrevious) patch.set(day[0].id, { concurrentWithPrevious: false })
    for (const t of computeEntryTimes(day, ctx.dayStart.get(dayId) ?? null)) {
      patch.set(t.id, { ...patch.get(t.id), computedStartTime: t.computedStartTime, computedEndTime: t.computedEndTime })
    }
  }
  return entries.map(e => patch.has(e.id) ? { ...e, ...patch.get(e.id) } : e)
}

/** Applies ops in seq order, then renumbers and re-times the days they
 *  touched. Same input → same output, on both client and server. */
export function applyScheduleOps(state: ScheduleState, ops: ScheduleOp[], ctx: ScheduleOpsContext): ScheduleState {
  return applyScheduleOpsTracked(state, ops, ctx).state
}

export function applyScheduleOpsTracked(state: ScheduleState, ops: ScheduleOp[], ctx: ScheduleOpsContext): { state: ScheduleState; touched: Set<string | null> } {
  const touched = new Set<string | null>()
  if (ops.length === 0) return { state, touched }
  let s = state
  for (const op of [...ops].sort((a, b) => a.seq - b.seq)) {
    for (const d of touchedBy(s, op)) touched.add(d)
    s = applyOne(s, op, ctx)
  }
  return { state: { ...s, entries: retimeDays(reindex(s.entries, touched), ctx, touched) }, touched }
}

/** Order indexes 0…n-1 in the touched days (deletes leave gaps), so the same
 *  order always has the same numbers — replays stay identical. */
function reindex(entries: ScheduleEntryRow[], containers: Set<string | null>): ScheduleEntryRow[] {
  const pos = new Map<string, number>()
  for (const c of containers) ordered(entries, c).forEach((e, i) => pos.set(e.id, i))
  return entries.map(e => !pos.has(e.id) || pos.get(e.id) === e.orderIndex ? e : { ...e, orderIndex: pos.get(e.id)! })
}
