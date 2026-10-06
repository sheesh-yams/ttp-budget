import { stripBudgetForAccess } from '@/lib/budget-visibility'

const financialBudget = {
  markupPct: 0.1,
  discountType: 'flat',
  discountLabel: 'Loyalty discount',
  discountValueCents: 5_000,
  discountValuePct: null,
  phases: [{
    accounts: [{
      lineItems: [{ id: '1', markupPct: 0.05, hasMarkup: true }],
      children: [{
        lineItems: [{ id: '2', markupPct: 0.02, hasMarkup: true }],
      }],
    }],
  }],
}

// Without Budget margin (what a Collaborator has), discount and markup are
// margin data and must not cross the wire.
const noMargin = { costs: true, margin: false }

describe('stripBudgetForAccess — discount is margin data, must not cross the wire', () => {
  it('passes the budget through unchanged with costs + margin', () => {
    const result = stripBudgetForAccess(financialBudget, { costs: true, margin: true })
    expect(result).toBe(financialBudget) // same reference — no stripping performed
  })

  it('nulls the budget-level discount fields without margin', () => {
    const result = stripBudgetForAccess(financialBudget, noMargin)
    expect(result.discountType).toBeNull()
    expect(result.discountLabel).toBeNull()
    expect(result.discountValueCents).toBeNull()
    expect(result.discountValuePct).toBeNull()
    expect(result.markupPct).toBeNull()
  })

  it('strips per-line markup/hasMarkup without margin (regression guard)', () => {
    const result = stripBudgetForAccess(financialBudget, noMargin)
    const item = result.phases[0].accounts[0].lineItems[0]
    expect(item.markupPct).toBeNull()
    expect(item.hasMarkup).toBe(false)
    const childItem = result.phases[0].accounts[0].children![0].lineItems[0]
    expect(childItem.markupPct).toBeNull()
    expect(childItem.hasMarkup).toBe(false)
  })
})

describe('stripBudgetForAccess (roles Phase 2)', () => {
  // Deep fixture: rates at every nesting level the budget page sends.
  const budget = {
    markupPct: 0.2, taxPct: 0.08,
    discountType: 'pct', discountLabel: 'Promo', discountValueCents: null, discountValuePct: 0.1,
    phases: [{
      accounts: [{
        lineItems: [{ id: 'a', description: 'Director', quantity: 2, rateCents: 150_000, rateCardId: 'rc1', markupPct: 0.05, hasMarkup: true }],
        children: [{
          lineItems: [{ id: 'b', description: 'Gaffer', quantity: 1, rateCents: 50_000, rateCardId: null, markupPct: null }],
          children: [{ lineItems: [{ id: 'c', description: 'Grip', quantity: 1, rateCents: 40_000, rateCardId: 'rc2', markupPct: 0.1 }] }],
        }],
      }],
    }],
  }
  const allLines = (b: typeof budget) => {
    const out: Record<string, unknown>[] = []
    const walk = (accs: { lineItems?: Record<string, unknown>[]; children?: unknown[] }[]) =>
      accs.forEach(a => { out.push(...(a.lineItems ?? [])); walk((a.children ?? []) as never) })
    b.phases.forEach(ph => walk(ph.accounts as never))
    return out
  }

  it('full access passes through unchanged', () => {
    expect(stripBudgetForAccess(budget, { costs: true, margin: true })).toBe(budget)
  })

  it('costs without margin: rates kept, markup / fee / discount gone, tax kept', () => {
    const r = stripBudgetForAccess(budget, { costs: true, margin: false })
    expect(r.markupPct).toBeNull()
    expect(r.discountType).toBeNull()
    expect(r.discountValuePct).toBeNull()
    expect(r.taxPct).toBe(0.08)
    const lines = allLines(r)
    expect(lines.map(l => l.rateCents)).toEqual([150_000, 50_000, 40_000])
    expect(lines.every(l => l.markupPct === null)).toBe(true)
  })

  it('no costs: every rate zeroed at every depth, rate cards and tax gone, lines kept', () => {
    const r = stripBudgetForAccess(budget, { costs: false, margin: false })
    const lines = allLines(r)
    expect(lines).toHaveLength(3)
    expect(lines.every(l => l.rateCents === 0)).toBe(true)
    expect(lines.every(l => l.rateCardId === null)).toBe(true)
    expect(lines.every(l => l.markupPct === null)).toBe(true)
    expect(lines.map(l => l.description)).toEqual(['Director', 'Gaffer', 'Grip'])
    expect(lines.map(l => l.quantity)).toEqual([2, 1, 1])
    expect(r.taxPct).toBeNull()
    expect(r.markupPct).toBeNull()
    // Nothing money-shaped left anywhere in the payload.
    expect(JSON.stringify(r)).not.toMatch(/150000|50000|40000|0\.2\b|0\.08/)
  })

  it('does not mutate the input', () => {
    stripBudgetForAccess(budget, { costs: false, margin: false })
    expect(budget.phases[0].accounts[0].lineItems[0].rateCents).toBe(150_000)
  })
})
