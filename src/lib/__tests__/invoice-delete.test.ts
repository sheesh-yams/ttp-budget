import { deleteNeedsTypedConfirm, matchesInvoiceNumber, paymentInProgress } from '../invoice-delete'

describe('matchesInvoiceNumber', () => {
  it('accepts the number ignoring case and surrounding spaces', () => {
    expect(matchesInvoiceNumber('TTP-2026-007', 'TTP-2026-007')).toBe(true)
    expect(matchesInvoiceNumber('  ttp-2026-007 ', 'TTP-2026-007')).toBe(true)
  })
  it('rejects anything else', () => {
    expect(matchesInvoiceNumber('TTP-2026-07', 'TTP-2026-007')).toBe(false)
    expect(matchesInvoiceNumber('', 'TTP-2026-007')).toBe(false)
    expect(matchesInvoiceNumber(undefined, 'TTP-2026-007')).toBe(false)
    expect(matchesInvoiceNumber('DELETE', 'TTP-2026-007')).toBe(false)
  })
})

describe('deleteNeedsTypedConfirm', () => {
  it('skips typing only for a never-sent, unpaid draft', () => {
    expect(deleteNeedsTypedConfirm({ status: 'DRAFT' })).toBe(false)
    expect(deleteNeedsTypedConfirm({ status: 'DRAFT', sentAt: new Date() })).toBe(true)
    expect(deleteNeedsTypedConfirm({ status: 'DRAFT', amountPaidCents: 1 })).toBe(true)
    for (const s of ['SENT', 'VIEWED', 'OVERDUE', 'PAID', 'VOID']) expect(deleteNeedsTypedConfirm({ status: s })).toBe(true)
  })
})

describe('paymentInProgress', () => {
  const now = new Date('2026-10-05T12:00:00Z')
  const ago = (m: number) => new Date(now.getTime() - m * 60_000)
  it('blocks on a recent INITIATED attempt only', () => {
    expect(paymentInProgress([{ status: 'INITIATED', createdAt: ago(5) }], now)).toBe(true)
    expect(paymentInProgress([{ status: 'INITIATED', createdAt: ago(100) }], now)).toBe(true)
    expect(paymentInProgress([{ status: 'INITIATED', createdAt: ago(125) }], now)).toBe(false)
    expect(paymentInProgress([{ status: 'SUCCEEDED', createdAt: ago(1) }], now)).toBe(false)
    expect(paymentInProgress([], now)).toBe(false)
  })
})
