import 'server-only'

// View recording for the public token pages (/p, /i, /d). Not a 'use server'
// module on purpose: exports there are public RPC endpoints, and these take a
// raw id with no token check — anyone could inflate counts or move a status.
// Only the server components that already verified the token call these.
// Raw db: no session on public pages.

import { db } from '@/lib/db'

/** A client opened a proposal link. Only SENT advances to VIEWED. */
export async function recordProposalView(proposalId: string, ip: string, userAgent: string): Promise<void> {
  try {
    const now = new Date()
    await db.proposalView.create({ data: { proposalId, ip, userAgent, viewedAt: now } })
    await db.proposal.update({
      where: { id: proposalId },
      data:  { viewCount: { increment: 1 }, lastViewedAt: now },
    })
    // Every later status is a decision (APPROVED, DECLINED, CHANGES_NEEDED,
    // LOST, EXPIRED) that re-opening the link must never undo.
    await db.proposal.updateMany({ where: { id: proposalId, status: 'SENT' }, data: { status: 'VIEWED' } })
    await db.proposal.updateMany({ where: { id: proposalId, firstViewedAt: null }, data: { firstViewedAt: now } })
  } catch (err) {
    console.error('Failed to record proposal view:', err)
  }
}

/** A client opened an invoice link. Only SENT/OVERDUE advance to VIEWED. */
export async function recordInvoiceView(invoiceId: string, ip: string, userAgent: string): Promise<void> {
  try {
    const now = new Date()
    await db.invoiceView.create({ data: { invoiceId, ip, userAgent, viewedAt: now } })
    // One count per view. (Two updateMany calls used to split this by status,
    // and the second matched the row the first had just moved to VIEWED —
    // every first view counted twice.)
    await db.invoice.update({
      where: { id: invoiceId },
      data:  { viewCount: { increment: 1 }, lastViewedAt: now },
    })
    // PAID and VOID are terminal: opening the link after a void must not un-void it.
    await db.invoice.updateMany({
      where: { id: invoiceId, status: { in: ['SENT', 'OVERDUE'] } },
      data:  { status: 'VIEWED' },
    })
    await db.invoice.updateMany({ where: { id: invoiceId, firstViewedAt: null }, data: { firstViewedAt: now } })
  } catch (err) {
    console.error('Failed to record invoice view:', err)
  }
}

/**
 * A client opened a deliverable version. The workspace comes from the version
 * row, never from the caller. Hashes the IP with a salt so no raw IPs are stored.
 */
export async function recordDeliverableView(
  deliverableId: string,
  versionId:     string,
  ip:            string,
  userAgent:     string | null,
): Promise<void> {
  try {
    const version = await db.deliverableVersion.findFirst({
      where:  { id: versionId, deliverableId },
      select: { workspaceId: true },
    })
    if (!version) return

    const salt    = process.env.DELIVERY_VIEW_SALT ?? 'delivery-view-salt'
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + salt))
    const ipHash  = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

    await db.$transaction(async tx => {
      await tx.deliverableView.create({
        data: { deliverableId, versionId, workspaceId: version.workspaceId, ipHash, userAgent },
      })
      // First real client view clears the "unseen" badge.
      await tx.deliverableVersion.updateMany({
        where: { id: versionId, firstClientViewAt: null },
        data:  { firstClientViewAt: new Date() },
      })
    })
  } catch (err) {
    // Non-critical — don't crash the page if view recording fails
    console.error('[delivery] recordDeliverableView', err)
  }
}
