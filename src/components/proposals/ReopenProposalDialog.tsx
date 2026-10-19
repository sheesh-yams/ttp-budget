'use client'

// "Reopen" for an expired proposal: a new valid-through date, then either
// reopen it as sent (same link, same pricing and terms) — optionally emailing
// the client again — or make changes first (a new revision to edit and send).

import { useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getProposalReopenInfo, reopenProposal } from '@/server/actions/proposals'
import { earliestReopenDate, type ProposalReopenInfo } from '@/lib/proposal-expiry'

// Valid-through dates are stored as UTC midnight; view times are real moments.
const fmt = (iso: string | null, utc = false) => iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) })
  : null

export function ReopenProposalDialog({ open, proposalId, proposalTitle, onClose, onReopened, onMakeChanges, makeChangesLabel }: {
  open: boolean
  proposalId: string | null
  proposalTitle: string
  onClose: () => void
  /** After a successful reopen; `note` is shown by the caller if set. */
  onReopened: (note: string | null, result: { status: string; expiresAt: string }) => void
  /** "Make changes first" — gets the chosen date. Omit to hide the option. */
  onMakeChanges?: (expiresAt: string) => void
  makeChangesLabel?: string
}) {
  const [info, setInfo] = useState<ProposalReopenInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [mode, setMode] = useState<'same' | 'changes'>('same')
  const [notify, setNotify] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!open || !proposalId) return
    setInfo(null); setLoadError(null); setError(null); setMode('same')
    getProposalReopenInfo(proposalId).then(res => {
      if (!res.success) { setLoadError((res as { success: false; error: string }).error); return }
      setInfo(res.data)
      setDate(res.data.defaultExpiresAt)
      setNotify(!!res.data.to)
    }).catch(() => setLoadError('Couldn’t load the proposal'))
  }, [open, proposalId])

  // Valid-through is stored as UTC midnight of the date, so late in a US day
  // "tomorrow" may already be too soon — the picker's min says so.
  const minYmd = earliestReopenDate()
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= minYmd

  function submit() {
    if (!proposalId) return
    if (!dateOk) { setError(`Pick ${fmt(minYmd, true)} or later.`); return }
    if (mode === 'changes' && onMakeChanges) { onMakeChanges(date); return }
    setError(null)
    start(async () => {
      const res = await reopenProposal(proposalId, { expiresAt: date, notify: notify && !!info?.to })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      const result = { status: res.data.status, expiresAt: res.data.expiresAt }
      onReopened(res.data.emailError
        ? `Reopened — but the email didn’t send (${res.data.emailError}). Share the link yourself or try again from the proposal.`
        : res.data.emailed ? `Reopened and emailed to ${info?.to}.` : 'Reopened.', result)
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !pending) onClose() }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Reopen “{proposalTitle}”</DialogTitle>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !info ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Expired {fmt(info.expiredOn, true) ?? '—'}
              {info.lastViewedAt ? ` · last viewed by the client ${fmt(info.lastViewedAt)}` : ' · not viewed by the client'}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="reopen-date">New valid-through date</Label>
              <Input id="reopen-date" type="date" value={date} min={minYmd} onChange={e => { setDate(e.target.value); setError(null) }} className="w-48" />
              {date && !dateOk && <p className="text-xs text-destructive">Pick {fmt(minYmd, true)} or later.</p>}
            </div>

            <div className="space-y-2" role="radiogroup" aria-label="How to reopen">
              <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${mode === 'same' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" name="reopen-mode" className="mt-0.5 accent-primary" checked={mode === 'same'} onChange={() => setMode('same')} />
                <span>
                  <span className="font-medium text-foreground">Same proposal, new date</span>
                  <span className="block text-xs text-muted-foreground">Same link, and the same pricing and terms exactly as sent — only the date changes.</span>
                </span>
              </label>
              {onMakeChanges && (
                <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${mode === 'changes' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" name="reopen-mode" className="mt-0.5 accent-primary" checked={mode === 'changes'} onChange={() => setMode('changes')} />
                  <span>
                    <span className="font-medium text-foreground">Make changes first</span>
                    <span className="block text-xs text-muted-foreground">{makeChangesLabel ?? 'Creates a new version to edit, then send — the client gets a new link.'}</span>
                  </span>
                </label>
              )}
            </div>

            {mode === 'same' && (
              info.to ? (
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={notify} onChange={e => setNotify(e.target.checked)} />
                  <span>
                    Email the client the link again
                    <span className="block text-xs text-muted-foreground">
                      To {info.to}{info.cc.length ? ` · cc ${info.cc.join(', ')}` : ''} — shows the new valid-through date.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">This client has no contact email on file, so it’ll reopen without an email — share the link yourself.</p>
              )
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={!info || pending || !dateOk}>
            {pending ? 'Reopening…' : mode === 'changes' ? 'Continue to edit' : notify && info?.to ? 'Reopen & email' : 'Reopen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
