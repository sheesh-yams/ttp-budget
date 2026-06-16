'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Trash2 } from 'lucide-react'
import { deleteProposal } from '@/server/actions/proposals'

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT:          { label: 'Draft',          bg: '#F3F4F6', text: '#374151' },
  SENT:           { label: 'Sent',           bg: '#DBEAFE', text: '#1E40AF' },
  VIEWED:         { label: 'Viewed',         bg: '#EDE9FE', text: '#5B21B6' },
  CHANGES_NEEDED: { label: 'Changes Needed', bg: '#FEF3C7', text: '#92400E' },
  APPROVED:       { label: 'Approved',       bg: '#D1FAE5', text: '#065F46' },
  DECLINED:       { label: 'Declined',       bg: '#FEE2E2', text: '#991B1B' },
  EXPIRED:        { label: 'Expired',        bg: '#FEF3C7', text: '#78350F' },
  LOST:           { label: 'Lost',           bg: '#FFF1F2', text: '#9F1239' },
}

export interface ProposalRow {
  id:            string
  title:         string
  status:        string
  publicToken:   string
  version:       number
  viewCount:     number
  sentAt:        Date | null
  expiresAt:     Date | null
  approvedAt:    Date | null
  signatureName: string | null
  createdAt:     Date
  project: {
    id:     string
    name:   string
    client: { name: string }
  }
}

export function ProposalsTable({ proposals }: { proposals: ProposalRow[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [_, startDelete]        = useTransition()
  const now = new Date()

  function handleDelete(id: string) {
    setDeleting(id)
    startDelete(async () => {
      await deleteProposal(id)
      router.refresh()
      setDeleting(null)
    })
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            <th className="px-4 py-2.5 text-left">Proposal</th>
            <th className="px-3 py-2.5 text-left">Project</th>
            <th className="px-3 py-2.5 text-left">Client</th>
            <th className="px-3 py-2.5 text-left w-32">Status</th>
            <th className="px-3 py-2.5 text-left w-24">Sent</th>
            <th className="px-3 py-2.5 text-left w-24">Created</th>
            <th className="px-3 py-2.5 text-left w-36">Signed by</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {proposals.map(p => {
            const isExpired = !!p.expiresAt && new Date(p.expiresAt) < now && !['APPROVED', 'LOST'].includes(p.status)
            const eff       = isExpired ? 'EXPIRED' : p.status
            const style     = STATUS_STYLES[eff] ?? STATUS_STYLES.DRAFT
            const isDeleting = deleting === p.id

            return (
              <tr
                key={p.id}
                className={`group border-b last:border-0 hover:bg-muted/20 transition-colors ${isDeleting ? 'opacity-40' : ''}`}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/projects/${p.project.id}`}
                    className="font-medium text-foreground hover:text-violet-700 hover:underline"
                  >
                    {p.title}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground font-normal">v{p.version}</span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <Link href={`/projects/${p.project.id}`} className="hover:underline hover:text-foreground">
                    {p.project.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{p.project.client.name}</td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                    style={{ background: style.bg, color: style.text }}
                  >
                    {style.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {p.sentAt
                    ? new Date(p.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{p.signatureName ?? '—'}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-0.5">
                    <a
                      href={`/p/${p.publicToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded p-1 text-muted-foreground/40 hover:bg-accent hover:text-violet-600 transition-colors"
                      title="Open public proposal"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDelete(p.id)}
                      className="inline-flex rounded p-1 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all disabled:cursor-not-allowed"
                      title="Delete proposal"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
