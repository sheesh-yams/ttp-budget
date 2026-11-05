import { inTab, isBooked, summarizeBooked, type ProjectRow } from '@/lib/projects-table'

const row = (o: Partial<ProjectRow> = {}, money: Partial<NonNullable<ProjectRow['money']>> | null = {}): ProjectRow => ({
  id: Math.random().toString(36), name: 'P', shootType: 'OTHER', status: 'ACTIVE', phase: 'PRE_PROD',
  client: { id: 'c', name: 'C', logoUrl: null }, shootStart: null, shootEnd: null, updatedAt: '2026-11-01',
  billing: false, overdueInvoices: 0,
  money: money === null ? null : { valueCents: 0, invoicedCents: 0, collectedCents: 0, won: true, wonAt: null, proposed: false, ...money },
  step: { tone: 'grey', label: 'On track' }, attention: false, suggested: null, team: [], canEdit: true, canEditTeam: true,
  ...o,
})

describe('booked work', () => {
  it('leads are booked only once they are being invoiced', () => {
    expect(isBooked({ status: 'LEAD', billing: false })).toBe(false)
    expect(isBooked({ status: 'LEAD', billing: true })).toBe(true)
    expect(isBooked({ status: 'WRAPPED', billing: false })).toBe(true)
  })
  it('tabs: leads live on their own tab; an invoiced lead shows in progress too', () => {
    const lead = row({ status: 'LEAD', phase: 'LEAD' })
    const billedLead = row({ status: 'LEAD', phase: 'LEAD', billing: true })
    expect(inTab(lead, 'progress')).toBe(false)
    expect(inTab(lead, 'all')).toBe(false)
    expect(inTab(lead, 'attention')).toBe(false)
    expect(inTab(lead, 'leads')).toBe(true)
    expect(inTab(billedLead, 'progress')).toBe(true)
    expect(inTab(row({ status: 'WRAPPED' }), 'progress')).toBe(false)
  })
})

describe('summarizeBooked', () => {
  const today = '2026-11-05', soon = '2026-12-05'
  it("the user's example: 100k booked, 75k invoiced, 50k paid", () => {
    const s = summarizeBooked([row({}, { valueCents: 100_000_00, invoicedCents: 75_000_00, collectedCents: 50_000_00 })], today, soon)
    expect(s).toMatchObject({ count: 1, bookedCents: 100_000_00, collectedCents: 50_000_00, outstandingCents: 50_000_00, invoicedUnpaidCents: 25_000_00, notInvoicedCents: 25_000_00 })
  })
  it('skips unbilled leads and archived projects, floors at zero, counts overdue and shoots', () => {
    const s = summarizeBooked([
      row({ status: 'LEAD' }, { valueCents: 9_999 }),
      row({ status: 'ARCHIVED' }, { valueCents: 9_999 }),
      row({ status: 'WRAPPED', overdueInvoices: 2 }, { valueCents: 1_000, invoicedCents: 1_200, collectedCents: 1_200 }), // overpaid
      row({ shootStart: '2026-11-20' }, { valueCents: 500, invoicedCents: 0, collectedCents: 0 }),
    ], today, soon)
    expect(s).toMatchObject({ count: 2, bookedCents: 1_500, collectedCents: 1_200, outstandingCents: 500, notInvoicedCents: 500, invoicedUnpaidCents: 0, overdueCount: 2, upcomingShoots: 1 })
    expect(s.outstandingCents).toBe(s.invoicedUnpaidCents + s.notInvoicedCents)
  })
  it('margin-blind rows: counts only, no money', () => {
    const s = summarizeBooked([row({ shootStart: '2026-11-06' }, null)], today, soon)
    expect(s).toMatchObject({ count: 1, bookedCents: 0, upcomingShoots: 1 })
  })
})
