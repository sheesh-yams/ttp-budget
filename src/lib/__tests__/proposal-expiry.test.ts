import { isProposalExpired, canReopenProposal, defaultReopenDate, reopenedLinkExpiry, reopenedStatus, earliestReopenDate } from '@/lib/proposal-expiry'

const now = new Date('2026-10-19T12:00:00Z')
const past = '2026-09-30T00:00:00Z', future = '2026-11-30T00:00:00Z'

describe('proposal expiry', () => {
  it('a sent proposal past its date is expired; won/lost/declined/drafts are not reopenable', () => {
    expect(isProposalExpired({ status: 'VIEWED', expiresAt: past }, now)).toBe(true)
    expect(isProposalExpired({ status: 'VIEWED', expiresAt: future }, now)).toBe(false)
    expect(isProposalExpired({ status: 'EXPIRED', expiresAt: future }, now)).toBe(true)
    expect(isProposalExpired({ status: 'SENT', expiresAt: null }, now)).toBe(false)
    for (const status of ['APPROVED', 'LOST', 'DECLINED', 'DRAFT']) {
      expect(canReopenProposal({ status, expiresAt: past }, now)).toBe(false)
    }
    for (const status of ['SENT', 'VIEWED', 'CHANGES_NEEDED', 'EXPIRED']) {
      expect(canReopenProposal({ status, expiresAt: past }, now)).toBe(true)
    }
  })

  it('defaults the new date to today + the workspace validity days', () => {
    expect(defaultReopenDate(30, new Date(2026, 9, 19))).toBe('2026-11-18')
    expect(defaultReopenDate(0, new Date(2026, 9, 19))).toBe('2026-10-20')
  })

  it('keeps the link working past the new date', () => {
    const newDate = new Date('2027-03-01T00:00:00Z')
    expect(reopenedLinkExpiry(null, newDate, now).toISOString()).toBe('2027-03-31T00:00:00.000Z')
    expect(reopenedLinkExpiry(new Date('2028-01-01T00:00:00Z'), newDate, now).toISOString()).toBe('2028-01-01T00:00:00.000Z')
    expect(reopenedLinkExpiry(null, new Date('2026-10-25T00:00:00Z'), now).getTime()).toBe(now.getTime() + 90 * 86_400_000)
  })
  it('reopening as sent returns it to a signable status', () => {
    expect(reopenedStatus({ status: 'EXPIRED', firstViewedAt: past })).toBe('VIEWED')
    expect(reopenedStatus({ status: 'EXPIRED', firstViewedAt: null })).toBe('SENT')
    expect(reopenedStatus({ status: 'CHANGES_NEEDED', firstViewedAt: past })).toBe('VIEWED')
    expect(reopenedStatus({ status: 'SENT', firstViewedAt: null })).toBe('SENT')
    expect(reopenedStatus({ status: 'VIEWED', firstViewedAt: past })).toBe('VIEWED')
  })

  it('earliest date is tomorrow in UTC (dates are stored as UTC midnight)', () => {
    expect(earliestReopenDate(new Date('2026-10-19T12:00:00Z'))).toBe('2026-10-20')
    // 9pm Oct 19 in New York is already Oct 20 in UTC — Oct 20 would expire at once.
    expect(earliestReopenDate(new Date('2026-10-20T01:00:00Z'))).toBe('2026-10-21')
    expect(defaultReopenDate(0, new Date('2026-10-20T01:00:00Z')) >= '2026-10-21').toBe(true)
  })
})
