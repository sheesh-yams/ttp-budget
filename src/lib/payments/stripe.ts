/**
 * payments/stripe.ts — Stripe Connect (Standard) payment adapter
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SECURITY — READ BEFORE EDITING                                          │
 * │                                                                         │
 * │ 1. Platform secret key (STRIPE_SECRET_KEY) is env-level only. We store │
 * │    NO workspace-level secrets — Stripe Connect Standard means funds     │
 * │    settle directly to the connected account without our custody.        │
 * │                                                                         │
 * │ 2. We store ONLY non-secret state: stripeAccountId, stripeOnboardedAt, │
 * │    stripeChargesEnabled.  These are safe to read (not secrets).        │
 * │                                                                         │
 * │ 3. Direct-charge pattern (stripeAccount option): all money goes to the  │
 * │    connected account. We take no application fee today.                 │
 * │    TODO application_fee_amount when monetising payments.                │
 * │                                                                         │
 * │ 4. Cross-account settlement protection lives in the webhook route.      │
 * │    event.account MUST match the attempt's workspace stripeAccountId     │
 * │    before any settlement — this adapter does not settle payments.       │
 * │                                                                         │
 * │ 5. This file is server-only. Never import from client components.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import 'server-only'
import Stripe from 'stripe'
import type { PaymentProviderAdapter, CheckoutResult } from './types'
import { db } from '@/lib/db'

// ── Error class ────────────────────────────────────────────────────────────

export class StripeConfigError extends Error {
  constructor(public readonly code: 'STRIPE_NOT_CONFIGURED' | 'STRIPE_NOT_READY') {
    super(`[stripe] payment config error: ${code}`)
    this.name = 'StripeConfigError'
  }
}

// ── Stripe client ──────────────────────────────────────────────────────────

// Singleton — module evaluated once per server process.
// STRIPE_SECRET_KEY is the platform key; no workspace-level secrets.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')

export { stripe }

// ── DB type ───────────────────────────────────────────────────────────────

type StripeConfigRow = {
  stripeAccountId:     string | null
  stripeChargesEnabled: boolean
}

async function getStripeConfig(workspaceId: string): Promise<StripeConfigRow> {
  const config = await (db as unknown as {
    workspacePaymentConfig: {
      findUnique: (args: object) => Promise<StripeConfigRow | null>
    }
  }).workspacePaymentConfig.findUnique({
    where:  { workspaceId },
    select: { stripeAccountId: true, stripeChargesEnabled: true },
  })

  if (!config?.stripeAccountId) throw new StripeConfigError('STRIPE_NOT_CONFIGURED')
  if (!config.stripeChargesEnabled) throw new StripeConfigError('STRIPE_NOT_READY')
  return config
}

// ── createCheckout ─────────────────────────────────────────────────────────

async function createCheckout(args: {
  workspaceId: string
  invoice:     { id: string; number: string; publicToken: string }
  attempt:     { id: string; amountCents: number; currency: string; idempotencyKey: string; checkoutRef: string }
}): Promise<CheckoutResult> {
  const { workspaceId, invoice, attempt } = args

  const config  = await getStripeConfig(workspaceId)
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const session = await stripe.checkout.sessions.create(
    {
      mode:                'payment',
      client_reference_id: attempt.id,   // maps the Stripe event back to our attempt
      line_items: [{
        price_data: {
          currency:     attempt.currency.toLowerCase(),
          unit_amount:  attempt.amountCents,   // integer cents, from the attempt row
          product_data: { name: `Invoice ${invoice.number}` },
        },
        quantity: 1,
      }],
      payment_method_types: ['card', 'us_bank_account'] as string[] as Parameters<typeof stripe.checkout.sessions.create>[0]['payment_method_types'],
      success_url: `${appUrl}/i/${invoice.publicToken}?paid=1`,
      cancel_url:  `${appUrl}/i/${invoice.publicToken}`,
    },
    { stripeAccount: config.stripeAccountId! },  // direct charge to connected account
  )

  if (!session.url) throw new Error('[stripe] checkout session has no URL')

  return { mode: 'redirect', url: session.url }
}

export const stripeAdapter: PaymentProviderAdapter = { createCheckout }
