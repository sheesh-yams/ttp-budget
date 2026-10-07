import { addedScopeCents, projectValueCents } from '@/lib/project-value'
import { budgetTaxFraction, canCreateProjectFromInvoice, normalizeInvoiceLines } from '@/lib/invoice-first'
import { calcInvoiceTotals } from '@/lib/invoice-totals'
import { calcBudgetTotals } from '@/lib/totals'
import { PROJECT_AREA_KEYS, type ProjectPermissions, type Level } from '@/lib/permissions'
import type { InvoiceLineItemInput } from '@/lib/invoice-create'

const line = (over: Partial<InvoiceLineItemInput> = {}): InvoiceLineItemInput => ({
  id: 'l', description: 'Edit day', quantity: 1, unit: 'DAY', rateCents: 100_00, lineTotalCents: 100_00, ...over,
})

describe('project value with added scope', () => {
  const invoices = [
    { status: 'PAID',  totalCents: 5_000_00, isScopeAddition: false },
    { status: 'SENT',  totalCents: 1_200_00, isScopeAddition: true },
    { status: 'VOID',  totalCents: 9_999_00, isScopeAddition: true },
    { status: 'DRAFT', totalCents: 300_00,   isScopeAddition: true },
    { status: 'PAID',  totalCents: 700_00 },
  ]
  it('sums non-void added-scope invoices only', () => {
    expect(addedScopeCents(invoices)).toBe(1_500_00)
    expect(addedScopeCents([])).toBe(0)
  })
  it('adds it to the budget total', () => {
    expect(projectValueCents(10_000_00, invoices)).toBe(11_500_00)
    expect(projectValueCents(10_000_00, [])).toBe(10_000_00)
  })
})

describe('new project budget matches the invoice', () => {
  // The budget createInvoiceFirst writes: fee 0, the invoice tax as a fraction,
  // the invoice discount as a flat budget discount, the lines as budget lines.
  function both(lines: InvoiceLineItemInput[], taxPct: number, discountCents: number) {
    const norm = normalizeInvoiceLines(lines)
    if ('error' in norm) throw new Error(norm.error)
    const tax = budgetTaxFraction(taxPct)
    if ('error' in tax) throw new Error(tax.error)
    const invoice = calcInvoiceTotals({ lineTotalsCents: norm.lines.map(l => l.lineTotalCents), discountCents, taxPct })
    const budget  = calcBudgetTotals(
      [{ lineItems: norm.lines.map(l => ({ quantity: l.quantity, rateCents: l.rateCents, markupPct: null })) }],
      0, tax.fraction,
      invoice.discountCents > 0 ? { type: 'flat', valueCents: invoice.discountCents } : null,
    )
    return { invoice: invoice.totalCents, budget: budget.grandTotalCents }
  }

  it.each([
    ['plain', [line()], 0, 0],
    ['mixed units and fractional quantities', [line({ quantity: 2.5, unit: 'HOUR', rateCents: 85_50 }), line({ id: 'b', quantity: 1, unit: 'FLAT', rateCents: 1_234_56 }), line({ id: 'c', quantity: 0.3333, unit: 'DAY', rateCents: 999_99 })], 0, 0],
    ['tax', [line({ quantity: 3, rateCents: 1_250_00 })], 8.25, 0],
    ['discount + tax', [line({ quantity: 2, rateCents: 2_000_00 }), line({ id: 'b', rateCents: 333_33 })], 10.5, 150_00],
    ['discount larger than the lines (clamped)', [line()], 0, 500_00],
  ])('%s', (_name, lines, tax, discount) => {
    const r = both(lines as InvoiceLineItemInput[], tax as number, discount as number)
    expect(r.budget).toBe(r.invoice)
  })

  it('7.25% on $30.00 lands on half a cent — both round it up', () => {
    const r = both([line({ rateCents: 30_00 })], 7.25, 0)
    expect(r.invoice).toBe(30_00 + 218)
    expect(r.budget).toBe(r.invoice)
  })

  it('agrees for every 2-decimal rate across a range of amounts (half-cent cases)', () => {
    const rates = [5, 6.25, 7.25, 7.5, 8.25, 8.33, 8.88, 9.5, 10.25, 10.35, 13.75, 0.01, 99.99]
    let mismatches = 0
    for (const rate of rates) {
      const fraction = (budgetTaxFraction(rate) as { fraction: number }).fraction
      for (let base = 1; base <= 40_000; base += 7) {
        const inv = calcInvoiceTotals({ lineTotalsCents: [base], taxPct: rate }).totalCents
        const bud = calcBudgetTotals([{ lineItems: [{ quantity: 1, rateCents: base, markupPct: null }] }], 0, fraction).grandTotalCents
        if (inv !== bud) mismatches++
      }
    }
    expect(mismatches).toBe(0)
  })

  it('recomputes line totals from quantity × rate (never trusts the client)', () => {
    const norm = normalizeInvoiceLines([line({ quantity: 2, rateCents: 100_00, lineTotalCents: 1 })])
    expect('lines' in norm && norm.lines[0].lineTotalCents).toBe(200_00)
  })
  it('rounds quantity to the budget’s 4 decimals', () => {
    const norm = normalizeInvoiceLines([line({ quantity: 1.234567 })])
    expect('lines' in norm && norm.lines[0].quantity).toBe(1.2346)
  })
  it('rejects empty, zero and unknown-unit lines sensibly', () => {
    expect(normalizeInvoiceLines([])).toEqual({ error: expect.any(String) })
    expect(normalizeInvoiceLines([line({ description: '  ' })])).toEqual({ error: expect.any(String) })
    expect(normalizeInvoiceLines([line({ quantity: 0 })])).toEqual({ error: expect.any(String) })
    expect(normalizeInvoiceLines([line({ rateCents: 0 })])).toEqual({ error: expect.any(String) })
    const odd = normalizeInvoiceLines([line({ unit: 'PARSEC' })])
    expect('lines' in odd && odd.lines[0].unit).toBe('FLAT')
  })
  it('tax: two decimals at most, so the budget can hold it exactly', () => {
    expect(budgetTaxFraction(8.25)).toEqual({ fraction: 0.0825 })
    expect(budgetTaxFraction(0)).toEqual({ fraction: 0 })
    expect(budgetTaxFraction(8.875)).toEqual({ error: expect.any(String) })
    expect(budgetTaxFraction(-1)).toEqual({ error: expect.any(String) })
  })
})

describe('who may create a project from an invoice', () => {
  const perms = (level: Level, over: Partial<ProjectPermissions> = {}) =>
    ({ ...Object.fromEntries(PROJECT_AREA_KEYS.map(k => [k, level])), ...over }) as ProjectPermissions
  const access = (projectsEdit: boolean, baseline: ProjectPermissions, isOwner = false) => ({
    isOwner, baseline, can: (area: string, level = 'VIEW') => area === 'projects' && (projectsEdit || level === 'VIEW'),
  }) as Parameters<typeof canCreateProjectFromInvoice>[0]

  it('owners always', () => expect(canCreateProjectFromInvoice(access(false, perms('NONE'), true))).toBe(true))
  it('needs Projects edit', () => expect(canCreateProjectFromInvoice(access(false, perms('EDIT')))).toBe(false))
  it('needs budget costs, proposals and invoices edit on a new project', () => {
    expect(canCreateProjectFromInvoice(access(true, perms('EDIT')))).toBe(true)
    expect(canCreateProjectFromInvoice(access(true, perms('EDIT', { proposals: 'VIEW' })))).toBe(false)
    expect(canCreateProjectFromInvoice(access(true, perms('EDIT', { invoices: 'NONE' })))).toBe(false)
    // Costs need lines (applyProjectDependencies caps costs at lines).
    expect(canCreateProjectFromInvoice(access(true, perms('EDIT', { 'budget.lines': 'VIEW' })))).toBe(false)
  })
})
