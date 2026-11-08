// A client's money at a glance, from its invoices. Plain module (jest-tested),
// shared by the /clients cards and the client page so they always agree.
//
// Includes invoices on archived projects: that money is real (same call as the
// Dashboard's invoice totals).

export interface ClientMoneyInvoice {
  status:          string
  totalCents:      number
  amountPaidCents: number
  dueDate:         Date | string
  paidAt?:         Date | string | null
}

export interface ClientMoney {
  /** Sent invoices (not drafts, not void). */
  billedCents:      number
  /** What's actually been paid, partial payments included. */
  collectedCents:   number
  /** Balance still owed on sent, unpaid invoices. */
  outstandingCents: number
  /** The part of outstanding that's past its due date. */
  overdueCents:     number
  openCount:        number
  overdueCount:     number
  lastPaidAt:       string | null
}

const OPEN = new Set(['SENT', 'VIEWED', 'OVERDUE'])

export function clientMoney(invoices: ClientMoneyInvoice[], now = new Date()): ClientMoney {
  const m: ClientMoney = {
    billedCents: 0, collectedCents: 0, outstandingCents: 0, overdueCents: 0,
    openCount: 0, overdueCount: 0, lastPaidAt: null,
  }
  let lastPaid = 0
  for (const inv of invoices) {
    if (inv.status === 'VOID') continue
    m.collectedCents += inv.amountPaidCents
    if (inv.paidAt) lastPaid = Math.max(lastPaid, new Date(inv.paidAt).getTime())
    if (inv.status === 'DRAFT') continue
    m.billedCents += inv.totalCents
    if (!OPEN.has(inv.status)) continue
    const balance = Math.max(0, inv.totalCents - inv.amountPaidCents)
    if (balance === 0) continue
    m.outstandingCents += balance
    m.openCount++
    if (new Date(inv.dueDate).getTime() < now.getTime()) {
      m.overdueCents += balance
      m.overdueCount++
    }
  }
  m.lastPaidAt = lastPaid ? new Date(lastPaid).toISOString() : null
  return m
}
