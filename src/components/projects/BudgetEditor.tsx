'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Plus, Trash2, ChevronRight, ChevronDown, ChevronUp, Package,
  Upload, GripVertical, Pencil, Star, Copy, Check, MoreHorizontal, Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LineItemModal } from './LineItemModal'
import type { EditableLineItem } from './LineItemModal'
import { InsertPackageModal } from './InsertPackageModal'
import { BudgetSummaryBar } from './BudgetSummaryBar'
import { BulkImportModal } from '@/components/budget/BulkImportModal'
import {
  deleteLineItem, addAccount, upsertLineItem, deleteAccount,
  updateAccount, reorderAccounts, reorderLineItems, moveLineItem,
  updateBudgetRates, duplicatePhase, renamePhase, makePhasePrimary, deletePhase,
  duplicateLineItem,
} from '@/server/actions/budgets'
import {
  createBudgetSection, renameBudgetSection, deleteBudgetSection,
  reorderBudgetSections, moveAccountToSection, dismissSectionsNudge,
} from '@/server/actions/sections'
import { formatMoney, lineTotal, centsToRate, rateToCents, parseQtyFormula, fmtUnit } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { BudgetWithPhases, AccountWithItems, SectionSummary } from '@/types'
import { useRouter } from 'next/navigation'
import type { RateUnit } from '@prisma/client'
import { FloatingBulkActionBar } from './FloatingBulkActionBar'

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS: { value: RateUnit; label: string }[] = [
  { value: 'HOUR',     label: 'Hour' },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'DAY',      label: 'Day' },
  { value: 'WEEK',     label: 'Week' },
  { value: 'FLAT',     label: 'Flat' },
  { value: 'EACH',     label: 'Each' },
  { value: 'MILE',     label: 'Mile' },
]


// ─── Types ────────────────────────────────────────────────────────────────────

type LineItemRow = AccountWithItems['lineItems'][number]

// Drag item carries its source account so we can detect cross-account drops
type DragItem = { id: string; accountId: string }

// ─── Root component ───────────────────────────────────────────────────────────

interface Props {
  budget: BudgetWithPhases
  projectId: string
  /** OWNER/PRODUCER see margin, agency fee and grand totals; Collaborators don't. */
  canSeeFinancials?: boolean
  /** Collaborators may read but not mutate budgets — hides all edit affordances. */
  readOnly?: boolean
}

export function BudgetEditor({ budget, projectId, canSeeFinancials = true, readOnly = false }: Props) {
  const router = useRouter()
  const [, startRatesTransition] = useTransition()
  const [, startPhaseTransition] = useTransition()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()
  const [activePhase, setActivePhase] = useState(
    budget.phases.find(p => p.isPrimary)?.id ?? budget.phases[0]?.id
  )

  const currentPhase    = budget.phases.find(p => p.id === activePhase)
  const currentAccounts = (currentPhase?.accounts ?? []) as AccountWithItems[]

  const phaseTotalCents = currentAccounts.reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput), 0
  )
  const serverMarkupPct = budget.markupPct ? Number(budget.markupPct) : 0
  const serverTaxPct    = budget.taxPct    ? Number(budget.taxPct)    : 0

  // Local state for markup/tax so the summary bar updates instantly without a full refresh
  const [localMarkupPct, setLocalMarkupPct] = useState(serverMarkupPct)
  const [localTaxPct,    setLocalTaxPct]    = useState(serverTaxPct)
  const [markupInput, setMarkupInput] = useState(
    serverMarkupPct > 0 ? String(+(serverMarkupPct * 100).toFixed(2)) : ''
  )
  const [taxInput, setTaxInput] = useState(
    serverTaxPct > 0 ? String(+(serverTaxPct * 100).toFixed(2)) : ''
  )

  // Phase rename state
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)
  const [phaseNameInput, setPhaseNameInput] = useState('')

  function saveRates() {
    const mkPct = markupInput ? parseFloat(markupInput) / 100 : null
    const txPct = taxInput    ? parseFloat(taxInput)    / 100 : null
    setLocalMarkupPct(mkPct ?? 0)
    setLocalTaxPct(txPct ?? 0)
    startRatesTransition(async () => {
      await updateBudgetRates(budget.id, { markupPct: mkPct, taxPct: txPct })
    })
  }

  function startRenamePhase(phase: BudgetWithPhases['phases'][number]) {
    setPhaseNameInput(phase.name)
    setEditingPhaseId(phase.id)
  }

  function saveRenamePhase() {
    const trimmed = phaseNameInput.trim()
    if (!trimmed || !editingPhaseId) { setEditingPhaseId(null); return }
    const phase = budget.phases.find(p => p.id === editingPhaseId)
    if (trimmed === phase?.name) { setEditingPhaseId(null); return }
    setEditingPhaseId(null)
    startPhaseTransition(async () => {
      await renamePhase(editingPhaseId, trimmed)
      router.refresh()
    })
  }

  function handleMakePrimary(phaseId: string) {
    startPhaseTransition(async () => {
      await makePhasePrimary(phaseId)
      router.refresh()
    })
  }

  function handleAddPhase() {
    const currentName = currentPhase?.name ?? 'v1 Estimate'
    // Auto-suggest next version name
    const match = currentName.match(/v(\d+)/i)
    const nextNum = match ? parseInt(match[1]) + 1 : budget.phases.length + 1
    const suggested = `v${nextNum} Estimate`
    const name = prompt('Name for new budget version:', suggested)
    if (!name?.trim()) return
    startPhaseTransition(async () => {
      // Duplicate the current active phase into a new one
      const sourceId = activePhase ?? budget.phases[0]?.id
      if (!sourceId) return
      const result = await duplicatePhase(sourceId, name.trim())
      if (result.success) {
        router.refresh()
        setActivePhase(result.data.id)
      }
    })
  }

  async function handleDeletePhase(phaseId: string) {
    const phase = budget.phases.find(p => p.id === phaseId)
    const ok = await confirmDialog(
      `All line items in "${phase?.name ?? 'this phase'}" will be permanently lost.`,
      { title: `Delete phase?`, key: 'budget-delete-phase' }
    )
    if (!ok) return
    startPhaseTransition(async () => {
      const result = await deletePhase(phaseId)
      if (result.success) {
        // Switch to first remaining phase
        const remaining = budget.phases.filter(p => p.id !== phaseId)
        if (remaining.length > 0) setActivePhase(remaining[0].id)
        router.refresh()
      } else {
        alert((result as { success: false; error: string }).error)
      }
    })
  }

  return (
    <div className="pb-20">
      {ConfirmDialog}
      <Tabs value={activePhase} onValueChange={setActivePhase}>
        {/* ── Phase tabs row ── */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {budget.phases.map(phase => {
              const isActive  = activePhase === phase.id
              const isEditing = editingPhaseId === phase.id

              return (
                <div
                  key={phase.id}
                  className={[
                    'group/tab relative flex items-center gap-1 rounded-md px-2.5 py-1 text-[13px] transition-colors cursor-pointer select-none',
                    isActive
                      ? 'bg-white border border-border shadow-sm font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  ].join(' ')}
                  onClick={() => { if (!isEditing) setActivePhase(phase.id) }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      className="w-28 rounded border border-primary/50 bg-background px-1 py-0.5 text-[13px] font-medium outline-none ring-1 ring-primary/30"
                      value={phaseNameInput}
                      onChange={e => setPhaseNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.stopPropagation(); saveRenamePhase() }
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingPhaseId(null) }
                      }}
                      onBlur={saveRenamePhase}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span>{phase.name}</span>
                  )}

                  {phase.isPrimary && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary leading-none">
                      primary
                    </span>
                  )}

                  {/* Per-tab actions (visible on hover when active) */}
                  {isActive && !isEditing && (
                    <span className="ml-0.5 hidden items-center gap-0.5 group-hover/tab:flex" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        title="Rename"
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => startRenamePhase(phase)}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      {!phase.isPrimary && (
                        <button
                          type="button"
                          title="Make primary (this phase will be used for new proposals)"
                          className="rounded p-0.5 text-muted-foreground hover:text-amber-500 transition-colors"
                          onClick={() => handleMakePrimary(phase.id)}
                        >
                          <Star className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {budget.phases.length > 1 && !phase.isPrimary && (
                        <button
                          type="button"
                          title="Delete this version"
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => handleDeletePhase(phase.id)}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )
            })}

            {/* Add new version */}
            <button
              type="button"
              title="Save a copy of this budget as a new version"
              onClick={handleAddPhase}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Copy className="h-3 w-3" />
              New version
            </button>
          </div>

          <div className="ml-auto text-right shrink-0">
            <p className="text-xs text-muted-foreground">Phase total</p>
            <p className="text-lg font-semibold tabular">{formatMoney(phaseTotalCents)}</p>
          </div>
        </div>

        {/* ── Budget rates row ── (markup/agency-fee — hidden from Collaborators) */}
        {canSeeFinancials && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/30 px-4 py-2 text-[12px]">
          <span className="font-medium text-foreground/70">Budget rates</span>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            Agency fee
            <input
              type="number" min="0" max="100" step="1"
              value={markupInput}
              onChange={e => setMarkupInput(e.target.value)}
              onBlur={saveRates}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="0"
              className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right text-[12px] tabular-nums outline-none focus:ring-1 focus:ring-primary/40"
            />
            <span>%</span>
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            Tax
            <input
              type="number" min="0" max="100" step="0.25"
              value={taxInput}
              onChange={e => setTaxInput(e.target.value)}
              onBlur={saveRates}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="0"
              className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right text-[12px] tabular-nums outline-none focus:ring-1 focus:ring-primary/40"
            />
            <span>%</span>
          </label>
          <span className="ml-auto text-[10px] text-muted-foreground/40">Saves on blur · applied to gross total</span>
        </div>
        )}

        {budget.phases.map(phase => (
          <TabsContent key={phase.id} value={phase.id}>
            <PhaseView
              phase={phase as typeof currentPhase & NonNullable<unknown>}
              budgetId={budget.id}
              projectId={projectId}
              onMutated={() => router.refresh()}
              readOnly={readOnly}
            />
          </TabsContent>
        ))}
      </Tabs>

      <BudgetSummaryBar
        accounts={currentAccounts}
        budgetMarkupPct={localMarkupPct}
        budgetTaxPct={localTaxPct}
        canSeeFinancials={canSeeFinancials}
      />
    </div>
  )
}

// ─── Phase view ───────────────────────────────────────────────────────────────

function PhaseView({
  phase, budgetId, projectId, onMutated, readOnly = false,
}: {
  phase: BudgetWithPhases['phases'][number]
  budgetId: string
  projectId: string
  onMutated: () => void
  readOnly?: boolean
}) {
  const [addingToAccount, setAddingToAccount] = useState<string | null>(null)
  const [showPackages, setShowPackages]         = useState(false)
  const [showImport, setShowImport]             = useState(false)
  const [, startTransition] = useTransition()
  const [flashItemId, setFlashItemId]           = useState<string | null>(null)

  async function handleDuplicate(itemId: string) {
    const result = await duplicateLineItem(itemId)
    if ('error' in result) return
    setFlashItemId(result.data.newLineItemId)
    onMutated()
    setTimeout(() => setFlashItemId(null), 1500)
  }

  // ── Sections local state ──────────────────────────────────────────────────
  const [localSections, setLocalSections] = useState<SectionSummary[]>(
    (phase.sections ?? []) as SectionSummary[]
  )
  useEffect(() => {
    setLocalSections((phase.sections ?? []) as SectionSummary[])
  }, [phase.sections])

  const multiSection = localSections.length >= 2

  // Section modal state
  const [showAddSection, setShowAddSection]     = useState(false)
  const [deletingSection, setDeletingSection]   = useState<SectionSummary | null>(null)
  const [renamingSection, setRenamingSection]   = useState<string | null>(null)  // sectionId
  const [renameSectionVal, setRenameSectionVal] = useState('')

  // ── Full local account+item state (allows cross-account optimistic updates) ──
  const [localAccounts, setLocalAccounts] = useState<AccountWithItems[]>(
    phase.accounts as AccountWithItems[]
  )
  useEffect(() => {
    setLocalAccounts(phase.accounts as AccountWithItems[])
  }, [phase.accounts])

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const allItemIds = useMemo(() => {
    function collect(accounts: AccountWithItems[]): string[] {
      return accounts.flatMap(acc => [
        ...acc.lineItems.map(i => i.id),
        ...(acc.children ? collect(acc.children as AccountWithItems[]) : []),
      ])
    }
    return collect(localAccounts)
  }, [localAccounts])

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAccount(ids: string[]) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSel = ids.every(id => next.has(id))
      if (allSel) ids.forEach(id => next.delete(id))
      else        ids.forEach(id => next.add(id))
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(prev =>
      prev.size === allItemIds.length && allItemIds.length > 0
        ? new Set()
        : new Set(allItemIds)
    )
  }

  // ── Account drag state ────────────────────────────────────────────────────
  const [dragAccountId, setDragAccountId] = useState<string | null>(null)
  const [dropAccountId, setDropAccountId] = useState<string | null>(null)

  function handleAccountDrop(targetId: string) {
    if (!dragAccountId || dragAccountId === targetId) {
      setDragAccountId(null); setDropAccountId(null); return
    }
    const ordered = [...localAccounts]
    const fromIdx = ordered.findIndex(a => a.id === dragAccountId)
    const toIdx   = ordered.findIndex(a => a.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [removed] = ordered.splice(fromIdx, 1)
    ordered.splice(toIdx, 0, removed)
    // Always renumber with 100/200/300 codes after a reorder
    const orderedWithCodes = ordered.map((a, i) => ({ ...a, code: String((i + 1) * 100) }))
    setLocalAccounts(orderedWithCodes)
    setDragAccountId(null); setDropAccountId(null)
    startTransition(async () => {
      await reorderAccounts(ordered.map((a, i) => ({ id: a.id, order: i, code: a.code })))
      onMutated()
    })
  }

  // ── Item drag state (lifted so cross-account drops work) ──────────────────
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  // dropZone: where the item will land
  const [dropZone, setDropZone] = useState<{ accountId: string; beforeItemId?: string } | null>(null)

  function handleItemDrop() {
    if (!dragItem || !dropZone) { setDragItem(null); setDropZone(null); return }
    const { id: itemId, accountId: srcAccId } = dragItem
    const { accountId: tgtAccId, beforeItemId } = dropZone
    setDragItem(null); setDropZone(null)

    if (srcAccId === tgtAccId) {
      // ── Same-account reorder ────────────────────────────────────────────
      const acc  = localAccounts.find(a => a.id === srcAccId)!
      const items = [...acc.lineItems]
      const fromIdx = items.findIndex(i => i.id === itemId)
      const rawTo   = beforeItemId ? items.findIndex(i => i.id === beforeItemId) : items.length
      const toIdx   = rawTo > fromIdx ? rawTo - 1 : rawTo
      const [removed] = items.splice(fromIdx, 1)
      items.splice(Math.max(0, toIdx), 0, removed)
      setLocalAccounts(prev => prev.map(a =>
        a.id === srcAccId ? { ...a, lineItems: items } : a
      ))
      startTransition(async () => {
        await reorderLineItems(items.map((it, i) => ({ id: it.id, order: i })))
      })
    } else {
      // ── Cross-account move ──────────────────────────────────────────────
      const srcAcc  = localAccounts.find(a => a.id === srcAccId)!
      const tgtAcc  = localAccounts.find(a => a.id === tgtAccId)!
      const srcItem = srcAcc.lineItems.find(i => i.id === itemId)!
      const newSrcItems = srcAcc.lineItems.filter(i => i.id !== itemId)
      const newTgtItems = [...tgtAcc.lineItems]
      const insertIdx = beforeItemId
        ? newTgtItems.findIndex(i => i.id === beforeItemId)
        : newTgtItems.length
      newTgtItems.splice(Math.max(0, insertIdx), 0, srcItem)
      setLocalAccounts(prev => prev.map(a => {
        if (a.id === srcAccId) return { ...a, lineItems: newSrcItems }
        if (a.id === tgtAccId) return { ...a, lineItems: newTgtItems }
        return a
      }))
      startTransition(async () => {
        await moveLineItem(itemId, tgtAccId)
        onMutated()
      })
    }
  }

  // ── Section handlers ──────────────────────────────────────────────────────

  function handleSectionMoveUp(sectionId: string) {
    const idx = localSections.findIndex(s => s.id === sectionId)
    if (idx <= 0) return
    const next = [...localSections]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setLocalSections(next)
    startTransition(async () => {
      await reorderBudgetSections(phase.id, next.map(s => s.id))
      onMutated()
    })
  }

  function handleSectionMoveDown(sectionId: string) {
    const idx = localSections.findIndex(s => s.id === sectionId)
    if (idx === -1 || idx >= localSections.length - 1) return
    const next = [...localSections]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setLocalSections(next)
    startTransition(async () => {
      await reorderBudgetSections(phase.id, next.map(s => s.id))
      onMutated()
    })
  }

  function handleSectionRenameCommit(sectionId: string) {
    const trimmed = renameSectionVal.trim()
    setRenamingSection(null)
    if (!trimmed) return
    const current = localSections.find(s => s.id === sectionId)
    if (trimmed === current?.title) return
    setLocalSections(prev => prev.map(s => s.id === sectionId ? { ...s, title: trimmed } : s))
    startTransition(async () => {
      await renameBudgetSection(sectionId, trimmed)
      onMutated()
    })
  }

  function handleCrossSectionAccountDrop(accountId: string, toSectionId: string) {
    const account = localAccounts.find(a => a.id === accountId)
    if (!account || (account as unknown as { sectionId: string }).sectionId === toSectionId) return
    const toSectionAccounts = localAccounts.filter(a =>
      (a as unknown as { sectionId: string }).sectionId === toSectionId
    )
    const newOrder = toSectionAccounts.length
    setLocalAccounts(prev => prev.map(a =>
      a.id === accountId
        ? { ...a, sectionId: toSectionId, order: newOrder } as AccountWithItems
        : a
    ))
    startTransition(async () => {
      await moveAccountToSection(accountId, toSectionId, newOrder)
      onMutated()
    })
  }

  function handleAddAccount() {
    const name = prompt('Account name (e.g. Camera, Post Production)')
    if (!name?.trim()) return
    // Auto-assign the next sequential code (100, 200, 300…)
    const topLevel = localAccounts.filter(a => !('parentId' in a && a.parentId))
    const code = String((topLevel.length + 1) * 100)
    startTransition(async () => {
      await addAccount({ phaseId: phase.id, name: name.trim(), code, order: localAccounts.length })
      onMutated()
    })
  }

  // ── Nudge banner ─────────────────────────────────────────────────────────
  const totalLineItems = useMemo(() =>
    localAccounts.reduce((sum, a) => sum + a.lineItems.length, 0),
  [localAccounts])
  const showNudge =
    !readOnly &&
    localSections.length === 1 &&
    totalLineItems > 40 &&
    !phase.sectionsNudgeDismissedAt

  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  // ── Section-aware account grouping ──────────────────────────────────────
  // Must be declared before any early return (Rules of Hooks)
  const accountsBySection = useMemo(() => {
    const map: Record<string, AccountWithItems[]> = {}
    for (const s of localSections) map[s.id] = []
    for (const acc of localAccounts) {
      const sid = (acc as unknown as { sectionId: string }).sectionId
      if (map[sid]) map[sid].push(acc)
      else {
        // Account's section not in localSections yet (race) — put in first section
        const fallback = localSections[0]?.id
        if (fallback) {
          if (!map[fallback]) map[fallback] = []
          map[fallback].push(acc)
        }
      }
    }
    return map
  }, [localAccounts, localSections])

  // Render accounts for a given section (or all accounts for single-section mode)
  function renderAccounts(accounts: AccountWithItems[]) {
    return accounts.map((account, accountIndex) => (
      <AccountRows
        key={account.id}
        account={account}
        accountIndex={accountIndex}
        items={account.lineItems}
        depth={0}
        onAddItem={() => setAddingToAccount(account.id)}
        onMutated={onMutated}
        isDragging={dragAccountId === account.id}
        isDragOver={dropAccountId === account.id && !dragItem}
        onHeaderDragStart={() => setDragAccountId(account.id)}
        onHeaderDragOver={() => !dragItem && setDropAccountId(account.id)}
        onHeaderDragEnd={() => { setDragAccountId(null); setDropAccountId(null) }}
        onHeaderDrop={() => handleAccountDrop(account.id)}
        dragItem={dragItem}
        dropZone={dropZone}
        onItemDragStart={setDragItem}
        onItemDragEnd={() => { setDragItem(null); setDropZone(null) }}
        onItemDragOverItem={(beforeItemId) =>
          setDropZone({ accountId: account.id, beforeItemId })
        }
        onItemDragOverHeader={() => setDropZone({ accountId: account.id })}
        onItemDrop={handleItemDrop}
        onAccountDeleted={onMutated}
        selectedIds={selectedIds}
        onToggleItem={toggleItem}
        onToggleAccount={toggleAccount}
        onDuplicate={handleDuplicate}
        flashItemId={flashItemId}
        readOnly={readOnly}
      />
    ))
  }

  if (localAccounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">No budget accounts yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add an account manually, insert a package, or bulk import from a file.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={handleAddAccount}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add account
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowPackages(true)}>
            <Package className="mr-1.5 h-3.5 w-3.5" />Insert package
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />Import file
          </Button>
        </div>
        {showPackages && (
          <InsertPackageModal open onOpenChange={setShowPackages} phaseId={phase.id} onInserted={onMutated} />
        )}
        <BulkImportModal
          open={showImport} onOpenChange={setShowImport}
          target={{ type: 'budget', budgetId, projectId }} onImported={onMutated}
        />
      </div>
    )
  }

  return (
    <div>
      {/* ── Sections nudge banner ─────────────────────────────────────────── */}
      {showNudge && !nudgeDismissed && (
        <div className="mb-3 flex items-start justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="text-foreground">
            This budget has <strong>{totalLineItems}</strong> line items in one section.{' '}
            Split into sections to make it easier to navigate and produce cleaner proposals.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowAddSection(true)}
            >
              <Layers className="mr-1.5 h-3.5 w-3.5" />Split into sections
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNudgeDismissed(true)
                startTransition(async () => {
                  await dismissSectionsNudge(phase.id)
                })
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="w-9 pl-2 align-middle">
                {!readOnly && (
                  <BulkCheckbox
                    checked={selectedIds.size === allItemIds.length && allItemIds.length > 0}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < allItemIds.length}
                    onChange={toggleAll}
                    title={selectedIds.size === allItemIds.length && allItemIds.length > 0 ? 'Deselect all' : 'Select all'}
                  />
                )}
              </th>
              <th className="w-7" />
              <th className="px-4 py-2.5 text-left">Description</th>
              <th className="px-3 py-2.5 text-right w-14" title="Headcount — how many people of this role">Qty</th>
              <th className="px-3 py-2.5 text-right w-32" title="Billing unit — days, weeks, or flat">Unit</th>
              <th className="px-3 py-2.5 text-right w-28">Rate</th>
              <th className="px-3 py-2.5 text-right w-28">Total</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {/* ── Single-section mode: render exactly as before ──────────── */}
            {!multiSection && renderAccounts(localAccounts)}

            {/* ── Multi-section mode: render section dividers + grouped accounts ── */}
            {multiSection && localSections.map((section, sectionIdx) => {
              const sectionAccounts = accountsBySection[section.id] ?? []
              return (
                <SectionRows
                  key={section.id}
                  section={section}
                  sectionIdx={sectionIdx}
                  totalSections={localSections.length}
                  isRenaming={renamingSection === section.id}
                  renameVal={renameSectionVal}
                  onRenameValChange={setRenameSectionVal}
                  onRenameStart={() => { setRenameSectionVal(section.title); setRenamingSection(section.id) }}
                  onRenameCommit={() => handleSectionRenameCommit(section.id)}
                  onRenameCancel={() => setRenamingSection(null)}
                  onMoveUp={() => handleSectionMoveUp(section.id)}
                  onMoveDown={() => handleSectionMoveDown(section.id)}
                  onDelete={() => setDeletingSection(section)}
                  onDropAccount={(accountId) => handleCrossSectionAccountDrop(accountId, section.id)}
                  readOnly={readOnly}
                >
                  {renderAccounts(sectionAccounts)}
                  {sectionAccounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-8 py-3 text-xs text-muted-foreground italic">
                        No accounts — drag accounts here or add one below.
                      </td>
                    </tr>
                  )}
                </SectionRows>
              )
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAddAccount}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add account
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPackages(true)}>
            <Package className="mr-1.5 h-3.5 w-3.5" />Insert package
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />Import
          </Button>
          <Button
            variant="outline" size="sm"
            className={multiSection ? 'border-primary/30 text-primary' : ''}
            onClick={() => setShowAddSection(true)}
          >
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            {multiSection ? `Sections · ${localSections.length}` : 'Add sections'}
          </Button>
        </div>
      )}

      {addingToAccount && (
        <LineItemModal
          open
          onOpenChange={v => { if (!v) setAddingToAccount(null) }}
          accountId={addingToAccount}
          onSaved={onMutated}
        />
      )}
      <InsertPackageModal
        open={showPackages} onOpenChange={setShowPackages}
        phaseId={phase.id} onInserted={onMutated}
      />
      <BulkImportModal
        open={showImport} onOpenChange={setShowImport}
        target={{ type: 'budget', budgetId, projectId }} onImported={onMutated}
      />

      {/* ── Add / first-time activation section modal ── */}
      {showAddSection && (
        <AddSectionModal
          phaseId={phase.id}
          currentSections={localSections}
          onClose={() => setShowAddSection(false)}
          onCreated={onMutated}
        />
      )}

      {/* ── Delete section confirm ── */}
      {deletingSection && (
        <DeleteSectionModal
          section={deletingSection}
          otherSections={localSections.filter(s => s.id !== deletingSection.id)}
          hasAccounts={(accountsBySection[deletingSection.id]?.length ?? 0) > 0}
          onClose={() => setDeletingSection(null)}
          onDeleted={onMutated}
        />
      )}

      {!readOnly && (
        <FloatingBulkActionBar
          selectedIds={[...selectedIds]}
          phaseId={phase.id}
          onClear={() => setSelectedIds(new Set())}
          onMutated={onMutated}
          onSwapSelection={ids => setSelectedIds(new Set(ids))}
        />
      )}
    </div>
  )
}

// ─── Section rows (divider + accounts wrapper) ────────────────────────────────

function SectionRows({
  section, sectionIdx, totalSections,
  isRenaming, renameVal, onRenameValChange,
  onRenameStart, onRenameCommit, onRenameCancel,
  onMoveUp, onMoveDown, onDelete, onDropAccount,
  readOnly, children,
}: {
  section:             SectionSummary
  sectionIdx:          number
  totalSections:       number
  isRenaming:          boolean
  renameVal:           string
  onRenameValChange:   (v: string) => void
  onRenameStart:       () => void
  onRenameCommit:      () => void
  onRenameCancel:      () => void
  onMoveUp:            () => void
  onMoveDown:          () => void
  onDelete:            () => void
  onDropAccount:       (accountId: string) => void
  readOnly:            boolean
  children:            React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <>
      {/* Section divider row */}
      <tr
        className={[
          'border-b-2 border-t transition-colors',
          isDragOver ? 'bg-primary/5 border-primary/30' : 'border-border/60 bg-muted/20',
        ].join(' ')}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setIsDragOver(false)
          const id = e.dataTransfer.getData('text/plain')
          if (id) onDropAccount(id)
        }}
      >
        <td colSpan={2} />
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <input
                autoFocus
                className="rounded border border-primary/50 bg-background px-2 py-0.5 text-sm font-semibold outline-none ring-1 ring-primary/30 w-48"
                value={renameVal}
                onChange={e => onRenameValChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.stopPropagation(); onRenameCommit() }
                  if (e.key === 'Escape') { e.stopPropagation(); onRenameCancel() }
                }}
                onBlur={onRenameCommit}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm font-semibold text-foreground">{section.title}</span>
            )}
          </div>
        </td>
        <td colSpan={4} />
        <td className="px-2 py-2">
          {!readOnly && !isRenaming && (
            <div className="relative flex items-center justify-end gap-0.5" ref={menuRef}>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setMenuOpen(v => !v)}
                title="Section options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-md text-[13px]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                    onClick={() => { setMenuOpen(false); onRenameStart() }}
                  >
                    <Pencil className="h-3 w-3" /> Rename
                  </button>
                  {sectionIdx > 0 && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                      onClick={() => { setMenuOpen(false); onMoveUp() }}
                    >
                      <ChevronUp className="h-3 w-3" /> Move up
                    </button>
                  )}
                  {sectionIdx < totalSections - 1 && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                      onClick={() => { setMenuOpen(false); onMoveDown() }}
                    >
                      <ChevronDown className="h-3 w-3" /> Move down
                    </button>
                  )}
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/10"
                    onClick={() => { setMenuOpen(false); onDelete() }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </td>
      </tr>
      {children}
    </>
  )
}

// ─── Add section modal ────────────────────────────────────────────────────────

function AddSectionModal({
  phaseId, currentSections, onClose, onCreated,
}: {
  phaseId:         string
  currentSections: SectionSummary[]
  onClose:         () => void
  onCreated:       () => void
}) {
  const [, startTransition] = useTransition()
  const firstTime = currentSections.length === 1
  const [currentName, setCurrentName] = useState(currentSections[0]?.title ?? 'Main')
  const [newName, setNewName]         = useState('')
  const [pending, setPending]         = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedNew = newName.trim()
    if (!trimmedNew) return
    setPending(true)
    startTransition(async () => {
      if (firstTime) {
        const trimmedCurrent = currentName.trim()
        // Rename the existing "Main" section if the name changed
        if (trimmedCurrent && trimmedCurrent !== currentSections[0]?.title) {
          await renameBudgetSection(currentSections[0].id, trimmedCurrent)
        }
      }
      await createBudgetSection(phaseId, trimmedNew, currentSections.length)
      onCreated()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold">
          {firstTime ? 'Split into sections' : 'Add section'}
        </h2>
        {firstTime && (
          <p className="mb-4 text-[13px] text-muted-foreground">
            Give your current content a name, then name the new section.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3 mt-4">
          {firstTime && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Current section name
              </label>
              <input
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
                value={currentName}
                onChange={e => setCurrentName(e.target.value)}
                placeholder="Main"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {firstTime ? 'New section name' : 'Section name'}
            </label>
            <input
              autoFocus={!firstTime}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Post Production"
              onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending || !newName.trim()}>
              {pending ? 'Saving…' : firstTime ? 'Activate sections' : 'Add section'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete section modal ─────────────────────────────────────────────────────

function DeleteSectionModal({
  section, otherSections, hasAccounts, onClose, onDeleted,
}: {
  section:       SectionSummary
  otherSections: SectionSummary[]
  hasAccounts:   boolean
  onClose:       () => void
  onDeleted:     () => void
}) {
  const [, startTransition] = useTransition()
  const [moveTo, setMoveTo] = useState(otherSections[0]?.id ?? '')
  const [pending, setPending] = useState(false)

  function handleDelete() {
    setPending(true)
    startTransition(async () => {
      const result = await deleteBudgetSection(
        section.id,
        hasAccounts && moveTo ? moveTo : undefined,
      )
      if ('error' in result && result.error === 'CANNOT_DELETE_ONLY_SECTION') {
        alert('Cannot delete the only section in a phase.')
        setPending(false)
        return
      }
      onDeleted()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold">Delete &ldquo;{section.title}&rdquo;?</h2>
        {hasAccounts ? (
          <>
            <p className="mb-4 text-[13px] text-muted-foreground">
              This section has accounts. Move them to another section before deleting.
            </p>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Move accounts to</label>
              <Select value={moveTo} onValueChange={setMoveTo}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {otherSections.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <p className="mb-4 text-[13px] text-muted-foreground">
            This section is empty and will be permanently removed.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            type="button" variant="destructive" size="sm"
            disabled={pending || (hasAccounts && !moveTo)}
            onClick={handleDelete}
          >
            {pending ? 'Deleting…' : 'Delete section'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Bulk checkbox ────────────────────────────────────────────────────────────

function BulkCheckbox({
  checked, indeterminate, onChange, title, className,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  title?: string
  className?: string
}) {
  return (
    <label
      className={['relative flex items-center justify-center cursor-pointer transition-opacity', className].filter(Boolean).join(' ')}
      title={title}
    >
      {/* relative on the label contains this position:absolute sr-only input —
          otherwise it escapes to the document's containing block and extends the
          page far below the content, creating phantom body scroll. */}
      <input
        type="checkbox"
        checked={checked}
        ref={el => { if (el) el.indeterminate = !!indeterminate }}
        onChange={onChange}
        className="sr-only"
      />
      <div
        className={[
          'h-3.5 w-3.5 rounded-[3px] border transition-all flex items-center justify-center shrink-0',
          checked || indeterminate
            ? 'bg-violet-600 border-violet-600'
            : 'border-border/50 bg-transparent',
        ].join(' ')}
      >
        {indeterminate ? (
          <span className="block h-[1.5px] w-2 rounded-full bg-white" />
        ) : checked ? (
          <Check className="h-2 w-2 text-white stroke-[3]" />
        ) : null}
      </div>
    </label>
  )
}

// ─── Account rows ─────────────────────────────────────────────────────────────

function AccountRows({
  account, accountIndex, items, depth, onAddItem, onMutated, onAccountDeleted,
  // Account drag
  isDragging, isDragOver,
  onHeaderDragStart, onHeaderDragOver, onHeaderDragEnd, onHeaderDrop,
  // Item drag (from PhaseView)
  dragItem, dropZone,
  onItemDragStart, onItemDragEnd,
  onItemDragOverItem, onItemDragOverHeader, onItemDrop,
  // Bulk selection
  selectedIds, onToggleItem, onToggleAccount,
  // Duplicate
  onDuplicate, flashItemId,
  readOnly = false,
}: {
  account: AccountWithItems
  accountIndex: number
  items: LineItemRow[]
  depth: number
  onAddItem: () => void
  onMutated: () => void
  onAccountDeleted: () => void
  isDragging: boolean
  isDragOver: boolean
  onHeaderDragStart: () => void
  onHeaderDragOver: () => void
  onHeaderDragEnd: () => void
  onHeaderDrop: () => void
  dragItem: DragItem | null
  dropZone: { accountId: string; beforeItemId?: string } | null
  onItemDragStart: (item: DragItem) => void
  onItemDragEnd: () => void
  onItemDragOverItem: (beforeItemId: string) => void
  onItemDragOverHeader: () => void
  onItemDrop: () => void
  // Bulk selection
  selectedIds: Set<string>
  onToggleItem: (id: string) => void
  onToggleAccount: (ids: string[]) => void
  // Duplicate
  onDuplicate: (id: string) => Promise<void>
  flashItemId: string | null
  readOnly?: boolean
}) {
  const [collapsed, setCollapsed]           = useState(false)
  const [, startTransition]                 = useTransition()
  const [editingName, setEditingName]       = useState(false)
  const [nameValue, setNameValue]           = useState(account.name)
  const [editModalItem, setEditModalItem]   = useState<EditableLineItem | null>(null)
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()

  const totalCents = sumAccount(account as unknown as AccountInput)
  const indent     = depth * 20

  // ── Per-section selection helpers ─────────────────────────────────────────
  const accountItemIds = useMemo(() => {
    function collect(acc: AccountWithItems): string[] {
      return [...acc.lineItems.map(i => i.id), ...(acc.children ?? []).flatMap(collect)]
    }
    return collect(account)
  }, [account])
  const numSelected  = accountItemIds.filter(id => selectedIds.has(id)).length
  const allChecked   = accountItemIds.length > 0 && numSelected === accountItemIds.length
  const someChecked  = numSelected > 0 && !allChecked

  // ── Account name ──────────────────────────────────────────────────────────
  function saveAccountName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === account.name) { setEditingName(false); return }
    setEditingName(false)
    startTransition(async () => {
      await updateAccount(account.id, { name: trimmed })
      onMutated()
    })
  }

  // ── Account delete ────────────────────────────────────────────────────────
  async function handleDeleteAccount() {
    const itemCount = items.length
    const msg = itemCount > 0
      ? `This will also delete its ${itemCount} line item${itemCount !== 1 ? 's' : ''}.`
      : `"${account.name}" will be permanently removed.`
    const ok = await confirmDialog(msg, { title: `Delete "${account.name}"?`, key: 'budget-delete-account' })
    if (!ok) return
    startTransition(async () => {
      await deleteAccount(account.id)
      onAccountDeleted()
    })
  }

  // ── Item edit — opens the full LineItemModal ──────────────────────────────
  function openEditModal(item: LineItemRow) {
    setEditModalItem({
      id:              item.id,
      accountId:       account.id,
      description:     item.description,
      quantity:        Number(item.quantity),
      unit:            item.unit,
      rateCents:       item.rateCents,
      rateCardId:      item.rateCardId ?? null,
      markupPct:       item.markupPct != null ? Number(item.markupPct) : null,
      notes:           item.notes ?? null,
      quantityFormula: item.quantityFormula ?? null,
      lineItemCategory: item.lineItemCategory as ('CREW' | 'LOCATION' | 'EQUIPMENT' | 'SERVICE' | 'DELIVERABLE') ?? null,
      contactId:       (item as { contactId?: string | null }).contactId ?? null,
    })
  }

  // ── Item delete ───────────────────────────────────────────────────────────
  async function handleDeleteItem(id: string) {
    const ok = await confirmDialog('This line item will be permanently removed.', { key: 'budget-delete-line-item' })
    if (!ok) return
    startTransition(async () => {
      await deleteLineItem(id)
      onMutated()
    })
  }

  // ── Cross-account drop highlight on this account's header ─────────────────
  const isItemDropTargetHeader =
    dragItem !== null &&
    dragItem.accountId !== account.id &&
    dropZone?.accountId === account.id &&
    !dropZone.beforeItemId

  return (
    <>
      {ConfirmDialog}
      <LineItemModal
        open={!!editModalItem}
        onOpenChange={v => { if (!v) setEditModalItem(null) }}
        editItem={editModalItem}
        onSaved={() => { setEditModalItem(null); onMutated() }}
      />
      {/* ── Account header row ─────────────────────────────────────────────── */}
      <tr
        className={[
          'group/section border-b bg-secondary/40 font-medium transition-colors hover:bg-secondary/70',
          isDragging          ? 'opacity-40' : '',
          isDragOver          ? 'outline outline-1 outline-primary/50 bg-primary/5' : '',
          isItemDropTargetHeader ? 'outline outline-1 outline-violet-400/60 bg-violet-50/40' : '',
        ].join(' ')}
        onDragOver={e => {
          e.preventDefault()
          if (dragItem) {
            // An item is being dragged — use this header as "drop at end of account"
            onItemDragOverHeader()
          } else {
            onHeaderDragOver()
          }
        }}
        onDrop={e => {
          e.preventDefault()
          if (dragItem) {
            onItemDrop()
          } else {
            onHeaderDrop()
          }
        }}
      >
        {/* Section checkbox — select all items in this account */}
        <td className="w-9 pl-2 align-middle">
          {!readOnly && (
            <BulkCheckbox
              checked={allChecked}
              indeterminate={someChecked}
              onChange={() => onToggleAccount(accountItemIds)}
              title={allChecked ? 'Deselect section' : 'Select section'}
              className={numSelected > 0 ? 'opacity-100' : 'opacity-0 group-hover/section:opacity-100'}
            />
          )}
        </td>

        {/* Account drag handle (disabled in read-only mode) */}
        {readOnly ? (
          <td className="w-7" />
        ) : (
          <td
            className="w-7 cursor-grab active:cursor-grabbing pl-1"
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('text/plain', account.id)
              const row = e.currentTarget.closest('tr')
              if (row) e.dataTransfer.setDragImage(row, 0, 0)
              onHeaderDragStart()
            }}
            onDragEnd={onHeaderDragEnd}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />
          </td>
        )}

        {/* Name (editable) */}
        <td className="px-4 py-2" style={{ paddingLeft: `${indent + 16}px` }}>
          {editingName ? (
            <input
              autoFocus
              className="w-full max-w-xs rounded border border-primary/50 bg-background px-2 py-0.5 text-sm font-medium outline-none ring-1 ring-primary/30"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  saveAccountName()
                if (e.key === 'Escape') { setNameValue(account.name); setEditingName(false) }
              }}
              onBlur={saveAccountName}
            />
          ) : (
            <div className="group/name flex items-center gap-1.5">
              <button
                type="button"
                className="flex items-center gap-1.5 text-foreground"
                onClick={() => setCollapsed(v => !v)}
              >
                {collapsed
                  ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground" />
                }
                {depth === 0 && (
                  <span className="text-xs font-mono text-muted-foreground/60 w-8 text-right shrink-0">
                    {account.code ?? String((accountIndex + 1) * 100)}
                  </span>
                )}
                {account.name}
              </button>
              {!readOnly && (
                <button
                  type="button" title="Rename"
                  className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground group-hover/name:visible"
                  onClick={() => { setNameValue(account.name); setEditingName(true) }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </td>

        <td /><td /><td />

        <td className="px-3 py-2 text-right tabular font-semibold">
          {formatMoney(totalCents)}
        </td>

        {/* Add item + Delete section */}
        <td className="px-2">
          <div className="flex items-center justify-end gap-0.5">
            {!readOnly && (
              <>
                <button
                  type="button" title="Add line item"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={onAddItem}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button" title="Delete section"
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDeleteAccount}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* ── Line item rows ─────────────────────────────────────────────────── */}
      {!collapsed && items.map(item => {
        const isBeingDragged = dragItem?.id === item.id
        const isDropBefore   =
          dropZone?.accountId === account.id &&
          dropZone.beforeItemId === item.id &&
          !isBeingDragged

        return (
          <tr
            key={item.id}
            style={flashItemId === item.id ? { animation: 'mint-flash 1.5s ease-out forwards' } : undefined}
            className={[
              'group/item border-b transition-colors hover:bg-muted/40',
              isBeingDragged ? 'opacity-40'       : '',
              isDropBefore   ? 'border-t-2 border-t-violet-400' : '',
            ].join(' ')}
            onDragOver={e => { e.preventDefault(); onItemDragOverItem(item.id) }}
            onDrop={e => { e.preventDefault(); onItemDrop() }}
          >
            {/* Row checkbox — hover-reveal, permanently visible when checked */}
            <td className="w-9 pl-2 align-middle">
              {!readOnly && (
                <BulkCheckbox
                  checked={selectedIds.has(item.id)}
                  onChange={() => onToggleItem(item.id)}
                  className={selectedIds.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}
                />
              )}
            </td>

            {/* Item drag handle (disabled in read-only mode) */}
            {readOnly ? (
              <td className="w-7" />
            ) : (
              <td
                className="w-7 cursor-grab active:cursor-grabbing pl-1"
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', item.id)
                  const row = e.currentTarget.closest('tr')
                  if (row) e.dataTransfer.setDragImage(row, 0, 0)
                  onItemDragStart({ id: item.id, accountId: account.id })
                }}
                onDragEnd={onItemDragEnd}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/25 mx-auto" />
              </td>
            )}

            {/* Description — click to edit (static text in read-only mode) */}
            <td className="px-4 py-1.5" style={{ paddingLeft: `${indent + 36}px` }}>
              {readOnly ? (
                <span className="text-left">
                  <span className="text-foreground/90">{item.description}</span>
                  {item.lineItemCategory && (
                    <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-primary/8 text-primary/70">
                      {item.lineItemCategory}
                    </span>
                  )}
                  {item.notes && (
                    <span className="ml-2 text-xs text-muted-foreground">({item.notes})</span>
                  )}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  className="group/desc text-left hover:text-primary transition-colors"
                >
                  <span className="text-foreground/90 group-hover/desc:underline underline-offset-2 decoration-dotted">
                    {item.description}
                  </span>
                  {item.lineItemCategory && (
                    <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-primary/8 text-primary/70">
                      {item.lineItemCategory}
                    </span>
                  )}
                  {item.notes && (
                    <span className="ml-2 text-xs text-muted-foreground">({item.notes})</span>
                  )}
                </button>
              )}
            </td>

            {/* QTY */}
            <td className="px-2 py-1.5 text-right">
              {(() => {
                const [hc] = parseQtyFormula(Number(item.quantity), item.quantityFormula)
                return (
                  <span className={`tabular ${hc === 1 ? 'text-foreground/25' : 'text-foreground/70'}`}>
                    {hc}
                  </span>
                )
              })()}
            </td>

            {/* Unit */}
            <td className="px-3 py-1.5 text-right">
              {(() => {
                const [, days] = parseQtyFormula(Number(item.quantity), item.quantityFormula)
                return (
                  <span className="text-xs text-muted-foreground">
                    {fmtUnit(days, item.unit)}
                  </span>
                )
              })()}
            </td>

            {/* Rate */}
            <td className="px-3 py-1.5 text-right">
              <span className="tabular text-foreground/70">{formatMoney(item.rateCents)}</span>
            </td>

            {/* Total */}
            <td className="px-3 py-1.5 text-right tabular font-medium">
              {formatMoney(lineTotal(Number(item.quantity), item.rateCents, Number(item.markupPct) || null))}
            </td>

            {/* Actions */}
            <td className="px-2">
              <div className="flex items-center justify-end gap-0.5">
                {!readOnly && (
                  <>
                    <button
                      type="button" title="Edit"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/item:opacity-100"
                      onClick={() => openEditModal(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button" title="Duplicate"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/item:opacity-100"
                      onClick={() => { void onDuplicate(item.id) }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button" title="Delete"
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </td>
          </tr>
        )
      })}

      {/* ── Child accounts ─────────────────────────────────────────────────── */}
      {!collapsed && account.children?.map(child => (
        <AccountRows
          key={child.id}
          account={child}
          accountIndex={0}
          items={child.lineItems}
          depth={depth + 1}
          onAddItem={onAddItem}
          onMutated={onMutated}
          onAccountDeleted={onAccountDeleted}
          isDragging={false}
          isDragOver={false}
          onHeaderDragStart={() => {}}
          onHeaderDragOver={() => {}}
          onHeaderDragEnd={() => {}}
          onHeaderDrop={() => {}}
          dragItem={dragItem}
          dropZone={dropZone}
          onItemDragStart={onItemDragStart}
          onItemDragEnd={onItemDragEnd}
          onItemDragOverItem={onItemDragOverItem}
          onItemDragOverHeader={onItemDragOverHeader}
          onItemDrop={onItemDrop}
          selectedIds={selectedIds}
          onToggleItem={onToggleItem}
          onToggleAccount={onToggleAccount}
          onDuplicate={onDuplicate}
          flashItemId={flashItemId}
          readOnly={readOnly}
        />
      ))}
    </>
  )
}
