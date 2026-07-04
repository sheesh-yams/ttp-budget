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

function signState(state: string, workspaceId: string): string {
  return createHmac('sha256', process.env.STRIPE_SECRET_KEY ?? 'dev')
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

  const expected = signState(state, workspaceId)
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null

  return { state, workspaceId }
}
