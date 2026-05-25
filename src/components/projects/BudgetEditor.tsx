'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Plus, Trash2, ChevronRight, ChevronDown, Package,
  Upload, GripVertical, Check, X, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AddLineItemModal } from './AddLineItemModal'
import { InsertPackageModal } from './InsertPackageModal'
import { BudgetSummaryBar } from './BudgetSummaryBar'
import { BulkImportModal } from '@/components/budget/BulkImportModal'
import {
  deleteLineItem, addAccount, upsertLineItem, deleteAccount,
  updateAccount, reorderAccounts, reorderLineItems, moveLineItem,
} from '@/server/actions/budgets'
import { formatMoney, lineTotal, centsToRate, rateToCents } from '@/lib/money'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { BudgetWithPhases, AccountWithItems } from '@/types'
import { useRouter } from 'next/navigation'
import type { RateUnit } from '@prisma/client'

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

type EditItemState = {
  item: LineItemRow
  description: string
  quantity: string
  unit: RateUnit
  rate: string
  notes: string
}

// Drag item carries its source account so we can detect cross-account drops
type DragItem = { id: string; accountId: string }

// ─── Root component ───────────────────────────────────────────────────────────

interface Props {
  budget: BudgetWithPhases
  projectId: string
}

export function BudgetEditor({ budget, projectId }: Props) {
  const router = useRouter()
  const [activePhase, setActivePhase] = useState(
    budget.phases.find(p => p.isPrimary)?.id ?? budget.phases[0]?.id
  )

  const currentPhase    = budget.phases.find(p => p.id === activePhase)
  const currentAccounts = (currentPhase?.accounts ?? []) as AccountWithItems[]

  const phaseTotalCents = currentAccounts.reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput), 0
  )
  const budgetMarkupPct = budget.markupPct ? Number(budget.markupPct) : 0
  const budgetTaxPct    = budget.taxPct    ? Number(budget.taxPct)    : 0

  return (
    <div className="pb-20">
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
              budgetId={budget.id}
              projectId={projectId}
              onMutated={() => router.refresh()}
            />
          </TabsContent>
        ))}
      </Tabs>

      <BudgetSummaryBar
        accounts={currentAccounts}
        budgetMarkupPct={budgetMarkupPct}
        budgetTaxPct={budgetTaxPct}
      />
    </div>
  )
}

// ─── Phase view ───────────────────────────────────────────────────────────────

function PhaseView({
  phase, budgetId, projectId, onMutated,
}: {
  phase: BudgetWithPhases['phases'][number]
  budgetId: string
  projectId: string
  onMutated: () => void
}) {
  const [addingToAccount, setAddingToAccount] = useState<string | null>(null)
  const [showPackages, setShowPackages]         = useState(false)
  const [showImport, setShowImport]             = useState(false)
  const [, startTransition] = useTransition()

  // ── Full local account+item state (allows cross-account optimistic updates) ──
  const [localAccounts, setLocalAccounts] = useState<AccountWithItems[]>(
    phase.accounts as AccountWithItems[]
  )
  useEffect(() => {
    setLocalAccounts(phase.accounts as AccountWithItems[])
  }, [phase.accounts])

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
    // Optimistically update codes if they're numeric
    const hasNumericCodes = ordered.some(a => a.code && /^\d+$/.test(a.code))
    const orderedWithCodes = hasNumericCodes
      ? ordered.map((a, i) => ({ ...a, code: String((i + 1) * 100) }))
      : ordered
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

  function handleAddAccount() {
    const name = prompt('Account name (e.g. Camera, Post Production)')
    if (!name?.trim()) return
    startTransition(async () => {
      await addAccount({ phaseId: phase.id, name: name.trim(), order: phase.accounts.length })
      onMutated()
    })
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
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="w-7" />
              <th className="px-4 py-2.5 text-left">Description</th>
              <th className="px-3 py-2.5 text-right w-16">Qty</th>
              <th className="px-3 py-2.5 text-right w-20">Unit</th>
              <th className="px-3 py-2.5 text-right w-28">Rate</th>
              <th className="px-3 py-2.5 text-right w-28">Total</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {localAccounts.map(account => (
              <AccountRows
                key={account.id}
                account={account}
                // Pass the per-account items from the shared local state
                items={account.lineItems}
                depth={0}
                onAddItem={() => setAddingToAccount(account.id)}
                onMutated={onMutated}
                // Account drag
                isDragging={dragAccountId === account.id}
                isDragOver={dropAccountId === account.id && !dragItem}
                onHeaderDragStart={() => setDragAccountId(account.id)}
                onHeaderDragOver={() => !dragItem && setDropAccountId(account.id)}
                onHeaderDragEnd={() => { setDragAccountId(null); setDropAccountId(null) }}
                onHeaderDrop={() => handleAccountDrop(account.id)}
                // Item drag (lifted)
                dragItem={dragItem}
                dropZone={dropZone}
                onItemDragStart={setDragItem}
                onItemDragEnd={() => { setDragItem(null); setDropZone(null) }}
                onItemDragOverItem={(beforeItemId) =>
                  setDropZone({ accountId: account.id, beforeItemId })
                }
                onItemDragOverHeader={() =>
                  setDropZone({ accountId: account.id })
                }
                onItemDrop={handleItemDrop}
                // Account delete
                onAccountDeleted={onMutated}
              />
            ))}
          </tbody>
        </table>
      </div>

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
      </div>

      {addingToAccount && (
        <AddLineItemModal
          open
          onOpenChange={v => { if (!v) setAddingToAccount(null) }}
          accountId={addingToAccount}
          onAdded={onMutated}
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
    </div>
  )
}

// ─── Account rows ─────────────────────────────────────────────────────────────

function AccountRows({
  account, items, depth, onAddItem, onMutated, onAccountDeleted,
  // Account drag
  isDragging, isDragOver,
  onHeaderDragStart, onHeaderDragOver, onHeaderDragEnd, onHeaderDrop,
  // Item drag (from PhaseView)
  dragItem, dropZone,
  onItemDragStart, onItemDragEnd,
  onItemDragOverItem, onItemDragOverHeader, onItemDrop,
}: {
  account: AccountWithItems
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
}) {
  const [collapsed, setCollapsed]       = useState(false)
  const [, startTransition]             = useTransition()
  const [editingName, setEditingName]   = useState(false)
  const [nameValue, setNameValue]       = useState(account.name)
  const [editState, setEditState]       = useState<EditItemState | null>(null)

  const totalCents = sumAccount(account as unknown as AccountInput)
  const indent     = depth * 20

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
  function handleDeleteAccount() {
    const itemCount = items.length
    const msg = itemCount > 0
      ? `Delete "${account.name}" and its ${itemCount} line item${itemCount !== 1 ? 's' : ''}?`
      : `Delete "${account.name}"?`
    if (!confirm(msg)) return
    startTransition(async () => {
      await deleteAccount(account.id)
      onAccountDeleted()
    })
  }

  // ── Item inline edit ──────────────────────────────────────────────────────
  function startEditItem(item: LineItemRow) {
    setEditState({
      item,
      description: item.description,
      quantity:    String(Number(item.quantity)),
      unit:        item.unit,
      rate:        centsToRate(item.rateCents),
      notes:       item.notes ?? '',
    })
  }

  function saveEditItem() {
    if (!editState) return
    const qty       = parseFloat(editState.quantity)
    const rateCents = rateToCents(editState.rate)
    startTransition(async () => {
      await upsertLineItem(editState.item.id, {
        accountId:   account.id,
        description: editState.description.trim() || editState.item.description,
        quantity:    isNaN(qty) || qty <= 0 ? Number(editState.item.quantity) : qty,
        unit:        editState.unit,
        rateCents:   isNaN(rateCents) ? editState.item.rateCents : rateCents,
        rateCardId:  editState.item.rateCardId ?? null,
        markupPct:   editState.item.markupPct ? Number(editState.item.markupPct) : null,
        notes:       editState.notes.trim() || null,
      })
      setEditState(null)
      onMutated()
    })
  }

  // ── Item delete ───────────────────────────────────────────────────────────
  function handleDeleteItem(id: string) {
    if (!confirm('Delete this line item?')) return
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
      {/* ── Account header row ─────────────────────────────────────────────── */}
      <tr
        className={[
          'border-b bg-secondary/40 font-medium transition-colors',
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
        {/* Account drag handle */}
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
                {account.code && (
                  <span className="text-xs font-mono text-muted-foreground">{account.code}</span>
                )}
                {account.name}
              </button>
              <button
                type="button" title="Rename"
                className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground group-hover/name:visible"
                onClick={() => { setNameValue(account.name); setEditingName(true) }}
              >
                <Pencil className="h-3 w-3" />
              </button>
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
          </div>
        </td>
      </tr>

      {/* ── Line item rows ─────────────────────────────────────────────────── */}
      {!collapsed && items.map(item => {
        const isEditing = editState?.item.id === item.id
        const es        = isEditing ? editState! : null
        const isBeingDragged = dragItem?.id === item.id
        const isDropBefore   =
          dropZone?.accountId === account.id &&
          dropZone.beforeItemId === item.id &&
          !isBeingDragged

        const displayTotal = isEditing
          ? lineTotal(parseFloat(es!.quantity) || 0, rateToCents(es!.rate))
          : lineTotal(Number(item.quantity), item.rateCents, Number(item.markupPct) || null)

        return (
          <tr
            key={item.id}
            className={[
              'group/item border-b transition-colors',
              isEditing        ? 'bg-muted/30'     : 'hover:bg-muted/20',
              isBeingDragged   ? 'opacity-40'       : '',
              isDropBefore     ? 'border-t-2 border-t-violet-400' : '',
            ].join(' ')}
            onDragOver={e => { e.preventDefault(); onItemDragOverItem(item.id) }}
            onDrop={e => { e.preventDefault(); onItemDrop() }}
          >
            {/* Item drag handle */}
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

            {/* Description */}
            <td className="px-4 py-1.5" style={{ paddingLeft: `${indent + 36}px` }}>
              {isEditing ? (
                <input
                  autoFocus
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/40"
                  value={es!.description}
                  onChange={e => setEditState(s => s && { ...s, description: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Escape') setEditState(null) }}
                />
              ) : (
                <span className="text-foreground/90">
                  {item.description}
                  {item.notes && (
                    <span className="ml-2 text-xs text-muted-foreground">({item.notes})</span>
                  )}
                </span>
              )}
            </td>

            {/* Qty */}
            <td className="px-3 py-1.5 text-right">
              {isEditing ? (
                <input
                  type="number" min="0" step="0.5"
                  className="w-full rounded border border-border bg-background px-2 py-1 text-right text-sm tabular outline-none focus:ring-1 focus:ring-primary/40"
                  value={es!.quantity}
                  onChange={e => setEditState(s => s && { ...s, quantity: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Escape') setEditState(null) }}
                />
              ) : (
                <span className="tabular text-foreground/70">{Number(item.quantity)}</span>
              )}
            </td>

            {/* Unit */}
            <td className="px-3 py-1.5 text-right">
              {isEditing ? (
                <Select
                  value={es!.unit}
                  onValueChange={v => setEditState(s => s && { ...s, unit: v as RateUnit })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs uppercase text-muted-foreground">{item.unit}</span>
              )}
            </td>

            {/* Rate */}
            <td className="px-3 py-1.5 text-right">
              {isEditing ? (
                <input
                  type="number" min="0" step="50"
                  className="w-full rounded border border-border bg-background px-2 py-1 text-right text-sm tabular outline-none focus:ring-1 focus:ring-primary/40"
                  value={es!.rate}
                  onChange={e => setEditState(s => s && { ...s, rate: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Escape') setEditState(null) }}
                />
              ) : (
                <span className="tabular text-foreground/70">{formatMoney(item.rateCents)}</span>
              )}
            </td>

            {/* Total */}
            <td className="px-3 py-1.5 text-right tabular font-medium">
              {formatMoney(displayTotal)}
            </td>

            {/* Actions */}
            <td className="px-2">
              <div className="flex items-center justify-end gap-0.5">
                {isEditing ? (
                  <>
                    <button
                      type="button" title="Save"
                      className="rounded p-0.5 text-green-600 hover:bg-green-50"
                      onClick={saveEditItem}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button" title="Cancel"
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                      onClick={() => setEditState(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button" title="Edit"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/item:opacity-100"
                      onClick={() => startEditItem(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
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
        />
      ))}
    </>
  )
}
