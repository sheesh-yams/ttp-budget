import { clientMoney } from '@/lib/client-money'
import { buildClientActivity } from '@/lib/client-activity'

const now = new Date('2026-11-08T12:00:00Z')
const past = '2026-10-01T12:00:00Z'
const future = '2026-12-01T12:00:00Z'

describe('clientMoney', () => {
  it('counts partial payments as collected and balances as outstanding', () => {
    const m = clientMoney([
      { status: 'PAID',    totalCents: 10_000, amountPaidCents: 10_000, dueDate: past, paidAt: '2026-10-05T00:00:00Z' },
      { status: 'VIEWED',  totalCents: 8_000,  amountPaidCents: 3_000,  dueDate: past },    // partial, overdue
      { status: 'SENT',    totalCents: 5_000,  amountPaidCents: 0,      dueDate: future },
      { status: 'DRAFT',   totalCents: 99_999, amountPaidCents: 0,      dueDate: past },
      { status: 'VOID',    totalCents: 7_000,  amountPaidCents: 7_000,  dueDate: past },
    ], now)
    expect(m.billedCents).toBe(23_000)
    expect(m.collectedCents).toBe(13_000)
    expect(m.outstandingCents).toBe(10_000)
    expect(m.overdueCents).toBe(5_000)
    expect([m.openCount, m.overdueCount]).toEqual([2, 1])
    expect(m.lastPaidAt).toBe('2026-10-05T00:00:00.000Z')
  })
  it('an open invoice already covered owes nothing', () => {
    const m = clientMoney([{ status: 'VIEWED', totalCents: 1_000, amountPaidCents: 1_200, dueDate: past }], now)
    expect([m.outstandingCents, m.openCount, m.overdueCount, m.collectedCents]).toEqual([0, 0, 0, 1_200])
  })
  it('empty client', () => {
    expect(clientMoney([], now)).toMatchObject({ billedCents: 0, collectedCents: 0, outstandingCents: 0, lastPaidAt: null })
  })
})

describe('buildClientActivity', () => {
  const base = {
    projects: [{ id: 'p1', name: 'Spot', createdAt: '2026-09-01T00:00:00Z' }],
    proposals: [
      { projectId: 'p1', projectName: 'Spot', title: 'Spot v2', status: 'APPROVED', sentAt: '2026-09-02T00:00:00Z', firstViewedAt: '2026-09-03T00:00:00Z', approvedAt: '2026-09-04T00:00:00Z', declinedAt: null },
      { projectId: 'p1', projectName: 'Spot', title: '', status: 'VIEWED', sentAt: '2026-09-05T00:00:00Z', firstViewedAt: null, approvedAt: '2026-09-06T00:00:00Z', declinedAt: null },
    ],
    invoices: [{ projectId: 'p1', number: 'TTP-2026-001', sentAt: '2026-10-01T00:00:00Z', firstViewedAt: null, paidAt: '2026-10-10T00:00:00Z' }],
    deliverables: [{ projectId: 'p1', title: 'Cutdown', firstClientViewAt: '2026-11-01T00:00:00Z' }],
  }
  it('newest first, with links, skipping missing timestamps', () => {
    const a = buildClientActivity(base)
    expect(a.map(e => e.kind)).toEqual([
      'deliverable.viewed', 'invoice.paid', 'invoice.sent', 'proposal.sent',
      'proposal.won', 'proposal.viewed', 'proposal.sent', 'project.created',
    ])
    expect(a[0].href).toBe('/projects/p1/delivery')
    expect(a[1]).toMatchObject({ text: 'Invoice TTP-2026-001 paid', href: '/projects/p1/invoices' })
    // A title-less proposal falls back to the project name; approvedAt on a
    // non-won proposal isn't reported as a win.
    expect(a.find(e => e.at.startsWith('2026-09-05'))?.text).toBe('Proposal sent · Spot')
    expect(a.some(e => e.at.startsWith('2026-09-06'))).toBe(false)
  })
  it('respects the limit', () => {
    expect(buildClientActivity(base, 3)).toHaveLength(3)
  })
})
