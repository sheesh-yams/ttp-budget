'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ExternalLink, CheckCircle, Clock, Send, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewProposalModal } from './NewProposalModal'
import type { ProposalStatus } from '@/types'

interface ProposalRow {
  id: string
  title: string
  status: ProposalStatus
  publicToken: string
  version: number
  createdAt: Date
  expiresAt: Date | null
  signatureName: string | null
  approvedAt: Date | null
}

interface Props {
  proposals: ProposalRow[]
  projectId: string
  projectName: string
  budgetId: string | null
  totalCents: number
}

const STATUS_CONFIG: Record<ProposalStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:    { label: 'Draft',    color: 'bg-gray-100 text-gray-600',       icon: <FileText  className="h-3 w-3" /> },
  SENT:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700',       icon: <Send      className="h-3 w-3" /> },
  VIEWED:   { label: 'Viewed',   color: 'bg-violet-100 text-violet-700',   icon: <Clock     className="h-3 w-3" /> },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700',     icon: <CheckCircle className="h-3 w-3" /> },
  DECLINED: { label: 'Declined', color: 'bg-red-100 text-red-700',         icon: <Clock     className="h-3 w-3" /> },
  EXPIRED:  { label: 'Expired',  color: 'bg-amber-100 text-amber-700',     icon: <Clock     className="h-3 w-3" /> },
}

export function ProjectProposals({ proposals, projectId, projectName, budgetId, totalCents }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)

  const canCreateProposal = !!budgetId

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Proposals</h2>
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          disabled={!canCreateProposal}
          title={!canCreateProposal ? 'Add a budget first' : undefined}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Proposal
        </Button>
      </div>

      {proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
          <p className="text-sm font-medium text-foreground">No proposals yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canCreateProposal
              ? 'Create a proposal to share your budget with the client.'
              : 'Add a budget before creating a proposal.'}
          </p>
          {canCreateProposal && (
            <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Proposal
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Title</th>
                <th className="px-3 py-2.5 text-left w-28">Status</th>
                <th className="px-3 py-2.5 text-left w-32">Created</th>
                <th className="px-3 py-2.5 text-left w-36">Valid through</th>
                <th className="px-3 py-2.5 text-left w-40">Signed by</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => {
                const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.DRAFT
                const publicUrl = `/p/${p.publicToken}`
                const isExpired = p.expiresAt && new Date(p.expiresAt) < new Date() && p.status !== 'APPROVED'

                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {p.title}
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        v{p.version}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${isExpired ? 'bg-amber-100 text-amber-700' : cfg.color}`}>
                        {cfg.icon}
                        {isExpired ? 'Expired' : cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {p.expiresAt
                        ? new Date(p.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {p.signatureName ?? '—'}
                    </td>
                    <td className="px-2 py-2.5">
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                        title="Open proposal"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {budgetId && (
        <NewProposalModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          projectId={projectId}
          projectName={projectName}
          budgetId={budgetId}
          totalCents={totalCents}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}
