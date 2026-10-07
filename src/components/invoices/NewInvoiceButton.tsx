'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewStandaloneInvoiceModal, type InvoiceableProject } from '@/components/invoices/NewStandaloneInvoiceModal'

/** "New invoice" (invoice-first) — on /invoices, or "Bill added scope" on a project. */
export function NewInvoiceButton({ label = 'New invoice', variant = 'default', ...modal }: {
  label?:             string
  variant?:           'default' | 'outline'
  projects?:          InvoiceableProject[]
  clients?:           { id: string; name: string }[]
  canCreateProject?:  boolean
  lockedProject?:     InvoiceableProject
  invoiceExpiryDays?: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>
      <NewStandaloneInvoiceModal open={open} onOpenChange={setOpen} {...modal} />
    </>
  )
}
