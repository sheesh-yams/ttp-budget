'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ExternalLink, Eye, Clock, Send, FileText, Pencil, Receipt, CheckCircle, Trash2, TrendingDown, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProposalModal, type ProposalModalMode } from './ProposalModal'
import { NewInvoiceModal } from './NewInvoiceModal'
import { deleteProposal, updateProposalStatus } from '@/server/actions/proposals'
import type { ProposalStatus, ProposalContent, PaymentMilestone, ProposalDiscount } from '@/types'

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
  content: unknown
}

interface Props {
  proposals: ProposalRow[]
  projectId: string
  projectName: string
  clientId: string
  budgetId: string | null
  totalCents: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; fg: string; icon: React.ReactNode }> = {
  DRAFT:           { label: 'Draft',           color: 'bg-gray-100 text-gray-600',     bg: '#F3F4F6', fg: '#374151', icon: <FileText     className="h-3 w-3" /> },
  SENT:            { label: 'Sent',            color: 'bg-blue-100 text-blue-700',     bg: '#DBEAFE', fg: '#1E40AF', icon: <Send         className="h-3 w-3" /> },
  VIEWED:          { label: 'Viewed',          color: 'bg-violet-100 text-violet-700', bg: '#EDE9FE', fg: '#5B21B6', icon: <Clock        className="h-3 w-3" /> },
  CHANGES_NEEDED:  { label: 'Changes Needed',  color: 'bg-amber-100 text-amber-700',   bg: '#FEF3C7', fg: '#92400E', icon: <Clock        className="h-3 w-3" /> },
  APPROVED:        { label: 'Won',             color: 'bg-green-100 text-green-700',   bg: '#D1FAE5', fg: '#065F46', icon: <CheckCircle  className="h-3 w-3" /> },
  DECLINED:        { label: 'Declined',        color: 'bg-red-100 text-red-700',       bg: '#FEE2E2', fg: '#991B1B', icon: <Clock        className="h-3 w-3" /> },
  EXPIRED:         { label: 'Expired',         color: 'bg-amber-100 text-amber-700',   bg: '#FEF3C7', fg: '#78350F', icon: <Clock        className="h-3 w-3" /> },
  LOST:            { label: 'Lost',            color: 'bg-rose-50 text-rose-800',      bg: '#FFF1F2', fg: '#9F1239', icon: <TrendingDown className="h-3 w-3" /> },
}

function extractFromContent(content: unknown): {
  about: string
  deliverables: { title: string; description: string }[]
  milestones: PaymentMilestone[]
  discount?: ProposalDiscount
} {
  try {
    const c = content as ProposalContent
    const sections = c?.sections ?? []
    const aboutSection = sections.find(s => s.type === 'about')
    const scopeSection = sections.find(s => s.type === 'scope')
    const termsSection = sections.find(s => s.type === 'terms')

    const about = aboutSection?.type === 'about' ? (aboutSection.body ?? '') : ''
    const deliverables = scopeSection?.type === 'scope'
      ? scopeSection.items.map(i => ({ title: i.title, description: i.description }))
      : []
    const milestones: PaymentMilestone[] = termsSection?.type === 'terms' && termsSection.milestones?.length
      ? termsSection.milestones
      : []
    const discount = c?.discount

    return { about, deliverables, milestones, discount }
  } catch {
    return { about: '', deliverables: [], milestones: [] }
  }
}

export function ProjectProposals({ proposals, projectId, projectName, clientId, budgetId, totalCents }: Props) {
  const router = useRouter()

  // Proposal modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ProposalModalMode>('create')
  const [editingProposal, setEditingProposal] = useState<Props['proposals'][0] | null>(null)
  // Invoice modal state
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [invoiceProposal, setInvoiceProposal] = useState<Props['proposals'][0] | null>(null)

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Props['proposals'][0] | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Status change (optimistic)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({})

  async function handleStatusChange(proposalId: string, newStatus: string) {
    setStatusOverrides(prev => ({ ...prev, [proposalId]: newStatus }))
    await updateProposalStatus(proposalId, newStatus)
    router.refresh()
  }

  const canCreateProposal = !!budgetId

  function openCreate() {
    setEditingProposal(null)
    setModalMode('create')
    setModalOpen(true)
  }

  function openEdit(p: Props['proposals'][0]) {
    setEditingProposal(p)
    setModalMode(p.status === 'DRAFT' ? 'edit-draft' : 'revision')
    setModalOpen(true)
  }

  function openInvoiceModal(p: Props['proposals'][0]) {
    setInvoiceProposal(p)
    setInvoiceModalOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const result = await deleteProposal(deleteTarget.id)
      if (result.success) {
        setDeleteTarget(null)
        router.refresh()
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  const existing = editingProposal
    ? (() => {
        const { about, deliverables, milestones, discount } = extractFromContent(editingProposal.content)
        return {
          id: editingProposal.id,
          title: editingProposal.title,
          publicToken: editingProposal.publicToken,
          expiresAt: editingProposal.expiresAt ? editingProposal.expiresAt.toISOString() : null,
          about,
          deliverables,
          milestones,
          discount,
        }
      })()
    : undefined

  // Pre-fill create mode from the most recent non-draft proposal
  const lastSent = proposals.find(p => p.status !== 'DRAFT')
  const prefill  = lastSent ? extractFromContent(lastSent.content) : undefined

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Proposals</h2>
        <Button
          size="sm"
          onClick={openCreate}
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
            <Button size="sm" className="mt-4" onClick={openCreate}>
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
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => {
                const effectiveStatus = statusOverrides[p.id] ?? p.status
                const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.DRAFT
                const isExpiredEff    = !!p.expiresAt && new Date(p.expiresAt) < new Date() && !['APPROVED', 'LOST'].includes(effectiveStatus)
                const canEdit     = effectiveStatus === 'DRAFT'
                const canInvoice  = ['SENT', 'VIEWED', 'APPROVED'].includes(effectiveStatus) && !!budgetId
                const canDelete   = effectiveStatus !== 'APPROVED'
                const isTerminal  = ['APPROVED', 'LOST', 'DECLINED'].includes(effectiveStatus) || isExpiredEff

                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {p.title}
                      <span className="ml-2 text-xs text-muted-foreground font-normal">v{p.version}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {isTerminal ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${isExpiredEff ? 'bg-amber-100 text-amber-700' : cfg.color}`}>
                          {cfg.icon}
                          {isExpiredEff ? 'Expired' : effectiveStatus === 'APPROVED' ? 'Won' : cfg.label}
                        </span>
                      ) : (
                        <div className="relative inline-flex items-center">
                          <select
                            value={effectiveStatus}
                            onChange={e => handleStatusChange(p.id, e.target.value)}
                            style={{ background: cfg.bg, color: cfg.fg }}
                            className="rounded-full pl-2 pr-6 py-0.5 text-[11px] font-medium border-0 outline-none cursor-pointer appearance-none leading-none"
                          >
                            <option value="DRAFT">Draft</option>
                            <option value="SENT">Sent</option>
                            <option value="VIEWED">Viewed</option>
                            <option value="CHANGES_NEEDED">Changes Needed</option>
                            <option value="APPROVED">Won</option>
                            <option value="LOST">Lost</option>
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 pointer-events-none opacity-60" style={{ color: cfg.fg }} />
                        </div>
                      )}
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
                      <div className="flex items-center gap-0.5 justify-end">
                        {/* Edit DRAFT in-place */}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                            title="Edit draft"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Create invoice */}
                        {canInvoice && (
                          <button
                            type="button"
                            onClick={() => openInvoiceModal(p)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                            title="Create invoice"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Preview (draft) / Open (sent) */}
                        {p.status === 'DRAFT' ? (
                          <a
                            href={`/p/${p.publicToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                            title="Preview draft"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <a
                            href={`/p/${p.publicToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                            title="Open proposal"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {/* Delete */}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 inline-flex"
                            title="Delete proposal"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {budgetId && (
        <ProposalModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          mode={modalMode}
          projectId={projectId}
          projectName={projectName}
          budgetId={budgetId}
          totalCents={totalCents}
          existing={existing}
          prefill={modalMode === 'create' ? prefill : undefined}
          onDone={() => router.refresh()}
        />
      )}

      {invoiceProposal && budgetId && (
        <NewInvoiceModal
          open={invoiceModalOpen}
          onOpenChange={setInvoiceModalOpen}
          projectId={projectId}
          projectName={projectName}
          clientId={clientId}
          proposal={{
            id: invoiceProposal.id,
            title: invoiceProposal.title,
            budgetId,
            content: invoiceProposal.content,
          }}
          liveTotalCents={totalCents}
        />
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete proposal?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{deleteTarget?.title}</strong> will be permanently deleted.
            This cannot be undone.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteLoading}
              onClick={handleDelete}
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
