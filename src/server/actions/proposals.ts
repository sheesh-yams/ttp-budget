'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser } from '@/lib/auth'
import { nanoid } from 'nanoid'
import type { ActionResult } from '@/types'

// ─── Create proposal from a budget ───────────────────────────────────────────

export async function createProposal(
  projectId: string,
  budgetId: string,
  title: string
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const user = await getCurrentUser()

    const defaultContent = {
      sections: [
        { type: 'about', title: 'The project', body: '' },
        { type: 'scope', title: 'Deliverables', items: [] },
        { type: 'budget', detailLevel: 'SUMMARY' },
        {
          type: 'terms',
          title: 'Payment terms',
          body: '',
          milestones: [
            { id: nanoid(8), name: 'Deposit — on signing', percentPct: 50, trigger: 'on_signing' },
            { id: nanoid(8), name: 'Final — on delivery', percentPct: 50, trigger: 'on_delivery' },
          ],
        },
      ],
    }

    const proposal = await db.proposal.create({
      data: {
        workspaceId: user.workspaceId,
        projectId,
        budgetId,
        title,
        content: defaultContent as object,
        createdById: user.id,
      },
    })

    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: proposal.publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create proposal' }
  }
}

// ─── Update proposal content ──────────────────────────────────────────────────

export async function updateProposalContent(
  proposalId: string,
  content: Record<string, unknown>
): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    await db.proposal.update({
      where: { id: proposalId },
      data: { content: content as object, updatedAt: new Date() },
    })
    revalidatePath(`/proposals/${proposalId}/edit`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save proposal' }
  }
}

// ─── Send proposal (status: DRAFT → SENT) ─────────────────────────────────────

export async function sendProposal(proposalId: string): Promise<ActionResult<{ publicUrl: string }>> {
  try {
    await getWorkspaceId()
    const proposal = await db.proposal.update({
      where: { id: proposalId },
      data: { status: 'SENT', sentAt: new Date() },
    })
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/p/${proposal.publicToken}`
    revalidatePath(`/proposals/${proposalId}/edit`)
    return { success: true, data: { publicUrl } }
  } catch {
    return { success: false, error: 'Failed to send proposal' }
  }
}

// ─── Record view (called from public page, no auth) ───────────────────────────

export async function recordProposalView(
  proposalId: string,
  ip: string,
  userAgent: string
): Promise<void> {
  try {
    const now = new Date()
    await db.proposalView.create({
      data: { proposalId, ip, userAgent, viewedAt: now },
    })
    await db.proposal.update({
      where: { id: proposalId },
      data: { viewCount: { increment: 1 }, lastViewedAt: now, status: 'VIEWED' },
    })
    await db.proposal.updateMany({
      where: { id: proposalId, firstViewedAt: null },
      data: { firstViewedAt: now },
    })
  } catch (err) {
    console.error('Failed to record proposal view:', err)
  }
}

// ─── Update brand overrides ───────────────────────────────────────────────────

export async function updateProposalBranding(
  proposalId: string,
  brandOverrides: Record<string, unknown>
): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    await db.proposal.update({
      where: { id: proposalId },
      data: { brandOverrides: brandOverrides as object },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update branding' }
  }
}
