// A project's value = its primary budget phase's grand total, plus any
// invoices billed as added scope on top of it (invoice-first billing — a
// scope increase on a won project). Plain module, shared by the projects
// page, dashboard, project page and project invoices page.
//
// Milestone % amounts and actuals burn stay on the budget alone: 50% of the
// agreed budget doesn't include later extras, and actuals compare to costs.

import { extraCents } from '@/lib/invoice-lines'

export interface ScopeInvoiceLike {
  status:          string
  totalCents:      number
  isScopeAddition?: boolean
  /** Invoice.lineItems — extra lines (billed on top of the budget) add to the value. */
  lineItems?:      unknown
}

/**
 * Billed on top of the budget, from non-void invoices: whole added-scope
 * invoices, plus extra lines (e.g. unplanned costs from Actuals) on any other
 * invoice. An added-scope invoice's extras are already in its total.
 */
export function addedScopeCents(invoices: ScopeInvoiceLike[]): number {
  return invoices.reduce((s, inv) => {
    if (inv.status === 'VOID') return s
    return s + (inv.isScopeAddition ? inv.totalCents : extraCents(inv))
  }, 0)
}

/** Budget grand total + added scope. */
export function projectValueCents(budgetGrossCents: number, invoices: ScopeInvoiceLike[]): number {
  return budgetGrossCents + addedScopeCents(invoices)
}
