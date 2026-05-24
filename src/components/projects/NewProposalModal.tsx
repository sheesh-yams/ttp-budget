'use client'

import { useState, useTransition } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSentProposal } from '@/server/actions/proposals'

interface Deliverable { title: string; description: string }

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

  // Form state
  const [title, setTitle]   = useState(`${projectName} — Proposal`)
  const [about, setAbout]   = useState('')
  const [depositPct, setDepositPct] = useState('50')
  const [deliverables, setDeliverables] = useState<Deliverable[]>([
    { title: '', description: '' },
    { title: '', description: '' },
    { title: '', description: '' },
  ])
  const defaultExpiry = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  }
  const [expiresAt, setExpiresAt] = useState(defaultExpiry)
  const [error, setError] = useState('')

  // Success state
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function updateDeliverable(i: number, field: keyof Deliverable, value: string) {
    setDeliverables(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }

  function reset() {
    setTitle(`${projectName} — Proposal`)
    setAbout('')
    setDepositPct('50')
    setDeliverables([
      { title: '', description: '' },
      { title: '', description: '' },
      { title: '', description: '' },
    ])
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
    if (isNaN(deposit) || deposit < 0 || deposit > 100) { setError('Deposit % must be 0–100'); return }
    if (!expiresAt) { setError('Valid-through date is required'); return }
    setError('')

    const filledDeliverables = deliverables.filter(d => d.title.trim())

    startTransition(async () => {
      const result = await createSentProposal({
        projectId,
        budgetId,
        title: title.trim(),
        about: about.trim(),
        deliverables: filledDeliverables,
        depositPct: deposit,
        expiresAt,
        totalCents,
      })
      if (result.success) {
        // Always build the URL from the current origin so it works on any domain
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
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{publicUrl ? 'Proposal Created' : 'New Proposal'}</DialogTitle>
        </DialogHeader>

        {publicUrl ? (
          /* ── Success state ── */
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
          /* ── Form state ── */
          <div className="grid gap-5 py-2">
            {/* Title */}
            <div className="grid gap-1.5">
              <Label htmlFor="prop-title">Proposal title</Label>
              <Input
                id="prop-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* About */}
            <div className="grid gap-1.5">
              <Label htmlFor="prop-about">Project description</Label>
              <textarea
                id="prop-about"
                rows={4}
                placeholder="A brief description of the project — shown in the cover and 'The Project' section…"
                value={about}
                onChange={e => setAbout(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Deliverables */}
            <div className="grid gap-2">
              <Label>Deliverables</Label>
              {deliverables.map((d, i) => (
                <div key={i} className="grid grid-cols-[80px_1fr] gap-2 items-start">
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

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {!publicUrl && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={pending}>
              {pending ? 'Creating…' : 'Create & Send Proposal'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
