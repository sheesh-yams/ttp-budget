'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Send } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendDealMemo } from '@/server/actions/deal-memos'
import { CancelDealMemoDialog } from './CancelDealMemoDialog'

export interface VendorLinkInfo {
  sentAt:       string | null
  sentToEmail:  string | null
  signedAt:     string | null
  url:          string | null
  contactEmail: string | null
}

/**
 * Header actions for an awarded deal memo: send to the vendor (email dialog,
 * prefilled), re-send, copy the link, and cancel (typed CANCEL).
 */
export function DealMemoVendorActions({
  memoId, vendorName, roleLabel, link,
}: {
  memoId: string; vendorName: string; roleLabel: string; link: VendorLinkInfo
}) {
  const router = useRouter()
  const [sendOpen, setSendOpen]     = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [email, setEmail]           = useState(link.sentToEmail ?? link.contactEmail ?? '')
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [isPending, start]          = useTransition()
  const sent   = !!link.sentAt
  const signed = !!link.signedAt

  function send() {
    setError(null)
    start(async () => {
      const res = await sendDealMemo(memoId, { email })
      if (!res.success) { setError((res as { success: false; error: string }).error); router.refresh(); return }
      setSendOpen(false)
      router.refresh()
    })
  }

  async function copy() {
    if (!link.url) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      {!signed && (
        <Button size="sm" onClick={() => setSendOpen(true)}>
          <Send className="mr-1.5 h-3.5 w-3.5" /> {sent ? 'Re-send' : 'Send to vendor'}
        </Button>
      )}
      {link.url && (
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      )}
      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
        Cancel
      </Button>

      <Dialog open={sendOpen} onOpenChange={o => { setSendOpen(o); if (!o) setError(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{sent ? 'Re-send' : 'Send'} the deal memo to {vendorName}</DialogTitle>
            <DialogDescription>
              They’ll get an email with a link to review the terms and sign. The terms are locked in as they are now
              {sent ? ' — re-sending replaces the version they see, using the same link.' : '.'} Only this email can sign.
            </DialogDescription>
          </DialogHeader>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Vendor email</span>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)} disabled={isPending}>Not now</Button>
            <Button onClick={send} disabled={isPending || !email.trim()}>{isPending ? 'Sending…' : sent ? 'Re-send' : 'Send'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelDealMemoDialog
        memoId={memoId} vendorName={vendorName} roleLabel={roleLabel}
        wasSent={sent} signed={signed} open={cancelOpen} onOpenChange={setCancelOpen}
      />
    </>
  )
}
