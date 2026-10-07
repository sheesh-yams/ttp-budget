// Invoice-first billing — pure pieces shared by createInvoiceFirst
// (src/server/actions/invoice-first.ts), the /invoices page and tests.
// Plain module, not 'use server'.
//
// "New project" mode builds a won project whose budget matches the invoice:
// the invoice lines become budget lines, the agency fee is 0, and the
// invoice's discount and tax go on the budget, so the primary phase's grand
// total (the project's value everywhere) equals the invoice total.

import type { Access } from '@/lib/access'
import { atLeast, resolveProjectPermissions, type ProjectArea } from '@/lib/permissions'
import type { InvoiceLineItemInput } from '@/lib/invoice-create'
import type { PaymentMilestone } from '@/types'

/** Project areas the new project needs at Edit: its budget, the won proposal and the invoice. */
const NEW_PROJECT_AREAS: ProjectArea[] = ['budget.costs', 'proposals', 'invoices']

/**
 * May this person create a project from an invoice? Projects Edit, and on a
 * project they create (baseline, no project role yet) Edit on the budget
 * costs, proposals and invoices. Owners always may.
 */
export function canCreateProjectFromInvoice(access: Pick<Access, 'isOwner' | 'can' | 'baseline'>): boolean {
  if (access.isOwner) return true
  if (!access.can('projects', 'EDIT')) return false
  const onNewProject = resolveProjectPermissions(access.baseline, [])
  return NEW_PROJECT_AREAS.every(a => atLeast(onNewProject[a], 'EDIT'))
}

/**
 * Budget lines hold quantity to 4 decimals; line totals are recomputed from
 * quantity × rate so the invoice and the budget add up identically. Returns
 * an error for an empty description or a non-positive quantity / rate.
 */
export function normalizeInvoiceLines(lines: InvoiceLineItemInput[]): { lines: InvoiceLineItemInput[] } | { error: string } {
  if (lines.length === 0) return { error: 'Add at least one line item.' }
  const out: InvoiceLineItemInput[] = []
  for (const li of lines) {
    const description = li.description.trim()
    const quantity    = Math.round(li.quantity * 10_000) / 10_000
    const rateCents   = Math.round(li.rateCents)
    if (!description) return { error: 'All line items need a description.' }
    if (!(quantity > 0)) return { error: 'All line items need a quantity greater than zero.' }
    if (!(rateCents > 0)) return { error: 'All line items need a rate greater than zero.' }
    out.push({
      ...li,
      description,
      quantity,
      unit:           RATE_UNITS.includes(li.unit as RateUnitValue) ? li.unit : 'FLAT',
      rateCents,
      lineTotalCents: Math.round(quantity * rateCents),
      ...(li.notes?.trim() ? { notes: li.notes.trim() } : { notes: undefined }),
    })
  }
  return { lines: out }
}

export const RATE_UNITS = ['FLAT', 'HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'EACH', 'MILE'] as const
export type RateUnitValue = typeof RATE_UNITS[number]

/**
 * The budget stores tax as a 0–1 fraction to 4 decimals, so an invoice tax
 * rate can carry at most 2 decimals (8.25%, not 8.875%) for the two totals
 * to match exactly.
 */
export function budgetTaxFraction(invoiceTaxPct: number): { fraction: number } | { error: string } {
  if (!Number.isFinite(invoiceTaxPct) || invoiceTaxPct < 0 || invoiceTaxPct >= 100) return { error: 'Tax must be between 0 and 100%.' }
  const hundredths = Math.round(invoiceTaxPct * 100)
  if (Math.abs(invoiceTaxPct * 100 - hundredths) > 1e-6) return { error: 'Use at most two decimals for tax (e.g. 8.25%).' }
  return { fraction: hundredths / 10_000 }
}

/** The won proposal's single payment milestone: the whole amount — the work is already delivered. */
export const INVOICE_FIRST_MILESTONE: PaymentMilestone = { id: 'full', name: 'Full payment', percentPct: 1, trigger: 'on_delivery' }
