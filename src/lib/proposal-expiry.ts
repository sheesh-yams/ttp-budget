// When a proposal counts as expired, and what reopening it is allowed to do.
// Plain module — shared by the proposal lists, the Reopen dialog, the public
// page and reopenProposal (tested in __tests__/proposal-expiry.test.ts).
//
// Expiry is mostly derived: a sent proposal whose valid-through date has
// passed is expired, whatever its stored status says.

/** Statuses a reopen can start from (still open with the client). */
export const REOPENABLE_STATUSES = ['SENT', 'VIEWED', 'CHANGES_NEEDED', 'EXPIRED'] as const

export function isProposalExpired(p: { status: string; expiresAt: Date | string | null }, now: Date = new Date()): boolean {
  if (p.status === 'EXPIRED') return true
  if (!p.expiresAt || !(REOPENABLE_STATUSES as readonly string[]).includes(p.status)) return false
  return new Date(p.expiresAt) < now
}

/** Expired and still open with the client (not won, lost, declined or a draft). */
export function canReopenProposal(p: { status: string; expiresAt: Date | string | null }, now: Date = new Date()): boolean {
  return (REOPENABLE_STATUSES as readonly string[]).includes(p.status) && isProposalExpired(p, now)
}

/** What the Reopen dialog shows (from getProposalReopenInfo). */
export interface ProposalReopenInfo {
  expiredOn: string | null      // ISO
  lastViewedAt: string | null   // ISO
  defaultExpiresAt: string      // "YYYY-MM-DD"
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

/**
 * The earliest valid-through date a reopen can pick, as "YYYY-MM-DD".
 * Dates are stored as UTC midnight (like every send) and the approve route
 * refuses once that's passed, so it's the day after today in UTC.
 */
export function earliestReopenDate(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().slice(0, 10)
}

/** Today + `days`, as "YYYY-MM-DD" (the Reopen dialog's default). */
export function defaultReopenDate(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.max(1, days))
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const min = earliestReopenDate(now)
  return ymd < min ? min : ymd
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
