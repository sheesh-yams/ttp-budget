import { calcBudgetTotals, type AccountInput } from '@/lib/totals'

// $1,000 subtotal via a single line item (qty 1 × $1,000).
const accounts: AccountInput[] = [
  { lineItems: [{ quantity: 1, rateCents: 100_000 }] },
]

describe('calcBudgetTotals — no discount (unchanged behavior)', () => {
  it('matches pre-discount math exactly when discount is omitted', () => {
    const t = calcBudgetTotals(accounts, 0.1, 0.0875)
    expect(t.subtotalCents).toBe(100_000)
    expect(t.markupCents).toBe(10_000)          // 10% of 100,000
    expect(t.discountCents).toBe(0)
    expect(t.discountLabel).toBe('')
    expect(t.taxCents).toBe(Math.round(110_000 * 0.0875))
    expect(t.grandTotalCents).toBe(110_000 + t.taxCents)
  })

  it('behaves identically when discount is null', () => {
    const t = calcBudgetTotals(accounts, 0.1, 0.0875, null)
    expect(t.discountCents).toBe(0)
    expect(t.grandTotalCents).toBe(calcBudgetTotals(accounts, 0.1, 0.0875).grandTotalCents)
  })
})

describe('calcBudgetTotals — flat discount', () => {
  it('subtracts a flat amount before tax', () => {
    // subtotal 100,000 + markup 10,000 = preTax 110,000; discount 20,000 flat
    const t = calcBudgetTotals(accounts, 0.1, 0.0875, { type: 'flat', valueCents: 20_000, label: 'Loyalty discount' })
    expect(t.discountCents).toBe(20_000)
    expect(t.discountLabel).toBe('Loyalty discount')
    const afterDiscount = 90_000
    expect(t.taxCents).toBe(Math.round(afterDiscount * 0.0875))
    expect(t.grandTotalCents).toBe(afterDiscount + t.taxCents)
  })

  it('defaults the label to "Discount" when none is provided', () => {
    const t = calcBudgetTotals(accounts, 0, 0, { type: 'flat', valueCents: 5_000 })
    expect(t.discountLabel).toBe('Discount')
  })
})

describe('calcBudgetTotals — percentage discount (0–1 fraction)', () => {
  it('computes against preTax (subtotal + markup), not raw subtotal', () => {
    // preTax = 110,000; 10% discount = 11,000
    const t = calcBudgetTotals(accounts, 0.1, 0, { type: 'pct', valuePct: 0.1 })
    expect(t.discountCents).toBe(11_000)
    expect(t.grandTotalCents).toBe(110_000 - 11_000)
  })

  it('does NOT divide by 100 — 0.1 means 10%, not 0.1%', () => {
    const t = calcBudgetTotals(accounts, 0, 0, { type: 'pct', valuePct: 0.5 })
    expect(t.discountCents).toBe(50_000) // 50% of 100,000 preTax
  })
})

describe('calcBudgetTotals — discount capping', () => {
  it('never exceeds preTax (grand total cannot go negative before tax)', () => {
    const t = calcBudgetTotals(accounts, 0, 0, { type: 'flat', valueCents: 999_999 })
    expect(t.discountCents).toBe(100_000) // capped at preTax (subtotal, no markup)
    expect(t.grandTotalCents).toBe(0)
  })

  it('never goes negative for a pathological negative value', () => {
    const t = calcBudgetTotals(accounts, 0, 0, { type: 'flat', valueCents: -500 })
    expect(t.discountCents).toBe(0)
  })
})

describe('calcBudgetTotals — order of operations', () => {
  it('applies discount before tax (tax computed on the post-discount amount)', () => {
    const t = calcBudgetTotals(accounts, 0, 0.1, { type: 'flat', valueCents: 30_000 })
    // preTax = 100,000; afterDiscount = 70,000; tax = 7,000
    expect(t.taxCents).toBe(7_000)
    expect(t.grandTotalCents).toBe(77_000)
  })
})
