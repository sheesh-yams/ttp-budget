/**
 * Time formatting utilities.
 * All times in the system are stored as "HH:MM" strings (24-hour, no seconds).
 * Display format is controlled by the workspace `callTimeFormat` setting.
 */

export type TimeFormat = '12H' | '24H'

/**
 * Parse a date stored as an ISO string (e.g. "2026-07-09T00:00:00.000Z") as a
 * LOCAL calendar date rather than UTC, preventing the common UTC-midnight
 * timezone shift that turns July 9 into July 8 in US timezones.
 *
 * Use this everywhere a Prisma DateTime date (shootStartDate, shootEndDate, etc.)
 * is formatted for display. Do NOT use for precise timestamps.
 */
export function parseLocalDate(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null
  const s = typeof iso === 'string' ? iso : iso.toISOString()
  const [y, m, d] = s.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Convert a stored "HH:MM" string to a display string.
 * "07:00" → "7:00 AM"  (12H)
 * "07:00" → "07:00"    (24H)
 * Returns "" if the input is falsy or malformed.
 */
export function formatTime(
  hhmm: string | null | undefined,
  format: TimeFormat = '12H',
): string {
  if (!hhmm) return ''
  const parts = hhmm.split(':')
  if (parts.length < 2) return hhmm
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m)) return hhmm
  if (format === '24H') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}
