// What's left to invoice of a project's agreed budget — the "Remaining
// balance" option in the New invoice window. Plain module (jest-tested).
//
// Every invoice that isn't voided counts as billed — paid, sent, overdue and
// drafts — on the assumption an outstanding invoice will be paid. To fold an
// outstanding invoice into the final one, void it first (the balance grows).
// Extras billed on top of the budget (InvoiceLineItem.extra) and added-scope
// invoices don't use up the budget, so they're left out.

import { budgetBilledCents, type InvoiceForLines } from '@/lib/invoice-lines'

export interface BalanceCounted {
  number:      string
  status:      string
  /** The part of this invoice that billed the budget. */
  billedCents: number
}

export interface RemainingBalance {
  agreedCents:   number
  invoicedCents: number
  /** Never below 0. */
  remainingCents: number
  counted:       BalanceCounted[]
}

export function remainingBalance(args: { agreedCents: number; invoices: InvoiceForLines[] }): RemainingBalance {
  const counted: BalanceCounted[] = args.invoices
    .filter(inv => inv.status !== 'VOID' && !inv.isScopeAddition)
    .map(inv => ({ number: inv.number ?? '', status: inv.status, billedCents: budgetBilledCents(inv) }))
    .filter(c => c.billedCents !== 0)
  const invoicedCents = counted.reduce((s, c) => s + c.billedCents, 0)
  return { agreedCents: args.agreedCents, invoicedCents, remainingCents: Math.max(0, args.agreedCents - invoicedCents), counted }
}
