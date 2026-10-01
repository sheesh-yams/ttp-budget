import { calcInvoiceTotals, autoInvoiceDiscount, addDaysISO, localISODate } from '../invoice-totals'

describe('calcInvoiceTotals', () => {
  it('subtotal − discount + tax on the discounted amount', () => {
    expect(calcInvoiceTotals({ lineTotalsCents: [3_744_000, 0], discountCents: 187_200, taxPct: 10 }))
      .toEqual({ subtotalCents: 3_744_000, discountCents: 187_200, taxCents: 355_680, totalCents: 3_912_480 })
  })
  it('no discount, no tax', () => {
    expect(calcInvoiceTotals({ lineTotalsCents: [100, 250] }).totalCents).toBe(350)
  })
  it('clamps a discount to the subtotal and ignores negatives', () => {
    expect(calcInvoiceTotals({ lineTotalsCents: [1000], discountCents: 5000 }).totalCents).toBe(0)
    expect(calcInvoiceTotals({ lineTotalsCents: [1000], discountCents: -50 }).discountCents).toBe(0)
  })
})

describe('autoInvoiceDiscount (the reported double discount)', () => {
  // 50% milestone: $39,312 pre-discount, $37,440 after a $1,872 share of the discount.
  const base = { preDiscountAmountCents: 3_931_200, netAmountCents: 3_744_000 }
  it('pre-filled amount untouched → the prorated discount applies', () => {
    expect(autoInvoiceDiscount({ ...base, subtotalCents: 3_931_200 })).toEqual({ discountCents: 187_200, alreadyIncluded: false })
  })
  it('amount typed as the discounted figure → no second discount', () => {
    expect(autoInvoiceDiscount({ ...base, subtotalCents: 3_744_000 })).toEqual({ discountCents: 0, alreadyIncluded: true })
  })
  it('no budget discount → nothing to apply', () => {
    expect(autoInvoiceDiscount({ subtotalCents: 500, preDiscountAmountCents: 500, netAmountCents: 500 })).toEqual({ discountCents: 0, alreadyIncluded: false })
  })
})

describe('dates', () => {
  it('adds days across a month end', () => {
    expect(addDaysISO('2026-10-20', 15)).toBe('2026-11-04')
  })
  it('localISODate is the local calendar day', () => {
    expect(localISODate(new Date(2026, 9, 1, 23, 30))).toBe('2026-10-01')
  })
})

describe('calendarDateToStored', () => {
  const { calendarDateToStored } = jest.requireActual('../invoice-totals') as typeof import('../invoice-totals')
  it('stores a calendar date at midday UTC — the same day from UTC−11 to UTC+11', () => {
    const d = calendarDateToStored('2026-10-01')!
    expect(d.toISOString()).toBe('2026-10-01T12:00:00.000Z')
    expect(d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })).toBe('10/1/2026')
    expect(d.toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' })).toBe('10/1/2026')
  })
  it('rejects malformed input', () => {
    expect(calendarDateToStored('10/01/2026')).toBeNull()
    expect(calendarDateToStored('2026-13-40')).toBeNull()
  })
})
