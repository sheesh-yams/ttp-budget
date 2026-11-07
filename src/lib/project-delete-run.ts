// The permanent-delete transaction, shared by deleteProject and its
// verification script. Raw db: every `where` carries the workspaceId.

import { db } from '@/lib/db'
import { paymentInProgress } from '@/lib/invoice-delete'

export const PROJECT_NOT_ARCHIVED = new Error('project-not-archived')
export const PROJECT_PAYMENT_IN_PROGRESS = new Error('project-payment-in-progress')

/**
 * Deletes an archived project and everything under it, and records an
 * AuditEvent (which has no FK to the project, so it survives). Throws
 * (and rolls back) PROJECT_NOT_ARCHIVED if it was restored meanwhile, or
 * PROJECT_PAYMENT_IN_PROGRESS while a client is mid-checkout on one of its
 * invoices — same rule as deleteInvoice: the payment would settle onto a
 * missing invoice and go unrecorded.
 */
export async function runProjectDelete(args: {
  workspaceId: string; projectId: string; actorId: string | null; metadata: Record<string, unknown>
}) {
  const { workspaceId, projectId } = args
  await db.$transaction(async tx => {
    const invoices   = await tx.invoice.findMany({ where: { workspaceId, projectId }, select: { id: true, number: true } })
    const invoiceIds = invoices.map(i => i.id)
    if (invoiceIds.length) {
      const open = await tx.paymentAttempt.findMany({
        where:  { workspaceId, invoiceId: { in: invoiceIds }, status: 'INITIATED' },
        select: { status: true, createdAt: true },
      })
      if (paymentInProgress(open)) throw PROJECT_PAYMENT_IN_PROGRESS
    }
    // Proposal → Budget is onDelete: Restrict, so proposals go before the
    // project's cascade removes its budgets.
    await tx.proposal.deleteMany({ where: { workspaceId, projectId } })
    // Re-checks it's still archived in the same statement; the FK cascades remove the rest.
    const res = await tx.project.deleteMany({ where: { id: projectId, workspaceId, status: 'ARCHIVED', archivedAt: { not: null } } })
    if (res.count !== 1) throw PROJECT_NOT_ARCHIVED
    // Soft ref (no FK) — cleared after the project (and so its invoices) is
    // gone, so an attempt created during this transaction isn't left behind.
    if (invoiceIds.length) await tx.paymentAttempt.deleteMany({ where: { workspaceId, invoiceId: { in: invoiceIds } } })
    await tx.auditEvent.create({
      data: {
        workspaceId, actorId: args.actorId, action: 'project.deleted', entityType: 'Project', entityId: projectId,
        // invoiceNumbers: backdated invoice numbering never reuses a deleted
        // invoice's number (src/lib/invoice-numbering.ts reads them back).
        metadata: { ...args.metadata, invoiceNumbers: invoices.map(i => i.number) } as never,
      },
    })
  })
}
