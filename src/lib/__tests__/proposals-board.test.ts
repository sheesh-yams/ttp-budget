import {
  badges, band, boardColumn, effectiveStatus, followUp, frozenTotalCents, inTab, matches, nextLine, pickProposal,
  stage, summarize, EMPTY_FILTERS, type DealProposal, type DealRow,
} from '@/lib/proposals-board'

const now = new Date('2026-11-05T15:00:00Z')

const prop = (o: Partial<DealProposal> = {}): DealProposal => ({
  id: 'pr1', title: 'Proposal', token: 'tok', status: 'SENT', version: 1, otherVersions: 0, draftAbove: null,
  viewCount: 0, sentAt: '2026-11-04T10:00:00Z', lastViewedAt: null, expiresAt: '2026-12-04T00:00:00Z',
  approvedAt: null, declinedAt: null, updatedAt: '2026-11-04T10:00:00Z', decidedAt: null, signatureName: null, ...o,
})
const row = (p: DealProposal | null, o: Partial<DealRow> = {}): DealRow => ({
  key: p?.id ?? 'p:x', project: { id: 'x', name: 'Shoot', status: 'LEAD' }, client: { id: 'c1', name: 'Acme', logoUrl: null },
  owner: null, proposal: p, hasBudget: true, valueCents: 10_000, canEdit: true, ...o,
})

describe('pickProposal', () => {
  it('latest non-draft, else newest draft, and notes a newer draft', () => {
    expect(pickProposal([])).toBeNull()
    const sentThenDraft = [{ status: 'SENT', version: 1 }, { status: 'DRAFT', version: 2 }]
    expect(pickProposal(sentThenDraft)).toEqual({ rep: sentThenDraft[0], others: 1, draftAbove: 2 })
    const drafts = [{ status: 'DRAFT', version: 1 }, { status: 'DRAFT', version: 2 }]
    expect(pickProposal(drafts)?.rep.version).toBe(2)
    expect(pickProposal(drafts)?.draftAbove).toBeNull()
    expect(pickProposal([{ status: 'EXPIRED', version: 1 }, { status: 'VIEWED', version: 3 }])?.rep.version).toBe(3)
  })
  it('frozenTotalCents prefers content.totalCents', () => {
    expect(frozenTotalCents({ totalCents: 5, budgetSnapshot: { totalCents: 9 } })).toBe(5)
    expect(frozenTotalCents({ budgetSnapshot: { totalCents: 9 } })).toBe(9)
    expect(frozenTotalCents({})).toBeNull()
    expect(frozenTotalCents(null)).toBeNull()
  })
})

describe('stage and status', () => {
  it('maps statuses, with open proposals past expiry reading as expired', () => {
    expect(stage(row(null), now)).toBe('ns')
    expect(stage(row(prop({ status: 'DRAFT' })), now)).toBe('ns')
    expect(stage(row(prop({ status: 'VIEWED' })), now)).toBe('out')
    expect(stage(row(prop({ status: 'APPROVED' })), now)).toBe('won')
    const lapsed = row(prop({ status: 'VIEWED', expiresAt: '2026-11-01T00:00:00Z' }))
    expect(effectiveStatus(lapsed, now)).toBe('EXPIRED')
    expect(stage(lapsed, now)).toBe('lost')
    // A won proposal never expires.
    expect(stage(row(prop({ status: 'APPROVED', expiresAt: '2026-01-01T00:00:00Z' })), now)).toBe('won')
  })
})

describe('followUp', () => {
  it('quiet after more than 5 days since the last view', () => {
    expect(followUp(row(prop({ status: 'VIEWED', viewCount: 2, lastViewedAt: '2026-10-31T15:00:00Z' })), now)).toBeNull() // 5 days
    expect(followUp(row(prop({ status: 'VIEWED', viewCount: 3, lastViewedAt: '2026-10-22T10:00:00Z' })), now)).toEqual({ short: 'Quiet 14d', long: 'No reply in 14 days' })
  })
  it('not opened after 3 days', () => {
    expect(followUp(row(prop({ sentAt: '2026-11-03T15:00:00Z' })), now)).toBeNull()
    expect(followUp(row(prop({ sentAt: '2026-11-02T15:00:00Z' })), now)?.short).toBe('Not opened 3d')
  })
  it('expiring within 2 days, and changes asked', () => {
    expect(followUp(row(prop({ expiresAt: '2026-11-07T00:00:00Z' })), now)?.long).toBe('Expires in 2 days')
    expect(followUp(row(prop({ status: 'CHANGES_NEEDED' })), now)?.short).toBe('Changes asked')
  })
  it('never for drafts or closed deals', () => {
    expect(followUp(row(prop({ status: 'DRAFT', sentAt: null })), now)).toBeNull()
    expect(followUp(row(prop({ status: 'LOST', sentAt: '2026-09-01T00:00:00Z' })), now)).toBeNull()
  })
})

describe('badges and lines', () => {
  it('v4 badge set', () => {
    expect(badges(row(null), now)).toEqual([{ text: 'Draft needed', tone: 'grey' }])
    expect(badges(row(prop()), now)).toEqual([{ text: 'Not opened', tone: 'blue' }])
    expect(badges(row(prop({ status: 'VIEWED', viewCount: 3, lastViewedAt: '2026-11-04T00:00:00Z' })), now)).toEqual([{ text: 'Viewed 3×', tone: 'violet' }])
    expect(badges(row(prop({ status: 'VIEWED', viewCount: 3, lastViewedAt: '2026-10-22T10:00:00Z' })), now).map(b => b.text)).toEqual(['Follow up', 'Quiet 14d'])
    expect(badges(row(prop({ status: 'APPROVED', approvedAt: '2026-10-22T00:00:00Z', signatureName: 'A' })), now)).toEqual([{ text: 'Signed Oct 22', tone: 'green' }])
    expect(badges(row(prop({ status: 'EXPIRED' })), now)[0].text).toBe('Expired')
  })
  it('lead lines say whether a budget exists', () => {
    expect(nextLine(row(null), now).text).toBe('Budget ready · draft the proposal')
    expect(nextLine(row(null, { hasBudget: false }), now).text).toBe('Build the budget, then draft')
    expect(nextLine(row(prop()), now).text).toBe('Sent yesterday · not opened yet')
  })
})

describe('tabs, filters, bands, board', () => {
  it('tabs', () => {
    const quiet = row(prop({ status: 'VIEWED', viewCount: 1, lastViewedAt: '2026-10-20T00:00:00Z' }))
    expect(inTab(row(null), 'open', now)).toBe(true)
    expect(inTab(quiet, 'open', now) && inTab(quiet, 'follow', now)).toBe(true)
    expect(inTab(row(prop({ status: 'DECLINED' })), 'lost', now)).toBe(true)
    expect(inTab(row(prop({ status: 'APPROVED' })), 'open', now)).toBe(false)
  })
  it('filters on effective status, owner and text', () => {
    const r = row(prop({ status: 'SENT', expiresAt: '2026-11-01T00:00:00Z' }), { owner: { userId: 'u1', name: 'S', email: 's@x', avatarUrl: null } })
    expect(matches(r, { ...EMPTY_FILTERS, statuses: ['EXPIRED'] }, now)).toBe(true)
    expect(matches(r, { ...EMPTY_FILTERS, statuses: ['SENT'] }, now)).toBe(false)
    expect(matches(r, { ...EMPTY_FILTERS, owners: ['u2'] }, now)).toBe(false)
    expect(matches(r, { ...EMPTY_FILTERS, q: 'acme' }, now)).toBe(true)
  })
  it('activity bands', () => {
    expect(band(row(null), now)).toBe('ns')
    expect(band(row(prop()), now)).toBe('d7')
    expect(band(row(prop({ sentAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' })), now)).toBe('d30')
    expect(band(row(prop({ status: 'LOST', sentAt: '2026-07-01T00:00:00Z' })), now)).toBe('older')
  })
  it('board columns: won this quarter only, lost within 90 days', () => {
    expect(boardColumn(row(prop({ status: 'VIEWED' })), now)).toBe('viewed')
    expect(boardColumn(row(prop({ status: 'CHANGES_NEEDED' })), now)).toBe('viewed')
    expect(boardColumn(row(prop({ status: 'APPROVED', approvedAt: '2026-10-01T00:00:00Z' })), now)).toBe('won')
    expect(boardColumn(row(prop({ status: 'APPROVED', approvedAt: '2026-09-30T23:00:00Z' })), now)).toBeNull()
    expect(boardColumn(row(prop({ status: 'EXPIRED', expiresAt: '2026-08-28T00:00:00Z' })), now)).toBe('lost')
    expect(boardColumn(row(prop({ status: 'LOST', decidedAt: '2026-07-01T00:00:00Z' })), now)).toBeNull()
    expect(boardColumn(row(prop({ status: 'LOST', decidedAt: '2026-10-20T00:00:00Z' })), now)).toBe('lost')
  })
  it('never dates a decision from updatedAt (opening the link bumps it)', () => {
    const won = row(prop({ status: 'APPROVED', approvedAt: null, decidedAt: null, updatedAt: '2026-11-05T09:00:00Z' }))
    expect(boardColumn(won, now)).toBeNull()
    expect(summarize([won], now).wonThisQCents).toBe(0)
    expect(nextLine(won, now).text).toBe('Won')
    const dated = row(prop({ status: 'APPROVED', approvedAt: null, decidedAt: '2026-10-07T00:00:00Z', updatedAt: '2026-11-05T09:00:00Z' }))
    expect(boardColumn(dated, now)).toBe('won')
  })
})

describe('summarize', () => {
  it('pipeline, drafting, quarter wins and win rate', () => {
    const rows = [
      row(prop({ id: 'a' }), { valueCents: 100 }),
      row(prop({ id: 'b', status: 'VIEWED', viewCount: 1, lastViewedAt: '2026-10-01T00:00:00Z' }), { valueCents: 200 }),
      row(null, { valueCents: 50 }),
      row(prop({ id: 'c', status: 'DRAFT' }), { valueCents: 25 }),
      row(prop({ id: 'd', status: 'APPROVED', approvedAt: '2026-10-02T00:00:00Z' }), { valueCents: 1_000 }),
      row(prop({ id: 'e', status: 'APPROVED', approvedAt: '2026-08-02T00:00:00Z' }), { valueCents: 400 }),
      row(prop({ id: 'f', status: 'LOST' }), { valueCents: 9_999 }),
    ]
    expect(summarize(rows, now)).toEqual({
      outCount: 2, pipelineCents: 300, nsCount: 2, draftingCents: 75,
      wonThisQCents: 1_000, wonLastQCents: 400, wonThisQCount: 1, wonCount: 2, decidedCount: 3, followCount: 1,
    })
  })
  it('margin-blind rows (null value) count but add no money', () => {
    const s = summarize([row(prop(), { valueCents: null })], now)
    expect(s.outCount).toBe(1)
    expect(s.pipelineCents).toBe(0)
  })
})
