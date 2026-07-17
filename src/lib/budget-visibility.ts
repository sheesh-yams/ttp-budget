/**
 * budget-visibility.ts — role-aware budget redaction (Feature F9).
 *
 * Collaborators may READ budgets but must never see margin / markup / agency-fee
 * data. We strip that data on the SERVER before it is serialised into any client
 * payload (RSC props or server-action return), so it never crosses the network —
 * not merely hidden with CSS. See the F9 constraint.
 *
 * Pure functions (no 'use server') so they can be imported by Server Components
 * and server actions alike.
 */

import type { UserRole } from '@prisma/client'

/** OWNER + PRODUCER see full financials; COLLABORATOR is margin-blind. */
export function canSeeFinancials(role: UserRole): boolean {
  return role === 'OWNER' || role === 'PRODUCER'
}

// Structural shapes — kept loose so this works against Prisma payloads whose
// Decimal fields may be Decimal | number | null.
type LineItemLike = Record<string, unknown> & { markupPct?: unknown; hasMarkup?: unknown }
type AccountLike  = Record<string, unknown> & { lineItems?: LineItemLike[]; children?: AccountLike[] }
type PhaseLike    = Record<string, unknown> & { accounts?: AccountLike[] }
type BudgetLike   = Record<string, unknown> & {
  markupPct?: unknown; phases?: PhaseLike[]
  discountType?: unknown; discountLabel?: unknown; discountValueCents?: unknown; discountValuePct?: unknown
}

function stripAccount<A extends AccountLike>(acc: A): A {
  return {
    ...acc,
    lineItems: (acc.lineItems ?? []).map(li => ({
      ...li,
      markupPct: null,    // per-line markup override removed
      hasMarkup: false,   // agency fee never applies → totals compute to net
    })),
    // Preserve nesting; only map when children are present.
    ...(Array.isArray(acc.children) ? { children: acc.children.map(stripAccount) } : {}),
  }
}

/**
 * Returns a budget payload safe to send to `role`. For non-financial roles the
 * budget-level markup (agency fee) and every per-line markup are removed, so all
 * downstream totals resolve to net cost with no margin recoverable from the wire.
 */
export function stripBudgetForRole<B extends BudgetLike>(budget: B, role: UserRole): B {
  if (canSeeFinancials(role)) return budget
  return {
    ...budget,
    markupPct: null, // agency fee — gone from the payload entirely
    // Discount amount is margin-adjacent (reveals a negotiated concession) —
    // strip it the same way, not just hide it client-side.
    discountType: null,
    discountLabel: null,
    discountValueCents: null,
    discountValuePct: null,
    ...(Array.isArray(budget.phases)
      ? { phases: budget.phases.map(ph => ({ ...ph, accounts: (ph.accounts ?? []).map(stripAccount) })) }
      : {}),
  }
}
