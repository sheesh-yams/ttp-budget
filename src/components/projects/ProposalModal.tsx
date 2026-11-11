'use client'

import { ClientPeopleChecklist } from '@/components/clients/ClientPersonPicker'
import { defaultPreparedFor, readSnapshots, retargetPreparedFor, type ClientPerson } from '@/lib/client-people'
import { useState, useTransition, useEffect, useRef } from 'react'
import { Copy, Check, ExternalLink, Plus, X } from 'lucide-react'
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
import type { MilestoneTrigger, PaymentMilestone } from '@/types'
import { ContractTab } from '@/components/proposals/ContractTab'

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
  about?: string
  deliverables?: unknown[]
  contractEnabled?: boolean
  recipientEmails?: string[]
  /** Saved To; null = the client's contact email. */
  toEmail?: string | null
  /** Who it was prepared for — stored snapshots ([{ contactId, name, … }]). */
  clientContacts?: unknown
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
  proposalExpiryDays?: number
  /** Contract permission: NONE hides the Contract tab, VIEW shows it read-only. */
  contractAccess?: 'NONE' | 'VIEW' | 'EDIT'
  /** The client's contact email — the default To. */
  clientEmail?: string | null
  /** The client's standard proposal CC — fills a new proposal or a draft with no CC yet. */
  defaultCc?: string[]
  /** The client's people (only for people who can send) — the Prepared for list. */
  people?: ClientPerson[]
}

const MODE_TITLE: Record<ProposalModalMode, string> = {
  'create':     'New Proposal',
  'edit-draft': 'Edit Draft',
  'revision':   'New Revision',
}

function defaultExpiry(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() + days)
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
  proposalExpiryDays = 30,
  contractAccess = 'EDIT',
  clientEmail = null,
  defaultCc = [],
  people = [],
}: Props) {
  // A string, so a re-render with an equal list doesn't reset the form.
  const defaultCcText = defaultCc.join(', ')
  // Read inside the reset effect without re-running it when the list re-renders.
  const peopleRef = useRef(people)
  peopleRef.current = people

  /**
   * Ticking or unticking people only touches their own addresses: someone
   * unticked leaves To/CC; someone ticked fills an empty To, else joins CC.
   * Everything else in To/CC (typed, standard CC, other people) stays.
   */
  function togglePreparedFor(ids: string[]) {
    const r = retargetPreparedFor({
      to, cc: parseRecipients(recipients), prev: preparedFor, next: ids,
      emailOf: id => people.find(p => p.id === id)?.email ?? null,
    })
    setPreparedFor(ids)
    setTo(r.to)
    setRecipients(r.cc.join(', '))
  }


  const [pending, startTransition] = useTransition()
  const [activeTab, setActiveTab]  = useState<'overview' | 'contract'>('overview')

  const [title,      setTitle]      = useState('')
  const [to,         setTo]         = useState('')
  const [recipients, setRecipients] = useState('')
  // Prepared for: ClientContact ids, in the order picked (the first is To).
  const [preparedFor, setPreparedFor] = useState<string[]>([])
  const [expiresAt,  setExpiresAt]  = useState(() => defaultExpiry(proposalExpiryDays))
  const [milestones, setMilestones] = useState<LocalMilestone[]>(defaultMilestones)
  const [error,      setError]      = useState('')
  const [successToken,   setSuccessToken]   = useState<string | null>(null)
  const [successId,      setSuccessId]      = useState<string | null>(null)
  const [copied,         setCopied]         = useState(false)
  const [isDraft,        setIsDraft]        = useState(false)
  const [isSentManually, setIsSentManually] = useState(false)

  // Keep a ref so the reset effect can read the current successToken without
  // adding it to the dependency array (which would cause spurious re-runs).
  const successTokenRef = useRef(successToken)
  successTokenRef.current = successToken

  useEffect(() => {
    if (!open) return
    // If the success screen is already showing, don't reset it. This prevents
    // revalidatePath re-renders (which change `prefill`) from wiping the screen.
    if (successTokenRef.current) return
    if (existing) {
      setTitle(existing.title)
      setTo(existing.toEmail ?? clientEmail ?? '')
      const saved = readSnapshots(existing.clientContacts)
      setPreparedFor(saved
        ? saved.flatMap(x => (x.contactId && peopleRef.current.some(p => p.id === x.contactId) ? [x.contactId] : []))
        // Saved before "Prepared for" existed: the people already in To/CC.
        : (() => {
            const addrs = [existing.toEmail ?? clientEmail ?? '', ...(existing.recipientEmails ?? [])].map(e => e.trim().toLowerCase())
            return addrs.flatMap(a => peopleRef.current.filter(p => p.email && p.email.toLowerCase() === a).map(p => p.id))
          })())
      // A draft that was never sent and has no CC yet takes the client's
      // standard CC; anything already sent keeps what it went to.
      setRecipients(existing.recipientEmails?.length ? existing.recipientEmails.join(', ') : mode === 'edit-draft' ? defaultCcText : '')
      setExpiresAt(existing.expiresAt ? existing.expiresAt.split('T')[0] : defaultExpiry(proposalExpiryDays))
      setMilestones(existing.milestones?.length ? fromPaymentMilestones(existing.milestones) : defaultMilestones())
    } else {
      setTitle(`${projectName} — Proposal`)
      // Prepared for the client's Proposals people (else Main): the first is
      // To, the others are copied — on top of the standard proposal CC.
      const picked = defaultPreparedFor(peopleRef.current)
      const emails = picked.map(p => p.email).filter((e): e is string => !!e)
      setPreparedFor(picked.map(p => p.id))
      setTo(emails[0] ?? clientEmail ?? '')
      setRecipients([...new Set([...emails.slice(1), ...(defaultCcText ? defaultCcText.split(', ') : [])])].join(', '))
      setExpiresAt(defaultExpiry(proposalExpiryDays))
      setMilestones(prefill?.milestones?.length ? fromPaymentMilestones(prefill.milestones) : defaultMilestones())
    }
    setError('')
    setSuccessToken(null)
    setSuccessId(null)
    setCopied(false)
    setIsDraft(false)
    setIsSentManually(false)
    setActiveTab('overview')
  }, [open, existing, projectName, prefill, clientEmail, defaultCcText, mode])

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

  function parseRecipients(raw: string): string[] {
    return raw.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean)
  }

  function baseInput() {
    return {
      projectId,
      budgetId,
      title: title.trim(),
      milestones: toPaymentMilestones(milestones, totalCents),
      expiresAt,
      totalCents,
      recipientEmails: parseRecipients(recipients),
      toEmail: to.trim() || null,
      ...(people.length ? { clientContactIds: preparedFor } : {}),
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleSaveDraft() {
    if (!validate()) return
    startTransition(async () => {
      let result: { success: boolean; data?: { id: string; publicToken: string }; error?: string }

      if (mode === 'edit-draft' && existing) {
        const r = await updateDraftProposal(existing.id, baseInput())
        result = r.success
          ? { success: true, data: { id: existing.id, publicToken: existing.publicToken } }
          : { success: false, error: (r as { success: false; error: string }).error }
      } else {
        const r = await createDraftProposal(baseInput())
        result = r.success
          ? { success: true, data: { id: r.data.id, publicToken: r.data.publicToken } }
          : { success: false, error: (r as { success: false; error: string }).error }
      }

      if (result.success && result.data) {
        setSuccessToken(result.data.publicToken)
        setSuccessId(result.data.id)
        setIsDraft(true)
      } else {
        setError(result.error ?? 'Something went wrong')
      }
    })
  }

  function handleSend() {
    if (!validate()) return
    if (!to.trim()) { setError('Add a To address to send — or use "Mark as Sent".'); return }
    startTransition(async () => {
      if (mode === 'edit-draft' && existing) {
        const updateResult = await updateDraftProposal(existing.id, baseInput())
        if (!updateResult.success) { setError((updateResult as { success: false; error: string }).error); return }
        const sendResult = await sendDraftProposal(existing.id, true)
        if (sendResult.success) { setSuccessToken(existing.publicToken); setSuccessId(existing.id); setIsDraft(false) }
        else { setError((sendResult as { success: false; error: string }).error) }
        return
      }
      const r = await createSentProposal({ ...baseInput(), sendEmail: true })
      if (r.success) { setSuccessToken(r.data.publicToken); setSuccessId(r.data.id); setIsDraft(false) }
      else { setError((r as { success: false; error: string }).error) }
    })
  }

  // ── Send / mark-sent directly from the "Draft Saved" success screen ────────
  // Lets you go straight from Save Draft → Send without closing and reopening
  // the edit modal — the draft was just saved, so its content is already
  // current; no need to run updateDraftProposal again first.

  function handleSendFromSuccess() {
    if (!successId) return
    startTransition(async () => {
      const r = await sendDraftProposal(successId, true)
      if (r.success) setIsDraft(false)
      else setError((r as { success: false; error: string }).error)
    })
  }

  function handleMarkSentFromSuccess() {
    if (!successId) return
    startTransition(async () => {
      const r = await sendDraftProposal(successId, false)
      if (r.success) { setIsDraft(false); setIsSentManually(true) }
      else setError((r as { success: false; error: string }).error)
    })
  }

  // Bypass — flips status to SENT without ever attempting an email. Use when
  // you've already shared the link manually.
  function handleMarkSent() {
    if (!validate()) return
    startTransition(async () => {
      if (mode === 'edit-draft' && existing) {
        const updateResult = await updateDraftProposal(existing.id, baseInput())
        if (!updateResult.success) { setError((updateResult as { success: false; error: string }).error); return }
        const sendResult = await sendDraftProposal(existing.id, false)
        if (sendResult.success) { setSuccessToken(existing.publicToken); setIsDraft(false); setIsSentManually(true) }
        else { setError((sendResult as { success: false; error: string }).error) }
        return
      }
      const r = await createSentProposal({ ...baseInput(), sendEmail: false })
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

  // ── Derived ────────────────────────────────────────────────────────────────
  // totalCents already reflects the budget's own discount (set in the Budget
  // editor's rates bar) — proposals no longer carry a separate discount.

  const totalPct   = computeTotalPct(milestones, totalCents)
  const totalOk    = Math.abs(totalPct - 100) <= 0.5
  const totalDollars = totalCents / 100

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={activeTab === 'contract' && mode === 'edit-draft' && !successToken ? 'sm:max-w-[960px]' : 'sm:max-w-[520px]'}>
        <DialogHeader>
          <DialogTitle>
            {successToken ? (isDraft ? 'Draft Saved' : (isSentManually ? 'Marked as Sent' : 'Proposal Sent')) : MODE_TITLE[mode]}
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar — only visible in edit-draft mode, not on the success screen */}
        {mode === 'edit-draft' && !successToken && existing && contractAccess !== 'NONE' && (
          <div className="flex border-b border-border -mx-6 px-6 -mt-1">
            {(['overview', 'contract'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {tab === 'overview' ? 'Overview' : 'Contract'}
              </button>
            ))}
          </div>
        )}

        {/* Contract tab */}
        {activeTab === 'contract' && mode === 'edit-draft' && existing && !successToken && contractAccess !== 'NONE' && (
          <div className="py-2">
            <ContractTab proposalId={existing.id} contractEnabled={existing.contractEnabled ?? true} canEdit={contractAccess === 'EDIT'} />
          </div>
        )}

        {activeTab === 'overview' && successToken ? (
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
                <Button size="sm" className="w-full" onClick={handleSendFromSuccess} disabled={pending}>
                  {pending ? 'Sending…' : 'Send Proposal'}
                </Button>
                <button
                  type="button"
                  onClick={handleMarkSentFromSuccess}
                  disabled={pending}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
                >
                  Mark as sent instead (no email)
                </button>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {isSentManually
                    ? 'Marked as sent — no email was sent. Share this link with your client manually.'
                    : `Your proposal has been emailed to ${to.trim() || clientEmail || 'the client'}.`}
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
        ) : activeTab === 'overview' ? (
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

            {/* Prepared for */}
            {people.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Prepared for</Label>
                <ClientPeopleChecklist people={people} selected={preparedFor} onChange={togglePreparedFor} />
                <p className="text-xs text-muted-foreground">
                  Shown as “Attn:” on the proposal. The first person picked is the To; the others are copied.
                </p>
              </div>
            )}

            {/* To */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-to">To</Label>
              <Input
                id="pm-to"
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="client@example.com"
              />
              <p className="text-xs text-muted-foreground">
                {clientEmail && to.trim().toLowerCase() !== clientEmail.toLowerCase()
                  ? <>The client’s contact email is {clientEmail}. This proposal goes to the address above instead.</>
                  : 'Starts as the client’s contact email. Change it to send this proposal to someone else.'}
              </p>
            </div>

            {/* CC */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-recipients">CC</Label>
              <Input
                id="pm-recipients"
                value={recipients}
                onChange={e => setRecipients(e.target.value)}
                placeholder="colleague@client.com, approver@client.com"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. A copy also goes to you. Only the To, CC and client contact
                addresses can e-sign it.
              </p>
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

            <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2">
              Description and deliverables are pulled from the <strong>Proposal Overview</strong> section on the project page.
              Discounts are now set in the <strong>Budget</strong> editor, alongside the agency fee — they apply here and on invoices automatically.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : null}

        {!successToken && activeTab === 'overview' && (
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
