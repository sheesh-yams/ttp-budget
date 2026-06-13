/**
 * payments/money.ts — Cents ↔ Helcim dollars converter
 *
 * All money in TTP is stored as integer cents.
 * The Helcim API expects a decimal dollar amount (e.g. 100.00 for $100.00).
 *
 * Rules:
 *  - centsToHelcimDollars: divide by 100, round to exactly 2 decimal places.
 *  - helcimDollarsToCents: multiply by 100, round to the nearest integer.
 *    Accepts both number and string (Helcim returns amount as string in events).
 *
 * These functions are pure — no I/O, no side effects.
 * Safe to import anywhere (client or server).
 */

/**
 * Convert integer cents to a Helcim-compatible dollar amount.
 *
 * @example
 * centsToHelcimDollars(10000)  // → 100.00
 * centsToHelcimDollars(1099)   // → 10.99
 * centsToHelcimDollars(1)      // → 0.01
 */
export function centsToHelcimDollars(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`centsToHelcimDollars expects an integer, got ${cents}`)
  }
  // parseFloat(toFixed) avoids the representation issue with (n/100).toFixed(2)
  return parseFloat((cents / 100).toFixed(2))
}

/**
 * Convert a Helcim dollar amount (number or string) back to integer cents.
 *
 * @example
 * helcimDollarsToCents(100)       // → 10000
 * helcimDollarsToCents("100.00")  // → 10000
 * helcimDollarsToCents("10.99")   // → 1099
 * helcimDollarsToCents("0.01")    // → 1
 */
export function helcimDollarsToCents(dollars: number | string): number {
  const parsed = typeof dollars === 'string' ? parseFloat(dollars) : dollars
  if (!isFinite(parsed)) {
    throw new TypeError(`helcimDollarsToCents: cannot parse "${dollars}" as a number`)
  }
  // Multiply by 100 and round to avoid floating-point drift.
  // e.g. 10.99 * 100 = 1098.9999999999999 → Math.round → 1099 ✓
  return Math.round(parsed * 100)
}
