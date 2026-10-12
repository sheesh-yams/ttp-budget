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
  /** Present (true) only for entries running alongside the one above — kept
   *  off otherwise so snapshots synced before this existed still match. */
  concurrent?: true
}

interface SnapshotSourceEntry {
  kind: 'SCENE' | 'BANNER'
  bannerLabel: string | null
  bannerType: string | null
  bannerNote: string | null
  bannerDurationMin: number | null
  computedStartTime: string | null
  computedEndTime: string | null
  concurrentWithPrevious?: boolean
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
  return entries.map((e, i) => ({
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
    // The first entry of a day has nothing to run alongside.
    ...(e.concurrentWithPrevious && i > 0 ? { concurrent: true as const } : {}),
  }))
}

export interface ScheduleBlockLike {
  startTime: string
  endTime?: string
  label: string
  whoNeeded?: string
  notes?: string
  concurrent?: boolean
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
      ...(e.concurrent ? { concurrent: true } : {}),
    }))
}

/**
 * When a call sheet's hand-edited schedule finishes: the latest end, since
 * blocks can overlap. Times there are typed as 00:00–23:59, so the blocks are
 * walked in order and a start well before the previous one (00:30 after
 * 23:30) counts as the next day. Returned as "HH:mm" within 24h.
 */
export function latestBlockEnd(blocks: { startTime: string; endTime?: string }[], fallback = '07:00'): string {
  let best: number | null = null
  let offset = 0
  let prevStart: number | null = null
  for (const b of blocks) {
    if (!b.startTime) continue
    let start = parseHHmm(b.startTime) + offset
    if (prevStart !== null && start < prevStart - 6 * 60) { offset += 24 * 60; start += 24 * 60 }
    prevStart = start
    let end = b.endTime ? parseHHmm(b.endTime) + offset : start
    if (end < start) end += 24 * 60
    if (best === null || end > best) best = end
  }
  return best === null ? fallback : formatHHmm(best % (24 * 60))
}

/**
 * JSON.stringify with object keys sorted recursively. Postgres jsonb does not
 * preserve key insertion order, so comparing a freshly-built snapshot against
 * one round-tripped through the DB with plain JSON.stringify gives false
 * positives — use this for any snapshot equality/divergence check instead.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// ── Recompute ─────────────────────────────────────────────────────────────────

interface EntryLike {
  id: string
  kind: 'SCENE' | 'BANNER'
  /** Starts with the entry above instead of after it. */
  concurrentWithPrevious?: boolean
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
 * Entries run in order, except an entry flagged `concurrentWithPrevious`
 * starts with the group above it (e.g. Talent HMU alongside Load In). The
 * next normal entry starts when the longest entry of that group ends.
 * The first entry ignores the flag.
 *
 * Boneyard entries (shootDayId = null) must NOT be passed to this function.
 */
export function computeEntryTimes(
  entries: EntryLike[],
  startTime: string | null | undefined,
): TimeUpdate[] {
  let groupStart = parseHHmm(startTime ?? '08:00')
  let groupEnd = groupStart
  return entries.map((entry, i) => {
    const duration =
      entry.kind === 'SCENE'
        ? (entry.scene?.estimatedDuration ?? 0)
        : (entry.bannerDurationMin ?? 0)
    if (!(entry.concurrentWithPrevious && i > 0)) groupStart = groupEnd
    const startMin = groupStart
    const endMin = addMinutes(startMin, duration)
    groupEnd = Math.max(groupEnd, endMin)
    return { id: entry.id, computedStartTime: formatHHmm(startMin), computedEndTime: formatHHmm(endMin) }
  })
}

/** When a shoot day wraps: the latest end time (not the last row's, since
 *  a concurrent row can end before the one above it). */
export function dayWrapTime(times: { computedEndTime: string | null }[]): string | null {
  let max: number | null = null
  for (const t of times) {
    if (!t.computedEndTime) continue
    const m = parseHHmm(t.computedEndTime)
    if (max === null || m > max) max = m
  }
  return max === null ? null : formatHHmm(max)
}
