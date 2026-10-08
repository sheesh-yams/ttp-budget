'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, ListChecks, Lock, Plus, RotateCcw, X } from 'lucide-react'
import type { ContractBlockCategory, DealMemoFeeKind, DealMemoStatus, RateUnit } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SmartTextEditor } from '@/components/delivery/SmartTextEditor'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CONTRACT_CATEGORY_LABEL, categoryNeedsReview } from '@/lib/contract-categories'
import { centsToRate, formatMoney, rateToCents } from '@/lib/money'
import { feeExpectedCents, lineHeadcountAndDays, memoExpectedCents } from '@/lib/deal-memo-core'
import { resolveMergeTagsPlain, type MergeTagContext } from '@/lib/merge-tags'
import { parseLocalDate } from '@/lib/time-format'
import type { VendorDealMemo } from '@/lib/deal-memo-vendor-view'
import type { PhaseLine } from '@/lib/deal-memo-queries'
import {
  addDealMemoSection, applyContractTemplateToDealMemo, awardDealMemo, deleteDealMemoFee, moveDealMemoSection, removeDealMemoSection,
  resetDealMemoSection, setDealMemoStatus, updateDealMemo, updateDealMemoSection, upsertDealMemoFee,
} from '@/server/actions/deal-memos'
import { SaveGeneration, SaveScope, SaveStatusLine, useSaveQueue, useSaveScope } from '@/components/autosave/SaveScope'
import { UseTemplateMenu } from '@/components/contracts/UseTemplateMenu'
import { DealMemoDocument } from './DealMemoDocument'
import { FEE_KIND_LABEL, STATUS_META, UNIT_OPTIONS, UNIT_SUFFIX, VENDOR_STAGE_META, vendorStage } from './labels'
import { DealMemoVendorActions, type VendorLinkInfo } from './DealMemoVendorActions'

export interface EditorFee {
  id: string; kind: DealMemoFeeKind; label: string; rateCents: number; unit: RateUnit
  quantity: number; termsText: string | null; budgetLineItemId: string | null; isAutoRate: boolean
  /** updatedAt — the row re-reads server values (e.g. auto OT) when it has no unsaved edits. */
  version: string
}

export interface EditorMemo {
  id: string; status: DealMemoStatus; roleLabel: string; position: string
  startDate: string | null; endDate: string | null; days: number
  workDayHours: number; otMultiplier: number; doubleTimeAfterHours: number
  doubleTimeMultiplier: number; productionZoneMiles: number
  internalNotes: string | null; lineItemId: string | null
  contact: { id: string; name: string; primaryRole: string; email: string | null } | null
  fees: EditorFee[]
  sections: {
    id: string; title: string; body: string; sourceBlockId: string | null
    /** The source block's category; null for blank sections or a deleted block. */
    category: ContractBlockCategory | null
    editedFromSource: boolean; version: string
  }[]
}

interface Props {
  projectId:  string
  memo:       EditorMemo
  lines:      PhaseLine[]
  library:    { id: string; title: string; isDefault: boolean; category: ContractBlockCategory }[]
  vendorView: VendorDealMemo
  /** budget.costs VIEW — the budget rate, budgeted amount and over/under */
  showBudget?: boolean
  /** dealMemos EDIT */
  canEdit?: boolean
  /** Vendor link + signature state (deal memos Phase 2). */
  vendor?: VendorLinkInfo & {
    firstViewedAt:    string | null
    signatureName:    string | null
    signatureEmail:   string | null
    /** Live terms differ from what the vendor was sent. */
    changedSinceSent: boolean
    /** The signed PDF (set once signed). */
    pdfUrl:           string | null
  }
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

/**
 * Edits autosave in batches: a burst of changes saves once, ~2.5s after the
 * last one (SaveScope). Actions that read saved data — send, award, preview,
 * add/remove/move — save everything first.
 */
export function DealMemoEditor(props: Props) {
  return <SaveScope><SaveGeneration><DealMemoEditorInner {...props} /></SaveGeneration></SaveScope>
}

function DealMemoEditorInner({ projectId, memo, lines, library, vendorView, showBudget = true, canEdit = true, vendor }: Props) {
  const router = useRouter()
  const { flushAll, discardFailed } = useSaveScope()
  // Latest on-screen values of each fee row / which sections have unsaved
  // edits — so parent actions use what's typed, not the last saved copy.
  const feeDrafts = useRef(new Map<string, FeePatch>())
  const dirtySections = useRef(new Set<string>())
  const [isPending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const cancelled = memo.status === 'CANCELLED'
  const signed    = !!vendor?.signedAt && memo.status === 'CONFIRMED'
  // Signed terms are what the vendor agreed to — no editing (the server refuses too).
  const readOnly  = cancelled || !canEdit || signed
  const stage     = memo.status === 'CONFIRMED' && vendor ? vendorStage(vendor) : null
  // Sent, unsigned, and the terms changed since — the vendor can't sign the old copy.
  const outdated  = !signed && memo.status === 'CONFIRMED' && !!vendor?.sentAt && !!vendor?.changedSinceSent
  const fmtWhen   = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

  const roleLine = memo.lineItemId ? lines.find(l => l.id === memo.lineItemId) ?? null : null
  const roleSlots = roleLine ? lineHeadcountAndDays(roleLine).headcount : 1
  const perSlotBudget = roleLine && showBudget ? Math.round((roleLine.quantity * roleLine.rateCents) / Math.max(1, roleSlots)) : null
  const expected = memoExpectedCents(memo.fees)

  // Fee terms are stored as templates ("{{dealMemo.workDayHours}}-hour day")
  // so they follow the memo's work-day settings. The editor shows them filled
  // in, exactly as the vendor will read them.
  const fmtDate = (iso: string | null) =>
    parseLocalDate(iso)?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const termsCtx: MergeTagContext = {
    vendor:   { name: memo.contact?.name },
    dealMemo: {
      position:             memo.position,
      workDayHours:         memo.workDayHours,
      otMultiplier:         memo.otMultiplier,
      doubleTimeAfterHours: memo.doubleTimeAfterHours,
      doubleTimeMultiplier: memo.doubleTimeMultiplier,
      productionZoneMiles:  memo.productionZoneMiles,
      startDate:            fmtDate(memo.startDate),
      endDate:              fmtDate(memo.endDate),
    },
  }
  // Explicit actions save every pending edit first, so they act on (and the
  // vendor receives) what's on screen.
  function run(fn: () => Promise<{ success: boolean }>) {
    setError(null)
    startTransition(async () => {
      if (!(await flushAll())) {
        // A save that can't succeed must not block every action — offer to
        // drop those edits and carry on.
        const discard = await confirm('Some changes couldn’t be saved. Discard them and continue?', { title: 'Unsaved changes', confirmLabel: 'Discard and continue' })
        if (!discard) { setError('Some changes couldn’t be saved — retry or discard them first.'); return }
        discardFailed()
      }
      const res = await fn()
      if (!res.success) setError((res as unknown as { error: string }).error)
      router.refresh()
    })
  }

  // Memo fields batch into one updateDealMemo patch.
  const memoQueue = useSaveQueue<Parameters<typeof updateDealMemo>[1]>(patch => updateDealMemo(memo.id, patch))
  const save = (patch: Parameters<typeof updateDealMemo>[1]) => memoQueue.queue(patch)
  // The work-day toggle shows the choice at once (the save follows in a moment).
  const [workDay, setWorkDay] = useState(memo.workDayHours)
  useEffect(() => { if (!memoQueue.busy) setWorkDay(memo.workDayHours) }, [memo.workDayHours, memoQueue])

  async function openPreview() {
    await flushAll()
    router.refresh()
    setShowPreview(true)
  }

  // Removing an edited library section loses those edits — ask first.
  async function removeSection(s: EditorMemo['sections'][number]) {
    if ((s.editedFromSource || dirtySections.current.has(s.id)) && !(await confirm(`Remove “${s.title}”? Your edits to it will be lost.`, { title: 'Remove section', confirmLabel: 'Remove' }))) return
    run(() => removeDealMemoSection(memo.id, s.id))
  }

  // Unticking a library block removes every copy of it on the memo (older
  // memos could add a block twice). Ask first if any copy was edited.
  async function removeBlock(copies: EditorMemo['sections']) {
    const edited = copies.some(c => c.editedFromSource || dirtySections.current.has(c.id))
    if (edited || copies.length > 1) {
      const msg = copies.length > 1
        ? `Remove all ${copies.length} “${copies[0].title}” sections from this memo?${edited ? ' Your edits will be lost.' : ''}`
        : `Remove “${copies[0].title}”? Your edits to it will be lost.`
      if (!(await confirm(msg, { title: 'Remove section', confirmLabel: 'Remove' }))) return
    }
    run(async () => {
      for (const c of copies) {
        const res = await removeDealMemoSection(memo.id, c.id)
        if (!res.success) return res
      }
      return { success: true }
    })
  }

  // Memos started before the budget-rate prefill (or before the line had a
  // rate) can pull it in with one click.
  const dayFee = memo.fees.find(f => f.kind === 'DAY_RATE')
  const canUseBudgetRate = !readOnly && !!roleLine && roleLine.rateCents > 0 && !!dayFee && dayFee.rateCents === 0
  function applyBudgetRate() {
    if (!roleLine || !dayFee) return
    const { days } = lineHeadcountAndDays(roleLine)
    // Start from what's on screen in the row (label/terms typed moments ago).
    const draft = feeDrafts.current.get(dayFee.id)
    run(() => upsertDealMemoFee(memo.id, {
      id: dayFee.id, kind: dayFee.kind, label: draft?.label ?? dayFee.label,
      termsText: draft?.termsText ?? dayFee.termsText ?? '',
      budgetLineItemId: draft ? draft.budgetLineItemId : dayFee.budgetLineItemId,
      rateCents: roleLine.rateCents, unit: roleLine.unit,
      quantity: roleLine.unit === 'FLAT' ? 1 : days, isAutoRate: false,
    }))
  }

  async function handleAward() {
    const ok = await confirm(
      `${memo.contact?.name ?? 'This person'} becomes the deal memo for ${memo.roleLabel} and is added to the crew. If that fills the role, its other bids are marked Not selected.`,
      { title: 'Award this bid?', confirmLabel: 'Award' },
    )
    if (ok) run(() => awardDealMemo(memo.id))
  }

  const meta = STATUS_META[memo.status]

  return (
    <div>
      {ConfirmDialog}
      <Link href={`/projects/${projectId}/deal-memos`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Deal Memos
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">
            {memo.contact?.name ?? 'No contact'} <span className="font-normal text-muted-foreground">— {memo.roleLabel}</span>
          </h1>
          <SaveStatusLine />
          {stage ? (
            <>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${VENDOR_STAGE_META[stage].className}`}>{VENDOR_STAGE_META[stage].label}</span>
              {outdated && (
                <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Outdated — re-send</span>
              )}
            </>
          ) : (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && memo.status === 'BID' && (
            <>
              <Button variant="outline" size="sm" disabled={isPending} onClick={() => run(() => setDealMemoStatus(memo.id, 'NOT_SELECTED'))}>Not selected</Button>
              <Button size="sm" disabled={isPending} onClick={handleAward}>Award</Button>
            </>
          )}
          {canEdit && (memo.status === 'NOT_SELECTED' || memo.status === 'CANCELLED') && (
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => run(() => setDealMemoStatus(memo.id, 'BID'))}>Reopen as bid</Button>
          )}
          {canEdit && memo.status === 'CONFIRMED' && vendor && (
            <DealMemoVendorActions
              memoId={memo.id} vendorName={memo.contact?.name ?? 'the vendor'} roleLabel={memo.roleLabel} link={vendor}
            />
          )}
          <Button variant="outline" size="sm" onClick={() => void openPreview()}>
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview as vendor
          </Button>
        </div>
      </div>

      {signed && vendor && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Signed by <span className="font-semibold">{vendor.signatureName}</span> ({vendor.signatureEmail}) on {fmtWhen(vendor.signedAt!)}.
          The terms are locked — cancel the deal memo to change them.
          {vendor.pdfUrl && (
            <> <a href={vendor.pdfUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Download PDF</a></>
          )}
          {vendor.changedSinceSent && (
            <span className="mt-1 block text-amber-800">
              The terms below changed after it was sent and differ from what they signed. The signed version
              {vendor.url ? <> (<a href={vendor.url} target="_blank" rel="noreferrer" className="underline">vendor link</a>)</> : ''} is the agreement.
            </span>
          )}
        </p>
      )}
      {!signed && memo.status === 'CONFIRMED' && vendor?.sentAt && (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${vendor.changedSinceSent ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          Sent to {vendor.sentToEmail} on {fmtWhen(vendor.sentAt)}
          {vendor.firstViewedAt ? ` · viewed ${fmtWhen(vendor.firstViewedAt)}` : ' · not opened yet'}.
          {outdated && (
            <span className="mt-1 block font-medium">
              Outdated: the terms changed after you sent it. The vendor’s link now says it’s out of date and they can’t
              sign it. Re-send to give them the updated deal memo.
            </span>
          )}
        </p>
      )}

      {cancelled && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          This deal memo is cancelled and read-only. Reopen it as a bid to make changes.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── Internal ───────────────────────────────────────────────────── */}
        {/* Phones: after the memo itself, so the fields you fill in come first. */}
        <aside className="order-last md:order-none h-fit space-y-4 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
            <Lock className="h-3 w-3" /> Internal — never shown to the vendor
          </p>
          <div>
            <p className="text-xs text-muted-foreground">Budget role</p>
            <p className="text-sm font-medium text-foreground">{memo.roleLabel}</p>
            <p className="text-xs text-muted-foreground">
              {roleLine
                ? (showBudget ? `${roleLine.accountName} · budget ${formatMoney(roleLine.rateCents)}${UNIT_SUFFIX[roleLine.unit]}` : roleLine.accountName)
                : memo.lineItemId ? 'Budget line no longer exists' : 'Not in the budget'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rolodex</p>
            <p className="text-sm font-medium text-foreground">{memo.contact?.name ?? '—'}</p>
            {memo.contact && <p className="text-xs text-muted-foreground">{memo.contact.primaryRole}{memo.contact.email ? ` · ${memo.contact.email}` : ''}</p>}
          </div>
          <div className="rounded-lg border bg-white px-3 py-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Expected cost</span><span className="font-medium tabular-nums">{formatMoney(expected)}</span></div>
            {perSlotBudget !== null && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Budgeted{roleSlots > 1 ? ' per person' : ''}</span><span className="tabular-nums">{formatMoney(perSlotBudget)}</span></div>
                <div className={`flex justify-between border-t pt-1 mt-1 font-medium ${perSlotBudget - expected >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  <span>{perSlotBudget - expected >= 0 ? 'Under budget' : 'Over budget'}</span>
                  <span className="tabular-nums">{formatMoney(Math.abs(perSlotBudget - expected))}</span>
                </div>
              </>
            )}
            {canUseBudgetRate && roleLine && (
              <button type="button" disabled={isPending} onClick={applyBudgetRate}
                className="mt-2 w-full rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                Use the budget rate ({formatMoney(roleLine.rateCents)}{UNIT_SUFFIX[roleLine.unit]})
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dm-notes" className="text-xs">Internal notes</Label>
            <Textarea
              id="dm-notes" rows={4} disabled={readOnly} defaultValue={memo.internalNotes ?? ''}
              placeholder="Negotiation notes, availability, references…"
              onChange={e => save({ internalNotes: e.target.value || null })}
            />
          </div>
        </aside>

        {/* ── The deal memo document ─────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-[2fr_1fr_1fr_90px]">
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="dm-position">Role (shown to the vendor)</Label>
                <Input
                  id="dm-position" disabled={readOnly} defaultValue={memo.position}
                  placeholder="e.g. 1st Assistant Camera" title={`Budget line: ${memo.roleLabel}`}
                  onChange={e => { const v = e.target.value.trim(); save({ position: v || memo.position }) }}
                  onBlur={e => { if (!e.target.value.trim()) e.target.value = memo.position }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-start">Start</Label>
                <Input id="dm-start" type="date" disabled={readOnly} defaultValue={toDateInput(memo.startDate)}
                  onChange={e => save({ startDate: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-end">End</Label>
                <Input id="dm-end" type="date" disabled={readOnly} defaultValue={toDateInput(memo.endDate)}
                  onChange={e => save({ endDate: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-days">Days</Label>
                <Input id="dm-days" type="number" min="0" step="0.5" disabled={readOnly} defaultValue={memo.days}
                  onChange={e => { const n = Number(e.target.value); if (e.target.value !== '' && !Number.isNaN(n)) save({ days: n }) }} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3 sm:gap-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Work day</Label>
                <div className="flex gap-1">
                  {([10, 12] as const).map(h => (
                    <button key={h} type="button" disabled={readOnly}
                      onClick={() => { setWorkDay(h); save({ workDayHours: h }) }}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${workDay === h ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-input text-muted-foreground hover:bg-muted/60'}`}>
                      {h}-hour
                    </button>
                  ))}
                </div>
              </div>
              <NumberField label="OT ×" value={memo.otMultiplier} step="0.1" disabled={readOnly} onSave={v => save({ otMultiplier: v })} />
              <NumberField label="Double time after (hrs)" value={memo.doubleTimeAfterHours} step="1" disabled={readOnly} onSave={v => save({ doubleTimeAfterHours: Math.round(v) })} />
              <NumberField label="Double time ×" value={memo.doubleTimeMultiplier} step="0.1" disabled={readOnly} onSave={v => save({ doubleTimeMultiplier: v })} />
              <NumberField label="Zone (miles)" value={memo.productionZoneMiles} step="1" disabled={readOnly} onSave={v => save({ productionZoneMiles: Math.round(v) })} />
            </div>
          </section>

          {/* Fees */}
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-foreground">Fee structure</h2>
              <span className="text-sm text-muted-foreground">Total <span className="ml-1 font-semibold tabular-nums text-foreground">{formatMoney(expected)}</span></span>
            </div>
            <div className="divide-y">
              {memo.fees.map(fee => (
                <FeeRow key={fee.id} memoId={memo.id} fee={fee} lines={lines} termsCtx={termsCtx} disabled={readOnly} drafts={feeDrafts.current}
                  onRemove={() => run(() => deleteDealMemoFee(memo.id, fee.id))} />
              ))}
            </div>
            {!readOnly && (
              <div className="border-t px-5 py-3">
                <button type="button" disabled={isPending}
                  onClick={() => run(() => upsertDealMemoFee(memo.id, { kind: 'CUSTOM', label: 'Additional fee', rateCents: 0, unit: 'FLAT', quantity: 1, termsText: '' }))}
                  className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add fee
                </button>
              </div>
            )}
          </section>

          {/* Terms */}
          <section className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-foreground">Terms</h2>
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <UseTemplateMenu audience="VENDOR" disabled={isPending}
                    onApply={templateId => run(() => applyContractTemplateToDealMemo(memo.id, templateId))} />
                  {library.length > 0 && (
                    <TermsPicker
                      library={library} sections={memo.sections} disabled={isPending}
                      onAdd={blockId => run(() => addDealMemoSection(memo.id, { blockId }))}
                      onRemove={removeBlock}
                    />
                  )}
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => addDealMemoSection(memo.id, { adHoc: true }))}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Blank section
                  </Button>
                </div>
              )}
            </div>
            {memo.sections.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                No terms yet. Add them from your crew &amp; vendor library in <Link href="/settings/contracts?for=vendor" className="text-primary hover:underline">Settings → Contracts</Link>, or start a blank section.
              </p>
            ) : (
              <div className="space-y-3 p-4">
                {memo.sections.map((s, i) => (
                  <SectionEditor key={s.id} memoId={memo.id} section={s} disabled={readOnly} actionsDisabled={readOnly || isPending} dirty={dirtySections.current}
                    isFirst={i === 0} isLast={i === memo.sections.length - 1}
                    onReset={() => run(() => resetDealMemoSection(memo.id, s.id))}
                    onMove={dir => run(() => moveDealMemoSection(memo.id, s.id, dir))}
                    onRemove={() => removeSection(s)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-none w-screen h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none sm:rounded-none gap-0 p-0 overflow-y-auto bg-[#FAFAF8] [&>button]:hidden">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-amber-50 px-6 py-2.5 text-sm text-amber-800">
            <span>Vendor preview — this is everything {memo.contact?.name ?? 'the vendor'} will see. Internal fields are hidden.</span>
            <button type="button" onClick={() => setShowPreview(false)} className="rounded-full p-1 hover:bg-amber-100" aria-label="Close preview">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="py-8"><DealMemoDocument memo={vendorView} /></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NumberField({ label, value, step, disabled, onSave }: {
  label: string; value: number; step: string; disabled: boolean; onSave: (v: number) => void
}) {
  return (
    <div className="w-28 space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} min="0" disabled={disabled} defaultValue={value}
        onChange={e => { const n = Number(e.target.value); if (e.target.value !== '' && !Number.isNaN(n)) onSave(n) }} />
    </div>
  )
}

type FeePatch = Parameters<typeof upsertDealMemoFee>[1]

function FeeRow({ memoId, fee, lines, termsCtx, disabled, drafts, onRemove }: {
  memoId: string; fee: EditorFee; lines: PhaseLine[]; termsCtx: MergeTagContext; disabled: boolean
  /** The parent's registry of on-screen values (used by "Use the budget rate"). */
  drafts: Map<string, FeePatch>
  onRemove: () => void
}) {
  const [label, setLabel] = useState(fee.label)
  const [rate, setRate]   = useState(centsToRate(fee.rateCents))
  const [unit, setUnit]   = useState<RateUnit>(fee.unit)
  const [qty, setQty]     = useState(String(fee.quantity))
  // Terms are a template ("{{dealMemo.workDayHours}}-hour day") until the
  // user types in them: until then the box always shows the live filled-in
  // text and saves keep the template, so they keep following the memo.
  const resolvedTerms = resolveMergeTagsPlain(fee.termsText ?? '', termsCtx)
  const [termsDraft, setTermsDraft] = useState<string | null>(null)
  const terms = termsDraft ?? resolvedTerms
  const [lineId, setLineId] = useState(fee.budgetLineItemId ?? '')
  // OT: typing a rate takes it off auto; the "auto" link puts it back.
  const [autoRate, setAutoRate] = useState(fee.isAutoRate)

  const queue = useSaveQueue<FeePatch>(f => upsertDealMemoFee(memoId, f))
  useEffect(() => () => { drafts.delete(fee.id) }, [drafts, fee.id])

  // Adopt the server's values when they change (auto OT, another save) — but
  // only fields that actually mean something different from what's typed, so
  // a half-typed "1." or a cleared rate is never rewritten under the cursor.
  useEffect(() => {
    if (queue.busy) return
    if (label.trim() !== fee.label) setLabel(fee.label)
    if (rateToCents(rate) !== fee.rateCents) setRate(centsToRate(fee.rateCents))
    if (unit !== fee.unit) setUnit(fee.unit)
    if ((Number(qty) || 0) !== fee.quantity) setQty(String(fee.quantity))
    if (lineId !== (fee.budgetLineItemId ?? '')) setLineId(fee.budgetLineItemId ?? '')
    if (autoRate !== fee.isAutoRate) setAutoRate(fee.isAutoRate)
    if (termsDraft !== null && termsDraft === resolvedTerms) setTermsDraft(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fee.version, fee.label, fee.rateCents, fee.unit, fee.quantity, fee.budgetLineItemId, fee.isAutoRate, resolvedTerms])

  // Every change queues the whole row (the latest wins); one save after a pause.
  function commit(next: Partial<{ label: string; rate: string; unit: RateUnit; qty: string; termsDraft: string | null; lineId: string; autoRate: boolean }>) {
    const v = { label, rate, unit, qty, termsDraft, lineId, autoRate, ...next }
    const patch: FeePatch = {
      id: fee.id, kind: fee.kind,
      // A blanked-out name saves as the last saved one (never a stray letter).
      label: v.label.trim() || fee.label,
      rateCents: rateToCents(v.rate), unit: v.unit,
      quantity: v.unit === 'FLAT' ? 1 : Number(v.qty) || 0,
      // Typed text that matches the filled-in template is still the template.
      termsText: v.termsDraft !== null && v.termsDraft !== resolvedTerms ? v.termsDraft : (fee.termsText ?? ''),
      budgetLineItemId: v.lineId || null,
      isAutoRate: v.autoRate,
    }
    drafts.set(fee.id, patch)
    queue.queue(patch)
  }

  const expected = feeExpectedCents({ rateCents: rateToCents(rate), quantity: unit === 'FLAT' ? 1 : Number(qty) || 0 })

  return (
    <div className="group/fee px-4 py-3 sm:px-5">
      {/* Phones: name across, then rate + unit, then quantity + total. */}
      <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1.4fr_110px_120px_80px_90px_24px]">
        <Input value={label} disabled={disabled} onChange={e => { setLabel(e.target.value); commit({ label: e.target.value }) }}
          onBlur={() => { if (!label.trim()) setLabel(fee.label) }} aria-label="Fee name" className="col-span-2 sm:col-span-1" />
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input className="pl-5 tabular-nums" inputMode="decimal" value={rate} disabled={disabled}
            onChange={e => { setRate(e.target.value); setAutoRate(false); commit({ rate: e.target.value, autoRate: false }) }} aria-label="Rate" />
        </div>
        <select value={unit} disabled={disabled} onChange={e => {
            const next = e.target.value as RateUnit
            setUnit(next)
            if (next === 'FLAT') setQty('1')
            commit({ unit: next, ...(next === 'FLAT' ? { qty: '1' } : {}) })
          }}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" aria-label="Unit">
          {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
        <Input type="number" min="0" step="0.5" value={qty} disabled={disabled || unit === 'FLAT'}
          onChange={e => { setQty(e.target.value); commit({ qty: e.target.value }) }} aria-label="Quantity" title="Expected quantity" />
        <span className="text-right text-sm tabular-nums text-muted-foreground">{expected > 0 ? formatMoney(expected) : '—'}</span>
        {/* No hover on touch screens: always visible on phones (when editable). */}
        {disabled ? <span className="hidden sm:block" /> : <button type="button" title="Remove fee" onClick={onRemove}
          className="col-span-2 inline-flex items-center gap-1 justify-self-end rounded p-0.5 text-xs text-muted-foreground transition-opacity hover:text-destructive sm:col-span-1 sm:opacity-0 sm:group-hover/fee:opacity-100">
          <X className="h-3.5 w-3.5" /><span className="sm:hidden">Remove fee</span>
        </button>}
      </div>
      <div className="mt-2 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1.4fr_1fr]">
        <Input value={terms} disabled={disabled} placeholder="Details & terms (shown to the vendor)"
          onChange={e => { setTermsDraft(e.target.value); commit({ termsDraft: e.target.value }) }} className="text-[13px]" />
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-violet-700" title="Internal only">Actuals →</span>
          <select value={lineId} disabled={disabled}
            onChange={e => { setLineId(e.target.value); commit({ lineId: e.target.value }) }}
            className="h-8 min-w-0 flex-1 rounded-md border border-dashed border-violet-300 bg-violet-50/40 px-2 text-[12px]" aria-label="Actuals line">
            <option value="">Default ({defaultTargetLabel(fee.kind)})</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.accountName} › {l.description}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {FEE_KIND_LABEL[fee.kind]}
        {fee.kind === 'OVERTIME' && (
          autoRate
            ? ' · auto from day rate'
            : <> · set by hand · <button type="button" disabled={disabled} className="inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => { setAutoRate(true); commit({ autoRate: true }) }}><RotateCcw className="h-2.5 w-2.5" /> auto</button></>
        )}
      </p>
    </div>
  )
}

function defaultTargetLabel(kind: DealMemoFeeKind): string {
  if (kind === 'DAY_RATE' || kind === 'OVERTIME') return 'their budget line'
  if (kind === 'KIT') return 'their kit line, else its own line'
  return 'its own line'
}

/** Library checklist: ticked = already on this memo. Ticking adds, unticking removes. */
function TermsPicker({ library, sections, disabled, onAdd, onRemove }: {
  library: Props['library']; sections: EditorMemo['sections']; disabled: boolean
  onAdd: (blockId: string) => void; onRemove: (copies: EditorMemo['sections']) => void
}) {
  // Every section on the memo from each block (normally one).
  const onMemo = new Map<string, EditorMemo['sections']>()
  for (const s of sections) if (s.sourceBlockId) onMemo.set(s.sourceBlockId, [...(onMemo.get(s.sourceBlockId) ?? []), s])
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <ListChecks className="mr-1 h-3.5 w-3.5" /> Choose terms
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">Tick to add a block from your crew &amp; vendor library; untick to remove it.</p>
        <div className="max-h-80 overflow-y-auto">
          {library.map(b => {
            const copies = onMemo.get(b.id)
            return (
              <label key={b.id} className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
                <input
                  type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={!!copies} disabled={disabled}
                  onChange={() => (copies ? onRemove(copies) : onAdd(b.id))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{b.title}</span>
                  <span className={`text-[11px] ${categoryNeedsReview(b.category) ? 'text-blue-700' : 'text-muted-foreground'}`}>
                    {CONTRACT_CATEGORY_LABEL[b.category]}{b.isDefault ? ' · Default' : ''}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SectionEditor({ memoId, section, disabled, actionsDisabled, dirty, isFirst, isLast, onReset, onMove, onRemove }: {
  memoId: string; section: EditorMemo['sections'][number]
  /** The parent's set of sections with unsaved edits (remove asks first). */
  dirty: Set<string>
  /** Signed / cancelled / view-only — not editable, no toolbar. */
  disabled: boolean
  /** Reset / move / remove — also off while an action runs. */
  actionsDisabled: boolean
  isFirst: boolean; isLast: boolean
  onReset: () => void
  onMove: (dir: 'up' | 'down') => void; onRemove: () => void
}) {
  const [title, setTitle] = useState(section.title)
  const [body, setBody]   = useState(section.body)
  const queue = useSaveQueue<{ title: string; body: string }>(v => updateDealMemoSection(memoId, section.id, v))
  // Re-read the server copy (e.g. after Reset) unless edits are on their way —
  // and leave text alone that only differs by the server trimming it.
  useEffect(() => {
    if (queue.busy) return
    dirty.delete(section.id)
    if (title.trim() !== section.title) setTitle(section.title)
    if (body !== section.body) setBody(section.body)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.version, section.title, section.body])
  useEffect(() => () => { dirty.delete(section.id) }, [dirty, section.id])
  // A blanked-out title saves as the last saved one.
  const edit = (v: { title: string; body: string }) => {
    dirty.add(section.id)
    queue.queue({ title: v.title.trim() ? v.title : section.title, body: v.body })
  }
  // SOW / Custom library blocks and blank sections are templates to tailor — blue.
  const review = !section.sourceBlockId || categoryNeedsReview(section.category)
  const reviewLabel = section.category === 'SOW' ? 'Scope of work' : 'Custom'
  const inputTone = review ? 'border-blue-200 focus-visible:ring-blue-400' : ''
  return (
    <div className={`space-y-2 rounded-lg border px-4 py-3 ${review ? 'border-blue-300 bg-blue-50/40' : 'border-violet-200'}`}>
      {/* Phones: the title gets its own line; badges and controls wrap below. */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Input value={title} disabled={disabled} onChange={e => { setTitle(e.target.value); edit({ title: e.target.value, body }) }}
          onBlur={() => { if (!title.trim()) setTitle(section.title) }} className={`basis-full font-medium sm:basis-auto ${inputTone}`} aria-label="Section title" />
        {review && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700" title="Tailor this section for the job">{reviewLabel} — review</span>}
        {section.editedFromSource && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Edited</span>}
        {section.sourceBlockId && section.editedFromSource && (
          <button type="button" disabled={actionsDisabled} onClick={onReset} title="Reset to the library version" className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" disabled={actionsDisabled || isFirst} onClick={() => onMove('up')} title="Move up" className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={actionsDisabled || isLast} onClick={() => onMove('down')} title="Move down" className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={actionsDisabled} onClick={onRemove} title="Remove section" className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Same editor as the library blocks in Settings: styles + vendor merge tags. */}
      <SmartTextEditor
        value={body} onChange={v => { setBody(v); edit({ title, body: v }) }} readOnly={disabled}
        rows={5} showMergeTags mergeTagSet="vendor" hideHint
        frameClassName={review ? 'border-blue-200 bg-white' : 'bg-white'}
      />
    </div>
  )
}
