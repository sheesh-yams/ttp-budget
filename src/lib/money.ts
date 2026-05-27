/**
 * Money is stored as integers (cents) in the DB to avoid float drift.
 * All math happens in cents. Convert at the edges.
 */

/** Format cents as a display string: 6126000 → "$61,260" */
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/** Format with cents shown: 6126050 → "$61,260.50" */
export function formatMoneyFull(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/** Parse a display string back to cents: "$1,200.50" → 120050 */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const float = parseFloat(cleaned)
  if (isNaN(float)) return 0
  return Math.round(float * 100)
}

/** Convert a decimal rate string input to cents: "850" → 85000 */
export function rateToCents(rate: string | number): number {
  const n = typeof rate === 'string' ? parseFloat(rate) : rate
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

/** Cents to display rate: 85000 → "850.00" */
export function centsToRate(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** Calculate line item total in cents */
export function lineTotal(
  quantity: number,
  rateCents: number,
  markupPct?: number | null
): number {
  const subtotal = Math.round(quantity * rateCents)
  if (!markupPct) return subtotal
  return Math.round(subtotal * (1 + Number(markupPct)))
}

/** Apply a percentage markup to an amount in cents */
export function applyMarkup(cents: number, markupPct: number): number {
  return Math.round(cents * (1 + markupPct))
}

/** Percentage as a human-readable string: 0.2 → "20%" */
export function formatPct(pct: number): string {
  return `${Math.round(pct * 100)}%`
}

// ─── Quantity / unit display helpers ─────────────────────────────────────────
// A budget line item stores quantity = A × B, and optionally quantityFormula
// = "AxB" (e.g. "3x2") so we can recover A (headcount) and B (days on set).

const UNIT_LABELS: Record<string, string> = {
  HOUR:     'Hour',
  HALF_DAY: 'Half Day',
  DAY:      'Day',
  WEEK:     'Week',
  FLAT:     'Flat',
  EACH:     'Each',
  MILE:     'Mile',
}

/**
 * Parse A × B from a quantityFormula like "3x2".
 * Returns [headcount=A, days=B].
 * Falls back to [quantity, 1] when no formula is present.
 */
export function parseQtyFormula(quantity: number, formula: string | null | undefined): [number, number] {
  const match = formula?.match(/^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)$/)
  if (match) return [Number(match[1]), Number(match[2])]
  return [quantity, 1]
}

/**
 * Format the billing unit column for display.
 * Days=1 → "Day" / "Week" / "Flat"
 * Days>1 → "2 Days" / "3 Weeks"
 */
export function fmtUnit(days: number, unit: string): string {
  if (unit === 'FLAT') return 'Flat'
  const label = UNIT_LABELS[unit] ?? unit
  if (days === 1) return label
  return `${days} ${label}s`
}
