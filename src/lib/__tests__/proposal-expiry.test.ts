import { daysUntilValidThrough, isProposalExpired, isProposalLinkExpired, proposalTermLabel, canReopenProposal, defaultReopenDate, reopenedLinkExpiry, reopenedStatus, earliestReopenDate } from '@/lib/proposal-expiry'

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
    expect(defaultReopenDate(30, new Date('2026-10-19T16:00:00Z'))).toBe('2026-11-18')
    expect(defaultReopenDate(0, new Date('2026-10-19T16:00:00Z'))).toBe('2026-10-20')
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

  it('earliest date is tomorrow in the studio time zone', () => {
    expect(earliestReopenDate(new Date('2026-10-19T12:00:00Z'))).toBe('2026-10-20')
    // 9pm Oct 19 in New York is Oct 20 in UTC — but still Oct 19 for the studio.
    expect(earliestReopenDate(new Date('2026-10-20T01:00:00Z'))).toBe('2026-10-20')
    expect(defaultReopenDate(0, new Date('2026-10-20T01:00:00Z'))).toBe('2026-10-20')
    // A Los Angeles studio at 11pm Oct 19 (06:00Z Oct 20) is still on Oct 19.
    expect(earliestReopenDate(new Date('2026-10-20T06:00:00Z'), 'America/Los_Angeles')).toBe('2026-10-20')
    expect(earliestReopenDate(new Date('2026-10-20T06:00:00Z'), 'America/New_York')).toBe('2026-10-21')
  })

  it('counts days left in calendar days in the studio zone', () => {
    // Valid through Nov 25; 9pm Nov 24 Eastern (02:00Z Nov 25) → 1 day left, not "today".
    expect(daysUntilValidThrough('2026-11-25T00:00:00Z', new Date('2026-11-25T02:00:00Z'))).toBe(1)
    expect(daysUntilValidThrough('2026-11-25T00:00:00Z', new Date('2026-11-25T15:00:00Z'))).toBe(0)
    expect(daysUntilValidThrough('2026-11-25T00:00:00Z', new Date('2026-11-26T15:00:00Z'))).toBe(-1)
  })

  it('a valid-through date lasts to the end of that day in the studio zone', () => {
    const p = { status: 'VIEWED', expiresAt: '2026-12-01T00:00:00Z' }   // "valid through Dec 1"
    // 7pm Nov 30 Eastern — the old cut-off — is still valid.
    expect(isProposalExpired(p, new Date('2026-12-01T00:00:00Z'))).toBe(false)
    // 11pm Dec 1 Eastern (04:00Z Dec 2) — still valid.
    expect(isProposalExpired(p, new Date('2026-12-02T04:00:00Z'))).toBe(false)
    // 12:01am Dec 2 Eastern (05:01Z) — expired.
    expect(isProposalExpired(p, new Date('2026-12-02T05:01:00Z'))).toBe(true)
    // Pacific studio: 11:30pm Dec 1 Pacific (07:30Z Dec 2) still valid.
    expect(isProposalExpired(p, new Date('2026-12-02T07:30:00Z'), 'America/Los_Angeles')).toBe(false)
    expect(isProposalExpired(p, new Date('2026-12-02T08:01:00Z'), 'America/Los_Angeles')).toBe(true)
  })
})

describe('won proposals lock instead of expiring', () => {
  it('the client link never expires once won', () => {
    expect(isProposalLinkExpired({ status: 'APPROVED', publicTokenExpiresAt: past }, now)).toBe(false)
    expect(isProposalLinkExpired({ status: 'SENT', publicTokenExpiresAt: past }, now)).toBe(true)
    expect(isProposalLinkExpired({ status: 'LOST', publicTokenExpiresAt: past }, now)).toBe(true)
    expect(isProposalLinkExpired({ status: 'VIEWED', publicTokenExpiresAt: future }, now)).toBe(false)
    expect(isProposalLinkExpired({ status: 'SENT', publicTokenExpiresAt: null }, now)).toBe(false)
  })
  it('the valid-through slot shows the acceptance once won', () => {
    expect(proposalTermLabel({ status: 'APPROVED', expiresAt: past, approvedAt: '2026-09-01T10:00:00Z' }))
      .toEqual({ label: 'Accepted', date: '2026-09-01T10:00:00.000Z', text: null, value: 'September 1, 2026' })
    expect(proposalTermLabel({ status: 'APPROVED', expiresAt: past, approvedAt: null }))
      .toEqual({ label: 'Status', date: null, text: 'Accepted', value: 'Accepted' })
    expect(proposalTermLabel({ status: 'VIEWED', expiresAt: past })).toEqual({ label: 'Valid Through', date: '2026-09-30T00:00:00.000Z', text: null, value: 'September 30, 2026' })
  })
  it('a 9pm Eastern signature is dated that day, not the next', () => {
    const t = proposalTermLabel({ status: 'APPROVED', expiresAt: past, approvedAt: '2026-11-25T02:00:00Z' })
    expect(t?.value).toBe('November 24, 2026')
    expect(proposalTermLabel({ status: 'APPROVED', expiresAt: past, approvedAt: '2026-11-25T02:00:00Z' }, 'Europe/London')?.value).toBe('November 25, 2026')
    expect(proposalTermLabel({ status: 'SENT', expiresAt: null })).toBeNull()
  })
})
