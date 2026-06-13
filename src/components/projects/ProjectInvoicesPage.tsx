'use client'

/**
 * ProjectInvoicesPage
 *
 * Renders:
 *   1. Payment Schedule — milestone rows from the approved proposal, each showing
 *      "NOT CREATED" (+ Generate Invoice button) or the matching invoice's status.
 *   2. All Invoices table — scrollable list of every invoice for this project.
 *
 * NewInvoiceModal is opened from both the Generate buttons AND the + New Invoice
 * button in the header.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Receipt, CheckCircle2, Clock, Send, Ban, Trash2, Eye, FileText, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NewInvoiceModal } from '@/components/projects/NewInvoiceModal'
import { SendInvoiceModal } from '@/components/invoice/SendInvoiceModal'
import { PreviewPanel } from '@/components/invoice/PreviewPanel'
import { EditInvoiceModal } from '@/components/invoice/EditInvoiceModal'
import { formatMoney } from '@/lib/money'
import { voidInvoice, deleteInvoice } from '@/server/actions/invoices'
import { useTransition } from 'react'
import type { ProposalContent, PaymentMilestone, MilestoneTrigger, InvoiceLineItem } from '@/types'
import type { InvoiceStatus } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  clientId: string
}

interface InvoiceRow {
  id: string
  number: string
  title: string | null
  status: InvoiceStatus
  kind: string
  totalCents: number
  amountPaidCents: number
  dueDate: string
  publicToken: string
  sentAt: string | null
  lineItems: unknown
  taxPct: number | string
  notes: string | null
}

interface ProposalRef {
  id: string
  title: string
  status: string
  content: unknown
  budgetId: string
}

interface Props {
  project: Project
  budget: { id: string; name: string } | null
  proposal: ProposalRef | null
  budgetTotalCents: number
  invoices: InvoiceRow[]
}

// ── Status config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:   { label: 'Draft',   color: 'bg-gray-100 text-gray-600',     icon: <FileText   className="h-3 w-3" /> },
  SENT:    { label: 'Sent',    color: 'bg-blue-100 text-blue-700',     icon: <Send        className="h-3 w-3" /> },
  VIEWED:  { label: 'Viewed',  color: 'bg-violet-100 text-violet-700', icon: <Eye         className="h-3 w-3" /> },
  PAID:    { label: 'Paid',    color: 'bg-green-100 text-green-700',   icon: <CheckCircle2 className="h-3 w-3" /> },
  OVERDUE: { label: 'Overdue', color: 'bg-red-100 text-red-700',       icon: <Clock       className="h-3 w-3" /> },
  VOID:    { label: 'Void',    color: 'bg-gray-100 text-gray-400',     icon: <Ban         className="h-3 w-3" /> },
}

const KIND_ORDER = ['DEPOSIT', 'PROGRESS', 'FINAL', 'STANDALONE']

// ── Milestone trigger labels ────────────────────────────────────────────────

function triggerLabel(trigger: MilestoneTrigger, customDate?: string): string {
  switch (trigger) {
    case 'on_signing':  return 'Due on signing'
    case 'on_shoot_day': return 'Due on shoot day'
    case 'on_delivery': return 'Due on delivery'
    case 'net_30':      return 'Net 30'
    case 'net_60':      return 'Net 60'
    case 'net_90':      return 'Net 90'
    case 'custom_date': return customDate
      ? new Date(customDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Custom date'
    default:            return trigger
  }
}

// ── Parse milestones from proposal content ─────────────────────────────────

function parseMilestones(content: unknown): PaymentMilestone[] {
  try {
    const c = content as ProposalContent & { sections?: { type: string }[] }
    const sections = (c as { sections?: Array<{ type: string; milestones?: PaymentMilestone[] }> }).sections ?? []
    const termsSection = sections.find(s => s.type === 'terms')
    if (termsSection && 'milestones' in termsSection) {
      return (termsSection as { milestones: PaymentMilestone[] }).milestones ?? []
    }
  } catch {}
  return []
}

// ── Component ───────────────────────────────────────────────────────────────

export function ProjectInvoicesPage({
  project,
  budget,
  proposal,
  budgetTotalCents,
  invoices,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actingId, setActingId]      = useState<string | null>(null)

  // NewInvoiceModal state — can be opened from header or a milestone Generate button
  const [newInvOpen, setNewInvOpen]           = useState(false)
  const [newInvMilestoneIdx, setNewInvMilestoneIdx] = useState<number | undefined>(undefined)

  // Confirm dialog (void / delete)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'void' | 'delete'
    inv: InvoiceRow
  } | null>(null)

  const milestones = proposal ? parseMilestones(proposal.content) : []

  function refresh() { router.refresh() }

  function openNewInvoice(milestoneIdx?: number) {
    setNewInvMilestoneIdx(milestoneIdx)
    setNewInvOpen(true)
  }

  function handleConfirm() {
    if (!confirmDialog) return
    const { type, inv } = confirmDialog
    setActingId(inv.id)
    startTransition(async () => {
      if (type === 'void')   await voidInvoice(inv.id)
      if (type === 'delete') await deleteInvoice(inv.id)
      setConfirmDialog(null)
      setActingId(null)
      refresh()
    })
  }

  const totalInvoiced = invoices
    .filter(i => !['VOID', 'DRAFT'].includes(i.status))
    .reduce((s, i) => s + i.totalCents, 0)

  const totalPaid = invoices.reduce((s, i) => s + i.amountPaidCents, 0)

  // Match invoices to milestones by order of KIND_ORDER (best-effort)
  // DEPOSIT → 0%, PROGRESS → middle, FINAL → last
  const sortedByKind = [...invoices].sort((a, b) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  )

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
          {budgetTotalCents > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMoney(totalInvoiced)} invoiced
              {totalPaid > 0 && ` · ${formatMoney(totalPaid)} paid`}
              {' '}of {formatMoney(budgetTotalCents)} total
            </p>
          )}
        </div>
        {budget && proposal && (
          <Button size="sm" onClick={() => openNewInvoice()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Invoice
          </Button>
        )}
      </div>

      {/* ── Payment Schedule ───────────────────────────────────────────── */}
      {milestones.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            Payment Schedule
            <span className="text-xs font-normal text-muted-foreground">
              from proposal: {proposal?.title}
            </span>
          </h2>

          <div className="rounded-xl border overflow-hidden">
            {milestones.map((m, idx) => {
              const milestoneAmount = Math.round(budgetTotalCents * m.percentPct)

              // Try to find a matching invoice — rough match by position/kind
              const kindForIdx =
                idx === 0 ? 'DEPOSIT'
                : idx === milestones.length - 1 ? 'FINAL'
                : 'PROGRESS'
              const matchedInv = sortedByKind.find(inv =>
                !['VOID'].includes(inv.status) && inv.kind === kindForIdx
              )

              const isLast = idx === milestones.length - 1

              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-4 px-5 py-4 ${!isLast ? 'border-b' : ''} bg-background hover:bg-muted/20 transition-colors`}
                >
                  {/* Milestone number */}
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: matchedInv ? '#5D00A4' : '#F0EBF7',
                      color: matchedInv ? '#fff' : '#8B4FC3',
                    }}
                  >
                    {idx + 1}
                  </div>

                  {/* Milestone info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Math.round(m.percentPct * 100)}% · {triggerLabel(m.trigger, m.customDate)}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatMoney(milestoneAmount)}
                    </p>
                  </div>

                  {/* Invoice status or Generate button */}
                  <div className="w-44 flex justify-end">
                    {matchedInv ? (
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CONFIG[matchedInv.status].color}`}>
                          {STATUS_CONFIG[matchedInv.status].icon}
                          {matchedInv.status === 'PAID'
                            ? `Paid ${formatMoney(matchedInv.amountPaidCents)}`
                            : `${STATUS_CONFIG[matchedInv.status].label} · ${matchedInv.number}`
                          }
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openNewInvoice(idx)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#c9a8f0] px-3 py-1.5 text-xs font-medium text-[#5D00A4] hover:bg-[#F5EDFA] transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Generate Invoice
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── No proposal state ─────────────────────────────────────────── */}
      {milestones.length === 0 && !proposal && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Receipt className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No payment schedule yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create and send a proposal with payment terms to see milestones here.
          </p>
        </div>
      )}

      {/* ── All Invoices ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            All Invoices
            {invoices.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({invoices.length})
              </span>
            )}
          </h2>
        </div>

        {invoices.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Receipt className="h-7 w-7 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No invoices yet</p>
            {budget && proposal ? (
              <Button size="sm" className="mt-4" onClick={() => openNewInvoice()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create First Invoice
              </Button>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {!budget ? 'Add a budget first.' : 'Create a proposal before invoicing.'}
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">Invoice</th>
                  <th className="px-3 py-2.5 text-left w-28">Status</th>
                  <th className="px-3 py-2.5 text-right w-28">Total</th>
                  <th className="px-3 py-2.5 text-right w-28">Paid</th>
                  <th className="px-3 py-2.5 text-left w-32">Due</th>
                  <th className="w-36" />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const cfg        = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.DRAFT
                  const isPartial  = inv.amountPaidCents > 0 && inv.amountPaidCents < inv.totalCents
                  const isOverdue  = !['PAID', 'VOID'].includes(inv.status) && new Date(inv.dueDate) < new Date()
                  const badgeClass = isOverdue ? 'bg-red-100 text-red-700' : isPartial ? 'bg-amber-100 text-amber-700' : cfg.color
                  const badgeLabel = isPartial ? 'Partial' : isOverdue ? 'Overdue' : cfg.label

                  const canSend   = inv.status === 'DRAFT' || inv.status === 'SENT'
                  const canEdit   = !['PAID', 'VOID'].includes(inv.status)
                  const canVoid   = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE'].includes(inv.status)
                  const canDelete = inv.status === 'DRAFT'
                  const isBusy    = actingId === inv.id && isPending

                  return (
                    <tr key={inv.id} className={`border-b last:border-0 hover:bg-muted/30 ${isBusy ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-xs font-medium text-foreground">{inv.number}</p>
                        {inv.title && <p className="mt-0.5 text-xs text-muted-foreground">{inv.title}</p>}
                      </td>

                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground">
                        {formatMoney(inv.totalCents)}
                      </td>

                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {inv.amountPaidCents > 0
                          ? <span className="text-green-600 font-medium">{formatMoney(inv.amountPaidCents)}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>

                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {new Date(inv.dueDate).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </td>

                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-0.5 justify-end">
                          <PreviewPanel invoiceId={inv.id} invoiceNumber={inv.number} />

                          {canEdit && (
                            <EditInvoiceModal
                              invoiceId={inv.id}
                              invoiceNumber={inv.number}
                              existingItems={(inv.lineItems as InvoiceLineItem[]) ?? []}
                              currentTaxPct={Number(inv.taxPct ?? 0)}
                              currentNotes={inv.notes}
                              currentTitle={inv.title}
                              currentDueDate={inv.dueDate}
                              onSaved={refresh}
                              trigger={open => (
                                <button
                                  type="button"
                                  onClick={open}
                                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                                  title="Edit invoice"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            />
                          )}

                          {canSend && (
                            <SendInvoiceModal
                              invoiceId={inv.id}
                              onSent={refresh}
                              trigger={open => (
                                <button
                                  type="button"
                                  onClick={open}
                                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                                  title={inv.status === 'SENT' ? 'Resend invoice' : 'Send invoice'}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </button>
                              )}
                            />
                          )}

                          {inv.status !== 'DRAFT' && (
                            <a
                              href={`/i/${inv.publicToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
                              title="Open client link"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </a>
                          )}

                          {canVoid && !canDelete && (
                            <button
                              type="button"
                              onClick={() => setConfirmDialog({ type: 'void', inv })}
                              disabled={isBusy}
                              className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 inline-flex disabled:opacity-40"
                              title="Void invoice"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setConfirmDialog({ type: 'delete', inv })}
                              disabled={isBusy}
                              className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 inline-flex disabled:opacity-40"
                              title="Delete draft"
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
      </section>

      {/* ── New Invoice Modal ─────────────────────────────────────────── */}
      {budget && proposal && (
        <NewInvoiceModal
          open={newInvOpen}
          onOpenChange={setNewInvOpen}
          projectId={project.id}
          projectName={project.name}
          clientId={project.clientId}
          proposal={{
            id:       proposal.id,
            title:    proposal.title,
            budgetId: proposal.budgetId,
            content:  proposal.content,
          }}
          liveTotalCents={budgetTotalCents}
          defaultMilestoneIdx={newInvMilestoneIdx}
        />
      )}

      {/* ── Void / Delete confirm dialog ─────────────────────────────── */}
      <Dialog open={!!confirmDialog} onOpenChange={open => { if (!open) setConfirmDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === 'delete' ? 'Delete Draft Invoice' : 'Void Invoice'}
            </DialogTitle>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-muted-foreground">
                {confirmDialog.type === 'delete'
                  ? `Permanently delete draft invoice ${confirmDialog.inv.number}? This cannot be undone.`
                  : `Mark invoice ${confirmDialog.inv.number} as void? The invoice link will still work but will show as voided.`
                }
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" className="flex-1" onClick={handleConfirm} disabled={isPending}>
                  {isPending ? 'Working…' : confirmDialog.type === 'delete' ? 'Delete' : 'Void Invoice'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
