// Gross total (net + markup − discount + tax) of each project's primary budget
// phase, keyed by projectId. Shared by the projects page and scripts so the
// number always matches what proposals show. Plain module.

import { calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'

/** Prisma `select` for `phase.findMany({ where: { isPrimary: true } })`. */
export const PRIMARY_PHASE_TOTALS_SELECT = {
  budget: {
    select: {
      projectId: true,
      markupPct: true,
      taxPct:    true,
      discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
    },
  },
  accounts: {
    where:  { parentId: null },
    select: {
      lineItems: { select: { quantity: true, rateCents: true, markupPct: true } },
      children:  { select: { lineItems: { select: { quantity: true, rateCents: true, markupPct: true } } } },
    },
  },
} as const

type DecimalLike = { toString(): string } | number | null

export interface PrimaryPhaseRow {
  budget: {
    projectId: string
    markupPct: DecimalLike
    taxPct:    DecimalLike
    discountType: string | null
    discountLabel: string | null
    discountValueCents: number | null
    discountValuePct: DecimalLike
  } | null
  accounts: unknown[]
}

export function primaryPhaseTotals(rows: PrimaryPhaseRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const phase of rows) {
    const b = phase.budget
    if (!b?.projectId) continue
    const discount: BudgetDiscountConfig | null = b.discountType ? {
      type:       b.discountType as 'flat' | 'pct',
      label:      b.discountLabel,
      valueCents: b.discountValueCents,
      valuePct:   b.discountValuePct != null ? Number(b.discountValuePct) : null,
    } : null
    const { grandTotalCents } = calcBudgetTotals(
      phase.accounts as unknown as AccountInput[],
      b.markupPct != null ? Number(b.markupPct) : 0,
      b.taxPct    != null ? Number(b.taxPct)    : 0,
      discount,
    )
    out.set(b.projectId, grandTotalCents)
  }
  return out
}
