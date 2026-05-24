import Link from 'next/link'
import type { Invoice, Proposal, Project, Client } from '@prisma/client'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import { format } from 'date-fns'

// ─── Invoice Tracker ──────────────────────────────────────────────────────────

type InvoiceRow = Invoice & { client: Client; project: Project }

export function InvoiceTracker({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-medium text-foreground">Invoice tracker</p>
        <Link href="/invoices" className="text-[12px] text-violet-600 hover:underline">
          View all →
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="grid grid-cols-[1fr_80px_72px] border-b border-border bg-muted/50 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          <span>Invoice</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Status</span>
        </div>
        {invoices.slice(0, 5).map((inv) => (
          <Link
            key={inv.id}
            href={`/projects/${inv.project.id}`}
            className="grid grid-cols-[1fr_80px_72px] items-center border-b border-violet-50 px-4 py-3 text-[13px] last:border-0 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="font-medium text-foreground text-[12px]">{inv.number}</p>
              <p className={`mt-0.5 text-[11px] ${inv.status === 'OVERDUE' ? 'text-red-600' : 'text-muted-foreground'}`}>
                {inv.status === 'PAID' && inv.paidAt
                  ? `Paid ${format(new Date(inv.paidAt), 'MMM d')}`
                  : inv.status === 'OVERDUE'
                  ? `Overdue · ${inv.client.name}`
                  : `Due ${format(new Date(inv.dueDate), 'MMM d')} · ${inv.client.name}`}
              </p>
            </div>
            <span className="text-right font-medium tabular text-[13px]">
              {formatMoney(inv.totalCents)}
            </span>
            <span className="text-right">
              <Badge variant={inv.status.toLowerCase() as 'paid' | 'sent' | 'overdue' | 'draft'}>
                {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
              </Badge>
            </span>
          </Link>
        ))}
        {invoices.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No invoices yet.</p>
        )}
      </div>
    </div>
  )
}

// ─── Proposal Queue ───────────────────────────────────────────────────────────

type ProposalRow = Proposal & { project: Project & { client: Client } }

export function ProposalQueue({ proposals }: { proposals: ProposalRow[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-medium text-foreground">Proposals</p>
        <Link href="/proposals" className="text-[12px] text-violet-600 hover:underline">
          View all →
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {proposals.slice(0, 4).map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.project.id}`}
            className="flex items-start gap-3 border-b border-violet-50 px-4 py-3 text-[13px] last:border-0 hover:bg-muted/30 transition-colors"
          >
            <div
              className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
              style={{
                background:
                  p.status === 'APPROVED' ? '#0F6E56'
                  : p.status === 'VIEWED'  ? '#04FFCC'
                  : '#5D00A4',
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{p.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {p.status === 'APPROVED'
                  ? `Approved${p.approvedAt ? ` · ${format(new Date(p.approvedAt), 'MMM d')}` : ''}`
                  : p.viewCount > 0
                  ? `Opened ${p.viewCount}×`
                  : `Sent${p.sentAt ? ` ${format(new Date(p.sentAt), 'MMM d')}` : ''}`}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant={p.status.toLowerCase() as 'approved' | 'sent' | 'viewed' | 'draft'}>
                  {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
        {proposals.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No proposals yet.</p>
        )}
      </div>
    </div>
  )
}
