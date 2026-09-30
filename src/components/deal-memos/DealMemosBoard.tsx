'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatMoney } from '@/lib/money'
import { awardDealMemo, deleteDealMemo, setDealMemoStatus } from '@/server/actions/deal-memos'
import type { DealMemoBoard } from '@/lib/deal-memo-queries'
import { AddBidDialog } from './AddBidDialog'
import { STATUS_META, UNIT_SUFFIX } from './labels'

type Role = DealMemoBoard['roles'][number]
type Memo = Role['memos'][number]

export function DealMemosBoard({ projectId, board }: { projectId: string; board: DealMemoBoard }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const [bidFor, setBidFor] = useState<{ lineItemId: string | null; roleLabel: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const confirmedCents = [...board.roles.flatMap(r => r.memos), ...board.unbudgeted]
    .filter(m => m.status === 'CONFIRMED')
    .reduce((s, m) => s + m.expectedCents, 0)
  const budgetedCents = board.roles.reduce((s, r) => s + r.budgetCents, 0)
  const slotsTotal  = board.roles.reduce((s, r) => s + r.headcount, 0)
  const slotsFilled = board.roles.reduce((s, r) => s + Math.min(r.headcount, r.memos.filter(m => m.status === 'CONFIRMED').length), 0)

  function run(fn: () => Promise<{ success: boolean }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError((res as unknown as { error: string }).error)
      router.refresh()
    })
  }

  async function handleAward(role: Role | null, memo: Memo) {
    const others = role ? role.memos.filter(m => m.status === 'BID' && m.id !== memo.id).length : 0
    const filledAfter = role ? role.memos.filter(m => m.status === 'CONFIRMED').length + 1 : 1
    const closesSlot = !!role && filledAfter >= role.headcount && others > 0
    const ok = await confirm(
      closesSlot
        ? `${memo.contactName} becomes the deal memo for ${memo.roleLabel} and is added to the crew. The other ${others} bid${others === 1 ? '' : 's'} will be marked Not selected.`
        : `${memo.contactName} becomes the deal memo for ${memo.roleLabel} and is added to the crew.`,
      { title: `Award ${memo.contactName}?`, confirmLabel: 'Award' },
    )
    if (!ok) return
    // The server enforces headcount and closes the other bids when the line fills.
    run(() => awardDealMemo(memo.id))
  }

  async function handleCancel(memo: Memo) {
    const ok = await confirm(
      `${memo.contactName}'s confirmed deal memo will be cancelled. Their crew slot stays; you can reopen it as a bid later.`,
      { title: 'Cancel this deal memo?', confirmLabel: 'Cancel memo' },
    )
    if (ok) run(() => setDealMemoStatus(memo.id, 'CANCELLED'))
  }

  async function handleDelete(memo: Memo) {
    const ok = await confirm(`${memo.contactName}'s bid for ${memo.roleLabel} will be permanently deleted.`, { title: 'Delete bid?' })
    if (ok) run(() => deleteDealMemo(memo.id))
  }

  function MemoRow({ role, memo }: { role: Role | null; memo: Memo }) {
    const perSlotBudget = role ? Math.round(role.budgetCents / Math.max(1, role.headcount)) : null
    const delta = perSlotBudget !== null && memo.expectedCents > 0 ? perSlotBudget - memo.expectedCents : null
    const meta = STATUS_META[memo.status]
    return (
      <tr className="border-t border-border text-sm">
        <td className="py-2 pl-4 pr-3">
          <Link href={`/projects/${projectId}/deal-memos/${memo.id}`} className="font-medium text-foreground hover:text-primary">
            {memo.contactName}
          </Link>
          {memo.position !== memo.roleLabel && <span className="block text-xs text-muted-foreground">as “{memo.position}”</span>}
        </td>
        <td className="px-3 py-2 tabular-nums text-muted-foreground">
          {memo.dayRateCents > 0 ? `${formatMoney(memo.dayRateCents)}${UNIT_SUFFIX[memo.dayRateUnit]}` : '—'}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{memo.expectedCents > 0 ? formatMoney(memo.expectedCents) : '—'}</td>
        <td className={`px-3 py-2 text-right tabular-nums text-xs ${delta === null ? 'text-muted-foreground' : delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${formatMoney(Math.abs(delta))}`}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
        </td>
        <td className="py-2 pl-3 pr-4 text-right">
          <div className="flex items-center justify-end gap-3 text-xs font-medium">
            {memo.status === 'BID' && (
              <>
                <button type="button" disabled={isPending} onClick={() => handleAward(role, memo)} className="text-primary hover:underline">Award</button>
                <button type="button" disabled={isPending} onClick={() => run(() => setDealMemoStatus(memo.id, 'NOT_SELECTED'))} className="text-muted-foreground hover:text-foreground">Not selected</button>
              </>
            )}
            {(memo.status === 'NOT_SELECTED' || memo.status === 'CANCELLED') && (
              <button type="button" disabled={isPending} onClick={() => run(() => setDealMemoStatus(memo.id, 'BID'))} className="text-muted-foreground hover:text-foreground">Reopen as bid</button>
            )}
            {memo.status === 'CONFIRMED' && (
              <button type="button" disabled={isPending} onClick={() => handleCancel(memo)} className="text-muted-foreground hover:text-destructive">Cancel</button>
            )}
            {(memo.status === 'BID' || memo.status === 'NOT_SELECTED') && (
              <button type="button" disabled={isPending} onClick={() => handleDelete(memo)} className="text-muted-foreground hover:text-destructive">Delete</button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  function MemoTable({ role, memos }: { role: Role | null; memos: Memo[] }) {
    if (memos.length === 0) return <p className="px-4 py-3 text-sm italic text-muted-foreground">No bids yet.</p>
    return (
      <table className="w-full">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pl-4 pr-3 font-semibold">Person</th>
            <th className="px-3 py-1.5 font-semibold">Rate</th>
            <th className="px-3 py-1.5 text-right font-semibold">Expected</th>
            <th className="px-3 py-1.5 text-right font-semibold" title="Budgeted amount per person minus this memo's expected total">vs budget</th>
            <th className="px-3 py-1.5 font-semibold">Status</th>
            <th className="py-1.5 pl-3 pr-4" />
          </tr>
        </thead>
        <tbody>{memos.map(m => <MemoRow key={m.id} role={role} memo={m} />)}</tbody>
      </table>
    )
  }

  return (
    <div>
      {ConfirmDialog}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Deal Memos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Collect bids for each crew role, then award one to lock in their terms. Internal only — rates here aren’t shared with clients.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Crew slots confirmed" value={`${slotsFilled} / ${slotsTotal}`} />
        <Stat label="Committed (confirmed memos)" value={formatMoney(confirmedCents)} />
        <Stat label="Budgeted for these roles" value={formatMoney(budgetedCents)} />
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {!board.phaseId ? (
        <div className="mb-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          This project has no budget yet. Deal memos are written against the budget’s crew lines — you can still add people outside the budget below.
        </div>
      ) : board.roles.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No crew lines in the budget ({board.phaseName}). Crew roles appear here once budget lines are categorized as crew.
        </div>
      ) : (
        <div className="space-y-4">
          {board.roles.map(role => {
            const confirmed = role.memos.filter(m => m.status === 'CONFIRMED').length
            const filled = confirmed >= role.headcount
            return (
              <section key={role.lineItemId} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center justify-between gap-4 bg-muted/40 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      {role.description}
                      {filled && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {role.accountName} · budget {formatMoney(role.rateCents)}{UNIT_SUFFIX[role.unit]}
                      {role.headcount > 1 ? ` × ${role.headcount} people` : ''} × {role.days} {role.days === 1 ? 'day' : 'days'} = {formatMoney(role.budgetCents)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground">{Math.min(confirmed, role.headcount)} / {role.headcount} confirmed</span>
                    <Button size="sm" variant="outline" onClick={() => setBidFor({ lineItemId: role.lineItemId, roleLabel: role.description })}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add bid
                    </Button>
                  </div>
                </div>
                <MemoTable role={role} memos={role.memos} />
              </section>
            )
          })}
        </div>
      )}

      <section className="mt-8 overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-4 bg-muted/40 px-4 py-3">
          <div>
            <p className="font-medium text-foreground">Not in the budget</p>
            <p className="text-xs text-muted-foreground">People hired for roles the budget doesn’t list. Their actuals come in as unbudgeted lines.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setBidFor({ lineItemId: null, roleLabel: '' })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add someone
          </Button>
        </div>
        <MemoTable role={null} memos={board.unbudgeted} />
      </section>

      {bidFor && (
        <AddBidDialog
          projectId={projectId}
          open={!!bidFor}
          onClose={() => setBidFor(null)}
          lineItemId={bidFor.lineItemId}
          roleLabel={bidFor.roleLabel}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
