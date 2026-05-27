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

export type ProposalModalMode = 'create' | 'edit-draft' | 'revision'

interface ExistingProposal {
  id: string
  title: string
  publicToken: string
  expiresAt: string | null
  depositPct: number
  // kept in type for compatibility but no longer shown in modal
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
  prefill?: { depositPct: number; about?: string; deliverables?: unknown[] }
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
  prefill,
  onDone,
}: Props) {
  const [pending, startTransition] = useTransition()

  const [title,      setTitle]      = useState('')
  const [depositPct, setDepositPct] = useState('50')
  const [expiresAt,  setExpiresAt]  = useState(defaultExpiry)
  const [error,      setError]      = useState('')
  const [successToken, setSuccessToken] = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [isDraft,      setIsDraft]      = useState(false)

  useEffect(() => {
    if (!open) return
    if (existing) {
      setTitle(existing.title)
      setDepositPct(String(existing.depositPct))
      setExpiresAt(existing.expiresAt ? existing.expiresAt.split('T')[0] : defaultExpiry())
    } else {
      setTitle(`${projectName} — Proposal`)
      setDepositPct(String(prefill?.depositPct ?? 50))
      setExpiresAt(defaultExpiry())
    }
    setError('')
    setSuccessToken(null)
    setCopied(false)
    setIsDraft(false)
  }, [open, existing, projectName, prefill])

  function validate() {
    if (!title.trim()) { setError('Title is required'); return false }
    const dep = parseInt(depositPct, 10)
    if (isNaN(dep) || dep < 0 || dep > 100) { setError('Deposit % must be 0–100'); return false }
    if (!expiresAt) { setError('Valid-through date is required'); return false }
    setError('')
    return true
  }

  function baseInput() {
    return {
      projectId,
      budgetId,
      title:      title.trim(),
      depositPct: parseInt(depositPct, 10),
      expiresAt,
      totalCents,
    }
  }

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
        onDone()
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
        if (sendResult.success) { setSuccessToken(existing.publicToken); setIsDraft(false); onDone() }
        else { setError((sendResult as { success: false; error: string }).error) }
        return
      }
      const r = await createSentProposal(baseInput())
      if (r.success) { setSuccessToken(r.data.publicToken); setIsDraft(false); onDone() }
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

  return (
    <Dialog open={open} onOpenChange={v => { if (!pending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {successToken ? (isDraft ? 'Draft Saved' : 'Proposal Sent') : MODE_TITLE[mode]}
          </DialogTitle>
        </DialogHeader>

        {successToken ? (
          <div className="py-2 space-y-4">
            {isDraft ? (
              <p className="text-sm text-muted-foreground">Draft saved. Send it when ready.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Your proposal is live. Share this link with your client.</p>
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
            <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="grid gap-5 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pm-title">Proposal title</Label>
              <Input id="pm-title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pm-deposit">Deposit %</Label>
                <Input id="pm-deposit" type="number" min="0" max="100" step="5"
                  value={depositPct} onChange={e => setDepositPct(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Remainder ({100 - (parseInt(depositPct, 10) || 50)}%) due on delivery
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pm-expiry">Valid through</Label>
                <Input id="pm-expiry" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2">
              Description and deliverables are pulled from the <strong>Proposal Overview</strong> section on the project page.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {!successToken && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
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
