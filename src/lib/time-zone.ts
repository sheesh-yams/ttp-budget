// The studio's time zone (Workspace.timeZone, IANA) — plain module, no
// dependencies (Intl only), jest-tested, safe in the browser.
//
// Proposal "valid through" dates are stored as UTC midnight of the chosen
// calendar day. That moment is 7pm Eastern the evening BEFORE — so the
// deadline is computed as the end of that day in the studio's zone instead.

export const DEFAULT_TIME_ZONE = 'America/New_York'

/** The zones offered in Settings (others are accepted if valid). */
export const TIME_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/New_York',    label: 'Eastern — New York' },
  { value: 'America/Chicago',     label: 'Central — Chicago' },
  { value: 'America/Denver',      label: 'Mountain — Denver' },
  { value: 'America/Phoenix',     label: 'Mountain (no DST) — Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
  { value: 'America/Anchorage',   label: 'Alaska — Anchorage' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii — Honolulu' },
  { value: 'America/Toronto',     label: 'Eastern — Toronto' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'Europe/London',       label: 'London' },
  { value: 'Europe/Paris',        label: 'Paris / Central Europe' },
  { value: 'Asia/Dubai',          label: 'Dubai' },
  { value: 'Asia/Kolkata',        label: 'India — Kolkata' },
  { value: 'Asia/Singapore',      label: 'Singapore' },
  { value: 'Asia/Tokyo',          label: 'Tokyo' },
  { value: 'Australia/Sydney',    label: 'Sydney' },
  { value: 'UTC',                 label: 'UTC' },
]

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

export function normalizeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE
}

const DAY_MS = 86_400_000

/** The zone's offset from UTC at `instant`, in ms (e.g. -5h for New York in winter). */
function offsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** The last instant (23:59:59.999) of calendar day `ymd` ("YYYY-MM-DD") in `tz`. */
export function endOfDayInZone(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const wall = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999)
  // Each offset in force around that day gives a candidate instant; keep the
  // ones whose wall clock really reads 23:59:59 that day. When the hour
  // repeats (zones that fall back at midnight, e.g. Santiago) take the later.
  const offsets = new Set([-DAY_MS, 0, DAY_MS].map(dt => offsetMs(wall + dt, tz)))
  const valid = [...offsets].map(o => wall - o).filter(c => c + offsetMs(c, tz) === wall)
  if (valid.length) return new Date(Math.max(...valid))
  // 23:59 falls in a spring-forward gap (Greenland jumps 23:00 → 00:00):
  // this lands on the last instant before midnight.
  return new Date(wall - offsetMs(wall - offsetMs(wall, tz), tz))
}

/** "YYYY-MM-DD" of an instant, as a calendar day in `tz`. */
export function ymdInZone(instant: Date | string | number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * When a proposal stops being signable: the end of its "valid through" day in
 * the studio's zone. The stored value is UTC midnight of that day, so its UTC
 * date IS the calendar day.
 */
export function proposalDeadline(expiresAt: Date | string, tz: string): Date {
  return endOfDayInZone(new Date(expiresAt).toISOString().slice(0, 10), normalizeTimeZone(tz))
}

/** An instant as a date in the studio's zone, e.g. "November 24, 2026". */
export function formatDateInZone(instant: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }): string {
  return new Date(instant).toLocaleDateString('en-US', { ...opts, timeZone: normalizeTimeZone(tz) })
}

/** A stored calendar date (UTC midnight, e.g. valid-through) — its own day, whatever the zone. */
export function formatCalendarDate(stored: Date | string, opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }): string {
  return new Date(stored).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}
