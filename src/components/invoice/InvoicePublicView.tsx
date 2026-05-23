// Phase 3 component — full invoice public page builds here.
import type { InvoiceWithRelations } from '@/types'

export function InvoicePublicView({ invoice }: { invoice: InvoiceWithRelations }) {
  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-white/50 text-sm">Invoice {invoice.number}</p>
        <p className="text-white/30 text-xs mt-2">Full invoice renderer — Phase 3</p>
      </div>
    </div>
  )
}
