/**
 * POST /api/payments/initiate
 *
 * Public route — no Clerk session. Authentication is via the invoice's
 * publicToken, which is a secret URL token already known to the client.
 *
 * Security invariants (see threat model in spec):
 *  1. Amount originates from the DB invoice record. Nothing from the request
 *     body is trusted for the payment amount.
 *  2. HELCIM_API_TOKEN never appears in response bodies or error strings.
 *     All Helcim calls happen inside src/lib/payments/helcim.ts (server-only).
 *  3. secretToken is returned once. The caller stores it in memory; this
 *     server stores only SHA-256(secretToken). Never log secretToken.
 *  4. workspaceId comes from the DB-fetched invoice, never from the client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { helcimAdapter, sha256Hex } from '@/lib/payments/helcim'

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentAttemptModel = {
  findFirst: (args: object) => Promise<{ id: string; idempotencyKey: string; checkoutRef: string | null } | null>
  updateMany: (args: object) => Promise<unknown>
  update: (args: object) => Promise<unknown>
  create: (args: object) => Promise<{ id: string }>
}

type WorkspacePaymentConfigModel = {
  findUnique: (args: object) => Promise<{ provider: string } | null>
}

type PublicDb = typeof db & {
  paymentAttempt: PaymentAttemptModel
  workspacePaymentConfig: WorkspacePaymentConfigModel
}

// ── Constants ──────────────────────────────────────────────────────────────

// Helcim tokens expire after 60 min. We treat > 55 min old as stale.
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
      where: { publicToken },
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        amountPaidCents: true,
        workspaceId: true,
        publicTokenExpiresAt: true,
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // ── 2. Expiry check ────────────────────────────────────────────────────
    const expiresAt = (invoice as unknown as { publicTokenExpiresAt: Date | null }).publicTokenExpiresAt
    if (expiresAt && expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invoice link has expired' }, { status: 410 })
    }

    // ── 3. Payable state guard ─────────────────────────────────────────────
    const PAYABLE = ['SENT', 'VIEWED']
    if (!PAYABLE.includes(invoice.status)) {
      return NextResponse.json(
        { error: `Invoice is not payable (status: ${invoice.status})` },
        { status: 422 },
      )
    }

    // Charge the balance due (covers partial-payment flows)
    const amountPaidCents = (invoice as unknown as { amountPaidCents: number }).amountPaidCents ?? 0
    const balanceCents = invoice.totalCents - amountPaidCents
    if (balanceCents <= 0) {
      return NextResponse.json({ error: 'Invoice balance is already zero' }, { status: 422 })
    }

    // ── 4. Workspace payment config ────────────────────────────────────────
    const pdb = db as unknown as PublicDb
    const config = await pdb.workspacePaymentConfig.findUnique({
      where: { workspaceId: invoice.workspaceId },
      select: { provider: true },
    })

    if (!config || config.provider === 'NONE') {
      return NextResponse.json({ error: 'Online payments are not configured' }, { status: 422 })
    }

    const { workspaceId } = invoice
    const invoiceId = invoice.id

    // ── 5. Expire stale INITIATED attempts ────────────────────────────────
    const staleCutoff = new Date(Date.now() - TOKEN_EXPIRY_MS)
    await pdb.paymentAttempt.updateMany({
      where: {
        invoiceId,
        status: 'INITIATED',
        createdAt: { lt: staleCutoff },
      },
      data: { status: 'EXPIRED', resolvedAt: new Date() },
    })

    // ── 6. Reuse guard ─────────────────────────────────────────────────────
    // If a recent INITIATED attempt exists, re-call Helcim for fresh tokens
    // (the raw secretToken cannot be recovered from the stored hash).
    const existing = await pdb.paymentAttempt.findFirst({
      where: { invoiceId, status: 'INITIATED' },
      select: { id: true, idempotencyKey: true, checkoutRef: true },
    })

    if (existing) {
      const checkoutRef = `pay_${randomUUID()}`
      const invoiceNumber = (invoice as unknown as { number: string }).number

      const { checkoutToken, secretToken } = await helcimAdapter.initializeCheckout({
        amountCents: balanceCents,
        currency: 'USD',
        idempotencyKey: existing.idempotencyKey,
        reference: invoiceNumber,
      })

      await pdb.paymentAttempt.update({
        where: { id: existing.id },
        data: { checkoutToken, secretTokenHash: sha256Hex(secretToken), checkoutRef },
      })

      return NextResponse.json({ attemptId: existing.id, checkoutToken, secretToken })
    }

    // ── 7. New attempt ─────────────────────────────────────────────────────
    const idempotencyKey = `${workspaceId}:${invoiceId}:${Date.now()}`
    const checkoutRef = `pay_${randomUUID()}`
    const invoiceNumber = (invoice as unknown as { number: string }).number

    const { checkoutToken, secretToken } = await helcimAdapter.initializeCheckout({
      amountCents: balanceCents,
      currency: 'USD',
      idempotencyKey,
      reference: invoiceNumber,
    })

    const attempt = await pdb.paymentAttempt.create({
      data: {
        workspaceId,
        invoiceId,
        provider: config.provider,
        status: 'INITIATED',
        amountCents: balanceCents,
        currency: 'USD',
        checkoutToken,
        secretTokenHash: sha256Hex(secretToken),
        idempotencyKey,
        checkoutRef,
      },
      select: { id: true },
    })

    return NextResponse.json({
      attemptId: attempt.id,
      checkoutToken,
      secretToken,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Payment initialization failed'
    const safe = msg
      .replace(/HELCIM_API_TOKEN[^\s]*/gi, '[redacted]')
      .replace(/api-token[^\s]*/gi, '[redacted]')
    console.error('[api/payments/initiate]', err)
    return NextResponse.json({ error: safe }, { status: 500 })
  }
}
