'use client'

import { useState, useTransition } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSentProposal } from '@/server/actions/proposals'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  budgetId: string
  projectName: string
  totalCents: number
  onCreated: () => void
}

export function NewProposalModal({
  open,
  onOpenChange,
  projectId,
  budgetId,
  projectName,
  totalCents,
  onCreated,
}: Props) {
  const [pending, startTransition] = useTransition()

  const defaultExpiry = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  }

  const [title,      setTitle]      = useState(`${projectName} — Proposal`)
  const [depositPct, setDepositPct] = useState('50')
  const [expiresAt,  setExpiresAt]  = useState(defaultExpiry)
  const [error,      setError]      = useState('')
  const [publicUrl,  setPublicUrl]  = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  function reset() {
    setTitle(`${projectName} — Proposal`)
    setDepositPct('50')
    setExpiresAt(defaultExpiry())
    setError('')
    setPublicUrl(null)
    setCopied(false)
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function handleSubmit() {
    if (!title.trim()) { setError('Title is required'); return }
    const deposit = parseInt(depositPct, 10)
    if (isNaN(parseInt(depositPct, 10)) || parseInt(depositPct, 10) < 0 || parseInt(depositPct, 10) > 100) { setError('Deposit % must be 0–100'); return }
    if (!expiresAt) { setError('Valid-through date is required'); return }
    setError('')

    startTransition(async () => {
      const deposit = parseInt(depositPct, 10) || 50
      const result = await createSentProposal({
        projectId,
        budgetId,
        title: title.trim(),
        milestones: [
          { id: crypto.randomUUID().slice(0, 8), name: 'On signing',  percentPct: deposit / 100,           trigger: 'on_signing'  },
          { id: crypto.randomUUID().slice(0, 8), name: 'On delivery', percentPct: (100 - deposit) / 100,   trigger: 'on_delivery' },
        ],
        expiresAt,
        totalCents,
      })
      if (result.success) {
        const url = `${window.location.origin}/p/${result.data.publicToken}`
        setPublicUrl(url)
        onCreated()
      } else {
        setError((result as { success: false; error: string }).error)
      }
    })
  }

  async function handleCopy() {
    if (!publicUrl) return
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{publicUrl ? 'Proposal Created' : 'Send Proposal'}</DialogTitle>
        </DialogHeader>

        {publicUrl ? (
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-4">
              Your proposal is live. Share this link with your client.
            </p>
            <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-3">
              <code className="flex-1 text-xs text-foreground break-all">{publicUrl}</code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="mt-4 flex gap-2">
              <Button asChild className="flex-1" size="sm">
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Preview
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="prop-title">Proposal title</Label>
              <Input
                id="prop-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="prop-deposit">Deposit %</Label>
                <Input
                  id="prop-deposit"
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
                <Label htmlFor="prop-expiry">Valid through</Label>
                <Input
                  id="prop-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2">
              Description and deliverables are pulled from the <strong>Proposal Overview</strong> section below.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {!publicUrl && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={pending}>
              {pending ? 'Sending…' : 'Send Proposal'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
