/**
 * GET /api/stripe/connect/callback
 *
 * Stripe Connect (Standard) OAuth callback. Stripe redirects here after the
 * workspace owner authorises the connection in the Stripe dashboard.
 *
 * Security invariants:
 *  1. State validation — the `state` query param is compared against the signed
 *     cookie set by getStripeConnectUrl(). A mismatch or absent cookie rejects
 *     the request regardless of whether the code looks valid.
 *  2. Workspace isolation — the workspaceId comes from the signed cookie, never
 *     from the URL or query string.
 *  3. On any error, redirect to /settings/payments?error=stripe_connect_failed.
 *     Never render a raw error page with Stripe internals.
 *  4. Cookie deleted after use (one-time token).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stripe } from '@/lib/payments/stripe'
import { parseStateCookie } from '@/server/actions/stripe-connect'
import { logAuditEvent } from '@/lib/audit'
import { cookies } from 'next/headers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

function failRedirect(reason: string) {
  console.error('[stripe-callback]', reason)
  return NextResponse.redirect(new URL('/settings/payments?error=stripe_connect_failed', APP_URL))
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const stateCookie  = cookieStore.get('stripe_oauth_state')?.value ?? ''

  // ── 1. Validate CSRF state ─────────────────────────────────────────────
  const parsed = parseStateCookie(stateCookie)
  if (!parsed) return failRedirect('Missing or invalid oauth state cookie')

  const queryState = req.nextUrl.searchParams.get('state') ?? ''
  if (queryState !== parsed.state) return failRedirect('state mismatch — possible CSRF')

  // ── 2. Check for Stripe errors ─────────────────────────────────────────
  const error = req.nextUrl.searchParams.get('error')
  if (error) return failRedirect(`Stripe OAuth error: ${error}`)

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return failRedirect('No code in callback')

  // ── 3. Exchange code → connected account ───────────────────────────────
  let stripeUserId: string
  try {
    const token = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    } as Parameters<typeof stripe.oauth.token>[0])
    if (!token.stripe_user_id) throw new Error('No stripe_user_id in token response')
    stripeUserId = token.stripe_user_id
  } catch (err) {
    return failRedirect(`Token exchange failed: ${(err as Error).message}`)
  }

  // ── 4. Fetch account details to seed chargesEnabled ───────────────────
  let chargesEnabled = false
  try {
    const account = await stripe.accounts.retrieve(stripeUserId)
    chargesEnabled = account.charges_enabled ?? false
  } catch {
    // Non-fatal — chargesEnabled will be updated by the account.updated webhook
  }

  // ── 5. Persist to workspace config ────────────────────────────────────
  const { workspaceId } = parsed
  try {
    await (db as unknown as {
      workspacePaymentConfig: {
        upsert: (args: object) => Promise<unknown>
      }
    }).workspacePaymentConfig.upsert({
      where: { workspaceId },
      update: {
        stripeAccountId:      stripeUserId,
        stripeOnboardedAt:    new Date(),
        stripeChargesEnabled: chargesEnabled,
        provider:             'STRIPE',
      },
      create: {
        workspaceId,
        stripeAccountId:      stripeUserId,
        stripeOnboardedAt:    new Date(),
        stripeChargesEnabled: chargesEnabled,
        provider:             'STRIPE',
      },
    })
  } catch (err) {
    return failRedirect(`DB write failed: ${(err as Error).message}`)
  }

  void logAuditEvent({
    workspaceId,
    action:    'payment.stripe_connected',
    entityType: 'WorkspacePaymentConfig',
    metadata:  { stripeAccountId: stripeUserId, chargesEnabled },
  })

  // ── 6. Delete state cookie (one-time token) ────────────────────────────
  const response = NextResponse.redirect(new URL('/settings/payments?connected=1', APP_URL))
  response.cookies.delete('stripe_oauth_state')
  return response
}
