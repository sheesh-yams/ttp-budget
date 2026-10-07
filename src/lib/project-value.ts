// A project's value = its primary budget phase's grand total, plus any
// invoices billed as added scope on top of it (invoice-first billing — a
// scope increase on a won project). Plain module, shared by the projects
// page, dashboard, project page and project invoices page.
//
// Milestone % amounts and actuals burn stay on the budget alone: 50% of the
// agreed budget doesn't include later extras, and actuals compare to costs.

export interface ScopeInvoiceLike {
  status:          string
  totalCents:      number
  isScopeAddition?: boolean
}

/** Sum of non-void added-scope invoices. */
export function addedScopeCents(invoices: ScopeInvoiceLike[]): number {
  return invoices.reduce((s, inv) => s + (inv.isScopeAddition && inv.status !== 'VOID' ? inv.totalCents : 0), 0)
}

/** Budget grand total + added scope. */
export function projectValueCents(budgetGrossCents: number, invoices: ScopeInvoiceLike[]): number {
  return budgetGrossCents + addedScopeCents(invoices)
}
