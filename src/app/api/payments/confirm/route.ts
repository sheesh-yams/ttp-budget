/**
 * POST /api/payments/confirm
 *
 * Public route — no Clerk session. Auth is via secretToken, which proves
 * the caller is the same client that initiated this payment attempt.
 *
 * Security invariants (see threat model in spec):
 *  1. Hash validation — validateHelcimHash() proves iFrame data wasn't tampered.
 *  2. secretToken check — SHA-256(secretToken) must match what's stored in DB,
 *     binding the confirm request to the client that initiated it.
 *  3. Amount check — tx.amountCents (fetched server-to-server from Helcim) must
 *     match attempt.amountCents (set server-side from the invoice). Nothing from
 *     the browser is trusted for the settled amount.
 *  4. Replay guard — only INITIATED attempts can transition to SUCCEEDED. Any
 *     duplicate confirm returns 409 immediately.
 *  5. Unique constraint on [provider, providerRef] prevents double-settlement
 *     if the same Helcim transactionId arrives on two concurrent requests.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateHelcimHash, sha256Hex, helcimAdapter } from '@/lib/payments/helcim'
import { settlePaymentAttempt } from '@/lib/payments/settle'

// ── Types ──────────────────────────────────────────────────────────────────

type AttemptRow = {
  id: string
  status: string
  amountCents: number
  invoiceId: string
  workspaceId: string
  provider: string
  secretTokenHash: string | null
}

type PaymentAttemptModel = {
  findUnique: (args: object) => Promise<AttemptRow | null>
  update: (args: object) => Promise<unknown>
}

type ConfirmDb = typeof db & {
  paymentAttempt: PaymentAttemptModel
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      attemptId?: unknown
      rawDataJson?: unknown
      helcimHash?: unknown
      secretToken?: unknown
    }

    const { attemptId, rawDataJson, helcimHash, secretToken } = body

    if (
      typeof attemptId   !== 'string' || !attemptId   ||
      typeof rawDataJson !== 'string' || !rawDataJson ||
      typeof helcimHash  !== 'string' || !helcimHash  ||
      typeof secretToken !== 'string' || !secretToken
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── 1. Fetch attempt ───────────────────────────────────────────────────
    const cdb = db as unknown as ConfirmDb
    const attempt = await cdb.paymentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        amountCents: true,
        invoiceId: true,
        workspaceId: true,
        provider: true,
        secretTokenHash: true,
      },
    })

    if (!attempt) {
      return NextResponse.json({ error: 'Payment attempt not found' }, { status: 404 })
    }

    // ── 2. Replay guard ────────────────────────────────────────────────────
    if (attempt.status !== 'INITIATED') {
      return NextResponse.json({ error: 'Payment already processed' }, { status: 409 })
    }

    // ── 3. Validate secretToken ────────────────────────────────────────────
    // Proves this confirm request comes from the same client that initiated.
    const providedTokenHash = sha256Hex(secretToken)
    if (providedTokenHash !== attempt.secretTokenHash) {
      // Generic error — don't hint at which check failed
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 })
    }

    // ── 4. Validate Helcim iFrame hash ─────────────────────────────────────
    // Proves the transaction data coming from the browser wasn't tampered with.
    const isHashValid = validateHelcimHash({ rawDataJson, secretToken, helcimHash })
    if (!isHashValid) {
      console.error('[confirm] Helcim hash mismatch — possible tampering', { attemptId })
      return NextResponse.json({ error: 'Payment data validation failed' }, { status: 422 })
    }

    // ── 5. Extract transactionId ───────────────────────────────────────────
    let parsedData: Record<string, unknown>
    try {
      parsedData = JSON.parse(rawDataJson) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid payment data format' }, { status: 422 })
    }

    const rawTxId = parsedData.transactionId
    if (!rawTxId) {
      return NextResponse.json({ error: 'Missing transactionId in payment data' }, { status: 422 })
    }

    const transactionId = String(rawTxId)

    // ── 6. Fetch transaction server-to-server ──────────────────────────────
    // This is the canonical source of truth — we never trust the client for amount.
    const tx = await helcimAdapter.getTransaction(transactionId)

    // ── 7. Settle (shared idempotent path with the webhook) ────────────────
    // Amount tamper check + atomic INITIATED → SUCCEEDED transition live here.
    const settled = await settlePaymentAttempt({
      attemptId:     attempt.id,
      transactionId,
      txAmountCents: tx.amountCents,
    })

    if (!settled.ok) {
      if (settled.reason === 'amount_mismatch') {
        console.error('[confirm] amount mismatch — possible tampering', {
          attemptId, attemptAmountCents: attempt.amountCents, txAmountCents: tx.amountCents,
        })
        return NextResponse.json({ error: 'Payment amount does not match invoice' }, { status: 422 })
      }
      // not_found shouldn't happen here (we fetched it above); treat as already done.
      return NextResponse.json({ error: 'Payment already processed' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    // Prisma unique constraint — duplicate transactionId (concurrent replay)
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Payment already processed' }, { status: 409 })
    }

    const msg = err instanceof Error ? err.message : 'Confirmation failed'
    const safe = msg
      .replace(/HELCIM_API_TOKEN[^\s]*/gi, '[redacted]')
      .replace(/api-token[^\s]*/gi, '[redacted]')
    console.error('[api/payments/confirm]', err)
    return NextResponse.json({ error: safe }, { status: 500 })
  }
}
