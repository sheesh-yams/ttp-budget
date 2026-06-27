/**
 * POST /api/webhooks/payments
 *
 * Inbound Helcim webhook — fires server-to-server when a transaction completes,
 * independent of the browser. This is the safety net for payments where the
 * HelcimPay.js confirm call never reached us (customer closed the tab, lost
 * signal, or an async ACH/EFT settled later).
 *
 * Helcim's payload is intentionally thin — `{ id, type }` with just the
 * transaction id and no amount/details — so we must look the transaction up
 * server-to-server to learn the amount and our `invoiceNumber` reference.
 *
 * Security / correctness invariants:
 *  1. Signature — every request is HMAC-verified with the account Verifier
 *     Token (Svix scheme) before any work. Unsigned/forged requests get 401.
 *  2. Timestamp tolerance — events older/newer than ±5 min are rejected (replay).
 *  3. Idempotency — the webhook-id is recorded in WebhookEvent (@@unique). A
 *     duplicate delivery short-circuits with 200.
 *  4. Amount — taken server-to-server from Helcim, never from the payload.
 *  5. Settlement — shared settlePaymentAttempt() with the confirm route; the
 *     INITIATED → SUCCEEDED compare-and-set means confirm + webhook never
 *     double-settle.
 *
 * Always returns 2xx once the signature is valid (even when there's nothing to
 * do) so Helcim doesn't retry a well-formed event forever. Only signature and
 * unexpected server errors return non-2xx.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { helcimAdapter, verifyWebhookSignature } from '@/lib/payments/helcim'
import { settlePaymentAttempt } from '@/lib/payments/settle'

// Reject events whose timestamp is more than this far from now (replay guard).
const TIMESTAMP_TOLERANCE_SEC = 5 * 60

type WebhookEventModel = {
  create: (args: object) => Promise<{ id: string }>
  update: (args: object) => Promise<unknown>
}
type AttemptLookupModel = {
  findUnique: (args: object) => Promise<{ id: string; amountCents: number } | null>
}
type WebhookDb = typeof db & {
  webhookEvent: WebhookEventModel
  paymentAttempt: AttemptLookupModel
}

// Helcim (and uptime checks) may probe this URL with GET/HEAD when validating
// the webhook config on save. Without these handlers Next.js returns 405, which
// fails the dashboard's reachability check. Always 200.
export function GET() {
  return NextResponse.json({ ok: true })
}
export function HEAD() {
  return new NextResponse(null, { status: 200 })
}

export async function POST(req: NextRequest) {
  // ── 1. Read raw body + signature headers ─────────────────────────────────
  // The raw text is required — re-serializing JSON would change the bytes the
  // signature was computed over.
  const rawBody = await req.text()
  const webhookId   = req.headers.get('webhook-id') ?? ''
  const webhookTs   = req.headers.get('webhook-timestamp') ?? ''
  const webhookSig  = req.headers.get('webhook-signature') ?? ''

  // IMPORTANT — handshake tolerance:
  // Helcim probes this URL when you click "Save" in the dashboard, and it
  // rejects the whole config (400 in the dashboard) if the probe gets any
  // non-2xx. That probe is unsigned and arrives before the Verifier Token even
  // exists. So we ACK every non-actionable request with 200 and only ever
  // SETTLE on a fully valid, signed event. The single non-2xx path is a genuine
  // processing error after verification (5xx → Helcim retries the real event).
  const ack = (extra: Record<string, unknown> = {}) => NextResponse.json({ received: true, ...extra })

  const verifierToken = process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN
  if (!verifierToken) {
    // Unconfigured (or the save-time probe before the token exists). Ack so the
    // dashboard save succeeds; real events can't be processed until it's set.
    console.warn('[helcim-webhook] HELCIM_WEBHOOK_VERIFIER_TOKEN not set — acking probe, not processing')
    return ack({ configured: false })
  }

  // Unsigned request → reachability/handshake probe. Nothing to process.
  if (!webhookId || !webhookTs || !webhookSig) {
    return ack({ probe: true })
  }

  // ── 2. Verify signature ──────────────────────────────────────────────────
  const valid = verifyWebhookSignature({
    webhookId,
    webhookTimestamp: webhookTs,
    rawBody,
    signatureHeader: webhookSig,
    verifierToken,
  })
  if (!valid) {
    // Could be a forgery or a token mismatch. We never settle without a valid
    // signature, so acking (200) is safe — and we log loudly so a misconfigured
    // token is visible rather than silently dropping real events.
    console.error('[helcim-webhook] signature verification FAILED — check HELCIM_WEBHOOK_VERIFIER_TOKEN', { webhookId })
    return ack({ verified: false })
  }

  // ── 3. Timestamp tolerance (replay guard) ────────────────────────────────
  const tsSec = Number(webhookTs)
  if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > TIMESTAMP_TOLERANCE_SEC) {
    console.error('[helcim-webhook] timestamp outside tolerance — skipping', { webhookId, webhookTs })
    return ack({ stale: true })
  }

  // ── 4. Parse payload ─────────────────────────────────────────────────────
  let payload: { id?: unknown; type?: unknown }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return ack({ parsed: false })
  }

  // We only act on card transactions. Acknowledge everything else (200) so
  // Helcim stops retrying.
  if (payload.type !== 'cardTransaction' || typeof payload.id !== 'string' || !payload.id) {
    return NextResponse.json({ received: true })
  }
  const transactionId = payload.id

  const wdb = db as unknown as WebhookDb

  // ── 5. Idempotency — record the delivery by webhook-id ───────────────────
  // The @@unique([provider, eventId]) constraint makes concurrent/retry
  // deliveries safe: the second create throws P2002 and we short-circuit.
  let eventRowId: string
  try {
    const row = await wdb.webhookEvent.create({
      data: { provider: 'HELCIM', eventId: webhookId, payloadHash: transactionId },
      select: { id: true },
    })
    eventRowId = row.id
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    throw err
  }

  try {
    // ── 6. Look the transaction up server-to-server ────────────────────────
    const tx = await helcimAdapter.getTransaction(transactionId)

    // Only settle approved transactions. Record + ack anything else.
    const isApproved = /approved|completed|captured/i.test(tx.status)
    if (!isApproved) {
      await markProcessed(wdb, eventRowId)
      return NextResponse.json({ received: true, status: tx.status })
    }

    // ── 7. Map back to our attempt via the reference we set at init ────────
    // tx.reference is the Helcim invoiceNumber we attached (our checkoutRef).
    if (!tx.reference) {
      console.error('[helcim-webhook] transaction has no reference — cannot map to an attempt', { transactionId })
      await markProcessed(wdb, eventRowId)
      return NextResponse.json({ received: true, unmapped: true })
    }

    const attempt = await wdb.paymentAttempt.findUnique({
      where:  { checkoutRef: tx.reference },
      select: { id: true, amountCents: true },
    })
    if (!attempt) {
      console.error('[helcim-webhook] no PaymentAttempt for reference', { reference: tx.reference, transactionId })
      await markProcessed(wdb, eventRowId)
      return NextResponse.json({ received: true, unmapped: true })
    }

    // ── 8. Settle (shared idempotent path with the confirm route) ──────────
    const settled = await settlePaymentAttempt({
      attemptId:     attempt.id,
      transactionId,
      txAmountCents: tx.amountCents,
    })

    if (!settled.ok && settled.reason === 'amount_mismatch') {
      // Don't settle a mismatched amount, but DO mark the event processed so
      // Helcim stops retrying — this needs human review, not a retry loop.
      console.error('[helcim-webhook] amount mismatch — not settling', {
        attemptId: attempt.id, attemptAmountCents: attempt.amountCents, txAmountCents: tx.amountCents,
      })
    }

    await markProcessed(wdb, eventRowId)
    return NextResponse.json({ received: true, settled: settled.ok })
  } catch (err) {
    // Leave WebhookEvent.processedAt null so a Helcim retry can re-attempt.
    const msg = err instanceof Error ? err.message : 'Webhook processing failed'
    const safe = msg.replace(/HELCIM_API_TOKEN[^\s]*/gi, '[redacted]').replace(/api-token[^\s]*/gi, '[redacted]')
    console.error('[helcim-webhook]', safe)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

async function markProcessed(wdb: WebhookDb, eventRowId: string): Promise<void> {
  await wdb.webhookEvent.update({
    where: { id: eventRowId },
    data:  { processedAt: new Date() },
  })
}
