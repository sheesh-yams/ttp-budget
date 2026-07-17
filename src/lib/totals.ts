import { lineTotal } from '@/lib/money'

// Accept both plain numbers and Prisma Decimal objects (which have valueOf/toNumber)
type Numeric = number | { toNumber(): number } | { valueOf(): number }

export interface LineItemInput {
  quantity: Numeric
  rateCents: number
  markupPct?: Numeric | null
}

export interface AccountInput {
  lineItems: LineItemInput[]
  children?: AccountInput[]
}

export interface BudgetDiscountConfig {
  type:        'flat' | 'pct'
  label?:      string | null
  valueCents?: number | null
  valuePct?:   number | null  // 0–1 fraction, same convention as markupPct/taxPct
}

export interface BudgetTotals {
  subtotalCents: number   // sum of all line items before budget-level markup
  markupCents: number     // budget-level markup amount
  discountCents: number   // 0 when no discount
  discountLabel: string   // '' when no discount
  taxCents: number
  grandTotalCents: number
}

/** Recursively sum all line items in an account tree */
export function sumAccount(account: AccountInput): number {
  const ownItems = account.lineItems.reduce(
    (acc, item) => acc + lineTotal(Number(item.quantity), item.rateCents, item.markupPct ? Number(item.markupPct) : null),
    0
  )
  const childItems = (account.children ?? []).reduce(
    (acc, child) => acc + sumAccount(child),
    0
  )
  return ownItems + childItems
}

/**
 * Calculate full budget totals from a list of top-level accounts.
 *
 * Canonical order: net subtotal → + agency fee (markup) → − discount →
 * + tax (on the post-discount amount) → grand total. This order is relied on
 * by every renderer of a budget's totals (proposal web/PDF, invoices,
 * BudgetSummaryBar) — do not reorder without updating all of them.
 */
export function calcBudgetTotals(
  accounts: AccountInput[],
  markupPct: number,
  taxPct: number,
  discount?: BudgetDiscountConfig | null
): BudgetTotals {
  const subtotalCents = accounts.reduce((acc, a) => acc + sumAccount(a), 0)
  const markupCents = Math.round(subtotalCents * markupPct)
  const preTax = subtotalCents + markupCents

  let discountCents = 0
  let discountLabel = ''
  if (discount?.type) {
    if (discount.type === 'flat' && discount.valueCents) {
      discountCents = discount.valueCents
    } else if (discount.type === 'pct' && discount.valuePct) {
      discountCents = Math.round(preTax * discount.valuePct)
    }
    // Never let a discount exceed the pre-tax amount or go negative.
    discountCents = Math.max(0, Math.min(discountCents, preTax))
    if (discountCents > 0) discountLabel = discount.label || 'Discount'
  }

  const afterDiscount = preTax - discountCents
  const taxCents = Math.round(afterDiscount * taxPct)
  const grandTotalCents = afterDiscount + taxCents

  return { subtotalCents, markupCents, discountCents, discountLabel, taxCents, grandTotalCents }
}

/**
 * Evaluate a quantity formula string against a globals map.
 * e.g. formula = "shoot_days + 1", globals = { shoot_days: 2 } → 3
 * Returns the raw quantity number if formula is empty/null.
 */
export function evalQuantity(
  formula: string | null | undefined,
  quantity: number,
  globals: Record<string, number>
): number {
  if (!formula) return quantity

  try {
    // Replace variable names with their values
    let expr = formula
    for (const [key, val] of Object.entries(globals)) {
      expr = expr.replaceAll(key, String(val))
    }
    // Safe eval: only numbers and basic operators
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return quantity
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${expr}`)()
    return typeof result === 'number' && isFinite(result) ? result : quantity
  } catch {
    return quantity
  }
}
