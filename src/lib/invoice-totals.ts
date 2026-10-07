/**
 * invoice-totals.ts — the one place invoice money is added up.
 *
 *   subtotal = Σ line totals
 *   discount = clamped to 0…subtotal
 *   tax      = round((subtotal − discount) × taxPct / 100)
 *   total    = subtotal − discount + tax
 *
 * Shared by the create/edit modals (live preview) and the server actions,
 * which recompute rather than trust the totals a client sends.
 */

export interface InvoiceTotals {
  subtotalCents: number
  discountCents: number
  taxCents:      number
  totalCents:    number
}

export function calcInvoiceTotals(args: {
  lineTotalsCents: number[]
  discountCents?:  number | null
  taxPct?:         number | null
}): InvoiceTotals {
  const subtotalCents = args.lineTotalsCents.reduce((s, c) => s + (Number.isFinite(c) ? Math.round(c) : 0), 0)
  const discountCents = Math.min(Math.max(0, Math.round(args.discountCents ?? 0)), Math.max(0, subtotalCents))
  const taxPct        = Number.isFinite(args.taxPct) ? Math.max(0, args.taxPct as number) : 0
  // taxPct carries up to 4 decimals — scale to an integer so a tax landing
  // exactly on half a cent rounds up, the same as calcBudgetTotals.
  const taxCents      = Math.round((subtotalCents - discountCents) * Math.round(taxPct * 10_000) / 1_000_000)
  return { subtotalCents, discountCents, taxCents, totalCents: subtotalCents - discountCents + taxCents }
}

/**
 * The budget discount a pre-filled invoice carries, unless the line items no
 * longer add up to the pre-discount amount they were filled with. If they add
 * up to the already-discounted amount, the discount is already in the price:
 * applying it again would double-discount (reported 2026-10-01).
 */
export function autoInvoiceDiscount(args: {
  subtotalCents:          number
  preDiscountAmountCents: number
  netAmountCents:         number
}): { discountCents: number; alreadyIncluded: boolean } {
  const full = Math.max(0, args.preDiscountAmountCents - args.netAmountCents)
  if (full > 0 && args.subtotalCents === args.netAmountCents) return { discountCents: 0, alreadyIncluded: true }
  return { discountCents: full, alreadyIncluded: false }
}

/** Local calendar date as YYYY-MM-DD (toISOString would give UTC — tomorrow, late evening in the US). */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * A calendar date (YYYY-MM-DD) as the instant to store: midday UTC, so it
 * reads as the same date in every timezone from UTC−11 to UTC+11 (stored as
 * UTC midnight, a US viewer saw the day before). Null if malformed.
 */
export function calendarDateToStored(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `date` (YYYY-MM-DD) plus `days`, as YYYY-MM-DD. */
export function addDaysISO(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return localISODate(new Date(y, (m ?? 1) - 1, (d ?? 1) + days))
}
