'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cancelDealMemo } from '@/server/actions/deal-memos'

const WORD = 'CANCEL'

/**
 * Cancelling an awarded deal memo needs a second, deliberate step: typing
 * CANCEL (the server checks it too). If it was sent, the vendor can be told —
 * on by default.
 */
export function CancelDealMemoDialog({
  memoId, vendorName, roleLabel, wasSent, signed, open, onOpenChange,
}: {
  memoId: string; vendorName: string; roleLabel: string; wasSent: boolean; signed: boolean
  open: boolean; onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [typed, setTyped]   = useState('')
  const [notify, setNotify] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [isPending, start]  = useTransition()
  const ready = typed.trim().toUpperCase() === WORD

  function close(o: boolean) {
    if (!o) { setTyped(''); setNotify(true); setError(null) }
    onOpenChange(o)
  }

  function confirm() {
    setError(null)
    start(async () => {
      const res = await cancelDealMemo(memoId, { confirm: typed, notifyVendor: wasSent && notify })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      close(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {vendorName}’s deal memo?</DialogTitle>
          <DialogDescription>
            {signed
              ? `${vendorName} has already signed this deal memo for ${roleLabel}. Cancelling voids it — their link will show it’s cancelled.`
              : `This calls off the deal memo for ${roleLabel}.${wasSent ? ' Their link will stop working.' : ''}`}
            {' '}Their crew slot stays; you can reopen it as a bid later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Type <span className="font-semibold text-foreground">{WORD}</span> to confirm</span>
            <Input value={typed} onChange={e => setTyped(e.target.value)} autoFocus autoComplete="off" placeholder={WORD} />
          </label>
          {wasSent && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="h-4 w-4" />
              Email {vendorName} that it’s cancelled
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={isPending}>Keep it</Button>
          <Button variant="destructive" onClick={confirm} disabled={!ready || isPending}>
            {isPending ? 'Cancelling…' : 'Cancel deal memo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
