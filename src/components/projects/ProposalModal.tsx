'use client'

import { useState, useTransition, useEffect } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
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

interface Deliverable { title: string; description: string }

export type ProposalModalMode = 'create' | 'edit-draft' | 'revision'

interface ExistingProposal {
  id: string
  title: string
  publicToken: string
  expiresAt: string | null
  /** Pre-parsed fields extracted from content JSON */
  about: string
  deliverables: Deliverable[]
  depositPct: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ProposalModalMode
  projectId: string
  budgetId: string
  projectName: string
  totalCents: number
  /** Required for edit-draft and revision modes */
  existing?: ExistingProposal
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

export function ProposalModal({
  open,
  onOpenChange,
  mode,
  projectId,
  budgetId,
  projectName,
  totalCents,
  existing,
  onDone,
}: Props) {
  const [pending, startTransition] = useTransition()

  // ── Form state (re-initialised when modal opens / mode changes) ──────────────
  const [title,       setTitle]       = useState('')
  const [about,       setAbout]       = useState('')
  const [depositPct,  setDepositPct]  = useState('50')
  const [deliverables, setDeliverables] = useState<Deliverable[]>([
    { title: '', description: '' },
    { title: '', description: '' },
    { title: '', description: '' },
  ])
  const [expiresAt, setExpiresAt] = useState(defaultExpiry)
  const [error,     setError]     = useState('')

  // Success state
  const [successToken, setSuccessToken] = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [isDraft,      setIsDraft]      = useState(false)

  // Initialise / reset form when modal opens
  useEffect(() => {
    if (!open) return
    if (existing) {
      setTitle(existing.title)
      setAbout(existing.about)
      setDepositPct(String(existing.depositPct))
      const dels = existing.deliverables.length > 0
        ? [...existing.deliverables, { title: '', description: '' }].slice(0, Math.max(3, existing.deliverables.length))
        : [{ title: '', description: '' }, { title: '', description: '' }, { title: '', description: '' }]
      setDeliverables(dels)
      if (existing.expiresAt) {
        setExpiresAt(existing.expiresAt.split('T')[0])
      } else {
        setExpiresAt(defaultExpiry())
      }
    } else {
      setTitle(`${projectName} — Proposal`)
      setAbout('')
      setDepositPct('50')
      setDeliverables([
        { title: '', description: '' },
        { title: '', description: '' },
        { title: '', description: '' },
      ])
      setExpiresAt(defaultExpiry())
    }
    setError('')
    setSuccessToken(null)
    setCopied(false)
    setIsDraft(false)
  }, [open, existing, projectName])

  function updateDeliverable(i: number, field: keyof Deliverable, value: string) {
    setDeliverables(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  function addDeliverable() {
    setDeliverables(prev => [...prev, { title: '', description: '' }])
  }

  function validate() {
    if (!title.trim()) { setError('Title is required'); return false }
    const dep = parseInt(depositPct, 10)
    if (isNaN(dep) || dep < 0 || dep > 100) { setError('Deposit % must be 0–100'); return false }
    if (!expiresAt) { setError('Valid-through date is required'); return false }
    setError('')
    return true
  }

  function buildInput() {
    return {
      projectId,
      budgetId,
      title:        title.trim(),
      about:        about.trim(),
      deliverables: deliverables.filter(d => d.title.trim()),
      depositPct:   parseInt(depositPct, 10),
      expiresAt,
      totalCents,
    }
  }

  function handleSaveDraft() {
    if (!validate()) return
    startTransition(async () => {
      let result: { success: boolean; data?: { publicToken: string }; error?: string }

      if (mode === 'edit-draft' && existing) {
        const r = await updateDraftProposal(existing.id, buildInput())
        result = r.success
          ? { success: true, data: { publicToken: existing.publicToken } }
          : { success: false, error: (r as { success: false; error: string }).error }
      } else {
        const r = await createDraftProposal(buildInput())
        result = r.success
          ? { success: true, data: { publicToken: r.data.publicToken } }
          : { success: false, error: (r as { success: false; error: string }).error }
      }

      if (result.success && result.data) {
        setSuccessToken(result.data.publicToken)
        setIsDraft(true)
        onDone()
      } else {
        setError(result.error ?? 'Something went wrong')
      }
    })
  }

  function handleSend() {
    if (!validate()) return
    startTransition(async () => {
      // For edit-draft: update content first, then send
      if (mode === 'edit-draft' && existing) {
        const updateResult = await updateDraftProposal(existing.id, buildInput())
        if (!updateResult.success) {
          setError((updateResult as { success: false; error: string }).error)
          return
        }
        const sendResult = await sendDraftProposal(existing.id)
        if (sendResult.success) {
          setSuccessToken(existing.publicToken)
          setIsDraft(false)
          onDone()
        } else {
          setError((sendResult as { success: false; error: string }).error)
        }
        return
      }

      // For create / revision: create sent in one step
      const r = await createSentProposal(buildInput())
      if (r.success) {
        setSuccessToken(r.data.publicToken)
        setIsDraft(false)
        onDone()
      } else {
        setError((r as { success: false; error: string }).error)
      }
    })
  }

  const publicUrl = successToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${successToken}` : null

  async function handleCopy() {
    if (!publicUrl) return
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!pending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {successToken
              ? (isDraft ? 'Draft Saved' : 'Proposal Sent')
              : MODE_TITLE[mode]}
          </DialogTitle>
        </DialogHeader>

        {successToken ? (
          /* ── Success state ── */
          <div className="py-2 space-y-4">
            {isDraft ? (
              <p className="text-sm text-muted-foreground">
                Draft saved. You can continue editing or send it when ready.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your proposal is live. Share this link with your client.
              </p>
            )}

            {!isDraft && (
              <>
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

            <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          /* ── Form ── */
          <div className="grid gap-5 py-2">
            {/* Title */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-title">Proposal title</Label>
              <Input
                id="pm-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* About */}
            <div className="grid gap-1.5">
              <Label htmlFor="pm-about">Project description</Label>
              <textarea
                id="pm-about"
                rows={4}
                placeholder="A brief description of the project shown on the cover and 'The Project' section…"
                value={about}
                onChange={e => setAbout(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Deliverables */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Deliverables</Label>
                <button
                  type="button"
                  onClick={addDeliverable}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Add
                </button>
              </div>
              {deliverables.map((d, i) => (
                <div key={i} className="grid grid-cols-[90px_1fr] gap-2 items-start">
                  <div className="grid gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <Input
                      placeholder="Title"
                      value={d.title}
                      onChange={e => updateDeliverable(i, 'title', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
                      Description
                    </span>
                    <Input
                      placeholder="Short description…"
                      value={d.description}
                      onChange={e => updateDeliverable(i, 'description', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Deposit + Expiry */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pm-deposit">Deposit %</Label>
                <Input
                  id="pm-deposit"
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={depositPct}
                  onChange={e => setDepositPct(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Remainder ({100 - (parseInt(depositPct, 10) || 50)}%) due on delivery
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pm-expiry">Valid through</Label>
                <Input
                  id="pm-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {!successToken && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleSaveDraft} disabled={pending}>
              {pending ? 'Saving…' : 'Save Draft'}
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
