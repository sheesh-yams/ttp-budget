// When a proposal counts as expired, and what reopening it is allowed to do.
// Plain module — shared by the proposal lists, the Reopen dialog, the public
// page and reopenProposal (tested in __tests__/proposal-expiry.test.ts).
//
// Expiry is mostly derived: a sent proposal whose valid-through date has
// passed is expired, whatever its stored status says. "Passed" means the end
// of that day in the studio's time zone (Workspace.timeZone) — the stored
// value is UTC midnight, which is the evening before in the Americas.

import { DEFAULT_TIME_ZONE, formatCalendarDate, formatDateInZone, normalizeTimeZone, proposalDeadline, ymdInZone } from './time-zone'

/** Statuses a reopen can start from (still open with the client). */
export const REOPENABLE_STATUSES = ['SENT', 'VIEWED', 'CHANGES_NEEDED', 'EXPIRED'] as const

/** Whether a valid-through date has run out: after 11:59 pm that day in `tz`. */
export function isPastValidThrough(expiresAt: Date | string, now: Date = new Date(), tz: string = DEFAULT_TIME_ZONE): boolean {
  return now.getTime() > proposalDeadline(expiresAt, tz).getTime()
}

export function isProposalExpired(p: { status: string; expiresAt: Date | string | null }, now: Date = new Date(), tz: string = DEFAULT_TIME_ZONE): boolean {
  if (p.status === 'EXPIRED') return true
  if (!p.expiresAt || !(REOPENABLE_STATUSES as readonly string[]).includes(p.status)) return false
  return isPastValidThrough(p.expiresAt, now, tz)
}

/**
 * Calendar days from today (in the studio's zone) to the valid-through date:
 * 0 = its last day is today, 1 = tomorrow, negative = already past.
 */
export function daysUntilValidThrough(expiresAt: Date | string, now: Date = new Date(), tz: string = DEFAULT_TIME_ZONE): number {
  const due = Date.parse(new Date(expiresAt).toISOString().slice(0, 10))
  const today = Date.parse(ymdInZone(now, normalizeTimeZone(tz)))
  return Math.round((due - today) / 86_400_000)
}

/** Expired and still open with the client (not won, lost, declined or a draft). */
export function canReopenProposal(p: { status: string; expiresAt: Date | string | null }, now: Date = new Date(), tz: string = DEFAULT_TIME_ZONE): boolean {
  return (REOPENABLE_STATUSES as readonly string[]).includes(p.status) && isProposalExpired(p, now, tz)
}

/** What the Reopen dialog shows (from getProposalReopenInfo). */
export interface ProposalReopenInfo {
  expiredOn: string | null      // ISO
  lastViewedAt: string | null   // ISO
  defaultExpiresAt: string      // "YYYY-MM-DD"
  /** The earliest date the picker allows (tomorrow in the studio's zone). */
  minExpiresAt: string          // "YYYY-MM-DD"
  /** Where the email would go (the client's contact email), and who's cc'd. */
  to: string | null
  cc: string[]
}

/**
 * The status a reopened proposal goes back to: reopening "as sent" puts it
 * back in front of the client to sign, and the approve route only accepts
 * SENT / VIEWED — so a literal EXPIRED or a CHANGES_NEEDED (the producer is
 * standing by the proposal as sent) returns to Viewed, or Sent if never opened.
 */
export function reopenedStatus(p: { status: string; firstViewedAt: Date | string | null }): string {
  return p.status === 'EXPIRED' || p.status === 'CHANGES_NEEDED' ? (p.firstViewedAt ? 'VIEWED' : 'SENT') : p.status
}

/** A "YYYY-MM-DD" calendar day plus `days`. */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The earliest valid-through date a reopen can pick, as "YYYY-MM-DD":
 * tomorrow in the studio's time zone.
 */
export function earliestReopenDate(now: Date = new Date(), tz: string = DEFAULT_TIME_ZONE): string {
  return addDays(ymdInZone(now, normalizeTimeZone(tz)), 1)
}

/** Today + `days` in the studio's zone, as "YYYY-MM-DD" (the Reopen dialog's default). */
export function defaultReopenDate(days: number, now: Date = new Date(), tz: string = DEFAULT_TIME_ZONE): string {
  return addDays(ymdInZone(now, normalizeTimeZone(tz)), Math.max(1, days))
}

/**
 * The share link has to outlive the new valid-through date, so the client
 * can still open and sign it: the later of its current expiry, 90 days from
 * now (what a send gives), or 30 days past the new date.
 */
export function reopenedLinkExpiry(current: Date | null, newValidThrough: Date, now: Date = new Date()): Date {
  const candidates = [now.getTime() + 90 * 86_400_000, newValidThrough.getTime() + 30 * 86_400_000]
  if (current) candidates.push(current.getTime())
  return new Date(Math.max(...candidates))
}

/**
 * Whether the client's share link has run out. A won proposal never expires —
 * it's locked, and the client keeps the signed copy, so its link stays open
 * whatever `publicTokenExpiresAt` says (regenerate the link to revoke it).
 */
export function isProposalLinkExpired(
  p: { status: string; publicTokenExpiresAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (p.status === 'APPROVED') return false
  return !!p.publicTokenExpiresAt && new Date(p.publicTokenExpiresAt) < now
}

/**
 * What the "Valid through" slot shows on the client page, sign page and PDF.
 * A won proposal shows when it was accepted instead — its valid-through date
 * no longer applies. `value` is ready to show: the acceptance moment as a date
 * in the studio's zone (a 9pm signature isn't "tomorrow"), the valid-through
 * date as its own calendar day. `date` is the ISO behind it. Null = show nothing.
 */
export function proposalTermLabel(p: {
  status: string; expiresAt: Date | string | null; approvedAt?: Date | string | null
}, tz: string = DEFAULT_TIME_ZONE): { label: string; date: string | null; text: string | null; value: string } | null {
  const iso = (d: Date | string) => new Date(d).toISOString()
  if (p.status === 'APPROVED') {
    return p.approvedAt
      ? { label: 'Accepted', date: iso(p.approvedAt), text: null, value: formatDateInZone(p.approvedAt, tz) }
      : { label: 'Status', date: null, text: 'Accepted', value: 'Accepted' }   // marked won by hand
  }
  return p.expiresAt ? { label: 'Valid Through', date: iso(p.expiresAt), text: null, value: formatCalendarDate(p.expiresAt) } : null
}
