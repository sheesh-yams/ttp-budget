'use client'

import { useState, useTransition, useOptimistic } from 'react'
import { Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddLineItemModal } from './AddLineItemModal'
import { deleteLineItem, addAccount } from '@/server/actions/budgets'
import { formatMoney, lineTotal } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { BudgetWithPhases, AccountWithItems } from '@/types'
import { useRouter } from 'next/navigation'

interface Props {
  budget: BudgetWithPhases
  projectId: string
}

export function BudgetEditor({ budget, projectId }: Props) {
  const router = useRouter()
  const [activePhase, setActivePhase] = useState(
    budget.phases.find(p => p.isPrimary)?.id ?? budget.phases[0]?.id
  )

  const currentPhase = budget.phases.find(p => p.id === activePhase)

  // Grand total across all accounts in current phase
  const phaseTotalCents = (currentPhase?.accounts ?? []).reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
    0
  )

  return (
    <div>
      <Tabs value={activePhase} onValueChange={setActivePhase}>
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            {budget.phases.map(phase => (
              <TabsTrigger key={phase.id} value={phase.id}>
                {phase.name}
                {phase.isPrimary && (
                  <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    primary
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Phase total</p>
            <p className="text-lg font-semibold tabular">{formatMoney(phaseTotalCents)}</p>
          </div>
        </div>

        {budget.phases.map(phase => (
          <TabsContent key={phase.id} value={phase.id}>
            <PhaseView
              phase={phase as typeof currentPhase & NonNullable<unknown>}
              projectId={projectId}
              onMutated={() => router.refresh()}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// ─── Phase view ───────────────────────────────────────────────────────────────

function PhaseView({
  phase,
  projectId,
  onMutated,
}: {
  phase: BudgetWithPhases['phases'][number]
  projectId: string
  onMutated: () => void
}) {
  const [addingToAccount, setAddingToAccount] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleAddAccount() {
    const name = prompt('Account name (e.g. Camera, Post Production)')
    if (!name?.trim()) return
    startTransition(async () => {
      await addAccount({ phaseId: phase.id, name: name.trim(), order: phase.accounts.length })
      onMutated()
    })
  }

  if (phase.accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">No budget accounts yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Add an account (e.g. Camera, Crew) to get started.</p>
        <Button className="mt-4" size="sm" onClick={handleAddAccount}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add account
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* Account rows */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Description</th>
              <th className="px-3 py-2.5 text-right w-16">Qty</th>
              <th className="px-3 py-2.5 text-right w-20">Unit</th>
              <th className="px-3 py-2.5 text-right w-28">Rate</th>
              <th className="px-3 py-2.5 text-right w-28">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {phase.accounts.map(account => (
              <AccountRows
                key={account.id}
                account={account as AccountWithItems}
                depth={0}
                onAddItem={() => setAddingToAccount(account.id)}
                onMutated={onMutated}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add account button */}
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={handleAddAccount}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add account
      </Button>

      {/* Add line item modal */}
      {addingToAccount && (
        <AddLineItemModal
          open
          onOpenChange={v => { if (!v) setAddingToAccount(null) }}
          accountId={addingToAccount}
          onAdded={onMutated}
        />
      )}
    </div>
  )
}

// ─── Account rows ─────────────────────────────────────────────────────────────

function AccountRows({
  account,
  depth,
  onAddItem,
  onMutated,
}: {
  account: AccountWithItems
  depth: number
  onAddItem: () => void
  onMutated: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [, startTransition] = useTransition()

  const totalCents = sumAccount(account as unknown as AccountInput)
  const indent = depth * 20

  function handleDeleteItem(id: string) {
    if (!confirm('Delete this line item?')) return
    startTransition(async () => {
      await deleteLineItem(id)
      onMutated()
    })
  }

  return (
    <>
      {/* Account header row */}
      <tr className="border-b bg-secondary/40 font-medium">
        <td className="px-4 py-2" style={{ paddingLeft: `${indent + 16}px` }}>
          <button
            type="button"
            className="flex items-center gap-1.5 text-foreground"
            onClick={() => setCollapsed(v => !v)}
          >
            {collapsed
              ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            }
            {account.code && (
              <span className="text-xs font-mono text-muted-foreground">{account.code}</span>
            )}
            {account.name}
          </button>
        </td>
        <td />
        <td />
        <td />
        <td className="px-3 py-2 text-right tabular font-semibold">
          {formatMoney(totalCents)}
        </td>
        <td className="px-2">
          <button
            type="button"
            title="Add line item"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={onAddItem}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {/* Line items */}
      {!collapsed && account.lineItems.map(item => {
        const total = lineTotal(Number(item.quantity), item.rateCents, Number(item.markupPct) || null)
        return (
          <tr key={item.id} className="border-b budget-row hover:bg-muted/30">
            <td className="px-4 py-2 text-foreground/90" style={{ paddingLeft: `${indent + 36}px` }}>
              {item.description}
              {item.notes && (
                <span className="ml-2 text-xs text-muted-foreground">({item.notes})</span>
              )}
            </td>
            <td className="px-3 py-2 text-right tabular text-foreground/70">
              {Number(item.quantity)}
            </td>
            <td className="px-3 py-2 text-right text-xs text-muted-foreground uppercase">
              {item.unit}
            </td>
            <td className="px-3 py-2 text-right tabular text-foreground/70">
              {formatMoney(item.rateCents)}
            </td>
            <td className="px-3 py-2 text-right tabular font-medium">
              {formatMoney(total)}
            </td>
            <td className="px-2">
              <button
                type="button"
                title="Delete"
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDeleteItem(item.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </td>
          </tr>
        )
      })}

      {/* Children accounts */}
      {!collapsed && account.children?.map(child => (
        <AccountRows
          key={child.id}
          account={child}
          depth={depth + 1}
          onAddItem={onAddItem}
          onMutated={onMutated}
        />
      ))}
    </>
  )
}
