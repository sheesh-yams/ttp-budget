/**
 * Cryptographically secure public token generation.
 *
 * Uses the Web Crypto API (`crypto.randomUUID()`), which is available in:
 *   - Node.js ≥ 14.17  (used by Next.js server actions & API routes)
 *   - Edge runtime      (used by Next.js middleware)
 *   - All modern browsers
 *
 * Output: UUID v4 — 36-character hyphenated hex string.
 * Entropy: 122 bits of cryptographic randomness.
 * Example: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 *
 * WHY NOT cuid()?
 * CUID v1 embeds a timestamp + process fingerprint + monotonic counter in the
 * token, leaving only ~32 bits of actual randomness.  For a URL-accessible
 * resource (proposals, invoices, call sheets) that randomness budget is far
 * too small — a determined attacker can enumerate the space in minutes.
 * UUID v4 provides 122 random bits, making brute-force infeasible even at
 * planetary scale.
 */
export function generatePublicToken(): string {
  return crypto.randomUUID()
}
