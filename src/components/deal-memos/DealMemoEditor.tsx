'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, Lock, Plus, RotateCcw, X } from 'lucide-react'
import type { DealMemoFeeKind, DealMemoStatus, RateUnit } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { centsToRate, formatMoney, rateToCents } from '@/lib/money'
import { feeExpectedCents, lineHeadcountAndDays, memoExpectedCents } from '@/lib/deal-memo-core'
import { resolveMergeTagsPlain, type MergeTagContext } from '@/lib/merge-tags'
import { parseLocalDate } from '@/lib/time-format'
import type { VendorDealMemo } from '@/lib/deal-memo-vendor-view'
import type { PhaseLine } from '@/lib/deal-memo-queries'
import {
  addDealMemoSection, awardDealMemo, deleteDealMemoFee, removeDealMemoSection,
  resetDealMemoSection, setDealMemoStatus, updateDealMemo, updateDealMemoSection, upsertDealMemoFee,
} from '@/server/actions/deal-memos'
import { DealMemoDocument } from './DealMemoDocument'
import { FEE_KIND_LABEL, STATUS_META, UNIT_OPTIONS, UNIT_SUFFIX, VENDOR_STAGE_META, vendorStage } from './labels'
import { DealMemoVendorActions, type VendorLinkInfo } from './DealMemoVendorActions'

export interface EditorFee {
  id: string; kind: DealMemoFeeKind; label: string; rateCents: number; unit: RateUnit
  quantity: number; termsText: string | null; budgetLineItemId: string | null; isAutoRate: boolean
  /** updatedAt — remounts the row when the server changes it (e.g. auto OT). */
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
  sections: { id: string; title: string; body: string; sourceBlockId: string | null; editedFromSource: boolean; version: string }[]
}

interface Props {
  projectId:  string
  memo:       EditorMemo
  lines:      PhaseLine[]
  library:    { id: string; title: string; isDefault: boolean }[]
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

export function DealMemoEditor({ projectId, memo, lines, library, vendorView, showBudget = true, canEdit = true, vendor }: Props) {
  const router = useRouter()
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
  // Remount fee rows when any value their terms depend on changes.
  const termsKey = [memo.workDayHours, memo.otMultiplier, memo.doubleTimeAfterHours,
    memo.doubleTimeMultiplier, memo.productionZoneMiles, memo.position, memo.startDate, memo.endDate].join('|')

  function run(fn: () => Promise<{ success: boolean }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError((res as unknown as { error: string }).error)
      router.refresh()
    })
  }

  const save = (patch: Parameters<typeof updateDealMemo>[1]) => run(() => updateDealMemo(memo.id, patch))

  // Memos started before the budget-rate prefill (or before the line had a
  // rate) can pull it in with one click.
  const dayFee = memo.fees.find(f => f.kind === 'DAY_RATE')
  const canUseBudgetRate = !readOnly && !!roleLine && roleLine.rateCents > 0 && !!dayFee && dayFee.rateCents === 0
  function applyBudgetRate() {
    if (!roleLine || !dayFee) return
    const { days } = lineHeadcountAndDays(roleLine)
    run(() => upsertDealMemoFee(memo.id, {
      id: dayFee.id, kind: dayFee.kind, label: dayFee.label, rateCents: roleLine.rateCents, unit: roleLine.unit,
      quantity: roleLine.unit === 'FLAT' ? 1 : days, termsText: dayFee.termsText ?? '',
      budgetLineItemId: dayFee.budgetLineItemId, isAutoRate: false,
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            {memo.contact?.name ?? 'No contact'} <span className="font-normal text-muted-foreground">— {memo.roleLabel}</span>
          </h1>
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
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
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

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── Internal ───────────────────────────────────────────────────── */}
        <aside className="h-fit space-y-4 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4">
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
              onBlur={e => { if (e.target.value !== (memo.internalNotes ?? '')) save({ internalNotes: e.target.value || null }) }}
            />
          </div>
        </aside>

        {/* ── The deal memo document ─────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_90px]">
              <div className="space-y-1.5">
                <Label htmlFor="dm-position">Role (shown to the vendor)</Label>
                <Input
                  id="dm-position" disabled={readOnly} defaultValue={memo.position}
                  placeholder="e.g. 1st Assistant Camera" title={`Budget line: ${memo.roleLabel}`}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== memo.position) save({ position: v }) }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-start">Start</Label>
                <Input id="dm-start" type="date" disabled={readOnly} defaultValue={toDateInput(memo.startDate)}
                  onBlur={e => { if (e.target.value !== toDateInput(memo.startDate)) save({ startDate: e.target.value || null }) }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-end">End</Label>
                <Input id="dm-end" type="date" disabled={readOnly} defaultValue={toDateInput(memo.endDate)}
                  onBlur={e => { if (e.target.value !== toDateInput(memo.endDate)) save({ endDate: e.target.value || null }) }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dm-days">Days</Label>
                <Input id="dm-days" type="number" min="0" step="0.5" disabled={readOnly} defaultValue={memo.days}
                  onBlur={e => { const n = Number(e.target.value); if (!Number.isNaN(n) && n !== memo.days) save({ days: n }) }} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Work day</Label>
                <div className="flex gap-1">
                  {([10, 12] as const).map(h => (
                    <button key={h} type="button" disabled={readOnly || isPending}
                      onClick={() => { if (memo.workDayHours !== h) save({ workDayHours: h }) }}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${memo.workDayHours === h ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-input text-muted-foreground hover:bg-muted/60'}`}>
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
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Fee structure</h2>
              <span className="text-sm text-muted-foreground">Expected total <span className="ml-1 font-semibold tabular-nums text-foreground">{formatMoney(expected)}</span></span>
            </div>
            <div className="divide-y">
              {memo.fees.map(fee => (
                <FeeRow key={`${fee.id}:${fee.version}:${termsKey}`} fee={fee} lines={lines} termsCtx={termsCtx} disabled={readOnly || isPending}
                  onSave={f => run(() => upsertDealMemoFee(memo.id, f))}
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
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Terms</h2>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  {library.length > 0 && (
                    <select
                      value="" disabled={isPending}
                      onChange={e => { if (e.target.value) run(() => addDealMemoSection(memo.id, { blockId: e.target.value })) }}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="">Add from library…</option>
                      {library.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
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
              <div className="divide-y">
                {memo.sections.map(s => (
                  <SectionEditor key={`${s.id}:${s.version}`} section={s} disabled={readOnly || isPending}
                    onSave={v => run(() => updateDealMemoSection(memo.id, s.id, v))}
                    onReset={() => run(() => resetDealMemoSection(memo.id, s.id))}
                    onRemove={() => run(() => removeDealMemoSection(memo.id, s.id))} />
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
        onBlur={e => { const n = Number(e.target.value); if (e.target.value !== '' && !Number.isNaN(n) && n !== value) onSave(n) }} />
    </div>
  )
}

function FeeRow({ fee, lines, termsCtx, disabled, onSave, onRemove }: {
  fee: EditorFee; lines: PhaseLine[]; termsCtx: MergeTagContext; disabled: boolean
  onSave: (f: Parameters<typeof upsertDealMemoFee>[1]) => void; onRemove: () => void
}) {
  const [label, setLabel] = useState(fee.label)
  const [rate, setRate]   = useState(centsToRate(fee.rateCents))
  const [unit, setUnit]   = useState<RateUnit>(fee.unit)
  const [qty, setQty]     = useState(String(fee.quantity))
  // Shown filled in; the stored template is only replaced if the text is edited.
  const resolvedTerms = resolveMergeTagsPlain(fee.termsText ?? '', termsCtx)
  const [terms, setTerms] = useState(resolvedTerms)
  const [lineId, setLineId] = useState(fee.budgetLineItemId ?? '')

  function commit(overrides: Partial<{ unit: RateUnit; lineId: string; isAutoRate: boolean }> = {}) {
    const rateCents = rateToCents(rate)
    const nextUnit = overrides.unit ?? unit
    const nextLine = overrides.lineId ?? lineId
    const nextQty  = nextUnit === 'FLAT' ? 1 : Number(qty) || 0
    const rateChanged = rateCents !== fee.rateCents
    const termsChanged = terms !== resolvedTerms
    const changed = label.trim() !== fee.label || rateChanged || nextUnit !== fee.unit ||
      nextQty !== fee.quantity || termsChanged ||
      nextLine !== (fee.budgetLineItemId ?? '') || overrides.isAutoRate !== undefined
    if (!changed || !label.trim()) return
    onSave({
      id: fee.id, kind: fee.kind, label: label.trim(), rateCents, unit: nextUnit,
      // Unedited terms keep their template so they keep following the memo.
      quantity: nextQty, termsText: termsChanged ? terms : (fee.termsText ?? ''), budgetLineItemId: nextLine || null,
      // Typing an OT rate by hand takes it off auto; the "auto" link puts it back.
      isAutoRate: overrides.isAutoRate ?? (fee.isAutoRate && !rateChanged),
    })
  }

  const expected = feeExpectedCents({ rateCents: rateToCents(rate), quantity: unit === 'FLAT' ? 1 : Number(qty) || 0 })

  return (
    <div className="group/fee px-5 py-3">
      <div className="grid items-center gap-2 sm:grid-cols-[1.4fr_110px_120px_80px_90px_24px]">
        <Input value={label} disabled={disabled} onChange={e => setLabel(e.target.value)} onBlur={() => commit()} aria-label="Fee name" />
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input className="pl-5 tabular-nums" inputMode="decimal" value={rate} disabled={disabled}
            onChange={e => setRate(e.target.value)} onBlur={() => commit()} aria-label="Rate" />
        </div>
        <select value={unit} disabled={disabled} onChange={e => {
            const next = e.target.value as RateUnit
            setUnit(next)
            if (next === 'FLAT') setQty('1')
            commit({ unit: next })
          }}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" aria-label="Unit">
          {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
        <Input type="number" min="0" step="0.5" value={qty} disabled={disabled || unit === 'FLAT'}
          onChange={e => setQty(e.target.value)} onBlur={() => commit()} aria-label="Quantity" title="Expected quantity" />
        <span className="text-right text-sm tabular-nums text-muted-foreground">{expected > 0 ? formatMoney(expected) : '—'}</span>
        <button type="button" title="Remove fee" disabled={disabled} onClick={onRemove}
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/fee:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 grid items-center gap-2 sm:grid-cols-[1.4fr_1fr]">
        <Input value={terms} disabled={disabled} placeholder="Details & terms (shown to the vendor)"
          onChange={e => setTerms(e.target.value)} onBlur={() => commit()} className="text-[13px]" />
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
          fee.isAutoRate
            ? ' · auto from day rate'
            : <> · set by hand · <button type="button" disabled={disabled} className="inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => commit({ isAutoRate: true })}><RotateCcw className="h-2.5 w-2.5" /> auto</button></>
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

function SectionEditor({ section, disabled, onSave, onReset, onRemove }: {
  section: EditorMemo['sections'][number]; disabled: boolean
  onSave: (v: { title: string; body: string }) => void; onReset: () => void; onRemove: () => void
}) {
  const [title, setTitle] = useState(section.title)
  const [body, setBody]   = useState(section.body)
  const commit = () => { if (title.trim() && (title !== section.title || body !== section.body)) onSave({ title, body }) }
  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex items-center gap-2">
        <Input value={title} disabled={disabled} onChange={e => setTitle(e.target.value)} onBlur={commit} className="font-medium" aria-label="Section title" />
        {section.editedFromSource && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Edited</span>}
        {section.sourceBlockId && section.editedFromSource && (
          <button type="button" disabled={disabled} onClick={onReset} title="Reset to the library version" className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" disabled={disabled} onClick={onRemove} title="Remove section" className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Textarea rows={4} value={body} disabled={disabled} onChange={e => setBody(e.target.value)} onBlur={commit} className="text-[13px]" aria-label="Section text" />
    </div>
  )
}
