'use client'

/**
 * BudgetEmptyState
 *
 * Client wrapper for the "no budget yet" state on /projects/[id]/budget.
 * Needs to be a client component (unlike the old inline server-action form
 * it replaces) because "Start from an existing budget" opens the picker
 * modal, which needs interactive state.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createBudget } from '@/server/actions/budgets'
import { BudgetSourcePickerModal } from './BudgetSourcePickerModal'
import type { BudgetTemplate } from '@prisma/client'

interface Props {
  projectId: string
  templates: Pick<BudgetTemplate, 'id' | 'name' | 'shootType' | 'description'>[]
  /** OWNER/PRODUCER only — Collaborators can't create or clone budgets. */
  canManage: boolean
}

export function BudgetEmptyState({ projectId, templates, canManage }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showPicker, setShowPicker] = useState(false)

  function handleCreateBlank() {
    startTransition(async () => {
      await createBudget(projectId)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <p className="font-medium text-foreground">No budget yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a proposal to generate a budget, or start one manually.
      </p>
      <div className="mt-4 flex items-center gap-3">
        {canManage && (
          <>
            <Button variant="outline" onClick={handleCreateBlank} disabled={pending}>
              {pending ? 'Creating…' : 'Create blank budget'}
            </Button>
            <Button onClick={() => setShowPicker(true)} disabled={pending}>
              Start from an existing budget
            </Button>
          </>
        )}
        <Link href={`/projects/${projectId}`}>
          <Button variant={canManage ? 'ghost' : 'default'}>Go to Overview →</Button>
        </Link>
      </div>

      {canManage && (
        <BudgetSourcePickerModal
          open={showPicker}
          onOpenChange={setShowPicker}
          templates={templates}
          target={{ mode: 'NEW_BUDGET', projectId }}
          onDone={() => { setShowPicker(false); router.refresh() }}
        />
      )}
    </div>
  )
}
