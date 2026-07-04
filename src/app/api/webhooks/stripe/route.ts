/**
 * POST /api/webhooks/stripe
 *
 * Stripe Connect platform webhook. Fires on events for all connected accounts
 * when the endpoint is configured as a Connect webhook in the Stripe dashboard.
 *
 * Security / correctness invariants:
 *  1. Signature — stripe.webhooks.constructEvent() verifies the STRIPE_WEBHOOK_SECRET
 *     signature. An invalid or absent signature returns 400 (not 200) so Stripe
 *     knows it was NOT accepted.
 *  2. Cross-account isolation — checkout.session.completed events are only
 *     settled when event.account matches the attempt's workspace stripeAccountId.
 *     A forged client_reference_id pointing to a workspace connected to a
 *     different account is detected and logged as payment.spoof_attempt.
 *  3. Idempotency — provider+eventId is recorded in WebhookEvent (@@unique).
 *     A duplicate event is acked 200 without re-processing.
 *  4. Settlement — uses the shared settlePaymentAttempt() with the compare-and-set
 *     guard, so concurrent confirm + webhook can't double-settle.
 *  5. amount_total is taken from the Stripe event (server-to-server), never
 *     from client input.
 *
 * Configure in Stripe dashboard:
 *   Endpoint URL: https://your-domain.com/api/webhooks/stripe
 *   Events:       checkout.session.completed, account.updated
 *   Type:         Connect webhook (so event.account is populated)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stripe } from '@/lib/payments/stripe'
import { settlePaymentAttempt } from '@/lib/payments/settle'
import { sendPaymentReceiptEmails } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'
import type Stripe from 'stripe'

// ── DB type helpers ────────────────────────────────────────────────────────

type WebhookEventModel = {
  create: (args: object) => Promise<{ id: string }>
  update: (args: object) => Promise<unknown>
}

type AttemptModel = {
  findUnique: (args: object) => Promise<{ id: string; status: string; amountCents: number; invoiceId: string; workspaceId: string } | null>
}

type ConfigModel = {
  findUnique: (args: object) => Promise<{ stripeAccountId: string | null; workspaceId: string } | null>
  updateMany: (args: object) => Promise<unknown>
}

type StripeWebhookDb = typeof db & {
  webhookEvent:          WebhookEventModel
  paymentAttempt:        AttemptModel
  workspacePaymentConfig: ConfigModel
}

// ── Handler ────────────────────────────────────────────────────────────────

export function GET()  { return NextResponse.json({ ok: true }) }
export function HEAD() { return new NextResponse(null, { status: 200 }) }

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''

  // ── 1. Verify signature ────────────────────────────────────────────────
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', (err as Error).message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const wdb = db as unknown as StripeWebhookDb

  // ── 2. Idempotency guard ───────────────────────────────────────────────
  let eventRowId: string
  try {
    const row = await wdb.webhookEvent.create({
      data:   { provider: 'STRIPE', eventId: event.id, payloadHash: event.type },
      select: { id: true },
    })
    eventRowId = row.id
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    throw err
  }

  // ── 3. Dispatch by event type ──────────────────────────────────────────
  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutSessionCompleted(wdb, event, session)
        break
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        await handleAccountUpdated(wdb, event, account)
        break
      }

      default:
        break
    }

    await markProcessed(wdb, eventRowId)
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] processing error:', (err as Error).message)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

// ── checkout.session.completed ─────────────────────────────────────────────

async function handleCheckoutSessionCompleted(
  wdb:     StripeWebhookDb,
  event:   Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const attemptId  = session.client_reference_id
  const amountTotal = session.amount_total

  if (!attemptId) {
    console.error('[stripe-webhook] checkout.session.completed missing client_reference_id', { sessionId: session.id })
    return
  }

  if (typeof amountTotal !== 'number') {
    console.error('[stripe-webhook] checkout.session.completed amount_total is null', { sessionId: session.id })
    return
  }

  // ── Fetch attempt ──────────────────────────────────────────────────────
  const attempt = await wdb.paymentAttempt.findUnique({
    where:  { id: attemptId },
    select: { id: true, status: true, amountCents: true, invoiceId: true, workspaceId: true },
  })

  if (!attempt) {
    console.error('[stripe-webhook] no PaymentAttempt for client_reference_id', { attemptId, sessionId: session.id })
    return
  }

  // ── Cross-account spoof check (CRITICAL) ──────────────────────────────
  // event.account is the connected Stripe account that generated this event.
  // The attempt's workspace must be configured with THIS account — if someone
  // forged client_reference_id to point to an attempt from workspace B while
  // the event came from workspace A's account, we reject and audit.
  const config = await wdb.workspacePaymentConfig.findUnique({
    where:  { workspaceId: attempt.workspaceId },
    select: { stripeAccountId: true, workspaceId: true },
  })

  if (!config || config.stripeAccountId !== event.account) {
    console.error('[stripe-webhook] cross-account settlement attempt BLOCKED', {
      attemptId,
      attemptWorkspace: attempt.workspaceId,
      eventAccount:     event.account,
      configAccount:    config?.stripeAccountId ?? null,
    })
    void logAuditEvent({
      workspaceId: attempt.workspaceId,
      actorId:     null,
      action:      'payment.spoof_attempt',
      entityType:  'PaymentAttempt',
      entityId:    attemptId,
      metadata:    { sessionId: session.id, eventAccount: event.account, configAccount: config?.stripeAccountId },
    })
    return
  }

  // ── Settle ─────────────────────────────────────────────────────────────
  const settled = await settlePaymentAttempt({
    attemptId,
    transactionId: session.id,   // Stripe session ID becomes providerRef
    txAmountCents: amountTotal,
  })

  if (!settled.ok && settled.reason === 'amount_mismatch') {
    console.error('[stripe-webhook] amount mismatch — not settling', {
      attemptId,
      attemptAmountCents: attempt.amountCents,
      txAmountCents:      amountTotal,
    })
  }

  if (settled.ok) {
    sendPaymentReceiptEmails(attempt.invoiceId).catch(err =>
      console.error('[stripe-webhook] receipt email failed', err),
    )
  }
}

// ── account.updated ────────────────────────────────────────────────────────

async function handleAccountUpdated(
  wdb:     StripeWebhookDb,
  event:   Stripe.Event,
  account: Stripe.Account,
): Promise<void> {
  if (!event.account) return

  await wdb.workspacePaymentConfig.updateMany({
    where: { stripeAccountId: event.account },
    data:  { stripeChargesEnabled: account.charges_enabled ?? false },
  })
}

// ── markProcessed ──────────────────────────────────────────────────────────

async function markProcessed(wdb: StripeWebhookDb, eventRowId: string): Promise<void> {
  await wdb.webhookEvent.update({ where: { id: eventRowId }, data: { processedAt: new Date() } })
}
