// Plain module (jest-tested): what an invoice's status becomes once an online
// payment has been added to amountPaidCents.

/**
 * PAID once payments cover the total. VOID stays VOID (terminal — the money is
 * still recorded). Anything else keeps its status: a balance is still due,
 * e.g. the invoice total went up while the client was checking out.
 */
export function settledInvoiceStatus(inv: { status: string; totalCents: number; amountPaidCents: number }): string {
  if (inv.status === 'VOID' || inv.status === 'PAID') return inv.status
  return inv.amountPaidCents >= inv.totalCents ? 'PAID' : inv.status
}
