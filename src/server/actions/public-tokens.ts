'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import type { ActionResult } from '@/types'

function days(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000)
}

// ─── Proposal ─────────────────────────────────────────────────────────────────

export async function regenerateProposalToken(
  proposalId: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const existing = await sdb.proposal.findFirst({ where: { id: proposalId }, select: { id: true, workspaceId: true } })
    if (!existing) return { success: false, error: 'Proposal not found' }

    const updated = await sdb.proposal.update({
      where: { id: proposalId },
      data: {
        publicToken:          crypto.randomUUID().replace(/-/g, ''),
        publicTokenExpiresAt: days(90),
      } as unknown as Parameters<typeof sdb.proposal.update>[0]['data'],
      select: { publicToken: true },
    })

    revalidatePath(`/projects`)

    await logAuditEvent({
      workspaceId: (existing as unknown as { workspaceId: string }).workspaceId,
      actorId:     user.id,
      action:      'token.regenerated',
      entityType:  'Proposal',
      entityId:    proposalId,
    })

    return { success: true, data: { token: (updated as unknown as { publicToken: string }).publicToken } }
  } catch {
    return { success: false, error: 'Failed to regenerate link' }
  }
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export async function regenerateInvoiceToken(
  invoiceId: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const existing = await sdb.invoice.findFirst({ where: { id: invoiceId }, select: { id: true, workspaceId: true } })
    if (!existing) return { success: false, error: 'Invoice not found' }

    const updated = await sdb.invoice.update({
      where: { id: invoiceId },
      data: {
        publicToken:          crypto.randomUUID().replace(/-/g, ''),
        publicTokenExpiresAt: days(180),
      } as unknown as Parameters<typeof sdb.invoice.update>[0]['data'],
      select: { publicToken: true },
    })

    revalidatePath(`/invoices`)

    await logAuditEvent({
      workspaceId: (existing as unknown as { workspaceId: string }).workspaceId,
      actorId:     user.id,
      action:      'token.regenerated',
      entityType:  'Invoice',
      entityId:    invoiceId,
    })

    return { success: true, data: { token: (updated as unknown as { publicToken: string }).publicToken } }
  } catch {
    return { success: false, error: 'Failed to regenerate link' }
  }
}

// ─── Call sheet ───────────────────────────────────────────────────────────────

export async function regenerateCallSheetToken(
  callSheetId: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const existing = await sdb.callSheet.findFirst({ where: { id: callSheetId }, select: { id: true, workspaceId: true } })
    if (!existing) return { success: false, error: 'Call sheet not found' }

    const updated = await sdb.callSheet.update({
      where: { id: callSheetId },
      data: {
        publicToken:          crypto.randomUUID().replace(/-/g, ''),
        publicTokenExpiresAt: days(14),
      } as unknown as Parameters<typeof sdb.callSheet.update>[0]['data'],
      select: { publicToken: true },
    })

    revalidatePath(`/projects`)

    await logAuditEvent({
      workspaceId: (existing as unknown as { workspaceId: string }).workspaceId,
      actorId:     user.id,
      action:      'token.regenerated',
      entityType:  'CallSheet',
      entityId:    callSheetId,
    })

    return { success: true, data: { token: (updated as unknown as { publicToken: string }).publicToken } }
  } catch {
    return { success: false, error: 'Failed to regenerate link' }
  }
}
