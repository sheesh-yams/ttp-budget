/**
 * schedule-compute.ts
 *
 * Pure time-math helpers and the recomputeShootDay algorithm.
 * All time values are "HH:mm" strings. Hours can exceed 23 (e.g. "25:30")
 * for post-midnight wrap — this is intentional per production convention.
 */

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Parse "HH:mm" → total minutes since midnight. Accepts hours > 23. */
export function parseHHmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Format total minutes since midnight → "HH:mm". Hours can exceed 23. */
export function formatHHmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutes(totalMinutes: number, delta: number): number {
  return totalMinutes + delta
}

// ── Call sheet snapshot / sync helpers ───────────────────────────────────────

export interface ScheduleSnapshotEntry {
  kind: 'SCENE' | 'BANNER'
  sceneNumber: string | null
  setting: string | null
  bannerLabel: string | null
  bannerType: string | null
  computedStartTime: string | null
  computedEndTime: string | null
  duration: number
  locationName: string | null
  castContactIds: string[]
  notes: string | null
}

interface SnapshotSourceEntry {
  kind: 'SCENE' | 'BANNER'
  bannerLabel: string | null
  bannerType: string | null
  bannerNote: string | null
  bannerDurationMin: number | null
  computedStartTime: string | null
  computedEndTime: string | null
  scene: {
    sceneNumber: string | null
    setting: string
    estimatedDuration: number | null
    notes: string | null
    castContactIds: string[]
    location: { name: string } | null
  } | null
}

/** Build a plain-JSON snapshot of a shoot day's entries — used both to detect
 *  drift (compare against the call sheet's last-synced copy) and to seed the
 *  call sheet's editable schedule blocks. */
export function buildScheduleSnapshot(entries: SnapshotSourceEntry[]): ScheduleSnapshotEntry[] {
  return entries.map(e => ({
    kind: e.kind,
    sceneNumber: e.scene?.sceneNumber ?? null,
    setting: e.scene?.setting ?? null,
    bannerLabel: e.bannerLabel ?? null,
    bannerType: e.bannerType ?? null,
    computedStartTime: e.computedStartTime ?? null,
    computedEndTime: e.computedEndTime ?? null,
    duration: e.kind === 'SCENE' ? (e.scene?.estimatedDuration ?? 0) : (e.bannerDurationMin ?? 0),
    locationName: e.scene?.location?.name ?? null,
    castContactIds: e.scene?.castContactIds ?? [],
    notes: e.scene?.notes ?? e.bannerNote ?? null,
  }))
}

export interface ScheduleBlockLike {
  startTime: string
  endTime?: string
  label: string
  whoNeeded?: string
  notes?: string
}

/** Convert a schedule snapshot into call-sheet schedule blocks for display/editing. */
export function snapshotToScheduleBlocks(snapshot: ScheduleSnapshotEntry[]): ScheduleBlockLike[] {
  return snapshot
    .filter(e => e.computedStartTime)
    .map(e => ({
      startTime: e.computedStartTime!,
      endTime: e.computedEndTime ?? undefined,
      label: e.kind === 'SCENE'
        ? `${e.sceneNumber ? `Sc ${e.sceneNumber} — ` : ''}${e.setting ?? ''}`
        : (e.bannerLabel || e.bannerType || ''),
      notes: e.notes ?? undefined,
    }))
}

// ── Recompute ─────────────────────────────────────────────────────────────────

interface EntryLike {
  id: string
  kind: 'SCENE' | 'BANNER'
  bannerDurationMin: number | null
  scene: { estimatedDuration: number | null } | null
}

interface TimeUpdate {
  id: string
  computedStartTime: string
  computedEndTime: string
}

/**
 * Given a shoot day's startTime and an ordered list of entries, compute
 * start + end time for each entry. Returns an array of updates (not applied here).
 *
 * Boneyard entries (shootDayId = null) must NOT be passed to this function.
 */
export function computeEntryTimes(
  entries: EntryLike[],
  startTime: string | null | undefined,
): TimeUpdate[] {
  let cursor = parseHHmm(startTime ?? '08:00')
  return entries.map(entry => {
    const duration =
      entry.kind === 'SCENE'
        ? (entry.scene?.estimatedDuration ?? 0)
        : (entry.bannerDurationMin ?? 0)
    const start = formatHHmm(cursor)
    cursor = addMinutes(cursor, duration)
    const end = formatHHmm(cursor)
    return { id: entry.id, computedStartTime: start, computedEndTime: end }
  })
}
