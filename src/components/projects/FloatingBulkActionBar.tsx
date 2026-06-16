'use client'

import { useState, useTransition } from 'react'
import { X, Trash2, FolderPlus, Check } from 'lucide-react'
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

  // Group form
  const [groupName, setGroupName] = useState('')

  // Inline mass-edit fields — all optional; blank = don't touch that field
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

  const hasEdits = editQty.trim() !== '' || editUnit !== '' || editRate.trim() !== ''

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {ConfirmDialog}

      {/* ── Floating pill ─────────────────────────────────────────────────────
          The OUTER wrapper is pinned to the viewport bottom and clips its
          content (overflow-hidden). The INNER bar slides down via translate-y
          to hide — because the outer clips, that off-screen translate can never
          extend the document's scrollable area (a fixed element translated past
          the viewport edge would otherwise add body scroll → blank space). The
          py-2 top padding gives the bar's shadow room before the clip. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center overflow-hidden px-6 pb-8 pt-6">
        <div
          className={[
            'pointer-events-auto flex items-center gap-1 rounded-xl bg-violet-700 px-4 py-2.5 shadow-2xl shadow-violet-900/50 ring-1 ring-white/10 transition-all duration-300 ease-out',
            count > 0
              ? 'translate-y-0 opacity-100'
              : 'translate-y-[150%] opacity-0',
          ].join(' ')}
        >

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

          {/* Inline mass-edit fields */}
          <div className="flex items-center gap-1.5 px-3 border-r border-white/20">
            <input
              type="number" min="0" step="0.5"
              value={editQty}
              onChange={e => setEditQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleMassEdit() }}
              placeholder="Qty"
              title="Qty / Days — blank leaves each item unchanged"
              className="w-14 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-violet-50 placeholder:text-violet-300 outline-none focus:bg-white/15 focus:border-white/40 tabular-nums"
            />
            <Select value={editUnit} onValueChange={v => setEditUnit(v as RateUnit | '')}>
              <SelectTrigger
                title="Unit — blank leaves each item unchanged"
                className="h-auto w-[5.5rem] rounded-md border-white/20 bg-white/10 px-2 py-1 text-xs text-violet-50 [&>span]:text-violet-50 data-[placeholder]:text-violet-300 focus:bg-white/15"
              >
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map(u => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="number" min="0" step="0.01"
              value={editRate}
              onChange={e => setEditRate(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleMassEdit() }}
              placeholder="Rate"
              title="Rate ($/unit) — blank leaves each item unchanged"
              className="w-16 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-violet-50 placeholder:text-violet-300 outline-none focus:bg-white/15 focus:border-white/40 tabular-nums"
            />
            <button
              type="button"
              title="Apply"
              onClick={handleMassEdit}
              disabled={!hasEdits}
              className="flex items-center justify-center rounded-md h-6 w-6 text-violet-100 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center pl-1">
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
      <Dialog open={groupOpen} onOpenChange={v => { setGroupOpen(v); if (!v) setGroupName('') }} modal={false}>
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
