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

// ─── Whole-budget snapshot (primary phase + visible option phases) ───────────
// The reads live with the caller (scoped server action, or a transaction with
// an explicit workspaceId); this turns the loaded rows into proposal content.
//
// A budget can have more than one phase flagged showAsProposalOption — those
// appear as client-facing tabs alongside the (always-included) primary phase.
// This snapshots each visible phase independently and returns the primary
// phase's data at the top level (the shape every content.budgetSnapshot
// consumer reads) plus the full list under `proposalOptions`, primary first.

export const BUDGET_SNAPSHOT_SELECT = {
  markupPct: true, taxPct: true,
  discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
} as const

type BudgetSnapshotRow = Prisma.BudgetGetPayload<{ select: typeof BUDGET_SNAPSHOT_SELECT }>

export function buildBudgetSnapshot(budget: BudgetSnapshotRow | null, allPhases: SnapshotPhase[]) {
  const budgetMarkupPct = budget?.markupPct != null ? Number(budget.markupPct) : 0
  const budgetTaxPct    = budget?.taxPct    != null ? Number(budget.taxPct)    : 0
  const discountConfig: BudgetDiscountConfig | null = budget?.discountType ? {
    type:       budget.discountType as 'flat' | 'pct',
    label:      budget.discountLabel,
    valueCents: budget.discountValueCents,
    valuePct:   budget.discountValuePct != null ? Number(budget.discountValuePct) : null,
  } : null

  const primaryPhase = allPhases.find(p => (p as unknown as { isPrimary: boolean }).isPrimary) ?? allPhases[0]

  // Primary always first, then any other phase explicitly flagged visible —
  // off by default, so a plain single-phase budget yields exactly one entry.
  const extraPhases = allPhases.filter(p =>
    p.id !== primaryPhase?.id && (p as unknown as { showAsProposalOption?: boolean }).showAsProposalOption
  )
  const visiblePhases = primaryPhase ? [primaryPhase, ...extraPhases] : []

  const proposalOptions = visiblePhases.map(phase => ({
    phaseId:      phase.id,
    phaseName:    (phase as unknown as { name: string }).name,
    isPrimary:    phase.id === primaryPhase?.id,
    overview:     phase.overview ?? '',
    about:        phase.description ?? '',
    deliverables: (phase.deliverables as { title: string; description: string; sectionIds?: string[] }[] | null) ?? [],
    budgetSnapshot: captureSinglePhaseSnapshot(phase, budgetMarkupPct, budgetTaxPct, discountConfig),
  }))

  const primaryOption = proposalOptions[0]

  return {
    // budgetSnapshot keeps its exact existing flat shape — every current
    // consumer (ProposalPublicView, ProposalPDF, the invoice/actuals content
    // readers) goes on reading content.budgetSnapshot exactly as before.
    budgetSnapshot: primaryOption?.budgetSnapshot ?? {
      accounts: [], sections: [], pageBreakBetweenAccounts: false, productionCents: 0,
      budgetMarkupPct, budgetTaxPct, discountCents: 0, discountLabel: '', totalCents: 0,
    },
    overview:     primaryOption?.overview ?? '',
    about:        primaryOption?.about ?? '',
    deliverables: primaryOption?.deliverables ?? [],
    // Only present when there's actually more than one visible phase.
    proposalOptions: proposalOptions.length > 1 ? proposalOptions : undefined,
  }
}

// ─── Proposal content (sections + payment terms) ─────────────────────────────

export function buildProposalContent(input: {
  overview: string
  about: string
  deliverables: { title: string; description: string; sectionIds?: string[] }[]
  milestones: { id: string; name: string; percentPct: number; trigger: string; customDate?: string }[]
  totalCents: number
}) {
  return {
    totalCents: input.totalCents,
    sections: [
      { type: 'about', title: 'The project', overview: input.overview, body: input.about },
      {
        type: 'scope',
        title: 'Deliverables',
        items: input.deliverables.map((d, i) => ({
          number:     String(i + 1).padStart(2, '0'),
          title:      d.title,
          description: d.description,
          ...(d.sectionIds?.length ? { sectionIds: d.sectionIds } : {}),
        })),
      },
      { type: 'budget', detailLevel: 'SUMMARY' },
      {
        type: 'terms',
        title: 'Payment terms',
        body: '',
        milestones: input.milestones,
      },
    ],
  }
}
