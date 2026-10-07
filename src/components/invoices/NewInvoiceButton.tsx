'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewStandaloneInvoiceModal, type InvoiceableProject } from '@/components/invoices/NewStandaloneInvoiceModal'

/** "New invoice" (invoice-first) — on /invoices, or "Bill added scope" on a project. */
export function NewInvoiceButton({ label = 'New invoice', variant = 'default', autoOpen = false, ...modal }: {
  label?:             string
  /** Open on mount (/invoices?new=1 from the mobile "+" sheet), then drop the param. */
  autoOpen?:          boolean
  variant?:           'default' | 'outline'
  projects?:          InvoiceableProject[]
  clients?:           { id: string; name: string }[]
  canCreateProject?:  boolean
  lockedProject?:     InvoiceableProject
  invoiceExpiryDays?: number
}) {
  const [open, setOpen] = useState(false)
  const router   = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (!autoOpen) return
    setOpen(true)
    router.replace(pathname, { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen])
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
