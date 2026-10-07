'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/money'
import { deleteNeedsTypedConfirm, matchesInvoiceNumber } from '@/lib/invoice-delete'
import { deleteInvoice, setInvoiceArchived } from '@/server/actions/invoices'

export interface DeletableInvoice {
  id:              string
  number:          string
  status:          string
  sentAt?:         Date | string | null
  amountPaidCents: number
}

/**
 * Delete an invoice of any status. A never-sent draft deletes on a plain
 * confirm; anything else needs its number typed (the server checks it too).
 */
export function DeleteInvoiceDialog({ invoice, onClose }: { invoice: DeletableInvoice | null; onClose: () => void }) {
  const router = useRouter()
  const [typed, setTyped]  = useState('')
  const [error, setError]  = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const needsTyping = !!invoice && deleteNeedsTypedConfirm(invoice)
  const ready = !!invoice && (!needsTyping || matchesInvoiceNumber(typed, invoice.number))
  const wasSent = !!invoice && (invoice.status !== 'DRAFT' || !!invoice.sentAt)

  function close() {
    setTyped('')
    setError(null)
    onClose()
  }

  function confirm() {
    if (!invoice) return
    setError(null)
    start(async () => {
      const res = await deleteInvoice(invoice.id, { confirm: typed })
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      close()
      router.refresh()
    })
  }

  return (
    <Dialog open={!!invoice} onOpenChange={o => { if (!o) close() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete invoice {invoice?.number}?</DialogTitle>
          <DialogDescription>This permanently removes the invoice. It can’t be undone.</DialogDescription>
        </DialogHeader>

        {invoice && (
          <div className="space-y-3">
            {(wasSent || invoice.amountPaidCents > 0) && (
              <ul className="list-disc space-y-1 rounded-lg border border-red-200 bg-red-50 py-2 pl-7 pr-3 text-sm text-red-800">
                {wasSent && <li>The client’s invoice link will stop working.</li>}
                {invoice.amountPaidCents > 0 && (
                  <li>
                    {formatMoney(invoice.amountPaidCents)} collected drops out of your totals. The payment
                    processor’s record is kept.
                  </li>
                )}
              </ul>
            )}
            {needsTyping && (
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Type <span className="font-mono font-semibold text-foreground">{invoice.number}</span> to confirm
                </span>
                <Input
                  value={typed} onChange={e => setTyped(e.target.value)}
                  autoFocus autoComplete="off" placeholder={invoice.number} className="font-mono"
                />
              </label>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={isPending}>Keep it</Button>
          <Button variant="destructive" onClick={confirm} disabled={!ready || isPending}>
            {isPending ? 'Deleting…' : 'Delete invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Row action: archive (hide from lists) or bring an archived invoice back. */
export function ArchiveInvoiceButton({ invoiceId, archived, disabled }: { invoiceId: string; archived: boolean; disabled?: boolean }) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError]  = useState<string | null>(null)

  function toggle() {
    setError(null)
    start(async () => {
      const res = await setInvoiceArchived(invoiceId, !archived)
      if (!res.success) { setError((res as { success: false; error: string }).error); return }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || isPending}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex disabled:opacity-40"
      title={error ?? (archived ? 'Unarchive' : 'Archive (hide from this list)')}
    >
      {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
    </button>
  )
}

/** "Show archived (n)" — only rendered when something is archived. */
export function ShowArchivedToggle({ count, value, onChange }: { count: number; value: boolean; onChange: (v: boolean) => void }) {
  if (count === 0) return null
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-3.5 w-3.5" />
      Show archived ({count})
    </label>
  )
}

/** Small tag shown next to an archived invoice's number. */
export function ArchivedTag() {
  return <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Archived</span>
}

/** Small tag on an invoice billed as added scope on top of a won project (invoice-first). */
export function ScopeAdditionTag() {
  return <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-blue-700" title="Billed on top of the agreed total">Added scope</span>
}
