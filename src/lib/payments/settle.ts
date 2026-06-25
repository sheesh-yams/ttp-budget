import 'server-only'

/**
 * payments/settle.ts — single idempotent settlement path.
 *
 * Both the browser confirm route (`/api/payments/confirm`) and the inbound
 * Helcim webhook (`/api/webhooks/helcim`) call this. Whichever arrives first
 * settles; the loser is a no-op. Safety relies on:
 *
 *  1. A guarded compare-and-set: the attempt only transitions INITIATED →
 *     SUCCEEDED via `updateMany(where: { status: 'INITIATED' })`. A second
 *     caller sees `count === 0` and aborts.
 *  2. The `@@unique([provider, providerRef])` constraint on PaymentAttempt —
 *     the same Helcim transactionId can never settle two attempts.
 *
 * Uses raw `db` (no scoped client): both callers are unauthenticated server
 * contexts (public confirm + provider webhook) with no Clerk session.
 */

import { db } from '@/lib/db'

// Single object shape (not a discriminated union): the repo compiles with
// `strict: false`, which disables union narrowing on the `ok` discriminant —
// callers would not be able to read `.reason` after an `if (!res.ok)` guard.
export type SettleResult = {
  ok:      boolean
  reason?: 'not_found' | 'already_processed' | 'amount_mismatch'
}

class AlreadyProcessed extends Error {}

type AttemptRow = { id: string; status: string; amountCents: number; invoiceId: string } | null

export async function settlePaymentAttempt(params: {
  attemptId:     string
  transactionId: string
  txAmountCents: number
}): Promise<SettleResult> {
  const { attemptId, transactionId, txAmountCents } = params

  const cdb = db as unknown as {
    paymentAttempt: { findUnique: (args: object) => Promise<AttemptRow> }
  }

  const attempt = await cdb.paymentAttempt.findUnique({
    where:  { id: attemptId },
    select: { id: true, status: true, amountCents: true, invoiceId: true },
  })

  if (!attempt) return { ok: false, reason: 'not_found' }
  if (attempt.status !== 'INITIATED') return { ok: false, reason: 'already_processed' }
  // Canonical amount comes server-to-server from the provider; never the client.
  if (txAmountCents !== attempt.amountCents) return { ok: false, reason: 'amount_mismatch' }

  try {
    await db.$transaction(async (t) => {
      const tdb = t as unknown as {
        paymentAttempt: { updateMany: (args: object) => Promise<{ count: number }> }
      }

      // Atomic compare-and-set — only one caller can flip INITIATED → SUCCEEDED.
      const res = await tdb.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'INITIATED' },
        data:  { status: 'SUCCEEDED', providerRef: transactionId, resolvedAt: new Date() },
      })
      if (res.count === 0) throw new AlreadyProcessed()

      await t.invoice.update({
        where: { id: attempt.invoiceId },
        data: {
          status:          'PAID',
          amountPaidCents: { increment: attempt.amountCents },
          paidAt:          new Date(),
        },
      })
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof AlreadyProcessed) return { ok: false, reason: 'already_processed' }
    // Duplicate transactionId hitting the @@unique([provider, providerRef]) guard.
    if ((err as { code?: string }).code === 'P2002') return { ok: false, reason: 'already_processed' }
    throw err
  }
}
