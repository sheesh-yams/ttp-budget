import { stripBudgetForRole, canSeeFinancials } from '@/lib/budget-visibility'

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

describe('canSeeFinancials', () => {
  it('OWNER and PRODUCER see financials; COLLABORATOR does not', () => {
    expect(canSeeFinancials('OWNER')).toBe(true)
    expect(canSeeFinancials('PRODUCER')).toBe(true)
    expect(canSeeFinancials('COLLABORATOR')).toBe(false)
  })
})

describe('stripBudgetForRole — discount is margin data, must not cross the wire', () => {
  it('passes the budget through unchanged for OWNER/PRODUCER', () => {
    const result = stripBudgetForRole(financialBudget, 'OWNER')
    expect(result).toBe(financialBudget) // same reference — no stripping performed
  })

  it('nulls the budget-level discount fields for COLLABORATOR', () => {
    const result = stripBudgetForRole(financialBudget, 'COLLABORATOR')
    expect(result.discountType).toBeNull()
    expect(result.discountLabel).toBeNull()
    expect(result.discountValueCents).toBeNull()
    expect(result.discountValuePct).toBeNull()
    expect(result.markupPct).toBeNull()
  })

  it('still strips per-line markup/hasMarkup for COLLABORATOR (existing behavior, regression guard)', () => {
    const result = stripBudgetForRole(financialBudget, 'COLLABORATOR')
    const item = result.phases[0].accounts[0].lineItems[0]
    expect(item.markupPct).toBeNull()
    expect(item.hasMarkup).toBe(false)
    const childItem = result.phases[0].accounts[0].children![0].lineItems[0]
    expect(childItem.markupPct).toBeNull()
    expect(childItem.hasMarkup).toBe(false)
  })
})
