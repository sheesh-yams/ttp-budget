// Shared invoice-row building for every "create an invoice" path —
// createInvoice (from a proposal) and createInvoiceFirst (invoice-first:
// new project or existing project). Plain module, not 'use server'.

import { z } from 'zod'
import { calcInvoiceTotals, calendarDateToStored } from '@/lib/invoice-totals'
import { generatePublicToken } from '@/lib/secure-token'

export const invoiceLineItemSchema = z.object({
  id:             z.string(),
  description:    z.string(),
  quantity:       z.number(),
  unit:           z.string(),
  rateCents:      z.number().int(),
  lineTotalCents: z.number().int(),
  notes:          z.string().optional(),
})
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>

// ─── Payment terms label ────────────────────────────────────────────────────
// Derived from the actual gap between issue date and due date, rather than a
// fixed workspace default — a workspace-wide "Net 30" default is wrong for
// any invoice whose due date was picked custom instead of using that default.
const COMMON_TERM_DAYS = [15, 30, 45, 60, 90]

export function deriveInvoicePaymentTerms(issueDate: Date, dueDate: Date): string | null {
  const days = Math.round((dueDate.getTime() - issueDate.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Due on Receipt'
  if (COMMON_TERM_DAYS.includes(days)) return `Net ${days}`
  return null
}

/**
 * Calendar dates stored at midday UTC (see calendarDateToStored). Issue date
 * defaults to now. Check with `'error' in result` (strict is off — no narrowing on a flag).
 */
export function resolveInvoiceDates(
  issueDateISO: string | undefined, dueDateISO: string,
): { issueDate: Date; dueDate: Date } | { error: string } {
  const issueDate = issueDateISO ? calendarDateToStored(issueDateISO) : new Date()
  const dueDate   = calendarDateToStored(dueDateISO.slice(0, 10))
  if (!issueDate || !dueDate) return { error: 'Invalid date' }
  if (issueDateISO && dueDate < issueDate) return { error: 'The due date can’t be before the invoice date.' }
  return { issueDate, dueDate }
}

/**
 * The Invoice create payload. Totals are always recomputed from the lines —
 * never trust totals sent by the client. The caller supplies the number
 * (generateInvoiceNumber) only once the invoice is definitely being created.
 */
export function buildInvoiceCreateData(input: {
  projectId:        string
  clientId:         string
  budgetId:         string | null
  number:           string
  kind:             'DEPOSIT' | 'PROGRESS' | 'FINAL' | 'STANDALONE'
  title:            string
  issueDate:        Date
  dueDate:          Date
  lineItems:        InvoiceLineItemInput[]
  taxPct:           number
  discountCents?:   number
  notes?:           string | null
  terms?:           string | null
  defaultTerms?:    string | null
  paymentTerms?:    string | null
  poNumber?:        string | null
  isScopeAddition?: boolean
  createdById:      string
}) {
  const totals = calcInvoiceTotals({
    lineTotalsCents: input.lineItems.map(li => li.lineTotalCents),
    discountCents:   input.discountCents ?? 0,
    taxPct:          input.taxPct,
  })
  return {
    projectId:       input.projectId,
    clientId:        input.clientId,
    budgetId:        input.budgetId,
    number:          input.number,
    publicToken:     generatePublicToken(),
    kind:            input.kind,
    title:           input.title,
    issueDate:       input.issueDate,
    dueDate:         input.dueDate,
    lineItems:       input.lineItems as object[],
    subtotalCents:   totals.subtotalCents,
    taxPct:          input.taxPct,
    taxCents:        totals.taxCents,
    discountCents:   totals.discountCents,
    totalCents:      totals.totalCents,
    notes:           input.notes ?? null,
    terms:           input.terms ?? input.defaultTerms ?? null,
    paymentTerms:    input.paymentTerms ?? deriveInvoicePaymentTerms(input.issueDate, input.dueDate),
    poNumber:        input.poNumber ?? null,
    isScopeAddition: input.isScopeAddition ?? false,
    createdById:     input.createdById,
  }
}
