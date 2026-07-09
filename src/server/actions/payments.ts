'use server'

/**
 * payments.ts — Payment server actions
 *
 * Security invariants:
 *  1. Amount originates server-side from the Invoice record. Nothing from the
 *     browser is trusted for the amount.
 *  2. API credentials (Helcim token) are stored AES-256-GCM encrypted in the DB.
 *     They never appear in ActionResult payloads or error strings.
 *  3. secretToken is returned to the client once (for the confirm request) and
 *     stored only as SHA-256(secretToken) — never plain text in the DB.
 *  4. All PaymentAttempt reads/writes go through getScopedDb() so workspace
 *     isolation is enforced automatically.
 *  5. helcimEnabled is checked server-side in getHelcimToken(). If a config row
 *     says provider=HELCIM but helcimEnabled=false, we log an audit event and
 *     fall through to wire/ACH instructions.
 */

import { randomUUID } from 'crypto'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId, requireRole } from '@/lib/auth'
import { helcimAdapter, sha256Hex, PaymentConfigError } from '@/lib/payments/helcim'
import { stripeAdapter, StripeConfigError } from '@/lib/payments/stripe'
import { logAuditEvent } from '@/lib/audit'
import type { ActionResult } from '@/types'

// ── Token expiry window ────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 55 * 60 * 1000

// ── Types ──────────────────────────────────────────────────────────────────

export type InitiatePaymentResult =
  | {
      mode:          'helcim_modal'
      attemptId:     string
      checkoutToken: string
      /** Raw secretToken — client must send this back in the confirm request.
       *  Never log it. Never store it. Expires in 60 min. */
      secretToken:   string
    }
  | {
      mode: 'redirect'
      url:  string
    }

// ── getPaymentConfig ───────────────────────────────────────────────────────

export async function getPaymentConfig() {
  const sdb = await getScopedDb()
  const config = await (sdb as unknown as {
    workspacePaymentConfig: {
      findFirst: (args: object) => Promise<{ id: string; provider: string } | null>
    }
  }).workspacePaymentConfig.findFirst({})
  return config
}

// ── initiatePayment ────────────────────────────────────────────────────────

export async function initiatePayment(
  invoiceId: string,
): Promise<ActionResult<InitiatePaymentResult>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [sdb, workspaceId] = await Promise.all([getScopedDb(), getWorkspaceId()])

    // ── 1. Fetch invoice (scoped) ──────────────────────────────────────────
    const invoice = await (sdb as unknown as {
      invoice: {
        findFirst: (args: object) => Promise<{
          id: string; number: string; status: string; totalCents: number; publicToken: string
        } | null>
      }
    }).invoice.findFirst({
      where:  { id: invoiceId },
      select: { id: true, number: true, status: true, totalCents: true, publicToken: true },
    })

    if (!invoice) return { success: false, error: 'Invoice not found' }

    const PAYABLE_STATUSES = ['SENT', 'VIEWED']
    if (!PAYABLE_STATUSES.includes(invoice.status)) {
      return { success: false, error: `Invoice cannot be paid in its current status (${invoice.status})` }
    }
    if (invoice.totalCents <= 0) {
      return { success: false, error: 'Invoice total must be greater than zero' }
    }

    // ── 2. Resolve payment provider ────────────────────────────────────────
    const config = await (sdb as unknown as {
      workspacePaymentConfig: {
        findFirst: (args: object) => Promise<{
          provider: string
          helcimEnabled: boolean
        } | null>
      }
    }).workspacePaymentConfig.findFirst({
      select: { provider: true, helcimEnabled: true },
    })

    const provider = config?.provider ?? 'NONE'

    // ── 3. Entitlement mismatch guard ──────────────────────────────────────
    // If somehow provider=HELCIM but helcimEnabled=false (entitlement revoked),
    // treat as NONE and log an audit event for investigation.
    if (provider === 'HELCIM' && !(config as unknown as { helcimEnabled: boolean })?.helcimEnabled) {
      void logAuditEvent({
        workspaceId,
        action:    'payment.entitlement_mismatch',
        entityType: 'WorkspacePaymentConfig',
        metadata:  { provider },
      })
      return { success: false, error: 'Online payments are not available for this workspace' }
    }

    if (provider === 'NONE' || !config) {
      return { success: false, error: 'Online payments are not configured for this workspace' }
    }

    if (provider === 'STRIPE') {
      const checkoutResult = await stripeAdapter.createCheckout({
        workspaceId,
        invoice: { id: invoice.id, number: invoice.number, publicToken: invoice.publicToken },
        attempt: { id: 'pending', amountCents: invoice.totalCents, currency: 'USD', idempotencyKey: '', checkoutRef: '' },
      })
      if (checkoutResult.mode !== 'redirect') {
        return { success: false, error: 'Unexpected checkout mode for Stripe provider' }
      }
      return { success: true, data: { mode: 'redirect', url: checkoutResult.url } }
    }

    // ── 4. HELCIM path ─────────────────────────────────────────────────────

    // Expire stale INITIATED attempts (> 55 min old)
    const staleCutoff = new Date(Date.now() - TOKEN_EXPIRY_MS)
    await (sdb as unknown as {
      paymentAttempt: { updateMany: (args: object) => Promise<unknown> }
    }).paymentAttempt.updateMany({
      where: { invoiceId, status: 'INITIATED', createdAt: { lt: staleCutoff } },
      data:  { status: 'EXPIRED', resolvedAt: new Date() },
    })

    // Check for a recent INITIATED attempt to reuse
    const existingAttempt = await (sdb as unknown as {
      paymentAttempt: {
        findFirst: (args: object) => Promise<{
          id: string; idempotencyKey: string; checkoutRef: string | null
        } | null>
      }
    }).paymentAttempt.findFirst({
      where:  { invoiceId, status: 'INITIATED' },
      select: { id: true, idempotencyKey: true, checkoutRef: true },
    })

    if (existingAttempt) {
      const checkoutRef    = `pay_${randomUUID()}`
      const idempotencyKey = existingAttempt.idempotencyKey

      const result = await helcimAdapter.createCheckout({
        workspaceId,
        invoice: { id: invoice.id, number: invoice.number, publicToken: invoice.publicToken },
        attempt: { id: existingAttempt.id, amountCents: invoice.totalCents, currency: 'USD', idempotencyKey, checkoutRef },
      })

      if (result.mode !== 'helcim_modal') {
        return { success: false, error: 'Unexpected checkout mode for Helcim provider' }
      }

      const { checkoutToken, secretToken } = result

      await (sdb as unknown as {
        paymentAttempt: { update: (args: object) => Promise<unknown> }
      }).paymentAttempt.update({
        where: { id: existingAttempt.id },
        data:  { checkoutToken, secretTokenHash: sha256Hex(secretToken), checkoutRef },
      })

      return { success: true, data: { mode: 'helcim_modal', attemptId: existingAttempt.id, checkoutToken, secretToken } }
    }

    // New attempt
    const idempotencyKey = `${workspaceId}:${invoiceId}:${Date.now()}`
    const checkoutRef    = `pay_${randomUUID()}`

    const result = await helcimAdapter.createCheckout({
      workspaceId,
      invoice: { id: invoice.id, number: invoice.number, publicToken: invoice.publicToken },
      attempt: { id: 'pending', amountCents: invoice.totalCents, currency: 'USD', idempotencyKey, checkoutRef },
    })

    if (result.mode !== 'helcim_modal') {
      return { success: false, error: 'Unexpected checkout mode for Helcim provider' }
    }

    const { checkoutToken, secretToken } = result

    const attempt = await (sdb as unknown as {
      paymentAttempt: { create: (args: object) => Promise<{ id: string }> }
    }).paymentAttempt.create({
      data: {
        invoiceId,
        provider:        'HELCIM',
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

    return { success: true, data: { mode: 'helcim_modal', attemptId: attempt.id, checkoutToken, secretToken } }
  } catch (err) {
    if (err instanceof PaymentConfigError) {
      const friendly: Record<string, string> = {
        HELCIM_NOT_ENABLED:    'Online payments are not enabled for this workspace',
        HELCIM_NOT_CONFIGURED: 'Payment provider is not fully configured',
        PROVIDER_MISMATCH:     'Payment provider configuration error',
      }
      return { success: false, error: friendly[err.code] ?? 'Payment not available' }
    }

    if (err instanceof StripeConfigError) {
      const friendly: Record<string, string> = {
        STRIPE_NOT_CONFIGURED: 'Stripe account not connected',
        STRIPE_NOT_READY:      'Stripe account is not yet ready to accept payments',
      }
      return { success: false, error: friendly[err.code] ?? 'Stripe not available' }
    }

    const msg  = err instanceof Error ? err.message : 'Payment initialisation failed'
    const safe = msg
      .replace(/api-token[^\s]*/gi,      '[redacted]')
      .replace(/HELCIM_API_TOKEN[^\s]*/gi, '[redacted]')
    console.error('[initiatePayment]', err)
    return { success: false, error: safe }
  }
}
