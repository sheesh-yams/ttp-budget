/**
 * POST /api/payments/initiate
 *
 * Public route — no Clerk session. Authentication is via the invoice's
 * publicToken, which is a secret URL token already known to the client.
 *
 * Security invariants:
 *  1. Amount originates from the DB invoice record (balance due). Nothing from
 *     the request body is trusted for the payment amount.
 *  2. API credentials are stored AES-256-GCM encrypted in the DB — they never
 *     appear in response bodies, error strings, or env reads.
 *  3. secretToken is returned once. The caller keeps it in memory; this server
 *     stores only SHA-256(secretToken). Never log secretToken.
 *  4. workspaceId comes from the DB-fetched invoice, never from the client.
 *  5. helcimEnabled is enforced inside the adapter; a workspace without the
 *     entitlement flag receives a payment-not-available error.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { helcimAdapter, sha256Hex, PaymentConfigError } from '@/lib/payments/helcim'
import { stripeAdapter, StripeConfigError } from '@/lib/payments/stripe'

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentAttemptModel = {
  findFirst:   (args: object) => Promise<{ id: string; idempotencyKey: string; checkoutRef: string | null } | null>
  updateMany:  (args: object) => Promise<unknown>
  update:      (args: object) => Promise<unknown>
  create:      (args: object) => Promise<{ id: string }>
}

type WorkspacePaymentConfigModel = {
  findUnique:  (args: object) => Promise<{ provider: string; helcimEnabled: boolean } | null>
}

type PublicDb = typeof db & {
  paymentAttempt:          PaymentAttemptModel
  workspacePaymentConfig:  WorkspacePaymentConfigModel
}

// ── Constants ──────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 55 * 60 * 1000

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { publicToken?: unknown }
    const { publicToken } = body

    if (!publicToken || typeof publicToken !== 'string') {
      return NextResponse.json({ error: 'publicToken is required' }, { status: 400 })
    }

    // ── 1. Look up invoice by public token ─────────────────────────────────
    const invoice = await db.invoice.findUnique({
      where:  { publicToken },
      select: {
        id:              true,
        number:          true,
        status:          true,
        totalCents:      true,
        amountPaidCents: true,
        workspaceId:     true,
        publicToken:     true,
        publicTokenExpiresAt: true,
      },
    })

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // ── 2. Expiry check ────────────────────────────────────────────────────
    const expiresAt = (invoice as unknown as { publicTokenExpiresAt: Date | null }).publicTokenExpiresAt
    if (expiresAt && expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invoice link has expired' }, { status: 410 })
    }

    // ── 3. Payable state guard ─────────────────────────────────────────────
    if (!['SENT', 'VIEWED'].includes(invoice.status)) {
      return NextResponse.json({ error: `Invoice is not payable (status: ${invoice.status})` }, { status: 422 })
    }

    const amountPaidCents = (invoice as unknown as { amountPaidCents: number }).amountPaidCents ?? 0
    const balanceCents    = invoice.totalCents - amountPaidCents
    if (balanceCents <= 0) {
      return NextResponse.json({ error: 'Invoice balance is already zero' }, { status: 422 })
    }

    // ── 4. Workspace payment config ────────────────────────────────────────
    const pdb    = db as unknown as PublicDb
    const config = await pdb.workspacePaymentConfig.findUnique({
      where:  { workspaceId: invoice.workspaceId },
      select: { provider: true, helcimEnabled: true },
    })

    if (!config || config.provider === 'NONE') {
      return NextResponse.json({ error: 'Online payments are not configured' }, { status: 422 })
    }

    // ── STRIPE path ────────────────────────────────────────────────────────
    // Create the PaymentAttempt BEFORE calling Stripe so we have a real id
    // to pass as client_reference_id (maps the Stripe event back to our row).
    if (config.provider === 'STRIPE') {
      const attemptId      = randomUUID()
      const idempotencyKey = `stripe:${invoice.workspaceId}:${invoice.id}:${Date.now()}`

      await pdb.paymentAttempt.create({
        data: {
          id:            attemptId,
          workspaceId:   invoice.workspaceId,
          invoiceId:     invoice.id,
          provider:      'STRIPE',
          status:        'INITIATED',
          amountCents:   balanceCents,
          currency:      'USD',
          idempotencyKey,
        },
        select: { id: true },
      })

      let stripeResult
      try {
        stripeResult = await stripeAdapter.createCheckout({
          workspaceId: invoice.workspaceId,
          invoice: { id: invoice.id, number: invoice.number, publicToken: invoice.publicToken },
          attempt: { id: attemptId, amountCents: balanceCents, currency: 'USD', idempotencyKey, checkoutRef: '' },
        })
      } catch (err) {
        await pdb.paymentAttempt.update({
          where: { id: attemptId },
          data:  { status: 'FAILED', resolvedAt: new Date() },
        })
        throw err
      }

      if (stripeResult.mode !== 'redirect') {
        return NextResponse.json({ error: 'Unexpected checkout mode' }, { status: 500 })
      }

      return NextResponse.json({ mode: 'redirect', url: stripeResult.url })
    }

    // Entitlement mismatch guard (provider=HELCIM but helcimEnabled=false)
    if (config.provider === 'HELCIM' && !config.helcimEnabled) {
      return NextResponse.json({ error: 'Online payments are not available for this workspace' }, { status: 422 })
    }

    const { workspaceId } = invoice
    const invoiceId       = invoice.id

    // ── 5. Expire stale INITIATED attempts ────────────────────────────────
    const staleCutoff = new Date(Date.now() - TOKEN_EXPIRY_MS)
    await pdb.paymentAttempt.updateMany({
      where: { invoiceId, status: 'INITIATED', createdAt: { lt: staleCutoff } },
      data:  { status: 'EXPIRED', resolvedAt: new Date() },
    })

    // ── 6. Reuse guard ────────────────────────────────────────────────────
    const existing = await pdb.paymentAttempt.findFirst({
      where:  { invoiceId, status: 'INITIATED' },
      select: { id: true, idempotencyKey: true, checkoutRef: true },
    })

    if (existing) {
      const checkoutRef = `pay_${randomUUID()}`

      const result = await helcimAdapter.createCheckout({
        workspaceId,
        invoice: { id: invoiceId, number: invoice.number, publicToken: invoice.publicToken },
        attempt: { id: existing.id, amountCents: balanceCents, currency: 'USD', idempotencyKey: existing.idempotencyKey, checkoutRef },
      })

      if (result.mode !== 'helcim_modal') {
        return NextResponse.json({ error: 'Unexpected checkout mode' }, { status: 500 })
      }

      const { checkoutToken, secretToken } = result
      await pdb.paymentAttempt.update({
        where: { id: existing.id },
        data:  { checkoutToken, secretTokenHash: sha256Hex(secretToken), checkoutRef },
      })

      return NextResponse.json({ attemptId: existing.id, checkoutToken, secretToken })
    }

    // ── 7. New attempt ─────────────────────────────────────────────────────
    const idempotencyKey = `${workspaceId}:${invoiceId}:${Date.now()}`
    const checkoutRef    = `pay_${randomUUID()}`

    const result = await helcimAdapter.createCheckout({
      workspaceId,
      invoice: { id: invoiceId, number: invoice.number, publicToken: invoice.publicToken },
      attempt: { id: 'pending', amountCents: balanceCents, currency: 'USD', idempotencyKey, checkoutRef },
    })

    if (result.mode !== 'helcim_modal') {
      return NextResponse.json({ error: 'Unexpected checkout mode' }, { status: 500 })
    }

    const { checkoutToken, secretToken } = result

    const attempt = await pdb.paymentAttempt.create({
      data: {
        workspaceId,
        invoiceId,
        provider:        config.provider,
        status:          'INITIATED',
        amountCents:     balanceCents,
        currency:        'USD',
        checkoutToken,
        secretTokenHash: sha256Hex(secretToken),
        idempotencyKey,
        checkoutRef,
      },
      select: { id: true },
    })

    return NextResponse.json({ attemptId: attempt.id, checkoutToken, secretToken })
  } catch (err) {
    if (err instanceof PaymentConfigError) {
      const friendly: Record<string, string> = {
        HELCIM_NOT_ENABLED:    'Online payments are not enabled for this workspace',
        HELCIM_NOT_CONFIGURED: 'Payment provider is not fully configured',
        PROVIDER_MISMATCH:     'Payment provider configuration error',
      }
      return NextResponse.json({ error: friendly[err.code] ?? 'Payment not available' }, { status: 422 })
    }

    if (err instanceof StripeConfigError) {
      const friendly: Record<string, string> = {
        STRIPE_NOT_CONFIGURED: 'Stripe account not connected',
        STRIPE_NOT_READY:      'Stripe account is not yet ready to accept payments — finish onboarding in the Stripe dashboard',
      }
      return NextResponse.json({ error: friendly[err.code] ?? 'Stripe not available' }, { status: 422 })
    }

    const msg  = err instanceof Error ? err.message : 'Payment initialization failed'
    const safe = msg.replace(/api-token[^\s]*/gi, '[redacted]')
    console.error('[api/payments/initiate]', err)
    return NextResponse.json({ error: safe }, { status: 500 })
  }
}
