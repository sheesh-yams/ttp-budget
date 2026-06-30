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
