/**
 * payments/types.ts — Payment provider abstraction layer
 *
 * All payment-provider implementations must satisfy `PaymentProviderAdapter`.
 * This file is safe to import anywhere — it contains no secrets, no fetch
 * calls, and no server-only code. The concrete adapters (helcim.ts, etc.) are
 * marked `import 'server-only'` and must never be imported from client code.
 */

// ── Initialize ─────────────────────────────────────────────────────────────

export type InitializeCheckoutInput = {
  /** Invoice-derived amount in **cents** (integer). Adapter converts to provider units. */
  amountCents: number
  /** ISO 4217 currency code. Default "USD". */
  currency: string
  /** Idempotency key — caller-generated, used to detect duplicate requests. */
  idempotencyKey: string
}

export type InitializeCheckoutResult = {
  /** Opaque token passed to the client-side modal renderer. */
  checkoutToken: string
  /**
   * Used server-side to validate the modal's callback hash.
   * NEVER include this in client responses or logs.
   */
  secretToken: string
}

// ── Transaction fetch ───────────────────────────────────────────────────────

export type ProviderTransaction = {
  /** Provider's unique transaction identifier. */
  transactionId: string
  /** Settled amount in **cents** (converted from provider units by the adapter). */
  amountCents: number
  /** ISO 4217 currency code as returned by the provider. */
  currency: string
  /** Provider-normalised status string, e.g. "APPROVED". */
  status: string
}

// ── Adapter interface ───────────────────────────────────────────────────────

export interface PaymentProviderAdapter {
  /**
   * Create a hosted-checkout session with the provider.
   * Called from `initiatePayment` server action — runs server-side only.
   * Must never include API credentials in thrown errors or returned values.
   */
  initializeCheckout(
    input: InitializeCheckoutInput,
  ): Promise<InitializeCheckoutResult>

  /**
   * Fetch a transaction by provider reference ID.
   * Called from the confirm route to verify amount and status server-side.
   * Must never include API credentials in thrown errors or returned values.
   */
  getTransaction(providerRef: string): Promise<ProviderTransaction>
}

// ── Client-side event shape (iFrame postMessage) ────────────────────────────
// These types describe the data flowing FROM the HelcimPay.js iFrame TO the
// client page. They live here (not in helcim.ts) because the client-side
// confirm modal component needs them — and this file has no server-only import.

export type HelcimEventStatus = 'SUCCESS' | 'ABORTED' | 'HIDE'

/** Raw transaction data returned in the iFrame SUCCESS event. */
export type HelcimTransactionData = {
  transactionId: string
  dateCreated: string
  cardBatchId?: string
  status: string          // "APPROVED"
  type: string            // "purchase"
  /** Dollar amount as a string, e.g. "100.00" */
  amount: string
  currency: string
  avsResponse?: string
  cvvResponse?: string
  approvalCode?: string
  cardToken?: string
  cardNumber?: string
  cardHolderName?: string
  cardType?: string
  customerCode?: string
  invoiceNumber?: string
  warning?: string
}

/** Shape of `event.data.eventMessage` for a SUCCESS event. */
export type HelcimSuccessPayload = {
  data: HelcimTransactionData
  /** SHA-256 hash to validate on the server. */
  hash: string
}
