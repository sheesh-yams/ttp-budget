'use server'

/**
 * stripe-connect.ts — Stripe Connect (Standard) OAuth server actions
 *
 * Security constraints:
 *  1. requireRole(['OWNER']) gates both connect and disconnect. Producers and
 *     Collaborators cannot touch the workspace's payment provider.
 *  2. The OAuth state token is HMAC-SHA256 signed with STRIPE_SECRET_KEY. The
 *     signature is stored in a short-lived (10 min) HTTP-only cookie alongside
 *     the workspace ID. This is the CSRF gate — a valid code with a mismatched
 *     or absent state cookie is rejected at the callback.
 *  3. We store NO Stripe secret in the DB. Only stripeAccountId (publishable
 *     Connect ID), stripeOnboardedAt, stripeChargesEnabled.
 *  4. Disconnect is best-effort: we always clear our DB state even if the
 *     Stripe deauthorize API call fails.
 */

import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { requireRole } from '@/lib/auth'
import { getScopedDb } from '@/lib/db-scoped'
import { logAuditEvent } from '@/lib/audit'
import { stripe } from '@/lib/payments/stripe'
import { buildStateCookieValue } from '@/lib/payments/stripe-state'
import type { ActionResult } from '@/types'

// ── Constants ──────────────────────────────────────────────────────────────

const COOKIE_NAME    = 'stripe_oauth_state'
const COOKIE_MAX_AGE = 600  // 10 minutes

// ── getStripeConnectUrl ────────────────────────────────────────────────────

export async function getStripeConnectUrl(): Promise<ActionResult<{ url: string }>> {
  const gate = await requireRole(['OWNER'])
  if (!gate.ok) return gate.error!

  const state = randomBytes(32).toString('hex')
  const cookieValue = buildStateCookieValue(state, gate.workspaceId)

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === 'production',
    sameSite:  'lax',
    maxAge:    COOKIE_MAX_AGE,
    path:      '/',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.STRIPE_CONNECT_CLIENT_ID ?? '',
    scope:         'read_write',
    state,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/connect/callback`,
  })

  const url = `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  return { success: true, data: { url } }
}

// ── disconnectStripe ───────────────────────────────────────────────────────

export async function disconnectStripe(): Promise<ActionResult<void>> {
  const gate = await requireRole(['OWNER'])
  if (!gate.ok) return gate.error!

  const sdb = await getScopedDb()
  const config = await (sdb as unknown as {
    workspacePaymentConfig: {
      findFirst:  (args: object) => Promise<{ id: string; stripeAccountId: string | null; provider: string } | null>
      updateMany: (args: object) => Promise<unknown>
    }
  }).workspacePaymentConfig.findFirst({
    select: { id: true, stripeAccountId: true, provider: true },
  })

  if (!config) return { success: false, error: 'Payment configuration not found' }

  // Best-effort deauthorize — proceed even if Stripe rejects (account may already be deauthorized)
  if (config.stripeAccountId) {
    try {
      await stripe.oauth.deauthorize({
        client_id:       process.env.STRIPE_CONNECT_CLIENT_ID ?? '',
        stripe_user_id:  config.stripeAccountId,
      } as Parameters<typeof stripe.oauth.deauthorize>[0])
    } catch (err) {
      console.warn('[disconnectStripe] Stripe deauthorize failed (proceeding with local disconnect):', (err as Error).message)
    }
  }

  await (sdb as unknown as {
    workspacePaymentConfig: {
      updateMany: (args: object) => Promise<unknown>
    }
  }).workspacePaymentConfig.updateMany({
    data: {
      stripeAccountId:      null,
      stripeOnboardedAt:    null,
      stripeChargesEnabled: false,
      provider:             'NONE',
    },
  })

  void logAuditEvent({
    workspaceId: gate.workspaceId,
    actorId:     gate.userId,
    action:      'payment.stripe_disconnected',
    entityType:  'WorkspacePaymentConfig',
    metadata:    { previousAccountId: config.stripeAccountId },
  })

  return { success: true, data: undefined }
}
