'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { BudgetReadOnly } from '@/components/budget/BudgetReadOnly'
import { sumAccount, calcBudgetTotals, type AccountInput } from '@/lib/totals'
import type { BudgetWithPhases } from '@/types'
import type { SerialAccount, SerialBudgetSection } from '@/components/budget/BudgetReadOnly'

const STATUS_LABELS: Record<string, string> = {
  DRAFT:    'Draft',
  SENT:     'Sent',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  EXPIRED:  'Expired',
}

const STATUS_PILL: Record<string, string> = {
  DRAFT:    'bg-zinc-100 text-zinc-600',
  SENT:     'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-700',
  EXPIRED:  'bg-yellow-100 text-yellow-700',
}

interface BudgetMeta {
  id: string
  /** Name from primary phase */
  name: string
  proposalStatus: string | null
  proposalTitle: string | null
}

interface Props {
  projectId: string
  budgets: BudgetWithPhases[]
  primaryBudgetId: string
  budgetMeta: BudgetMeta[]
}

function serializeAccounts(budget: BudgetWithPhases): { accounts: SerialAccount[]; sections: SerialBudgetSection[]; productionCents: number; markupPct: number; taxPct: number; totalCents: number } {
  const primaryPhase = budget.phases.find(p => p.isPrimary) ?? budget.phases[0]
  if (!primaryPhase) return { accounts: [], sections: [], productionCents: 0, markupPct: 0, taxPct: 0, totalCents: 0 }

  const rawAccounts = primaryPhase.accounts as unknown as AccountInput[]
  const productionCents = rawAccounts.reduce((sum, acc) => sum + sumAccount(acc), 0)
  const markupPct  = Number((budget as unknown as { markupPct?: number | null }).markupPct ?? 0)
  const taxPct     = Number((budget as unknown as { taxPct?: number | null }).taxPct ?? 0)

  let totalCents = productionCents
  if (markupPct > 0 || taxPct > 0) {
    const totals = calcBudgetTotals(rawAccounts, markupPct, taxPct)
    totalCents = totals.grandTotalCents
  }

  const accounts: SerialAccount[] = (primaryPhase.accounts as unknown as Array<{
    id: string; name: string; code: string | null; sectionId?: string | null
    lineItems: Array<{ id: string; description: string; quantity: unknown; unit: string; rateCents: number; markupPct: unknown; notes: string | null; quantityFormula: string | null }>
    children: Array<{ id: string; name: string; lineItems: Array<{ id: string; description: string; quantity: unknown; unit: string; rateCents: number; markupPct: unknown; notes: string | null; quantityFormula: string | null }> }>
  }>).map(acc => ({
    id: acc.id,
    name: acc.name,
    code: acc.code,
    sectionId: acc.sectionId ?? null,
    lineItems: acc.lineItems.map(li => ({
      id: li.id,
      description: li.description,
      quantity: Number(li.quantity),
      unit: li.unit,
      rateCents: li.rateCents,
      markupPct: li.markupPct != null ? Number(li.markupPct) : null,
      notes: li.notes,
      quantityFormula: li.quantityFormula,
    })),
    children: (acc.children ?? []).map(child => ({
      id: child.id,
      name: child.name,
      lineItems: child.lineItems.map(li => ({
        id: li.id,
        description: li.description,
        quantity: Number(li.quantity),
        unit: li.unit,
        rateCents: li.rateCents,
        markupPct: li.markupPct != null ? Number(li.markupPct) : null,
        notes: li.notes,
        quantityFormula: li.quantityFormula,
      })),
    })),
  }))

  const sections: SerialBudgetSection[] = ((primaryPhase as unknown as { sections?: Array<{ id: string; title: string }> }).sections ?? []).map(s => ({ id: s.id, title: s.title }))

  return { accounts, sections, productionCents, markupPct, taxPct, totalCents }
}

export function BudgetBreakdown({ projectId, budgets, primaryBudgetId, budgetMeta }: Props) {
  const [selectedId, setSelectedId] = useState(primaryBudgetId)

  const activeBudget = budgets.find(b => b.id === selectedId) ?? budgets[0]
  const activeMeta   = budgetMeta.find(m => m.id === selectedId) ?? budgetMeta[0]
  const { accounts, sections, productionCents, markupPct, taxPct, totalCents } = serializeAccounts(activeBudget)

  const multibudget = budgets.length > 1

  return (
    <section className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground">Budget Breakdown</h2>
        <div className="flex items-center gap-3">
          {/* Budget selector (multi-budget only) */}
          {multibudget && (
            <div className="relative flex items-center">
              <label className="sr-only" htmlFor="budget-select">Budget</label>
              <span className="absolute left-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pointer-events-none">Budget</span>
              <div className="relative">
                <select
                  id="budget-select"
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="appearance-none rounded-md border border-input bg-card pl-16 pr-7 py-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {budgetMeta.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          )}
          {/* Edit link */}
          <Link
            href={`/projects/${projectId}/budget?budgetId=${activeBudget.id}`}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Edit in Budget →
          </Link>
        </div>
      </div>

      {/* Sub-header */}
      {activeMeta && (activeMeta.proposalTitle || activeMeta.proposalStatus) && (
        <div className="flex items-center gap-2 mb-4">
          {activeMeta.proposalTitle && (
            <span className="text-sm text-muted-foreground">{activeMeta.proposalTitle}</span>
          )}
          {activeMeta.proposalStatus && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[activeMeta.proposalStatus] ?? 'bg-zinc-100 text-zinc-600'}`}>
              {STATUS_LABELS[activeMeta.proposalStatus] ?? activeMeta.proposalStatus}
            </span>
          )}
        </div>
      )}

      {/* Budget render */}
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No line items in this budget yet.</p>
      ) : (
        <BudgetReadOnly
          accounts={accounts}
          totalCents={totalCents}
          productionCents={productionCents}
          budgetMarkupPct={markupPct}
          budgetTaxPct={taxPct}
          budgetSections={sections}
          showPaymentSchedule={false}
          variant="overview"
        />
      )}
    </section>
  )
}
