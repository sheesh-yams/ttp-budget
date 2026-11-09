// How much of a booked project is still to be invoiced. Plain module
// (jest-tested), used by the /clients cards and the client page.
//
// Measured against the project's value as every other page shows it (the
// Projects page, and the project's invoices page the "Invoice" button opens):
// the live primary-phase total, or the won proposal's signed total when there's
// no budget, plus added-scope invoices. Drafts aren't invoiced yet; void
// invoices don't count. Wrapped and archived projects are done — whatever is
// left there was written off, not forgotten.

import { addedScopeCents } from '@/lib/project-value'

export interface BillingInvoice {
  status:           string
  totalCents:       number
  isScopeAddition?: boolean
}

export interface BillingProject {
  /** Live primary-phase grand total (0 when there's no budget). */
  budgetCents:        number
  /** Signed total of the won proposal; null when not won or not recorded. */
  approvedTotalCents: number | null
  won:                boolean
  archived:           boolean
  /** Project status WRAPPED — closed out. */
  wrapped?:           boolean
  invoices:           BillingInvoice[]
}

export function projectToInvoiceCents(p: BillingProject): number {
  if (p.archived || p.wrapped) return 0
  const sent = p.invoices.filter(i => i.status !== 'DRAFT' && i.status !== 'VOID')
  const invoiced = sent.reduce((s, i) => s + i.totalCents, 0)
  // Booked work only: won, or already billing.
  if (!p.won && sent.length === 0) return 0
  const agreed = p.budgetCents > 0 ? p.budgetCents : (p.approvedTotalCents ?? 0)
  return Math.max(0, agreed + addedScopeCents(p.invoices) - invoiced)
}

export interface ToInvoice { projectId: string; name: string; cents: number }

/** Projects with something left to invoice, largest first. */
export function toInvoiceList(projects: (BillingProject & { id: string; name: string })[]): ToInvoice[] {
  return projects
    .map(p => ({ projectId: p.id, name: p.name, cents: projectToInvoiceCents(p) }))
    .filter(p => p.cents > 0)
    .sort((a, b) => b.cents - a.cents)
}
