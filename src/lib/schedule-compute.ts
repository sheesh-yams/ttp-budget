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
  /** Present (true) only for entries running during the ones above — kept
   *  off otherwise so snapshots synced before this existed still match.
   *  A hand-set start time shows up through computedStartTime. */
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
  fixedStartTime?: string | null
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
  const overlaps = overlapFlags(entries)
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
    // Runs during the entries above (flagged, or a hand-set time inside them).
    ...(overlaps[i] ? { concurrent: true as const } : {}),
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

/** Call sheet blocks on one timeline, in minutes. Times there are typed as
 *  00:00–23:59, so blocks are walked in order and a start well before the
 *  previous one (00:30 after 23:30) counts as the next day. */
function blockTimeline(blocks: { startTime: string; endTime?: string }[]): ({ start: number; end: number } | null)[] {
  let offset = 0
  let prevStart: number | null = null
  return blocks.map(b => {
    if (!b.startTime) return null
    let start = parseHHmm(b.startTime) + offset
    if (prevStart !== null && start < prevStart - 6 * 60) { offset += 24 * 60; start += 24 * 60 }
    prevStart = start
    let end = b.endTime ? parseHHmm(b.endTime) + offset : start
    if (end < start) end += 24 * 60
    return { start, end }
  })
}

/** When a call sheet's schedule finishes — the latest end, since blocks can
 *  overlap ("Add block" starts there). "HH:mm" within 24h. */
export function latestBlockEnd(blocks: { startTime: string; endTime?: string }[], fallback = '07:00'): string {
  let best: number | null = null
  for (const t of blockTimeline(blocks)) if (t && (best === null || t.end > best)) best = t.end
  return best === null ? fallback : formatHHmm(best % (24 * 60))
}

/** Call sheet blocks that run during the ones above — shown as ↳ sub-rows.
 *  Worked out from the times (same rule as the stripboard), so hand-typed and
 *  synced schedules behave the same; a block's stored `concurrent` (from a
 *  sync) also counts when it starts with the block above, e.g. after a
 *  0-minute "Crew call". */
export function blockOverlapFlags(blocks: { startTime: string; endTime?: string; concurrent?: boolean }[]): boolean[] {
  const timeline = blockTimeline(blocks)
  return overlapRule(timeline.map((t, i) => t && { ...t, withAbove: !!blocks[i]?.concurrent }))
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
  /** Exact start set by hand ("HH:mm", 00–23); overrides the flag above. */
  fixedStartTime?: string | null
  bannerDurationMin: number | null
  scene: { estimatedDuration: number | null } | null
}

interface TimeUpdate {
  id: string
  computedStartTime: string
  computedEndTime: string
}

/** "HH:mm" typed 00:00–23:59, or null. */
export function isValidClockTime(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v)) return false
  const [h, m] = v.split(':').map(Number)
  return h! < 24 && m! < 60
}

/** A hand-set start in minutes for a day calling at `dayStartMin`. A time
 *  12h or more before the call (01:00 on a 20:00 call) is after midnight, so
 *  +24h; anything closer is a pre-call time that day (07:30 load-in on a 14:00
 *  call). */
export function resolveFixedStart(fixed: string, dayStartMin: number): number {
  const m = parseHHmm(fixed)
  return dayStartMin - m >= 12 * 60 ? m + 24 * 60 : m
}

/**
 * Given a shoot day's startTime and an ordered list of entries, compute
 * start + end time for each entry. Returns an array of updates (not applied here).
 *
 * Each entry starts, in order of precedence:
 *  - at its `fixedStartTime` if one is set — inside the entries above it runs
 *    during them (Talent call 09:00 during Setup 08:00–10:00); after them it
 *    leaves a gap;
 *  - with the entry directly above if flagged `concurrentWithPrevious`;
 *  - otherwise when everything above has ended (the latest end so far).
 * The first entry ignores the flag.
 *
 * Boneyard entries (shootDayId = null) must NOT be passed to this function.
 */
export function computeEntryTimes(
  entries: EntryLike[],
  startTime: string | null | undefined,
): TimeUpdate[] {
  const dayStart = parseHHmm(startTime ?? '08:00')
  let latestEnd = dayStart
  let prevStart = dayStart
  return entries.map((entry, i) => {
    const duration =
      entry.kind === 'SCENE'
        ? (entry.scene?.estimatedDuration ?? 0)
        : (entry.bannerDurationMin ?? 0)
    const startMin = entry.fixedStartTime && isValidClockTime(entry.fixedStartTime)
      ? resolveFixedStart(entry.fixedStartTime, dayStart)
      : entry.concurrentWithPrevious && i > 0 ? prevStart : latestEnd
    const endMin = addMinutes(startMin, duration)
    latestEnd = Math.max(latestEnd, endMin)
    prevStart = startMin
    return { id: entry.id, computedStartTime: formatHHmm(startMin), computedEndTime: formatHHmm(endMin) }
  })
}

/**
 * Shared overlap rule for stripboard rows and call sheet blocks (minutes on one
 * timeline, in order). A row runs "during" the rows above when it starts
 * inside the current group — at or after the group's first start and before
 * everything above has ended — or when it is set to start with the row above
 * (`withAbove`) and does, which covers a 0-minute row above. A row that starts
 * before the group (an early load-in) or after it (a gap) starts a new group.
 */
function overlapRule(rows: ({ start: number; end: number; withAbove: boolean } | null)[]): boolean[] {
  let groupStart: number | null = null
  let latestEnd: number | null = null
  let prevStart: number | null = null
  return rows.map(r => {
    if (!r) return false
    const inside = groupStart !== null && latestEnd !== null && r.start >= groupStart && r.start < latestEnd
    const withAbove = r.withAbove && prevStart !== null && r.start === prevStart
    const overlaps = inside || withAbove
    if (!overlaps) groupStart = r.start
    latestEnd = latestEnd === null ? r.end : Math.max(latestEnd, r.end)
    prevStart = r.start
    return overlaps
  })
}

/**
 * Which stripboard entries run during the ones above them — shown as ↳ rows
 * and as `concurrent` in the call sheet snapshot. A hand-set start time
 * overrides the "alongside" flag (it no longer decides the start).
 */
export function overlapFlags(entries: {
  computedStartTime: string | null
  computedEndTime: string | null
  concurrentWithPrevious?: boolean
  fixedStartTime?: string | null
}[]): boolean[] {
  return overlapRule(entries.map(e => {
    if (!e.computedStartTime) return null
    const start = parseHHmm(e.computedStartTime)
    return {
      start,
      end: e.computedEndTime ? parseHHmm(e.computedEndTime) : start,
      withAbove: !!e.concurrentWithPrevious && !e.fixedStartTime,
    }
  }))
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
