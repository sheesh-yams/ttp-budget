// Invoice delete + archive rules. Plain module (not 'use server') so the
// typed-confirm matcher can be shared by the dialog and unit-tested.

/**
 * How recently a still-INITIATED payment attempt blocks deleting its invoice.
 * Payments initiate reuses an INITIATED attempt for up to 55 min after its
 * createdAt and issues a fresh checkout token (live ~55 min more) without
 * touching createdAt — so a payment can settle up to ~110 min after it.
 */
export const PAYMENT_IN_PROGRESS_MINUTES = 120

/**
 * Typed confirmation for deleting a sent/void/paid invoice: the invoice
 * number, ignoring case and surrounding spaces. Drafts need no typing.
 */
export function matchesInvoiceNumber(typed: unknown, number: string): boolean {
  return typeof typed === 'string' && typed.trim().toUpperCase() === number.trim().toUpperCase()
}

/** Only drafts — never sent, never paid — skip the typed confirmation. */
export function deleteNeedsTypedConfirm(inv: { status: string; sentAt?: Date | string | null; amountPaidCents?: number }): boolean {
  return inv.status !== 'DRAFT' || !!inv.sentAt || (inv.amountPaidCents ?? 0) > 0
}

/**
 * A checkout started recently and not yet settled: settling it would update
 * an invoice that no longer exists, so deleting waits.
 */
export function paymentInProgress(attempts: { status: string; createdAt: Date }[], now = new Date()): boolean {
  const cutoff = now.getTime() - PAYMENT_IN_PROGRESS_MINUTES * 60_000
  return attempts.some(a => a.status === 'INITIATED' && a.createdAt.getTime() > cutoff)
}
