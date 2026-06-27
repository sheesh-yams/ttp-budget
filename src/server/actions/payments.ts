'use server'

/**
 * payments.ts — Payment server actions
 *
 * Security invariants (see threat model in spec):
 *  1. Amount originates server-side from the Invoice record. Nothing from the
 *     browser is trusted for the amount.
 *  2. HELCIM_API_TOKEN never appears in ActionResult payloads or error strings.
 *     It stays inside src/lib/payments/helcim.ts (server-only module).
 *  3. secretToken is returned to the client once (for the confirm request) and
 *     stored only as SHA-256(secretToken) — never as plain text in the DB.
 *  4. All PaymentAttempt reads/writes go through getScopedDb() so workspace
 *     isolation is enforced automatically.
 */

import { randomUUID } from 'crypto'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { helcimAdapter } from '@/lib/payments/helcim'
import { sha256Hex } from '@/lib/payments/helcim'
import type { ActionResult } from '@/types'

// ── Token expiry window ────────────────────────────────────────────────────
// Helcim checkoutToken + secretToken expire after 60 minutes.
// We treat anything older than 55 minutes as stale to give a safe margin.
const TOKEN_EXPIRY_MS = 55 * 60 * 1000

// ── Types used across phases ───────────────────────────────────────────────

export type InitiatePaymentResult = {
  attemptId:     string
  checkoutToken: string
  /** Raw secretToken — client must send this back in the confirm request.
   *  Never log it. Never store it. Expires in 60 min. */
  secretToken:   string
}

// ── getPaymentConfig ───────────────────────────────────────────────────────

/**
 * Returns the payment configuration for the active workspace, or null if
 * payments have not been configured (provider = NONE or no config row).
 */
export async function getPaymentConfig() {
  const sdb = await getScopedDb()

  // WorkspacePaymentConfig is workspace-scoped — no manual workspaceId needed
  const config = await (sdb as unknown as {
    workspacePaymentConfig: {
      findFirst: (args: object) => Promise<{ id: string; provider: string } | null>
    }
  }).workspacePaymentConfig.findFirst({})

  return config
}

// ── initiatePayment ────────────────────────────────────────────────────────

/**
 * Create (or refresh) a HelcimPay.js checkout session for an invoice.
 *
 * Flow:
 *  1. Authenticate — must be a workspace member
 *  2. Fetch invoice via scoped DB — validates workspace ownership
 *  3. Guard: invoice must be in a payable state (SENT or VIEWED)
 *  4. Expire stale INITIATED attempts for this invoice (> 55 min old)
 *  5. Reuse guard: if a recent INITIATED attempt exists, refresh its tokens
 *     by re-initialising with Helcim and updating the row
 *  6. Otherwise: call Helcim, create a new PaymentAttempt
 *  7. Return { attemptId, checkoutToken, secretToken }
 *
 * NOTE: This action is called from the authenticated (internal) invoice page,
 * not the public /i/[token] page. Phase 4 wires it from the public page via
 * a separate public-facing route.
 */
export async function initiatePayment(
  invoiceId: string,
): Promise<ActionResult<InitiatePaymentResult>> {
  try {
    const [sdb, workspaceId, user] = await Promise.all([
      getScopedDb(),
      getWorkspaceId(),
      getCurrentUser(),
    ])

    // ── 1. Fetch invoice (scoped — workspace isolation enforced) ───────────
    const invoice = await (sdb as unknown as {
      invoice: {
        findFirst: (args: object) => Promise<{
          id: string
          number: string
          status: string
          totalCents: number
        } | null>
      }
    }).invoice.findFirst({
      where: { id: invoiceId },
      select: { id: true, number: true, status: true, totalCents: true },
    })

    if (!invoice) {
      return { success: false, error: 'Invoice not found' }
    }

    // ── 2. Guard: invoice must be payable ──────────────────────────────────
    const PAYABLE_STATUSES = ['SENT', 'VIEWED']
    if (!PAYABLE_STATUSES.includes(invoice.status)) {
      return {
        success: false,
        error: `Invoice cannot be paid in its current status (${invoice.status})`,
      }
    }

    if (invoice.totalCents <= 0) {
      return { success: false, error: 'Invoice total must be greater than zero' }
    }

    // ── 3. Check payment provider is configured ────────────────────────────
    const config = await (sdb as unknown as {
      workspacePaymentConfig: {
        findFirst: (args: object) => Promise<{ provider: string } | null>
      }
    }).workspacePaymentConfig.findFirst({})

    if (!config || config.provider === 'NONE') {
      return { success: false, error: 'Online payments are not configured for this workspace' }
    }

    // ── 4. Expire stale INITIATED attempts ────────────────────────────────
    const staleCutoff = new Date(Date.now() - TOKEN_EXPIRY_MS)

    await (sdb as unknown as {
      paymentAttempt: {
        updateMany: (args: object) => Promise<unknown>
      }
    }).paymentAttempt.updateMany({
      where: {
        invoiceId,
        status: 'INITIATED',
        createdAt: { lt: staleCutoff },
      },
      data: { status: 'EXPIRED', resolvedAt: new Date() },
    })

    // ── 5. Reuse guard: check for a recent INITIATED attempt ───────────────
    const existingAttempt = await (sdb as unknown as {
      paymentAttempt: {
        findFirst: (args: object) => Promise<{
          id: string
          idempotencyKey: string
          checkoutRef: string | null
        } | null>
      }
    }).paymentAttempt.findFirst({
      where: { invoiceId, status: 'INITIATED' },
      select: { id: true, idempotencyKey: true, checkoutRef: true },
    })

    if (existingAttempt) {
      const checkoutRef = `pay_${randomUUID()}`

      const { checkoutToken, secretToken } = await helcimAdapter.initializeCheckout({
        amountCents:     invoice.totalCents,
        currency:        'USD',
        idempotencyKey:  existingAttempt.idempotencyKey,
        reference:       invoice.number,
      })

      await (sdb as unknown as {
        paymentAttempt: {
          update: (args: object) => Promise<unknown>
        }
      }).paymentAttempt.update({
        where: { id: existingAttempt.id },
        data: {
          checkoutToken,
          secretTokenHash: sha256Hex(secretToken),
          checkoutRef,
          // reset createdAt window by updating resolvedAt? No — keep original createdAt.
          // The expiry check uses createdAt; we're renewing within the window.
        },
      })

      return {
        success: true,
        data: {
          attemptId:     existingAttempt.id,
          checkoutToken,
          secretToken,
        },
      }
    }

    // ── 6. New attempt: call Helcim + create PaymentAttempt row ───────────
    const idempotencyKey = `${workspaceId}:${invoiceId}:${Date.now()}`
    const checkoutRef = `pay_${randomUUID()}`

    const { checkoutToken, secretToken } = await helcimAdapter.initializeCheckout({
      amountCents:    invoice.totalCents,
      currency:       'USD',
      idempotencyKey,
      reference:      invoice.number,
    })

    const attempt = await (sdb as unknown as {
      paymentAttempt: {
        create: (args: object) => Promise<{ id: string }>
      }
    }).paymentAttempt.create({
      data: {
        invoiceId,
        provider:        config.provider,
        status:          'INITIATED',
        amountCents:     invoice.totalCents,
        currency:        'USD',
        checkoutToken,
        secretTokenHash: sha256Hex(secretToken),
        idempotencyKey,
        checkoutRef,
      },
      select: { id: true },
    })

    return {
      success: true,
      data: {
        attemptId:     attempt.id,
        checkoutToken,
        secretToken,
      },
    }
  } catch (err) {
    // Sanitise: never leak Helcim credentials in the error message
    const msg = err instanceof Error ? err.message : 'Payment initialisation failed'
    // Strip any mention of api-token or HELCIM_API_TOKEN
    const safe = msg.replace(/HELCIM_API_TOKEN[^\s]*/gi, '[redacted]')
                    .replace(/api-token[^\s]*/gi, '[redacted]')
    console.error('[initiatePayment]', err)
    return { success: false, error: safe }
  }
}
