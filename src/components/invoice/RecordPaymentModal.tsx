'use client'

/**
 * RecordPaymentModal
 *
 * Manually record a payment against an invoice (wire, ACH, check, cash — any
 * payment that didn't come through the online payment processor). Amount
 * pre-fills to the full outstanding balance so marking an invoice fully paid
 * is a single click; a smaller amount records a partial payment and the
 * invoice status flips to PAID automatically once the running total covers it
 * (see recordPayment() in src/server/actions/invoices.ts).
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney } from '@/lib/money'
import { recordPayment } from '@/server/actions/invoices'

export interface RecordPaymentInvoice {
  id: string
  totalCents: number
  amountPaidCents: number
}

interface RecordPaymentModalProps {
  invoice: RecordPaymentInvoice | null
  onClose: () => void
  onRecorded: () => void
}

export function RecordPaymentModal({ invoice, onClose, onRecorded }: RecordPaymentModalProps) {
  const [amount, setAmount]         = useState('')
  const [method, setMethod]         = useState('')
  const [ref, setRef]               = useState('')
  const [error, setError]           = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Re-seed the form whenever a new invoice is opened.
  const invoiceId = invoice?.id ?? null
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (invoice && invoiceId !== seededFor) {
    setSeededFor(invoiceId)
    setAmount(((invoice.totalCents - invoice.amountPaidCents) / 100).toFixed(2))
    setMethod('')
    setRef('')
    setError('')
  }

  async function handleSubmit() {
    if (!invoice) return
    setError('')
    const amountCents = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Enter a valid amount')
      return
    }
    setSubmitting(true)
    try {
      const result = await recordPayment(
        invoice.id, amountCents,
        method.trim() || undefined,
        ref.trim()    || undefined,
      )
      if (result.success) {
        onClose()
        onRecorded()
      } else {
        setError((result as { success: false; error: string }).error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!invoice} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        {invoice && (
          <div className="space-y-4 py-1">
            <div className="rounded-lg bg-muted/40 px-4 py-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Outstanding balance</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(invoice.totalCents - invoice.amountPaidCents)}
              </span>
            </div>
            <div>
              <Label htmlFor="pay-amount">Amount received ($)</Label>
              <Input id="pay-amount" type="number" min={0.01} step={0.01}
                value={amount} onChange={e => setAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pay-method">Payment method (optional)</Label>
              <Input id="pay-method" placeholder="Wire, ACH, Check…"
                value={method} onChange={e => setMethod(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pay-ref">Reference # (optional)</Label>
              <Input id="pay-ref" placeholder="Wire confirmation, check #…"
                value={ref} onChange={e => setRef(e.target.value)} className="mt-1" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                {submitting ? 'Saving…' : 'Record Payment'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
