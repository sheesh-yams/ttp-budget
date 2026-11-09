import { projectToInvoiceCents, toInvoiceList } from '@/lib/project-billing'

const base = { budgetCents: 2_310_000, approvedTotalCents: 1_825_000, won: true, archived: false }
const paid = (c: number) => ({ status: 'PAID', totalCents: c })

describe('projectToInvoiceCents', () => {
  it('the live budget minus what was sent (PMH: $23,100 − $12,000), same base as the invoices page', () => {
    expect(projectToInvoiceCents({ ...base, invoices: [paid(400_000), paid(400_000), paid(400_000)] })).toBe(1_110_000)
  })
  it('drafts are not invoiced yet; void invoices do not count', () => {
    expect(projectToInvoiceCents({ ...base, invoices: [paid(1_200_000), { status: 'DRAFT', totalCents: 1_110_000 }, { status: 'VOID', totalCents: 99 }] })).toBe(1_110_000)
  })
  it('added scope raises the amount to bill and is itself invoiced', () => {
    expect(projectToInvoiceCents({ ...base, invoices: [paid(2_310_000), { status: 'SENT', totalCents: 50_000, isScopeAddition: true }] })).toBe(0)
  })
  it('fully or over-invoiced: nothing left', () => {
    expect(projectToInvoiceCents({ ...base, invoices: [paid(2_500_000)] })).toBe(0)
  })
  it('no budget: the signed total', () => {
    expect(projectToInvoiceCents({ ...base, budgetCents: 0, invoices: [paid(825_000)] })).toBe(1_000_000)
  })
  it('not booked (no win, nothing sent), archived or wrapped: nothing', () => {
    expect(projectToInvoiceCents({ ...base, won: false, approvedTotalCents: null, invoices: [] })).toBe(0)
    expect(projectToInvoiceCents({ ...base, archived: true, invoices: [] })).toBe(0)
    expect(projectToInvoiceCents({ ...base, wrapped: true, invoices: [paid(2_000_000)] })).toBe(0)
  })
  it('billing without a win (invoice-first) uses the budget', () => {
    expect(projectToInvoiceCents({ ...base, won: false, approvedTotalCents: null, invoices: [{ status: 'SENT', totalCents: 310_000 }] })).toBe(2_000_000)
  })
})

describe('toInvoiceList', () => {
  it('only projects with something left, largest first', () => {
    const rows = toInvoiceList([
      { ...base, id: 'a', name: 'A', invoices: [paid(1_825_000)] },
      { ...base, id: 'b', name: 'B', invoices: [] },
      { ...base, id: 'c', name: 'C', budgetCents: 100_000, invoices: [] },
    ])
    expect(rows.map(r => [r.projectId, r.cents])).toEqual([['a', 485_000], ['b', 2_310_000], ['c', 100_000]].sort((x, y) => (y[1] as number) - (x[1] as number)))
  })
})
