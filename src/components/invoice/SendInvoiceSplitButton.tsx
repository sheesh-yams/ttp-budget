'use client'

/**
 * SendInvoiceSplitButton
 *
 * Row-action control for sending an invoice. The Send icon is the primary
 * action (opens SendInvoiceModal — emails the client). DRAFT invoices also
 * get a small adjacent chevron opening a dropdown with "Mark as sent", for
 * invoices actually sent through another tool (QuickBooks, Stripe
 * Invoicing, a wire) that should just be tracked here without emailing.
 */

import { useState, useTransition } from 'react'
import { Send, ChevronDown, Check } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { markInvoiceAsSent } from '@/server/actions/invoices'
import { SendInvoiceModal } from './SendInvoiceModal'
import type { InvoiceStatus } from '@/types'

interface Props {
  invoiceId: string
  status:    InvoiceStatus
  onSent?:   () => void
}

export function SendInvoiceSplitButton({ invoiceId, status, onSent }: Props) {
  const { confirm, ConfirmDialog } = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [marked, setMarked] = useState(false)

  async function handleMarkAsSent() {
    const ok = await confirm(
      'This will flip the invoice status to SENT without sending an email. Use this if you\'ve invoiced through another tool and want to track the status here.',
      { title: 'Mark as sent?', key: 'invoice-mark-sent', confirmLabel: 'Confirm' }
    )
    if (!ok) return

    startTransition(async () => {
      const result = await markInvoiceAsSent(invoiceId)
      if (result.success) {
        setMarked(true)
        setTimeout(() => {
          setMarked(false)
          onSent?.()
        }, 1500)
      } else {
        alert((result as { success: false; error: string }).error)
      }
    })
  }

  return (
    <>
      {ConfirmDialog}
      <div className="inline-flex items-center">
        <SendInvoiceModal
          invoiceId={invoiceId}
          onSent={onSent}
          trigger={open => (
            <button
              type="button"
              onClick={open}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
              title={status === 'SENT' ? 'Resend invoice' : 'Send invoice'}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        />

        {status === 'DRAFT' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-accent-foreground inline-flex disabled:opacity-40"
                title="More send options"
              >
                {marked ? <Check className="h-3 w-3 text-green-600" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleMarkAsSent} disabled={isPending}>
                Mark as sent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </>
  )
}
