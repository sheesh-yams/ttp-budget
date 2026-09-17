// Pure, framework-agnostic pieces of the proposal budget-snapshot logic,
// shared between the authenticated server action (src/server/actions/proposals.ts,
// a 'use server' file that can only export async functions) and the public,
// unauthenticated /p/[token] page — which needs the exact same per-phase
// accounts/totals shape for its live draft preview but has no Clerk session
// and so can't call getScopedDb()-based server actions.

import type { Prisma } from '@prisma/client'
import { calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'

export const PHASE_TREE_INCLUDE = {
  sections: {
    orderBy: { orderIndex: 'asc' as const },
    select:  { id: true, title: true, orderIndex: true },
  },
  accounts: {
    where: { parentId: null },
    orderBy: { order: 'asc' as const },
    include: {
      lineItems: { orderBy: { order: 'asc' as const } },
      children: {
        orderBy: { order: 'asc' as const },
        include: { lineItems: { orderBy: { order: 'asc' as const } } },
      },
    },
  },
}

export type SnapshotPhase = Prisma.PhaseGetPayload<{ include: typeof PHASE_TREE_INCLUDE }> & {
  overview?: string | null
  description?: string | null
  deliverables?: unknown
  pageBreakBetweenAccounts?: boolean
}

export function captureSinglePhaseSnapshot(
  phase: SnapshotPhase,
  budgetMarkupPct: number,
  budgetTaxPct: number,
  discountConfig: BudgetDiscountConfig | null,
) {
  const sections = phase.sections.map(s => ({ id: s.id, title: s.title }))

  const accounts = phase.accounts.map(acc => ({
    id:        acc.id,
    name:      acc.name,
    code:      acc.code,
    order:     acc.order,
    sectionId: (acc as unknown as { sectionId?: string }).sectionId ?? null,
    lineItems: acc.lineItems.map(i => ({
      id:              i.id,
      description:     i.description,
      quantity:        Number(i.quantity),
      quantityFormula: i.quantityFormula ?? null,
      unit:            i.unit,
      rateCents:       i.rateCents,
      markupPct:       i.markupPct != null ? Number(i.markupPct) : null,
      notes:           i.notes,
      order:           i.order,
    })),
    children: acc.children.map(child => ({
      id:       child.id,
      name:     child.name,
      order:    child.order,
      lineItems: child.lineItems.map(i => ({
        id:              i.id,
        description:     i.description,
        quantity:        Number(i.quantity),
        quantityFormula: i.quantityFormula ?? null,
        unit:            i.unit,
        rateCents:       i.rateCents,
        markupPct:       i.markupPct != null ? Number(i.markupPct) : null,
        notes:           i.notes,
        order:           i.order,
      })),
    })),
  }))

  const totals = calcBudgetTotals(accounts as unknown as AccountInput[], budgetMarkupPct, budgetTaxPct, discountConfig)
  const productionCents = totals.subtotalCents
  const { discountCents, discountLabel } = totals
  const totalCents = totals.grandTotalCents
  const pageBreakBetweenAccounts = phase.pageBreakBetweenAccounts ?? false

  return { accounts, sections, pageBreakBetweenAccounts, productionCents, budgetMarkupPct, budgetTaxPct, discountCents, discountLabel, totalCents }
}
