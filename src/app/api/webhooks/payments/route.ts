/**
 * POST /api/webhooks/payments
 *
 * Inbound Helcim webhook — fires server-to-server when a transaction completes.
 * Safety net for payments where the HelcimPay.js confirm never reached us.
 *
 * Security / correctness invariants:
 *  1. Signature — HMAC-verified using the workspace's encrypted verifier token
 *     (resolved via resolveHelcimVerifierToken). Unsigned/forged → 401-equiv ack.
 *  2. Timestamp tolerance — events outside ±5 min are rejected (replay guard).
 *  3. Idempotency — webhook-id is recorded in WebhookEvent (@@unique). Duplicates
 *     short-circuit with 200.
 *  4. Amount — taken server-to-server from Helcim, never from the payload.
 *  5. Settlement — shared settlePaymentAttempt() with the confirm route; the
 *     INITIATED → SUCCEEDED compare-and-set means confirm + webhook can't double-settle.
 *  6. Entitlement — workspace resolved from encrypted credential config; a workspace
 *     without helcimEnabled can never process a webhook (resolveHelcimVerifierToken returns null).
 *
 * Always returns 2xx once the signature is valid (even when there's nothing to
 * do) so Helcim doesn't retry a well-formed event forever.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTransaction, resolveHelcimVerifierToken, verifyWebhookSignature } from '@/lib/payments/helcim'
import { settlePaymentAttempt } from '@/lib/payments/settle'
import { sendPaymentReceiptEmails } from '@/lib/email'

const TIMESTAMP_TOLERANCE_SEC = 5 * 60

type WebhookEventModel = {
  create: (args: object) => Promise<{ id: string }>
  update: (args: object) => Promise<unknown>
}
type AttemptLookupModel = {
  findFirst: (args: object) => Promise<{ id: string; amountCents: number; invoiceId: string } | null>
}
type InvoiceLookupModel = {
  findFirst: (args: object) => Promise<{ id: string } | null>
}
type WebhookDb = typeof db & {
  webhookEvent:   WebhookEventModel
  paymentAttempt: AttemptLookupModel
  invoice:        InvoiceLookupModel
}

export function GET()  { return NextResponse.json({ ok: true }) }
export function HEAD() { return new NextResponse(null, { status: 200 }) }

export async function POST(req: NextRequest) {
  const rawBody   = await req.text()
  const webhookId  = req.headers.get('webhook-id') ?? ''
  const webhookTs  = req.headers.get('webhook-timestamp') ?? ''
  const webhookSig = req.headers.get('webhook-signature') ?? ''

  const ack = (extra: Record<string, unknown> = {}) => NextResponse.json({ received: true, ...extra })

  // ── 1. Resolve the active Helcim workspace + verifier token ──────────────
  // Replaces the legacy HELCIM_WEBHOOK_VERIFIER_TOKEN env-var read.
  // Returns null when no workspace has an active Helcim config (e.g. before
  // migration, or when entitlement is revoked). In that case we ack so Helcim
  // doesn't treat its probe as a failure.
  const helcimContext = await resolveHelcimVerifierToken()
  if (!helcimContext) {
    console.warn('[helcim-webhook] no active Helcim workspace with verifier configured — acking probe')
    return ack({ configured: false })
  }

  const { verifierToken, workspaceId } = helcimContext

  // Unsigned request → reachability/handshake probe
  if (!webhookId || !webhookTs || !webhookSig) {
    return ack({ probe: true })
  }

  // ── 2. Verify signature ───────────────────────────────────────────────────
  const valid = verifyWebhookSignature({ webhookId, webhookTimestamp: webhookTs, rawBody, signatureHeader: webhookSig, verifierToken })
  if (!valid) {
    console.error('[helcim-webhook] signature verification FAILED', { webhookId })
    return ack({ verified: false })
  }

  // ── 3. Timestamp tolerance ────────────────────────────────────────────────
  const tsSec = Number(webhookTs)
  if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > TIMESTAMP_TOLERANCE_SEC) {
    console.error('[helcim-webhook] timestamp outside tolerance', { webhookId, webhookTs })
    return ack({ stale: true })
  }

  // ── 4. Parse payload ──────────────────────────────────────────────────────
  let payload: { id?: unknown; type?: unknown }
  try { payload = JSON.parse(rawBody) } catch { return ack({ parsed: false }) }

  if (payload.type !== 'cardTransaction' || typeof payload.id !== 'string' || !payload.id) {
    return NextResponse.json({ received: true })
  }
  const transactionId = payload.id
  const wdb = db as unknown as WebhookDb

  // ── 5. Idempotency ────────────────────────────────────────────────────────
  let eventRowId: string
  try {
    const row = await wdb.webhookEvent.create({
      data:   { provider: 'HELCIM', eventId: webhookId, payloadHash: transactionId },
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
    // ── 6. Look the transaction up server-to-server ───────────────────────
    // workspaceId comes from the verified Helcim config, not from any client input.
    const tx = await getTransaction(transactionId, workspaceId)

    const isApproved = /approved|completed|captured/i.test(tx.status)
    if (!isApproved) {
      await markProcessed(wdb, eventRowId)
      return NextResponse.json({ received: true, status: tx.status })
    }

    // ── 7. Map to our attempt via the invoice number reference ────────────
    if (!tx.reference) {
      console.error('[helcim-webhook] no reference on transaction — cannot map to attempt', { transactionId })
      await markProcessed(wdb, eventRowId)
      return NextResponse.json({ received: true, unmapped: true })
    }

    const invoice = await wdb.invoice.findFirst({
      where:  { number: tx.reference },
      select: { id: true },
    })
    if (!invoice) {
      console.error('[helcim-webhook] no Invoice for reference', { reference: tx.reference, transactionId })
      await markProcessed(wdb, eventRowId)
      return NextResponse.json({ received: true, unmapped: true })
    }

    const attempt = await wdb.paymentAttempt.findFirst({
      where:   { invoiceId: invoice.id, status: 'INITIATED' },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, amountCents: true, invoiceId: true },
    })
    if (!attempt) {
      console.error('[helcim-webhook] no INITIATED attempt for invoice', { reference: tx.reference, transactionId })
      await markProcessed(wdb, eventRowId)
      return NextResponse.json({ received: true, unmapped: true })
    }

    // ── 8. Settle ─────────────────────────────────────────────────────────
    const settled = await settlePaymentAttempt({ attemptId: attempt.id, transactionId, txAmountCents: tx.amountCents })

    if (!settled.ok && settled.reason === 'amount_mismatch') {
      console.error('[helcim-webhook] amount mismatch — not settling', {
        attemptId: attempt.id, attemptAmountCents: attempt.amountCents, txAmountCents: tx.amountCents,
      })
    }

    if (settled.ok) {
      sendPaymentReceiptEmails(attempt.invoiceId).catch(err =>
        console.error('[helcim-webhook] receipt email failed', err),
      )
    }

    await markProcessed(wdb, eventRowId)
    return NextResponse.json({ received: true, settled: settled.ok })
  } catch (err) {
    const msg  = err instanceof Error ? err.message : 'Webhook processing failed'
    const safe = msg.replace(/api-token[^\s]*/gi, '[redacted]')
    console.error('[helcim-webhook]', safe)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

async function markProcessed(wdb: WebhookDb, eventRowId: string): Promise<void> {
  await wdb.webhookEvent.update({ where: { id: eventRowId }, data: { processedAt: new Date() } })
}
