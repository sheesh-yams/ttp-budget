import { endOfDayInZone, isValidTimeZone, normalizeTimeZone, proposalDeadline, ymdInZone, formatDateInZone, formatCalendarDate, TIME_ZONE_OPTIONS } from '@/lib/time-zone'

describe('time zone helpers', () => {
  it('end of day in a zone, across DST', () => {
    // Winter: New York is UTC-5.
    expect(endOfDayInZone('2026-12-01', 'America/New_York').toISOString()).toBe('2026-12-02T04:59:59.999Z')
    // Summer: UTC-4.
    expect(endOfDayInZone('2026-07-01', 'America/New_York').toISOString()).toBe('2026-07-02T03:59:59.999Z')
    // DST starts Mar 8 2026 and ends Nov 1 2026 — the day's end is on the new offset.
    expect(endOfDayInZone('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-09T03:59:59.999Z')
    expect(endOfDayInZone('2026-11-01', 'America/New_York').toISOString()).toBe('2026-11-02T04:59:59.999Z')
    expect(endOfDayInZone('2026-12-01', 'UTC').toISOString()).toBe('2026-12-01T23:59:59.999Z')
    expect(endOfDayInZone('2026-12-01', 'Asia/Kolkata').toISOString()).toBe('2026-12-01T18:29:59.999Z')
    expect(endOfDayInZone('2026-12-01', 'Australia/Sydney').toISOString()).toBe('2026-12-01T12:59:59.999Z')
    // Santiago falls back at midnight Apr 4→5 2026 (23:00–23:59 happens twice): the later one.
    expect(endOfDayInZone('2026-04-04', 'America/Santiago').toISOString()).toBe('2026-04-05T03:59:59.999Z')
    expect(endOfDayInZone('2026-04-05', 'America/Santiago').toISOString()).toBe('2026-04-06T03:59:59.999Z')
  })

  it('a stored valid-through date maps to the end of that calendar day', () => {
    expect(proposalDeadline('2026-12-01T00:00:00.000Z', 'America/New_York').toISOString()).toBe('2026-12-02T04:59:59.999Z')
    expect(proposalDeadline(new Date('2026-12-01T00:00:00Z'), 'America/Los_Angeles').toISOString()).toBe('2026-12-02T07:59:59.999Z')
    // A bad zone falls back to Eastern rather than throwing.
    expect(proposalDeadline('2026-12-01T00:00:00Z', 'Not/AZone').toISOString()).toBe('2026-12-02T04:59:59.999Z')
  })

  it('validates and normalises zones', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
    expect(normalizeTimeZone(undefined)).toBe('America/New_York')
    for (const o of TIME_ZONE_OPTIONS) expect(isValidTimeZone(o.value)).toBe(true)
  })

  it('formats in a zone vs as a calendar date', () => {
    expect(ymdInZone('2026-11-25T02:00:00Z', 'America/New_York')).toBe('2026-11-24')
    expect(ymdInZone('2026-11-25T02:00:00Z', 'UTC')).toBe('2026-11-25')
    expect(formatDateInZone('2026-11-25T02:00:00Z', 'America/New_York')).toBe('November 24, 2026')
    expect(formatCalendarDate('2026-12-01T00:00:00Z')).toBe('December 1, 2026')
  })
})
