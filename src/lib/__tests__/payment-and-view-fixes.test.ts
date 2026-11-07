import { parseShadeUrl } from '@/lib/shade-url'
import { settledInvoiceStatus } from '@/lib/payments/settle-status'
import { formatInvoiceNumber, invoiceNumberYear } from '@/lib/invoice-numbering'
import { calendarDateToStored } from '@/lib/invoice-totals'

describe('parseShadeUrl', () => {
  it('reads drive and publish links', () => {
    expect(parseShadeUrl('https://app.shade.inc/drive/d1/assets/a1?x=1')).toEqual({ driveId: 'd1', assetId: 'a1' })
    expect(parseShadeUrl('https://app.shade.inc/publish/a2')).toEqual({ driveId: '', assetId: 'a2' })
    expect(parseShadeUrl('not a url')).toBeNull()
    expect(parseShadeUrl('https://vimeo.com/123')).toBeNull()
  })
})

describe('settledInvoiceStatus', () => {
  it('is PAID only when payments cover the total', () => {
    expect(settledInvoiceStatus({ status: 'VIEWED', totalCents: 1000, amountPaidCents: 1000 })).toBe('PAID')
    expect(settledInvoiceStatus({ status: 'SENT', totalCents: 1000, amountPaidCents: 1200 })).toBe('PAID')
    // Total went up mid-checkout: the old balance was charged, the rest is still due.
    expect(settledInvoiceStatus({ status: 'VIEWED', totalCents: 1500, amountPaidCents: 1000 })).toBe('VIEWED')
    expect(settledInvoiceStatus({ status: 'OVERDUE', totalCents: 1500, amountPaidCents: 1000 })).toBe('OVERDUE')
  })
  it('never moves a terminal status', () => {
    expect(settledInvoiceStatus({ status: 'VOID', totalCents: 1000, amountPaidCents: 1000 })).toBe('VOID')
    expect(settledInvoiceStatus({ status: 'PAID', totalCents: 1000, amountPaidCents: 500 })).toBe('PAID')
  })
})

describe('invoice numbering', () => {
  it('numbers under the invoice date year', () => {
    expect(invoiceNumberYear(calendarDateToStored('2025-12-31')!)).toBe(2025)
    expect(invoiceNumberYear(calendarDateToStored('2026-01-01')!, new Date('2026-11-07T12:00:00Z'))).toBe(2026)
  })
  it('caps a future date (or a typo) at the current year', () => {
    const now = new Date('2026-11-07T12:00:00Z')
    expect(invoiceNumberYear(calendarDateToStored('2027-01-02')!, now)).toBe(2026)
    expect(invoiceNumberYear(calendarDateToStored('2062-03-01')!, now)).toBe(2026)
  })
  it('formats prefix-year-seq', () => {
    expect(formatInvoiceNumber('TTP', 2025, 7)).toBe('TTP-2025-007')
    expect(formatInvoiceNumber('TTP', 2026, 1234)).toBe('TTP-2026-1234')
  })
})
