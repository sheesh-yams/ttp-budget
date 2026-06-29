'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BudgetEditor } from '@/components/projects/BudgetEditor'
import type { BudgetWithPhases } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  DRAFT:    'Draft',
  SENT:     'Sent',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  EXPIRED:  'Expired',
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:    'bg-zinc-100 text-zinc-600',
  SENT:     'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-700',
  EXPIRED:  'bg-yellow-100 text-yellow-700',
}

interface Props {
  projectId: string
  budgets: BudgetWithPhases[]
  activeBudgetId: string
  budgetStatusMap: Record<string, string | null>
  canSeeFin: boolean
}

export function BudgetPageClient({
  projectId,
  budgets,
  activeBudgetId,
  budgetStatusMap,
  canSeeFin,
}: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(activeBudgetId)

  const activeBudget = budgets.find(b => b.id === selectedId) ?? budgets[0]

  function handleSelect(budgetId: string) {
    setSelectedId(budgetId)
    router.replace(`/projects/${projectId}/budget?budgetId=${budgetId}`, { scroll: false })
  }

  return (
    <div>
      {/* Tab strip */}
      <div className="mb-5 flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
        {budgets.map(b => {
          const status  = budgetStatusMap[b.id]
          const isActive = b.id === selectedId
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => handleSelect(b.id)}
              className={[
                'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 shrink-0 transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              ].join(' ')}
            >
              {b.phases[0]?.name ?? b.id.slice(-6)}
              {status && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                  {STATUS_LABELS[status] ?? status}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <BudgetEditor
        key={activeBudget.id}
        budget={activeBudget}
        projectId={projectId}
        canSeeFinancials={canSeeFin}
        readOnly={!canSeeFin}
      />
    </div>
  )
}
