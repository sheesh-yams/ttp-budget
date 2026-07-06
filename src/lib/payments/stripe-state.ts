/**
 * stripe-state.ts — HMAC-signed OAuth state token helpers
 *
 * Shared by:
 *  - stripe-connect.ts (server action — builds + sets the cookie)
 *  - /api/stripe/connect/callback (route — reads + validates the cookie)
 *
 * No 'use server' — these are pure functions, not server actions.
 */

import { createHmac } from 'crypto'

/**
 * Secret used to sign the OAuth state cookie. Prefer a dedicated
 * STRIPE_OAUTH_STATE_SECRET (key separation from the payment API key); fall back
 * to STRIPE_SECRET_KEY for existing deployments. NEVER fall back to a constant —
 * a hardcoded default would let anyone forge a valid state cookie and defeat the
 * CSRF protection on the Connect callback. Throws (fail closed) if neither is set.
 */
function stateSecret(): string {
  const secret = process.env.STRIPE_OAUTH_STATE_SECRET || process.env.STRIPE_SECRET_KEY
  if (!secret) {
    throw new Error(
      'Stripe OAuth state signing secret is not configured — set STRIPE_OAUTH_STATE_SECRET (preferred) or STRIPE_SECRET_KEY.',
    )
  }
  return secret
}

function signState(state: string, workspaceId: string): string {
  return createHmac('sha256', stateSecret())
    .update(`${state}:${workspaceId}`)
    .digest('hex')
}

export function buildStateCookieValue(state: string, workspaceId: string): string {
  return `${state}.${workspaceId}.${signState(state, workspaceId)}`
}

/** Returns { state, workspaceId } if signature is valid; null otherwise. */
export function parseStateCookie(cookieValue: string): { state: string; workspaceId: string } | null {
  const parts = cookieValue.split('.')
  if (parts.length !== 3) return null
  const [state, workspaceId, sig] = parts
  if (!state || !workspaceId || !sig) return null

  // If the signing secret is unconfigured, signState throws. On the callback
  // side we treat that as an invalid cookie (graceful failRedirect) rather than
  // surfacing a 500 — the initiating server action already fails loudly.
  let expected: string
  try {
    expected = signState(state, workspaceId)
  } catch {
    return null
  }
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null

  return { state, workspaceId }
}
