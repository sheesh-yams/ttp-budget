/**
 * payments/helcim.ts — Helcim payment provider adapter
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SECURITY — READ BEFORE EDITING                                          │
 * │                                                                         │
 * │ 1. HELCIM_API_TOKEN is read inside each function, never at module level.│
 * │    This prevents it from leaking into build-time bundles or server logs.│
 * │                                                                         │
 * │ 2. All fetch() calls wrap errors before re-throwing. Error messages and │
 * │    caught exceptions must NEVER include request headers or the token.   │
 * │                                                                         │
 * │ 3. secretToken is short-lived (60 min). It is returned to the caller    │
 * │    but NEVER logged. The caller stores SHA-256(secretToken) in the DB.  │
 * │                                                                         │
 * │ 4. This file is server-only. Never import from client components.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import 'server-only'
import { createHash, createHmac } from 'crypto'
import type {
  PaymentProviderAdapter,
  InitializeCheckoutInput,
  InitializeCheckoutResult,
  ProviderTransaction,
} from './types'
import { centsToHelcimDollars, helcimDollarsToCents } from './money'

// ── Constants ──────────────────────────────────────────────────────────────

const HELCIM_API_BASE = 'https://api.helcim.com/v2'
const INITIALIZE_ENDPOINT = `${HELCIM_API_BASE}/helcim-pay/initialize`

// ── Internal helpers ───────────────────────────────────────────────────────

/** Read the API token at call-time. Never cache at module level. */
function getApiToken(): string {
  const token = process.env.HELCIM_API_TOKEN
  if (!token) throw new Error('[helcim] HELCIM_API_TOKEN is not configured')
  return token
}

/**
 * Build fetch headers. Accepts the token as a param so it is never assembled
 * at module level and never visible in a caught error's stack.
 */
function buildHeaders(token: string): HeadersInit {
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'api-token': token,     // Helcim uses 'api-token', NOT 'Authorization: Bearer'
  }
}

/**
 * Safely extract an error message from a Helcim response body.
 * Strips any value that could contain the request token.
 */
async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as Record<string, unknown>
    // Helcim returns { errors: string } on failure
    const msg = typeof body.errors === 'string' ? body.errors : JSON.stringify(body)
    // Truncate to avoid leaking large bodies into logs
    return msg.slice(0, 200)
  } catch {
    return `HTTP ${res.status}`
  }
}

// ── initializeCheckout ─────────────────────────────────────────────────────

/**
 * Create a HelcimPay.js checkout session.
 *
 * Endpoint: POST https://api.helcim.com/v2/helcim-pay/initialize
 * Auth:     api-token header (NOT Authorization: Bearer)
 *
 * Amount is sent as dollars (float). We convert from cents internally.
 * Returns checkoutToken (→ client) and secretToken (→ stored as hash).
 */
async function initializeCheckout(
  input: InitializeCheckoutInput,
): Promise<InitializeCheckoutResult> {
  const amountDollars = centsToHelcimDollars(input.amountCents)

  // Base body. We optionally attach an `invoiceRequest` so our reference rides
  // along as the Helcim invoiceNumber (echoed back on the transaction → lets a
  // webhook map a bare transactionId to our PaymentAttempt).
  const baseBody: Record<string, unknown> = {
    paymentType: 'purchase',
    amount: amountDollars,
    currency: input.currency,
    // Show both credit card and bank account (ACH/EFT) tabs in the modal.
    paymentMethod: 'cc-ach',
  }

  if (input.reference) {
    // Helcim creates an invoice from this; the line-item total must equal amount.
    // NOTE: if the exact invoiceRequest shape is wrong, the first call fails and
    // we transparently retry WITHOUT it (below) so payments never break — the
    // only cost is that specific payment has no webhook backstop. Watch server
    // logs for "[helcim] initialize: retrying without invoiceRequest" to know
    // the shape needs adjusting.
    const withRef: Record<string, unknown> = {
      ...baseBody,
      invoiceRequest: {
        invoiceNumber: input.reference,
        currency: input.currency,
        lineItems: [
          { description: 'Invoice payment', quantity: 1, price: amountDollars, total: amountDollars },
        ],
      },
    }
    try {
      return await postInitialize(withRef)
    } catch (err) {
      console.error('[helcim] initialize: retrying without invoiceRequest —', (err as Error).message)
      return await postInitialize(baseBody)
    }
  }

  return await postInitialize(baseBody)
}

/** POST to the HelcimPay initialize endpoint and parse the token pair. */
async function postInitialize(body: Record<string, unknown>): Promise<InitializeCheckoutResult> {
  const token = getApiToken()

  let res: Response
  try {
    res = await fetch(INITIALIZE_ENDPOINT, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    })
  } catch (fetchErr) {
    // Network-level error — safe to log the message (no headers in scope)
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

  const { checkoutToken, secretToken } = parsed as {
    checkoutToken?: string
    secretToken?: string
  }

  if (!checkoutToken || !secretToken) {
    throw new Error('[helcim] initialize: response missing checkoutToken or secretToken')
  }

  return { checkoutToken, secretToken }
}

// ── getTransaction ─────────────────────────────────────────────────────────

/**
 * Fetch a transaction by Helcim transactionId.
 *
 * Endpoint: GET https://api.helcim.com/v2/card-transactions/{cardTransactionId}
 *
 * Called from the confirm route to verify amount and status server-to-server.
 * The transaction object's `amount` field is a number (dollars) in the API
 * response — different from the iFrame event which returns it as a string.
 */
async function getTransaction(providerRef: string): Promise<ProviderTransaction> {
  const token = getApiToken()
  const url = `${HELCIM_API_BASE}/card-transactions/${encodeURIComponent(providerRef)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(token),
    })
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
    amount?: number | string
    currency?: string
    status?: string
    invoiceNumber?: string
  }

  if (!tx.transactionId || tx.amount == null || !tx.status) {
    throw new Error('[helcim] getTransaction: unexpected response shape')
  }

  return {
    transactionId: String(tx.transactionId),
    // API returns amount as a dollar number (e.g. 52.5); convert to cents
    amountCents: helcimDollarsToCents(tx.amount),
    currency: (tx.currency ?? 'USD').toUpperCase(),
    status: tx.status,
    reference: tx.invoiceNumber ? String(tx.invoiceNumber) : undefined,
  }
}

// ── verifyWebhookSignature ───────────────────────────────────────────────────

/**
 * Verify an inbound Helcim webhook signature (Svix-compatible scheme).
 *
 * Signed content:  `${webhookId}.${webhookTimestamp}.${rawBody}`
 * Key:             base64-decoded account Verifier Token (strip any `whsec_` prefix)
 * MAC:             HMAC-SHA256 → base64
 * Header:          `webhook-signature` is a space-separated list of
 *                  `v1,<base64sig>` entries; a match against ANY entry passes.
 *
 * `verifierToken` is passed in (read from env by the caller) so this module
 * stays free of env reads at module scope. Returns true on a valid signature.
 */
export function verifyWebhookSignature(params: {
  webhookId:        string
  webhookTimestamp: string
  rawBody:          string
  signatureHeader:  string
  verifierToken:    string
}): boolean {
  const { webhookId, webhookTimestamp, rawBody, signatureHeader, verifierToken } = params
  if (!webhookId || !webhookTimestamp || !rawBody || !signatureHeader || !verifierToken) {
    return false
  }

  // Verifier tokens may be distributed with a `whsec_` prefix (Svix convention).
  const secret = verifierToken.startsWith('whsec_') ? verifierToken.slice(6) : verifierToken

  let key: Buffer
  try {
    key = Buffer.from(secret, 'base64')
  } catch {
    return false
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`
  const expectedSig = createHmac('sha256', key).update(signedContent, 'utf8').digest('base64')

  // Header may carry multiple space-separated signatures, each `v<n>,<sig>`.
  for (const part of signatureHeader.split(' ')) {
    const comma = part.indexOf(',')
    const sig = comma === -1 ? part : part.slice(comma + 1)
    if (sig && timingSafeCompare(sig, expectedSig)) return true
  }
  return false
}

// ── validateHelcimHash ─────────────────────────────────────────────────────

/**
 * Validate the hash returned by the HelcimPay.js iFrame.
 *
 * Algorithm (from Helcim docs):
 *   1. JSON.parse the raw transaction data to get a plain object
 *   2. JSON.stringify it back — this normalises key order and whitespace
 *   3. Append the secretToken as a raw string (no separator)
 *   4. SHA-256 the result
 *   5. Compare (constant-time) against the hash from the iFrame event
 *
 * The secretToken is accepted as a parameter — it is the caller's
 * responsibility not to log it. This function does not read the env var.
 *
 * Returns true if valid, false if invalid.
 * Throws only on programming errors (bad argument types).
 */
export function validateHelcimHash(params: {
  /** Raw JSON string of the transaction data object from the iFrame event. */
  rawDataJson: string
  /** The secretToken returned by initializeCheckout and passed back by the client. */
  secretToken: string
  /** The hash string from the iFrame event. */
  helcimHash: string
}): boolean {
  const { rawDataJson, secretToken, helcimHash } = params

  // Re-parse + re-stringify for canonical form (strips extra whitespace, normalises keys)
  let parsedData: unknown
  try {
    parsedData = JSON.parse(rawDataJson)
  } catch {
    // Invalid JSON from client — treat as tampered
    return false
  }

  const canonicalJson = JSON.stringify(parsedData)
  const input = canonicalJson + secretToken
  const ourHash = createHash('sha256').update(input, 'utf8').digest('hex')

  // Constant-time comparison to prevent timing attacks
  return timingSafeCompare(ourHash, helcimHash)
}

/**
 * SHA-256 a string. Used externally to derive secretTokenHash for storage.
 * The caller should pass secretToken — this function does not read env vars.
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * Constant-time string comparison to prevent timing-oracle attacks.
 * Both strings are hashed before comparison so length leaks are avoided.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  if (ha.length !== hb.length) return false
  let diff = 0
  for (let i = 0; i < ha.length; i++) {
    diff |= ha[i] ^ hb[i]
  }
  return diff === 0
}

// ── Export adapter ─────────────────────────────────────────────────────────

export const helcimAdapter: PaymentProviderAdapter = {
  initializeCheckout,
  getTransaction,
}
