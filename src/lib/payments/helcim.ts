/**
 * payments/helcim.ts — Helcim payment provider adapter (per-workspace credentials)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SECURITY — READ BEFORE EDITING                                          │
 * │                                                                         │
 * │ 1. API tokens are loaded per-call from the DB (AES-256-GCM encrypted). │
 * │    They never appear in env vars, build bundles, or server logs.        │
 * │                                                                         │
 * │ 2. All fetch() calls wrap errors before re-throwing. Error messages and │
 * │    caught exceptions must NEVER include request headers or the token.   │
 * │                                                                         │
 * │ 3. secretToken is short-lived (60 min). It is returned to the caller   │
 * │    for modal init but NEVER logged. The caller stores SHA-256(token).   │
 * │                                                                         │
 * │ 4. This file is server-only. Never import from client components.       │
 * │                                                                         │
 * │ 5. helcimEnabled is enforced server-side in getHelcimToken(). No UI     │
 * │    path bypasses this check — callers that don't call getHelcimToken    │
 * │    must gate on helcimEnabled themselves (see initiatePayment).         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import 'server-only'
import { createHash, createHmac } from 'crypto'
import type {
  PaymentProviderAdapter,
  CheckoutResult,
  InitializeCheckoutInput,
  InitializeCheckoutResult,
  ProviderTransaction,
} from './types'
import { centsToHelcimDollars, helcimDollarsToCents } from './money'
import { decryptCredential } from '@/lib/crypto/credentials'
import { db } from '@/lib/db'

// ── Constants ──────────────────────────────────────────────────────────────

const HELCIM_API_BASE        = 'https://api.helcim.com/v2'
const INITIALIZE_ENDPOINT    = `${HELCIM_API_BASE}/helcim-pay/initialize`

// ── Error class ────────────────────────────────────────────────────────────

/** Thrown when a workspace's payment configuration prevents processing. */
export class PaymentConfigError extends Error {
  constructor(public readonly code: 'HELCIM_NOT_ENABLED' | 'HELCIM_NOT_CONFIGURED' | 'PROVIDER_MISMATCH') {
    super(`[helcim] payment config error: ${code}`)
    this.name = 'PaymentConfigError'
  }
}

// ── Credential loading ─────────────────────────────────────────────────────

type HelcimConfig = {
  helcimEnabled:          boolean
  helcimCredentialId:     string | null
  helcimWebhookVerifierId: string | null
  provider:               string
}

async function getHelcimConfig(workspaceId: string): Promise<HelcimConfig> {
  const config = await db.workspacePaymentConfig.findUnique({
    where:  { workspaceId },
    select: {
      helcimEnabled:           true,
      helcimCredentialId:      true,
      helcimWebhookVerifierId: true,
      provider:                true,
    },
  }) as HelcimConfig | null

  if (!config?.helcimEnabled) throw new PaymentConfigError('HELCIM_NOT_ENABLED')
  if (config.provider !== 'HELCIM') throw new PaymentConfigError('PROVIDER_MISMATCH')
  return config
}

/**
 * Decrypt and return the Helcim API token for a specific workspace.
 * Throws `PaymentConfigError` if the workspace is not entitled or not configured.
 */
export async function getHelcimToken(workspaceId: string): Promise<string> {
  const config = await getHelcimConfig(workspaceId)
  if (!config.helcimCredentialId) throw new PaymentConfigError('HELCIM_NOT_CONFIGURED')
  return decryptCredential(config.helcimCredentialId)
}

/**
 * Find the single active Helcim workspace and return its verifier token.
 * Used by the inbound webhook route (which doesn't know the workspace upfront).
 *
 * Returns null if no workspace has Helcim active + a verifier configured.
 */
export async function resolveHelcimVerifierToken(): Promise<{
  verifierToken: string
  workspaceId:   string
} | null> {
  const config = await db.workspacePaymentConfig.findFirst({
    where: { provider: 'HELCIM', helcimEnabled: true, helcimWebhookVerifierId: { not: null } },
    select: { workspaceId: true, helcimWebhookVerifierId: true },
  }) as { workspaceId: string; helcimWebhookVerifierId: string } | null

  if (!config) return null

  try {
    const verifierToken = await decryptCredential(config.helcimWebhookVerifierId)
    return { verifierToken, workspaceId: config.workspaceId }
  } catch {
    // Credential row may be corrupt or KEK missing — log without content
    console.error('[helcim] resolveHelcimVerifierToken: failed to decrypt verifier credential')
    return null
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Build fetch headers. Accepts the token as a param so it is never assembled
 * at module level and never visible in a caught error's stack.
 */
function buildHeaders(token: string): HeadersInit {
  return {
    'accept':         'application/json',
    'content-type':   'application/json',
    'api-token':      token,  // Helcim uses 'api-token', NOT 'Authorization: Bearer'
  }
}

/**
 * Safely extract an error message from a Helcim response body.
 * Strips any value that could contain the request token.
 */
async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as Record<string, unknown>
    const msg  = typeof body.errors === 'string' ? body.errors : JSON.stringify(body)
    return msg.slice(0, 200)
  } catch {
    return `HTTP ${res.status}`
  }
}

// ── initializeCheckout ─────────────────────────────────────────────────────

async function initializeCheckout(
  input: InitializeCheckoutInput,
  workspaceId: string,
): Promise<InitializeCheckoutResult> {
  const amountDollars = centsToHelcimDollars(input.amountCents)

  const baseBody: Record<string, unknown> = {
    paymentType:   'purchase',
    amount:        amountDollars,
    currency:      input.currency,
    paymentMethod: 'cc-ach',
  }

  if (input.reference) {
    const withRef: Record<string, unknown> = {
      ...baseBody,
      invoiceRequest: {
        invoiceNumber: input.reference,
        currency:      input.currency,
        lineItems: [
          { description: 'Invoice payment', quantity: 1, price: amountDollars, total: amountDollars },
        ],
      },
    }
    try {
      return await postInitialize(withRef, workspaceId)
    } catch (err) {
      console.error('[helcim] initialize: retrying without invoiceRequest —', (err as Error).message)
      return await postInitialize(baseBody, workspaceId)
    }
  }

  return await postInitialize(baseBody, workspaceId)
}

async function postInitialize(body: Record<string, unknown>, workspaceId: string): Promise<InitializeCheckoutResult> {
  const token = await getHelcimToken(workspaceId)

  let res: Response
  try {
    res = await fetch(INITIALIZE_ENDPOINT, {
      method:  'POST',
      headers: buildHeaders(token),
      body:    JSON.stringify(body),
    })
  } catch (fetchErr) {
    throw new Error(`[helcim] initialize: network error — ${(fetchErr as Error).message}`)
  }

  if (!res.ok) {
    const msg = await safeErrorMessage(res)
    throw new Error(`[helcim] initialize: ${res.status} — ${msg}`)
  }

  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    throw new Error('[helcim] initialize: response is not valid JSON')
  }

  const { checkoutToken, secretToken } = parsed as { checkoutToken?: string; secretToken?: string }
  if (!checkoutToken || !secretToken) {
    throw new Error('[helcim] initialize: response missing checkoutToken or secretToken')
  }

  return { checkoutToken, secretToken }
}

// ── getTransaction ─────────────────────────────────────────────────────────

/**
 * Fetch a transaction by Helcim transactionId.
 * Called from the confirm route and webhook route to verify amount server-to-server.
 */
export async function getTransaction(providerRef: string, workspaceId: string): Promise<ProviderTransaction> {
  const token = await getHelcimToken(workspaceId)
  const url   = `${HELCIM_API_BASE}/card-transactions/${encodeURIComponent(providerRef)}`

  let res: Response
  try {
    res = await fetch(url, { method: 'GET', headers: buildHeaders(token) })
  } catch (fetchErr) {
    throw new Error(`[helcim] getTransaction: network error — ${(fetchErr as Error).message}`)
  }

  if (!res.ok) {
    const msg = await safeErrorMessage(res)
    throw new Error(`[helcim] getTransaction: ${res.status} — ${msg}`)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new Error('[helcim] getTransaction: response is not valid JSON')
  }

  const tx = body as {
    transactionId?: number | string
    amount?:        number | string
    currency?:      string
    status?:        string
    invoiceNumber?: string
  }

  if (!tx.transactionId || tx.amount == null || !tx.status) {
    throw new Error('[helcim] getTransaction: unexpected response shape')
  }

  return {
    transactionId: String(tx.transactionId),
    amountCents:   helcimDollarsToCents(tx.amount),
    currency:      (tx.currency ?? 'USD').toUpperCase(),
    status:        tx.status,
    reference:     tx.invoiceNumber ? String(tx.invoiceNumber) : undefined,
  }
}

// ── verifyWebhookSignature ─────────────────────────────────────────────────

/**
 * Verify an inbound Helcim webhook signature (Svix-compatible scheme).
 * `verifierToken` is decrypted by the caller via resolveHelcimVerifierToken()
 * so this function stays free of DB/env access.
 */
export function verifyWebhookSignature(params: {
  webhookId:        string
  webhookTimestamp: string
  rawBody:          string
  signatureHeader:  string
  verifierToken:    string
}): boolean {
  const { webhookId, webhookTimestamp, rawBody, signatureHeader, verifierToken } = params
  if (!webhookId || !webhookTimestamp || !rawBody || !signatureHeader || !verifierToken) return false

  const secret = verifierToken.startsWith('whsec_') ? verifierToken.slice(6) : verifierToken

  let key: Buffer
  try {
    key = Buffer.from(secret, 'base64')
  } catch {
    return false
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`
  const expectedSig   = createHmac('sha256', key).update(signedContent, 'utf8').digest('base64')

  for (const part of signatureHeader.split(' ')) {
    const comma = part.indexOf(',')
    const sig   = comma === -1 ? part : part.slice(comma + 1)
    if (sig && timingSafeCompare(sig, expectedSig)) return true
  }
  return false
}

// ── validateHelcimHash ────────────────────────────────────────────────────

export function validateHelcimHash(params: {
  rawDataJson: string
  secretToken: string
  helcimHash:  string
}): boolean {
  const { rawDataJson, secretToken, helcimHash } = params

  let parsedData: unknown
  try {
    parsedData = JSON.parse(rawDataJson)
  } catch {
    return false
  }

  const canonicalJson = JSON.stringify(parsedData)
  const input         = canonicalJson + secretToken
  const ourHash       = createHash('sha256').update(input, 'utf8').digest('hex')

  return timingSafeCompare(ourHash, helcimHash)
}

// ── sha256Hex ─────────────────────────────────────────────────────────────

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// ── timingSafeCompare ─────────────────────────────────────────────────────

function timingSafeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  if (ha.length !== hb.length) return false
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i]
  return diff === 0
}

// ── Adapter implementation ────────────────────────────────────────────────

async function createCheckout(args: {
  workspaceId: string
  invoice:     { id: string; number: string; publicToken: string }
  attempt:     { id: string; amountCents: number; currency: string; idempotencyKey: string; checkoutRef: string }
}): Promise<CheckoutResult> {
  const { checkoutToken, secretToken } = await initializeCheckout(
    {
      amountCents:    args.attempt.amountCents,
      currency:       args.attempt.currency,
      idempotencyKey: args.attempt.idempotencyKey,
      reference:      args.invoice.number,
    },
    args.workspaceId,
  )
  return { mode: 'helcim_modal', checkoutToken, secretToken }
}

export const helcimAdapter: PaymentProviderAdapter = { createCheckout }
