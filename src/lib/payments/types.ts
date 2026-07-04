/**
 * payments/types.ts — Payment provider abstraction layer
 *
 * All payment-provider implementations must satisfy `PaymentProviderAdapter`.
 * This file is safe to import anywhere — it contains no secrets, no fetch
 * calls, and no server-only code. The concrete adapters (helcim.ts, stripe.ts)
 * are marked `import 'server-only'` and must never be imported from client code.
 */

// ── Provider result types ────────────────────────────────────────────────────

/**
 * Union returned by every adapter's `createCheckout`.
 * - helcim_modal: launch the HelcimPay.js modal on the client; secretToken is
 *   needed by the client confirm step and must NOT be logged.
 * - redirect: full-page navigation to a hosted checkout URL (Stripe).
 */
export type CheckoutResult =
  | { mode: 'helcim_modal'; checkoutToken: string; secretToken: string }
  | { mode: 'redirect'; url: string }

/**
 * Verified event delivered to `settleAttempt`. Populated by the provider
 * adapter after signature / hash validation — amount is always integer cents.
 */
export type VerifiedPaymentEvent = {
  provider:    'STRIPE' | 'HELCIM'
  providerRef: string        // transaction / session id at the provider
  amountCents: number        // converted to integer cents by the adapter
  currency:    string
  workspaceId: string        // resolved from verified data only, never from URL/body
  attemptId?:  string        // when the provider echoes our reference back
}

// ── Adapter interface ────────────────────────────────────────────────────────

export interface PaymentProviderAdapter {
  /**
   * Create a checkout session for an invoice payment.
   * Amount originates from `attempt.amountCents` (server-side) — never from
   * client input. Must never include API credentials in thrown errors or
   * returned values.
   */
  createCheckout(args: {
    workspaceId: string
    invoice:     { id: string; number: string; publicToken: string }
    attempt:     { id: string; amountCents: number; currency: string; idempotencyKey: string; checkoutRef: string }
  }): Promise<CheckoutResult>
}

// ── Helcim-specific types (used by confirm + webhook routes) ─────────────────
// These live here (not in helcim.ts) because the client-side confirm modal
// component needs them — and this file has no server-only import.

export type HelcimEventStatus = 'SUCCESS' | 'ABORTED' | 'HIDE'

/** Raw transaction data returned in the HelcimPay.js iFrame SUCCESS event. */
export type HelcimTransactionData = {
  transactionId:   string
  dateCreated:     string
  cardBatchId?:    string
  status:          string    // "APPROVED"
  type:            string    // "purchase"
  /** Dollar amount as a string, e.g. "100.00" */
  amount:          string
  currency:        string
  avsResponse?:    string
  cvvResponse?:    string
  approvalCode?:   string
  cardToken?:      string
  cardNumber?:     string
  cardHolderName?: string
  cardType?:       string
  customerCode?:   string
  invoiceNumber?:  string
  warning?:        string
}

/** Shape of `event.data.eventMessage` for a SUCCESS event. */
export type HelcimSuccessPayload = {
  data: HelcimTransactionData
  /** SHA-256 hash to validate on the server. */
  hash: string
}

// ── Legacy adapter types (used internally by the Helcim adapter) ─────────────

export type InitializeCheckoutInput = {
  amountCents:    number
  currency:       string
  idempotencyKey: string
  reference?:     string
}

export type InitializeCheckoutResult = {
  checkoutToken: string
  secretToken:   string
}

export type ProviderTransaction = {
  transactionId: string
  amountCents:   number
  currency:      string
  status:        string
  reference?:    string
}
