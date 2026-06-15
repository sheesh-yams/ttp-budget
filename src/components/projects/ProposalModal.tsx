'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { Copy, Check, ExternalLink, Plus, X, Tag } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createSentProposal,
  createDraftProposal,
  updateDraftProposal,
  sendDraftProposal,
} from '@/server/actions/proposals'
import type { MilestoneTrigger, PaymentMilestone, ProposalDiscount } from '@/types'

export type ProposalModalMode = 'create' | 'edit-draft' | 'revision'

// ─── Local milestone state (before converting to PaymentMilestone for the server) ──

type AmtType = 'pct' | 'flat'

interface LocalMilestone {
  id: string
  amtType: AmtType
  pctValue: string    // used when amtType === 'pct'
  flatValue: string   // used when amtType === 'flat' (dollars)
  trigger: MilestoneTrigger
  customDate: string
}

const TRIGGER_OPTIONS: { value: MilestoneTrigger; label: string }[] = [
  { value: 'on_signing',   label: 'On signing'   },
  { value: 'on_shoot_day', label: 'On shoot day'  },
  { value: 'on_delivery',  label: 'On delivery'   },
  { value: 'net_30',       label: 'Net 30'        },
  { value: 'net_60',       label: 'Net 60'        },
  { value: 'net_90',       label: 'Net 90'        },
  { value: 'custom_date',  label: 'Custom date'   },
]

function newId() { return crypto.randomUUID().slice(0, 8) }

function defaultMilestones(): LocalMilestone[] {
  return [
    { id: newId(), amtType: 'pct', pctValue: '50', flatValue: '', trigger: 'on_signing',  customDate: '' },
    { id: newId(), amtType: 'pct', pctValue: '50', flatValue: '', trigger: 'on_delivery', customDate: '' },
  ]
}

function fromPaymentMilestones(ms: PaymentMilestone[]): LocalMilestone[] {
  return ms.map(m => ({
    id: m.id,
    amtType: 'pct' as AmtType,
    pctValue: String(Math.round(m.percentPct * 100)),
    flatValue: '',
    trigger: m.trigger,
    customDate: m.customDate ?? '',
  }))
}

function toPaymentMilestones(locals: LocalMilestone[], totalCents: number): PaymentMilestone[] {
  const totalDollars = totalCents / 100
  return locals.map(m => {
    let percentPct: number
    if (m.amtType === 'flat') {
      const flat = parseFloat(m.flatValue) || 0
      percentPct = totalDollars > 0 ? flat / totalDollars : 0
    } else {
      percentPct = (parseFloat(m.pctValue) || 0) / 100
    }
    const label = TRIGGER_OPTIONS.find(t => t.value === m.trigger)?.label ?? m.trigger
    return {
      id: m.id,
      name: label,
      percentPct,
      trigger: m.trigger,
      ...(m.trigger === 'custom_date' && m.customDate ? { customDate: m.customDate } : {}),
    }
  })
}

function computeTotalPct(locals: LocalMilestone[], totalCents: number): number {
  const totalDollars = totalCents / 100
  return locals.reduce((sum, m) => {
    if (m.amtType === 'flat') {
      const flat = parseFloat(m.flatValue) || 0
      return sum + (totalDollars > 0 ? (flat / totalDollars) * 100 : 0)
    }
    return sum + (parseFloat(m.pctValue) || 0)
  }, 0)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExistingProposal {
  id: string
  title: string
  publicToken: string
  expiresAt: string | null
  milestones?: PaymentMilestone[]
  discount?: ProposalDiscount
  about?: string
  deliverables?: unknown[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ProposalModalMode
  projectId: string
  budgetId: string
  projectName: string
  totalCents: number
  existing?: ExistingProposal
  prefill?: { milestones?: PaymentMilestone[]; about?: string; deliverables?: unknown[] }
  onDone: () => void
}

const MODE_TITLE: Record<ProposalModalMode, string> = {
  'create':     'New Proposal',
  'edit-draft': 'Edit Draft',
  'revision':   'New Revision',
}

function defaultExpiry() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalModal({
  open,
  onOpenChange,
  mode,
  projectId,
  budgetId,
  projectName,
  totalCents,
  existing,
  prefill,
  onDone,
}: Props) {
  const [pending, startTransition] = useTransition()

  const [title,      setTitle]      = useState('')
  const [expiresAt,  setExpiresAt]  = useState(defaultExpiry)
  const [milestones, setMilestones] = useState<LocalMilestone[]>(defaultMilestones)
  const [error,      setError]      = useState('')
  const [successToken,   setSuccessToken]   = useState<string | null>(null)
  const [copied,         setCopied]         = useState(false)
  const [isDraft,        setIsDraft]        = useState(false)
  const [isSentManually, setIsSentManually] = useState(false)

  // Discount state
  const [discountType,  setDiscountType]  = useState<'none' | 'flat' | 'pct'>('none')
  const [discountLabel, setDiscountLabel] = useState('Discount')
  const [discountFlat,  setDiscountFlat]  = useState('')   // dollar string, e.g. "500"
  const [discountPct,   setDiscountPct]   = useState('')   // percent string, e.g. "10"

  useEffect(() => {
    if (!open) return
    if (existing) {
      setTitle(existing.title)
      setExpiresAt(existing.expiresAt ? existing.expiresAt.split('T')[0] : defaultExpiry())
      setMilestones(existing.milestones?.length ? fromPaymentMilestones(existing.milestones) : defaultMilestones())
      const d = existing.discount
      if (d) {
        setDiscountType(d.type)
        setDiscountLabel(d.label || 'Discount')
        setDiscountFlat(d.type === 'flat' && d.valueCents ? String(d.valueCents / 100) : '')
        setDiscountPct(d.type === 'pct' && d.valuePct ? String(d.valuePct) : '')
      } else {
        setDiscountType('none'); setDiscountLabel('Discount'); setDiscountFlat(''); setDiscountPct('')
      }
    } else {
      setTitle(`${projectName} — Proposal`)
      setExpiresAt(defaultExpiry())
      setMilestones(prefill?.milestones?.length ? fromPaymentMilestones(prefill.milestones) : defaultMilestones())
      setDiscountType('none'); setDiscountLabel('Discount'); setDiscountFlat(''); setDiscountPct('')
    }
    setError('')
    setSuccessToken(null)
    setCopied(false)
    setIsDraft(false)
    setIsSentManually(false)
  }, [open, existing, projectName, prefill])

  // ── Milestone helpers ──────────────────────────────────────────────────────

  function addMilestone() {
    setMilestones(prev => [
      ...prev,
      { id: newId(), amtType: 'pct', pctValue: '0', flatValue: '', trigger: 'on_delivery', customDate: '' },
    ])
  }

  function removeMilestone(i: number) {
    setMilestones(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateMilestone(i: number, patch: Partial<LocalMilestone>) {
    setMilestones(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate() {
    if (!title.trim()) { setError('Title is required'); return false }
    if (!expiresAt) { setError('Valid-through date is required'); return false }
    const total = computeTotalPct(milestones, totalCents)
    if (Math.abs(total - 100) > 0.5) {
      setError(`Payment schedule must total 100% (currently ${total.toFixed(1)}%)`)
      return false
    }
    setError('')
    return true
  }

  // ── Base input ─────────────────────────────────────────────────────────────

  function baseInput() {
    return {
      projectId,
      budgetId,
      title: title.trim(),
      milestones: toPaymentMilestones(milestones, discountedTotalCents),
      expiresAt,
      totalCents: discountedTotalCents,
      discount: discountPayload,
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleSaveDraft() {
    if (!validate()) return
    startTransition(async () => {
      let result: { success: boolean; data?: { publicToken: string }; error?: string }

      if (mode === 'edit-draft' && existing) {
        const r = await updateDraftProposal(existing.id, baseInput())
        result = r.success
          ? { success: true, data: { publicToken: existing.publicToken } }
          : { success: false, error: (r as { success: false; error: string }).error }
      } else {
        const r = await createDraftProposal(baseInput())
        result = r.success
          ? { success: true, data: { publicToken: r.data.publicToken } }
          : { success: false, error: (r as { success: false; error: string }).error }
      }

      if (result.success && result.data) {
        setSuccessToken(result.data.publicToken)
        setIsDraft(true)
      } else {
        setError(result.error ?? 'Something went wrong')
      }
    })
  }

  function handleSend() {
    if (!validate()) return
    startTransition(async () => {
      if (mode === 'edit-draft' && existing) {
        const updateResult = await updateDraftProposal(existing.id, baseInput())
        if (!updateResult.success) { setError((updateResult as { success: false; error: string }).error); return }
        const sendResult = await sendDraftProposal(existing.id)
        if (sendResult.success) { setSuccessToken(existing.publicToken); setIsDraft(false) }
        else { setError((sendResult as { success: false; error: string }).error) }
        return
      }
      const r = await createSentProposal(baseInput())
      if (r.success) { setSuccessToken(r.data.publicToken); setIsDraft(false) }
      else { setError((r as { success: false; error: string }).error) }
    })
  }

  // Same flow as handleSend but marks isSentManually — when email sending is
  // added to handleSend, this path will remain the bypass (no email sent).
  function handleMarkSent() {
    if (!validate()) return
    startTransition(async () => {
      if (mode === 'edit-draft' && existing) {
        const updateResult = await updateDraftProposal(existing.id, baseInput())
        if (!updateResult.success) { setError((updateResult as { success: false; error: string }).error); return }
        const sendResult = await sendDraftProposal(existing.id)
        if (sendResult.success) { setSuccessToken(existing.publicToken); setIsDraft(false); setIsSentManually(true) }
        else { setError((sendResult as { success: false; error: string }).error) }
        return
      }
      const r = await createSentProposal(baseInput())
      if (r.success) { setSuccessToken(r.data.publicToken); setIsDraft(false); setIsSentManually(true) }
      else { setError((r as { success: false; error: string }).error) }
    })
  }

  const publicUrl = successToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${successToken}` : null

  async function handleCopy() {
    if (!publicUrl) return
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose(v: boolean) {
    if (pending) return
    if (!v && successToken) onDone()
    onOpenChange(v)
  }

  // ── Discount computation ──────────────────────────────────────────────────

  const discountedTotalCents = useMemo(() => {
    if (discountType === 'flat') {
      const d = Math.round((parseFloat(discountFlat) || 0) * 100)
      return Math.max(0, totalCents - d)
    }
    if (discountType === 'pct') {
      const pct = parseFloat(discountPct) || 0
      return Math.max(0, Math.round(totalCents * (1 - pct / 100)))
    }
    return totalCents
  }, [discountType, discountFlat, discountPct, totalCents])

  const discountPayload = useMemo((): ProposalDiscount | undefined => {
    if (discountType === 'none') return undefined
    return {
      type: discountType,
      label: discountLabel.trim() || 'Discount',
      ...(discountType === 'flat' ? { valueCents: Math.round((parseFloat(discountFlat) || 0) * 100) } : {}),
      ...(discountType === 'pct'  ? { valuePct: parseFloat(discountPct) || 0 } : {}),
    }
  }, [discountType, discountLabel, discountFlat, discountPct])

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalPct   = computeTotalPct(milestones, discountedTotalCents)
  const totalOk    = Math.abs(totalPct - 100) <= 0.5
  const totalDollars = discountedTotalCents / 100

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {successToken ? (isDraft ? 'Draft Saved' : (isSentManually ? 'Marked as Sent' : 'Proposal Sent')) : MODE_TITLE[mode]}
          </DialogTitle>
        </DialogHeader>

        {successToken ? (
          <div className="py-2 space-y-4">
            {isDraft ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Draft saved. Preview it or send when ready.</p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href={publicUrl!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Preview draft
                  </a>
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {isSentManually
                    ? 'Marked as sent — no email was sent. Share this link with your client manually.'
                    : 'Your proposal is live. Share this link with your client.'}
                </p>
                <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-3">
                  <code className="flex-1 text-xs text-foreground break-all">{publicUrl}</code>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <Button asChild className="w-full" size="sm">
                  <a href={publicUrl!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Preview proposal
                  </a>
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={() => handleClose(false)}>Done</Button>
          </div>
        ) : (
          <div className="grid gap-5 py-2">

            {/* Title */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-title">Proposal title</Label>
              <Input id="pm-title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            </div>

            {/* Valid through */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-expiry">Valid through</Label>
              <Input id="pm-expiry" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-48" />
            </div>

            {/* Payment schedule */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Payment schedule</Label>
                <button
                  type="button"
                  onClick={addMilestone}
                  className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add payment
                </button>
              </div>

              <div className="rounded-lg border border-border/70 overflow-hidden">
                {milestones.map((m, i) => (
                  <div key={m.id} className="group/row border-b last:border-0">
                    {/* Main row */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      {/* Amount input + type toggle */}
                      <div className="flex items-center shrink-0">
                        <div className="flex items-center rounded-md border border-input overflow-hidden">
                          <span className="px-1.5 py-1 text-xs text-muted-foreground bg-muted/40 border-r border-input select-none">
                            {m.amtType === 'pct' ? '%' : '$'}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step={m.amtType === 'pct' ? '1' : '100'}
                            value={m.amtType === 'pct' ? m.pctValue : m.flatValue}
                            onChange={e => updateMilestone(i, m.amtType === 'pct'
                              ? { pctValue: e.target.value }
                              : { flatValue: e.target.value }
                            )}
                            className="w-16 px-2 py-1 text-sm text-right bg-transparent focus:outline-none"
                          />
                        </div>
                        {/* Toggle % / $ */}
                        <button
                          type="button"
                          onClick={() => updateMilestone(i, {
                            amtType: m.amtType === 'pct' ? 'flat' : 'pct',
                            pctValue: m.amtType === 'flat'
                              ? String(Math.round(((parseFloat(m.flatValue) || 0) / totalDollars) * 100))
                              : m.pctValue,
                            flatValue: m.amtType === 'pct'
                              ? String(Math.round(((parseFloat(m.pctValue) || 0) / 100) * totalDollars))
                              : m.flatValue,
                          })}
                          className="ml-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          title={m.amtType === 'pct' ? 'Switch to fixed $' : 'Switch to %'}
                        >
                          {m.amtType === 'pct' ? '→$' : '→%'}
                        </button>
                      </div>

                      {/* Trigger */}
                      <select
                        value={m.trigger}
                        onChange={e => updateMilestone(i, { trigger: e.target.value as MilestoneTrigger })}
                        className="flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {TRIGGER_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>

                      {/* Remove */}
                      {milestones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMilestone(i)}
                          className="shrink-0 opacity-0 group-hover/row:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Custom date row */}
                    {m.trigger === 'custom_date' && (
                      <div className="px-3 pb-2">
                        <Input
                          type="date"
                          value={m.customDate}
                          onChange={e => updateMilestone(i, { customDate: e.target.value })}
                          className="w-48 h-7 text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Total indicator */}
              <div className={`flex items-center justify-end gap-1.5 text-xs ${totalOk ? 'text-green-600' : 'text-amber-600'}`}>
                {totalOk
                  ? <><Check className="h-3 w-3" /> Total: 100%</>
                  : <>Total: {totalPct.toFixed(1)}% — must equal 100%</>
                }
              </div>
            </div>

            {/* Discount */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  Discount
                </Label>
                <div className="flex items-center rounded-md border border-border/60 overflow-hidden text-xs">
                  {(['none', 'flat', 'pct'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDiscountType(t)}
                      className={`px-2.5 py-1 font-medium transition-colors ${
                        discountType === t
                          ? 'bg-violet-600 text-white'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {t === 'none' ? 'None' : t === 'flat' ? 'Flat $' : '% of total'}
                    </button>
                  ))}
                </div>
              </div>

              {discountType !== 'none' && (
                <div className="rounded-lg border border-border/60 p-3 space-y-2.5">
                  {/* Label */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Label</p>
                      <input
                        type="text"
                        placeholder="New client discount"
                        value={discountLabel}
                        onChange={e => setDiscountLabel(e.target.value)}
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 rounded-md border border-input px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div className="grid gap-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {discountType === 'flat' ? 'Amount ($)' : 'Percentage (%)'}
                      </p>
                      <div className="flex items-center rounded-md border border-input overflow-hidden">
                        <span className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/40 border-r border-input select-none">
                          {discountType === 'flat' ? '$' : '%'}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step={discountType === 'flat' ? '50' : '1'}
                          placeholder={discountType === 'flat' ? '500' : '10'}
                          value={discountType === 'flat' ? discountFlat : discountPct}
                          onChange={e => discountType === 'flat'
                            ? setDiscountFlat(e.target.value)
                            : setDiscountPct(e.target.value)
                          }
                          className="flex-1 px-2 py-1.5 text-sm text-right bg-transparent focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Discount preview */}
                  {discountedTotalCents < totalCents && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                      <span className="text-muted-foreground">After discount</span>
                      <span className="font-semibold text-foreground">
                        ${(discountedTotalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="ml-1.5 text-emerald-600 font-medium">
                          (-${((totalCents - discountedTotalCents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2">
              Description and deliverables are pulled from the <strong>Proposal Overview</strong> section on the project page.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {!successToken && (
          <DialogFooter className="gap-2 sm:gap-1 flex-wrap">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={pending}>Cancel</Button>
            <Button variant="outline" onClick={handleSaveDraft} disabled={pending}>
              {pending ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button variant="outline" onClick={handleMarkSent} disabled={pending} className="text-muted-foreground">
              {pending ? 'Saving…' : 'Mark as Sent'}
            </Button>
            <Button onClick={handleSend} disabled={pending}>
              {pending ? 'Sending…' : mode === 'edit-draft' ? 'Save & Send' : 'Send Proposal'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
