'use client'

import { useState, useTransition } from 'react'
import { X, Trash2, FolderPlus, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  bulkDeleteLineItems,
  bulkMoveToNewAccount,
  bulkUpdateLineItems,
} from '@/server/actions/budgets'
import { rateToCents } from '@/lib/money'
import type { RateUnit } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  selectedIds: string[]
  phaseId:     string
  onClear:     () => void
  onMutated:   () => void
}

const UNITS: { value: RateUnit; label: string }[] = [
  { value: 'HOUR',     label: 'Hour'     },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'DAY',      label: 'Day'      },
  { value: 'WEEK',     label: 'Week'     },
  { value: 'FLAT',     label: 'Flat'     },
  { value: 'EACH',     label: 'Each'     },
  { value: 'MILE',     label: 'Mile'     },
]

// ─── Floating bar ─────────────────────────────────────────────────────────────

export function FloatingBulkActionBar({ selectedIds, phaseId, onClear, onMutated }: Props) {
  const count = selectedIds.length
  const [, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  // Dialog open states
  const [groupOpen, setGroupOpen] = useState(false)
  const [editOpen,  setEditOpen]  = useState(false)

  // Group form
  const [groupName, setGroupName] = useState('')

  // Mass-edit form — all optional; blank = don't touch that field
  const [editQty,  setEditQty]  = useState('')
  const [editUnit, setEditUnit] = useState<RateUnit | ''>('')
  const [editRate, setEditRate] = useState('')

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    const ok = await confirm(
      `${count} line item${count !== 1 ? 's' : ''} will be permanently removed from this budget.`,
      { title: `Delete ${count} item${count !== 1 ? 's' : ''}?`, key: 'bulk-delete-line-items' }
    )
    if (!ok) return
    startTransition(async () => {
      await bulkDeleteLineItems(selectedIds)
      onClear()
      onMutated()
    })
  }

  function handleGroup() {
    if (!groupName.trim()) return
    const name = groupName.trim()
    setGroupOpen(false)
    setGroupName('')
    startTransition(async () => {
      await bulkMoveToNewAccount(selectedIds, name, phaseId)
      onClear()
      onMutated()
    })
  }

  function handleMassEdit() {
    const updates: { quantity?: number; unit?: RateUnit; rateCents?: number } = {}
    const qty = parseFloat(editQty)
    if (editQty.trim() && !isNaN(qty))  updates.quantity  = qty
    if (editUnit)                        updates.unit      = editUnit
    const rate = parseFloat(editRate)
    if (editRate.trim() && !isNaN(rate)) updates.rateCents = rateToCents(rate)

    setEditOpen(false)
    setEditQty('')
    setEditUnit('')
    setEditRate('')

    if (!Object.keys(updates).length) return

    startTransition(async () => {
      await bulkUpdateLineItems(selectedIds, updates)
      onClear()
      onMutated()
    })
  }

  function closeEdit() {
    setEditOpen(false)
    setEditQty('')
    setEditUnit('')
    setEditRate('')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {ConfirmDialog}

      {/* ── Floating pill ─────────────────────────────────────────────────── */}
      <div
        className={[
          'fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out',
          count > 0
            ? 'translate-y-0 opacity-100'
            : 'translate-y-16 opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <div className="flex items-center gap-1 rounded-full bg-violet-700 px-4 py-2.5 shadow-2xl shadow-violet-900/50 ring-1 ring-white/10">

          {/* Count + clear */}
          <div className="flex items-center gap-2 pr-3 border-r border-white/20">
            <span className="text-sm font-semibold text-violet-50 whitespace-nowrap tabular-nums">
              {count} {count === 1 ? 'item' : 'items'} selected
            </span>
            <button
              type="button"
              onClick={onClear}
              title="Clear selection"
              className="flex items-center justify-center rounded-full h-5 w-5 text-violet-300 hover:text-violet-50 hover:bg-white/15 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center pl-1">
            <PillButton
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Mass edit"
              onClick={() => setEditOpen(true)}
            />
            <PillButton
              icon={<FolderPlus className="h-3.5 w-3.5" />}
              label="Group"
              onClick={() => setGroupOpen(true)}
            />
            <PillButton
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Delete"
              onClick={handleDelete}
              danger
            />
          </div>
        </div>
      </div>

      {/* ── Group into Account dialog ──────────────────────────────────────── */}
      <Dialog open={groupOpen} onOpenChange={v => { setGroupOpen(v); if (!v) setGroupName('') }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Group into new account</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-group-name">Account name</Label>
              <Input
                id="bulk-group-name"
                autoFocus
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="e.g. Camera, Post Production, Travel"
                onKeyDown={e => { if (e.key === 'Enter') handleGroup() }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {count} line item{count !== 1 ? 's' : ''} will be moved into this new account.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGroupOpen(false); setGroupName('') }}>
              Cancel
            </Button>
            <Button onClick={handleGroup} disabled={!groupName.trim()}>
              Create group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mass edit dialog ───────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={v => { if (!v) closeEdit(); else setEditOpen(true) }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              Mass edit {count} item{count !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-xs text-muted-foreground -mt-1">
              Leave a field blank to keep each item&apos;s current value.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-qty">Qty / Days</Label>
                <Input
                  id="bulk-qty"
                  type="number"
                  min="0"
                  step="0.5"
                  value={editQty}
                  onChange={e => setEditQty(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-unit">Unit</Label>
                <Select
                  value={editUnit}
                  onValueChange={v => setEditUnit(v as RateUnit | '')}
                >
                  <SelectTrigger id="bulk-unit">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-rate">Rate ($/unit)</Label>
              <Input
                id="bulk-rate"
                type="number"
                min="0"
                step="0.01"
                value={editRate}
                onChange={e => setEditRate(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>Cancel</Button>
            <Button onClick={handleMassEdit}>
              Apply to {count} item{count !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Pill button ──────────────────────────────────────────────────────────────

function PillButton({
  icon, label, onClick, danger = false,
}: {
  icon:    React.ReactNode
  label:   string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        danger
          ? 'text-red-300 hover:bg-red-500/25 hover:text-red-200'
          : 'text-violet-100 hover:bg-white/12 hover:text-white',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  )
}
