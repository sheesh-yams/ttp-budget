'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import type { ScopedDb } from '@/lib/db-scoped'
import { getCurrentUser } from '@/lib/auth'
import { requireMoneyPermission } from '@/lib/money-access'
import { calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'
import type { ActionResult } from '@/types'
import { logAuditEvent } from '@/lib/audit'
import { generatePublicToken } from '@/lib/secure-token'
import { syncDeliverablesFromProposal } from './delivery'
import { sendProposalEmail, normalizeRecipientEmails, buildCcList } from '@/lib/email'
import { PHASE_TREE_INCLUDE, BUDGET_SNAPSHOT_SELECT, buildBudgetSnapshot, buildProposalContent, type SnapshotPhase } from '@/lib/proposal-snapshot'
import { applyProposalWonEffects } from '@/lib/proposal-won'
import { canReopenProposal, defaultReopenDate, earliestReopenDate, reopenedLinkExpiry, reopenedStatus, type ProposalReopenInfo } from '@/lib/proposal-expiry'

function uid() { return crypto.randomUUID().slice(0, 8) }

// ─── Resolve who/where a proposal email goes ──────────────────────────────────
// Shared by every "send proposal" entry point. Looks up the client's contact
// email + workspace branding up front so we can fail fast with a clear error
// before ever touching the proposal record, instead of creating/updating it
// and only then discovering there's nowhere to send it.

async function resolveProposalEmailContext(sdb: ScopedDb, projectId: string) {
  const project = await sdb.project.findFirst({
    where: { id: projectId },
    select: {
      name: true,
      client: { select: { contactEmail: true } },
      workspace: { select: { name: true, primaryColor: true, accentColor: true } },
    },
  })
  return {
    projectName:   project?.name ?? 'Project',
    clientEmail:   project?.client?.contactEmail ?? null,
    workspaceName: project?.workspace?.name ?? null,
    brandPrimary:  project?.workspace?.primaryColor ?? null,
    brandAccent:   project?.workspace?.accentColor ?? null,
  }
}

// ─── Capture a frozen snapshot of budget line items ───────────────────────────
// Internal helper — always called from exported functions that have already
// validated workspace ownership via getScopedDb(). Accepts sdb so all reads
// remain scoped to the active workspace. The shaping is buildBudgetSnapshot
// (src/lib/proposal-snapshot.ts).

async function captureBudgetSnapshot(sdb: ScopedDb, budgetId: string) {
  // sdb.budget.findFirst auto-scopes — safe even if budgetId comes from user input.
  const budget = await sdb.budget.findFirst({
    where: { id: budgetId },
    select: BUDGET_SNAPSHOT_SELECT,
  })
  // sdb.phase.findMany auto-scopes — blocks foreign budgetId cross-workspace reads.
  const allPhases = await sdb.phase.findMany({
    where: { budgetId },
    orderBy: { order: 'asc' },
    include: PHASE_TREE_INCLUDE,
  }) as unknown as SnapshotPhase[]
  return buildBudgetSnapshot(budget, allPhases)
}

// ─── Create proposal from a budget ───────────────────────────────────────────

export async function createProposal(
  projectId: string,
  budgetId: string,
  title: string
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const gate = await requireMoneyPermission({ budgetId }, 'proposals', 'EDIT')
    if (gate.ok && gate.projectId !== projectId) return { success: false, error: 'Not found' }
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

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
            { id: uid(), name: 'Deposit — on signing', percentPct: 0.5, trigger: 'on_signing' },
            { id: uid(), name: 'Final — on delivery', percentPct: 0.5, trigger: 'on_delivery' },
          ],
        },
      ],
    }

    const proposal = await sdb.proposal.create({
      data: {
        projectId,
        budgetId,
        title,
        publicToken: generatePublicToken(),
        content: defaultContent as object,
        createdById: user.id,
      } as unknown as Parameters<typeof sdb.proposal.create>[0]['data'],
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
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    await sdb.proposal.update({
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

/** Re-send an already-SENT proposal's email (e.g. a "Resend" action). Always emails. */
export async function sendProposal(proposalId: string): Promise<ActionResult<{ publicUrl: string }>> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const existing = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { budgetId: true, content: true, workspaceId: true, projectId: true, title: true, publicToken: true, expiresAt: true, recipientEmails: true } as unknown as Parameters<typeof sdb.proposal.findFirst>[0]['select'],
    })
    if (!existing) return { success: false, error: 'Proposal not found' }

    const emailCtx = await resolveProposalEmailContext(sdb, existing.projectId)
    if (!emailCtx.clientEmail) {
      return { success: false, error: 'This client has no contact email on file. Add one in the client profile before sending.' }
    }
    const toEmail = emailCtx.clientEmail
    const ccList  = buildCcList(toEmail, (existing as unknown as { recipientEmails?: string[] }).recipientEmails, user.email)

    const snapshot = await captureBudgetSnapshot(sdb, existing.budgetId as string)
    const mergedContent = { ...(existing.content as object), budgetSnapshot: snapshot }

    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/p/${(existing as unknown as { publicToken: string }).publicToken}`

    let messageId: string
    try {
      const sent = await sendProposalEmail({
        to:            toEmail,
        cc:            ccList,
        proposalTitle: existing.title,
        projectName:   emailCtx.projectName,
        proposalUrl:   publicUrl,
        expiresAt:     existing.expiresAt ? new Date(existing.expiresAt) : null,
        actorName:     user.name ?? user.email,
        actorEmail:    user.email,
        workspaceName: emailCtx.workspaceName,
        brandPrimary:  emailCtx.brandPrimary,
        brandAccent:   emailCtx.brandAccent,
      })
      messageId = sent.id
    } catch (emailErr) {
      const message = emailErr instanceof Error ? emailErr.message : 'Unknown error'
      console.error('[sendProposal] email send failed', emailErr)
      await logAuditEvent({
        workspaceId: (existing as unknown as { workspaceId: string }).workspaceId,
        actorId:     user.id,
        action:      'proposal.email_failed',
        entityType:  'Proposal',
        entityId:    proposalId,
        metadata:    { to: toEmail, cc: ccList, error: message },
      })
      return { success: false, error: `Email failed to send: ${message}` }
    }

    const now = new Date()
    await sdb.proposal.update({
      where: { id: proposalId },
      data: {
        status:  'SENT',
        sentAt:  now,
        content: mergedContent as object,
        publicTokenExpiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      } as unknown as Parameters<typeof sdb.proposal.update>[0]['data'],
    })
    revalidatePath(`/proposals/${proposalId}/edit`)
    await syncDeliverablesFromProposal((existing as unknown as { projectId: string }).projectId)

    await logAuditEvent({
      workspaceId: (existing as unknown as { workspaceId: string }).workspaceId,
      actorId:     user.id,
      action:      'proposal.email_sent',
      entityType:  'Proposal',
      entityId:    proposalId,
      metadata:    { to: toEmail, cc: ccList, messageId },
    })

    return { success: true, data: { publicUrl } }
  } catch (err) {
    console.error('[sendProposal]', err)
    return { success: false, error: 'Failed to send proposal' }
  }
}

// ─── Record view (called from public page — no auth, uses raw db) ─────────────

export async function recordProposalView(
  proposalId: string,
  ip: string,
  userAgent: string
): Promise<void> {
  try {
    const now = new Date()
    await db.proposalView.create({ data: { proposalId, ip, userAgent, viewedAt: now } })
    // Only SENT advances to VIEWED. Every later status is a decision
    // (APPROVED, DECLINED, CHANGES_NEEDED, LOST, EXPIRED) that a client or
    // teammate re-opening the link must never undo — same guard as
    // recordInvoiceView uses for PAID/VOID.
    await db.proposal.update({
      where: { id: proposalId },
      data: { viewCount: { increment: 1 }, lastViewedAt: now },
    })
    await db.proposal.updateMany({
      where: { id: proposalId, status: 'SENT' },
      data: { status: 'VIEWED' },
    })
    await db.proposal.updateMany({
      where: { id: proposalId, firstViewedAt: null },
      data: { firstViewedAt: now },
    })
  } catch (err) {
    console.error('Failed to record proposal view:', err)
  }
}

// ─── Create + populate + send in one call (from NewProposalModal) ─────────────

export async function createSentProposal(input: {
  projectId: string
  budgetId: string
  title: string
  milestones: { id: string; name: string; percentPct: number; trigger: string; customDate?: string }[]
  expiresAt: string
  totalCents: number
  /** Extra addresses to email + allow to e-sign, beyond the client contact email. */
  recipientEmails?: string[]
  /** true = actually email the client (status only flips to SENT on success).
   *  false = "Mark as Sent" bypass — flips to SENT immediately, no email attempted. */
  sendEmail: boolean
}): Promise<ActionResult<{ id: string; publicToken: string; publicUrl: string }>> {
  try {
    const gate = await requireMoneyPermission({ budgetId: input?.budgetId }, 'proposals', 'EDIT')
    if (gate.ok && gate.projectId !== input?.projectId) return { success: false, error: 'Not found' }
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    // Resolve the recipient up front — fail fast before creating anything if
    // we're about to email and there's nowhere to send it.
    let emailCtx: Awaited<ReturnType<typeof resolveProposalEmailContext>> | null = null
    if (input.sendEmail) {
      emailCtx = await resolveProposalEmailContext(sdb, input.projectId)
      if (!emailCtx.clientEmail) {
        return { success: false, error: 'This client has no contact email on file. Add one in the client profile, or use "Mark as Sent" instead.' }
      }
    }

    // Resolves the primary phase's content AND (when flagged) any other
    // visible phases in one pass — see captureBudgetSnapshot above.
    const snapshot = await captureBudgetSnapshot(sdb, input.budgetId)
    const content = buildProposalContent({ ...input, overview: snapshot.overview, about: snapshot.about, deliverables: snapshot.deliverables })
    const recipientEmails = normalizeRecipientEmails(input.recipientEmails)
    const fullContent = {
      ...content,
      budgetSnapshot: snapshot.budgetSnapshot,
      ...(snapshot.proposalOptions ? { proposalOptions: snapshot.proposalOptions } : {}),
    }

    const maxVersion = await sdb.proposal.aggregate({
      where: { projectId: input.projectId },
      _max: { version: true },
    })
    const nextVersion = ((maxVersion._max as unknown as { version: number | null }).version ?? 0) + 1

    // Created as DRAFT when we still need to email — only flips to SENT after
    // the email actually goes out, so a Resend failure never leaves a proposal
    // showing "sent" when the client got nothing.
    const proposal = await sdb.proposal.create({
      data: {
        projectId: input.projectId,
        budgetId: input.budgetId,
        title: input.title,
        publicToken: generatePublicToken(),
        content: fullContent as object,
        status: input.sendEmail ? 'DRAFT' : 'SENT',
        sentAt: input.sendEmail ? null : new Date(),
        expiresAt: new Date(input.expiresAt),
        publicTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) as unknown as undefined,
        recipientEmails,
        version: nextVersion,
        createdById: user.id,
      } as unknown as Parameters<typeof sdb.proposal.create>[0]['data'],
    })

    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/p/${(proposal as unknown as { publicToken: string }).publicToken}`

    if (input.sendEmail && emailCtx) {
      const toEmail = emailCtx.clientEmail!
      const ccList  = buildCcList(toEmail, recipientEmails, user.email)
      try {
        const sent = await sendProposalEmail({
          to:            toEmail,
          cc:            ccList,
          proposalTitle: input.title,
          projectName:   emailCtx.projectName,
          proposalUrl:   publicUrl,
          expiresAt:     new Date(input.expiresAt),
          actorName:     user.name ?? user.email,
          actorEmail:    user.email,
          workspaceName: emailCtx.workspaceName,
          brandPrimary:  emailCtx.brandPrimary,
          brandAccent:   emailCtx.brandAccent,
        })
        await sdb.proposal.update({ where: { id: proposal.id }, data: { status: 'SENT', sentAt: new Date() } })
        await logAuditEvent({
          workspaceId: gate.workspaceId,
          actorId:     user.id,
          action:      'proposal.email_sent',
          entityType:  'Proposal',
          entityId:    proposal.id,
          metadata:    { to: toEmail, cc: ccList, messageId: sent.id },
        })
      } catch (emailErr) {
        const message = emailErr instanceof Error ? emailErr.message : 'Unknown error'
        console.error('[createSentProposal] email send failed', emailErr)
        await logAuditEvent({
          workspaceId: gate.workspaceId,
          actorId:     user.id,
          action:      'proposal.email_failed',
          entityType:  'Proposal',
          entityId:    proposal.id,
          metadata:    { to: emailCtx.clientEmail, error: message },
        })
        // Proposal stays as a DRAFT — not lost, just not sent. Surface the real reason.
        return { success: false, error: `Proposal saved as a draft, but the email failed to send: ${message}` }
      }
    } else {
      await logAuditEvent({
        workspaceId: gate.workspaceId,
        actorId:     user.id,
        action:      'proposal.sent',
        entityType:  'Proposal',
        entityId:    proposal.id,
      })
    }

    revalidatePath(`/projects/${input.projectId}`)
    await syncDeliverablesFromProposal(input.projectId)
    return { success: true, data: { id: proposal.id, publicToken: (proposal as unknown as { publicToken: string }).publicToken, publicUrl } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create proposal' }
  }
}

// ─── Create a DRAFT proposal ──────────────────────────────────────────────────

export async function createDraftProposal(input: {
  projectId: string
  budgetId: string
  title: string
  milestones: { id: string; name: string; percentPct: number; trigger: string; customDate?: string }[]
  expiresAt: string
  totalCents: number
  recipientEmails?: string[]
}): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const gate = await requireMoneyPermission({ budgetId: input?.budgetId }, 'proposals', 'EDIT')
    if (gate.ok && gate.projectId !== input?.projectId) return { success: false, error: 'Not found' }
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])

    // sdb.phase.findFirst auto-scopes — blocks foreign budgetId cross-workspace reads.
    const primaryPhase = await sdb.phase.findFirst({
      where: { budgetId: input.budgetId, isPrimary: true },
      select: { overview: true, description: true, deliverables: true },
    }) ?? await sdb.phase.findFirst({
      where: { budgetId: input.budgetId },
      orderBy: { order: 'asc' },
      select: { overview: true, description: true, deliverables: true },
    })

    const phaseOverview = (primaryPhase as unknown as { overview?: string | null })?.overview ?? ''
    const phaseAbout = primaryPhase?.description ?? ''
    const phaseDeliverables = (primaryPhase?.deliverables as { title: string; description: string; sectionIds?: string[] }[] | null) ?? []

    const content = buildProposalContent({ ...input, overview: phaseOverview, about: phaseAbout, deliverables: phaseDeliverables })

    const maxVersion = await sdb.proposal.aggregate({
      where: { projectId: input.projectId },
      _max: { version: true },
    })
    const nextVersion = ((maxVersion._max as unknown as { version: number | null }).version ?? 0) + 1

    const proposal = await sdb.proposal.create({
      data: {
        projectId: input.projectId,
        budgetId: input.budgetId,
        title: input.title,
        publicToken: generatePublicToken(),
        content: content as object,
        status: 'DRAFT',
        expiresAt: new Date(input.expiresAt),
        recipientEmails: normalizeRecipientEmails(input.recipientEmails),
        version: nextVersion,
        createdById: user.id,
      } as unknown as Parameters<typeof sdb.proposal.create>[0]['data'],
    })
    revalidatePath(`/projects/${input.projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: (proposal as unknown as { publicToken: string }).publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to save draft' }
  }
}

// ─── Update an existing DRAFT proposal ───────────────────────────────────────

export async function updateDraftProposal(
  proposalId: string,
  input: {
    title: string
    milestones: { id: string; name: string; percentPct: number; trigger: string; customDate?: string }[]
    expiresAt: string
    totalCents: number
    recipientEmails?: string[]
  }
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    const existing = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { budgetId: true },
    })
    if (!existing) return { success: false, error: 'Proposal not found' }
    // budgetId comes from sdb-verified proposal; sdb.phase.findFirst also auto-scopes.
    const primaryPhase = await sdb.phase.findFirst({
      where: { budgetId: existing.budgetId as string, isPrimary: true },
      select: { overview: true, description: true, deliverables: true },
    }) ?? await sdb.phase.findFirst({
      where: { budgetId: existing.budgetId as string },
      orderBy: { order: 'asc' },
      select: { overview: true, description: true, deliverables: true },
    })
    const phaseOverview = (primaryPhase as unknown as { overview?: string | null })?.overview ?? ''
    const phaseAbout = primaryPhase?.description ?? ''
    const phaseDeliverables = (primaryPhase?.deliverables as { title: string; description: string; sectionIds?: string[] }[] | null) ?? []
    const content = buildProposalContent({ ...input, overview: phaseOverview, about: phaseAbout, deliverables: phaseDeliverables })
    const proposal = await sdb.proposal.update({
      where: { id: proposalId },
      data: {
        title: input.title,
        content: content as object,
        expiresAt: new Date(input.expiresAt),
        recipientEmails: normalizeRecipientEmails(input.recipientEmails),
        updatedAt: new Date(),
      } as unknown as Parameters<typeof sdb.proposal.update>[0]['data'],
    })
    revalidatePath(`/projects/${(proposal as unknown as { projectId: string }).projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: (proposal as unknown as { publicToken: string }).publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to update draft' }
  }
}

// ─── Send an existing DRAFT proposal ─────────────────────────────────────────

export async function sendDraftProposal(
  proposalId: string,
  /** true = actually email the client. false = "Mark as Sent" bypass — no email. */
  sendEmail: boolean,
): Promise<ActionResult<{ publicToken: string }>> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const existing = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { budgetId: true, projectId: true, content: true, title: true, publicToken: true, expiresAt: true, recipientEmails: true } as unknown as Parameters<typeof sdb.proposal.findFirst>[0]['select'],
    })
    if (!existing) return { success: false, error: 'Proposal not found' }

    let emailCtx: Awaited<ReturnType<typeof resolveProposalEmailContext>> | null = null
    let toEmail = ''
    let ccList: string[] = []
    if (sendEmail) {
      emailCtx = await resolveProposalEmailContext(sdb, existing.projectId)
      if (!emailCtx.clientEmail) {
        return { success: false, error: 'This client has no contact email on file. Add one in the client profile, or use "Mark as Sent" instead.' }
      }
      toEmail = emailCtx.clientEmail
      ccList  = buildCcList(toEmail, (existing as unknown as { recipientEmails?: string[] }).recipientEmails, user.email)
    }

    const snapshot = await captureBudgetSnapshot(sdb, existing.budgetId as string)
    const mergedContent = {
      ...(existing.content as object),
      budgetSnapshot: snapshot.budgetSnapshot,
      // Explicit assignment (not a conditional spread) so re-sending after
      // un-flagging an option correctly clears a stale proposalOptions array
      // left over from a previous send — undefined is dropped on JSON write.
      proposalOptions: snapshot.proposalOptions,
    }

    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/p/${(existing as unknown as { publicToken: string }).publicToken}`

    if (sendEmail && emailCtx) {
      try {
        const sent = await sendProposalEmail({
          to:            toEmail,
          cc:            ccList,
          proposalTitle: existing.title,
          projectName:   emailCtx.projectName,
          proposalUrl:   publicUrl,
          expiresAt:     existing.expiresAt ? new Date(existing.expiresAt) : null,
          actorName:     user.name ?? user.email,
          actorEmail:    user.email,
          workspaceName: emailCtx.workspaceName,
          brandPrimary:  emailCtx.brandPrimary,
          brandAccent:   emailCtx.brandAccent,
        })
        await logAuditEvent({
          workspaceId: gate.workspaceId,
          actorId:     user.id,
          action:      'proposal.email_sent',
          entityType:  'Proposal',
          entityId:    proposalId,
          metadata:    { to: toEmail, cc: ccList, messageId: sent.id },
        })
      } catch (emailErr) {
        const message = emailErr instanceof Error ? emailErr.message : 'Unknown error'
        console.error('[sendDraftProposal] email send failed', emailErr)
        await logAuditEvent({
          workspaceId: gate.workspaceId,
          actorId:     user.id,
          action:      'proposal.email_failed',
          entityType:  'Proposal',
          entityId:    proposalId,
          metadata:    { to: toEmail, cc: ccList, error: message },
        })
        // Stays DRAFT — content snapshot below is skipped too, nothing changes until retried.
        return { success: false, error: `Email failed to send: ${message}` }
      }
    } else {
      await logAuditEvent({
        workspaceId: gate.workspaceId,
        actorId:     user.id,
        action:      'proposal.sent',
        entityType:  'Proposal',
        entityId:    proposalId,
      })
    }

    const proposal = await sdb.proposal.update({
      where: { id: proposalId },
      data: {
        status:  'SENT',
        sentAt:  new Date(),
        content: mergedContent as object,
        publicTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      } as unknown as Parameters<typeof sdb.proposal.update>[0]['data'],
    })
    revalidatePath(`/projects/${existing.projectId}`)
    await syncDeliverablesFromProposal(existing.projectId)
    return { success: true, data: { publicToken: (proposal as unknown as { publicToken: string }).publicToken } }
  } catch (err) {
    console.error('[sendDraftProposal]', err)
    return { success: false, error: 'Failed to send proposal' }
  }
}

// ─── Reopen an expired proposal ───────────────────────────────────────────────

/** What the Reopen dialog shows. */
export async function getProposalReopenInfo(proposalId: string): Promise<ActionResult<ProposalReopenInfo>> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error
    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const p = await sdb.proposal.findFirst({
      where:  { id: proposalId },
      select: { status: true, expiresAt: true, lastViewedAt: true, projectId: true, recipientEmails: true },
    })
    if (!p) return { success: false, error: 'Proposal not found' }
    if (!canReopenProposal(p)) return { success: false, error: 'Only an expired proposal can be reopened.' }
    const ws = await sdb.workspace.findFirst({ where: { id: gate.workspaceId }, select: { proposalExpiryDays: true } })
    const ctx = await resolveProposalEmailContext(sdb, p.projectId)
    return { success: true, data: {
      expiredOn: p.expiresAt?.toISOString() ?? null,
      lastViewedAt: p.lastViewedAt?.toISOString() ?? null,
      defaultExpiresAt: defaultReopenDate(ws?.proposalExpiryDays ?? 30),
      to: ctx.clientEmail,
      cc: ctx.clientEmail ? buildCcList(ctx.clientEmail, (p as unknown as { recipientEmails?: string[] }).recipientEmails, user.email) : [],
    } }
  } catch (err) {
    console.error('[getProposalReopenInfo]', err)
    return { success: false, error: 'Couldn’t load the proposal' }
  }
}

/**
 * Reopens an expired proposal as it was sent — same link, same frozen
 * pricing and terms — with a new valid-through date. The link is kept alive
 * past the new date; a literally-EXPIRED status goes back to Viewed/Sent;
 * Won/Lost/Declined/drafts are refused. Optionally emails the client the link
 * again (the reopen stands even if that email fails — the result says so).
 */
export async function reopenProposal(
  proposalId: string, input: { expiresAt: string; notify: boolean },
): Promise<ActionResult<{ emailed: boolean; emailError?: string; status: string; expiresAt: string }>> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error
    if (typeof input?.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) {
      return { success: false, error: 'Pick a valid-through date.' }
    }
    // Stored as UTC midnight, like every send; the approve route refuses once
    // it's < now — so the new date has to still be in the future.
    const validThrough = new Date(input.expiresAt)
    if (isNaN(validThrough.getTime()) || input.expiresAt < earliestReopenDate()) {
      return { success: false, error: 'Pick a later date — the proposal would already be expired on that one.' }
    }

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const p = await sdb.proposal.findFirst({
      where:  { id: proposalId },
      select: { status: true, expiresAt: true, publicTokenExpiresAt: true, firstViewedAt: true, projectId: true, title: true, publicToken: true, recipientEmails: true },
    })
    if (!p) return { success: false, error: 'Proposal not found' }
    if (!canReopenProposal(p)) return { success: false, error: 'Only an expired proposal can be reopened.' }

    // Fail fast before changing anything if the email can't go anywhere.
    const emailCtx = input.notify ? await resolveProposalEmailContext(sdb, p.projectId) : null
    if (input.notify && !emailCtx?.clientEmail) {
      return { success: false, error: 'This client has no contact email on file — add one, or reopen without emailing.' }
    }

    const status = reopenedStatus(p)
    const res = await sdb.proposal.updateMany({
      // Guarded on exactly what was read: a status change or another reopen
      // made meanwhile wins (and a double-click doesn't email twice).
      where: { id: proposalId, status: p.status, expiresAt: p.expiresAt },
      data:  {
        expiresAt: validThrough,
        publicTokenExpiresAt: reopenedLinkExpiry(p.publicTokenExpiresAt, validThrough),
        ...(status !== p.status ? { status: status as typeof p.status } : {}),
      },
    })
    if (res.count === 0) return { success: false, error: 'This proposal changed — refresh and try again.' }
    await logAuditEvent({
      workspaceId: gate.workspaceId, actorId: user.id, action: 'proposal.reopened', entityType: 'Proposal', entityId: proposalId,
      metadata: { from: p.expiresAt?.toISOString() ?? null, to: validThrough.toISOString(), fromStatus: p.status, toStatus: status, notify: input.notify },
    })
    revalidatePath(`/projects/${p.projectId}`)
    revalidatePath('/proposals')

    const done = { status, expiresAt: validThrough.toISOString() }
    if (!input.notify || !emailCtx?.clientEmail) return { success: true, data: { ...done, emailed: false } }
    const ccList = buildCcList(emailCtx.clientEmail, (p as unknown as { recipientEmails?: string[] }).recipientEmails, user.email)
    try {
      const sent = await sendProposalEmail({
        to: emailCtx.clientEmail, cc: ccList, proposalTitle: p.title, projectName: emailCtx.projectName,
        proposalUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/p/${p.publicToken}`, expiresAt: validThrough,
        actorName: user.name ?? user.email, actorEmail: user.email,
        workspaceName: emailCtx.workspaceName, brandPrimary: emailCtx.brandPrimary, brandAccent: emailCtx.brandAccent,
      })
      await logAuditEvent({
        workspaceId: gate.workspaceId, actorId: user.id, action: 'proposal.email_sent', entityType: 'Proposal', entityId: proposalId,
        metadata: { to: emailCtx.clientEmail, cc: ccList, messageId: sent.id, reason: 'reopened' },
      })
      return { success: true, data: { ...done, emailed: true } }
    } catch (emailErr) {
      const message = emailErr instanceof Error ? emailErr.message : 'Unknown error'
      await logAuditEvent({
        workspaceId: gate.workspaceId, actorId: user.id, action: 'proposal.email_failed', entityType: 'Proposal', entityId: proposalId,
        metadata: { to: emailCtx.clientEmail, cc: ccList, error: message, reason: 'reopened' },
      })
      return { success: true, data: { ...done, emailed: false, emailError: message } }
    }
  } catch (err) {
    console.error('[reopenProposal]', err)
    return { success: false, error: 'Failed to reopen the proposal' }
  }
}

// ─── Create a new version (revision) from an existing proposal ────────────────

export async function createProposalRevision(
  proposalId: string
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const source = await sdb.proposal.findFirst({ where: { id: proposalId } })
    if (!source) return { success: false, error: 'Proposal not found' }

    const maxVersion = await sdb.proposal.aggregate({
      where: { projectId: (source as unknown as { projectId: string }).projectId },
      _max: { version: true },
    })
    const nextVersion = ((maxVersion._max as unknown as { version: number | null }).version ?? 1) + 1
    const proposal = await sdb.proposal.create({
      data: {
        projectId:   (source as unknown as { projectId: string }).projectId,
        budgetId:    (source as unknown as { budgetId: string }).budgetId,
        title:       (source as unknown as { title: string }).title,
        publicToken: generatePublicToken(),
        content:     (source as unknown as { content: object }).content,
        status:      'DRAFT',
        version:     nextVersion,
        expiresAt:   (source as unknown as { expiresAt: Date | null }).expiresAt,
        createdById: user.id,
      } as unknown as Parameters<typeof sdb.proposal.create>[0]['data'],
    })
    // Copy contract sections from source proposal to the new revision
    type SectionRow = { title: string; body: string; orderIndex: number; attachedBy: string; sourceBlockId: string | null; editedFromSource: boolean }
    const sourceSections = await (sdb as unknown as {
      proposalContractSection: {
        findMany: (a: object) => Promise<SectionRow[]>
        createMany: (a: object) => Promise<unknown>
      }
    }).proposalContractSection.findMany({
      where:   { proposalId },
      orderBy: { orderIndex: 'asc' },
      select:  { title: true, body: true, orderIndex: true, attachedBy: true, sourceBlockId: true, editedFromSource: true },
    })
    if (sourceSections.length > 0) {
      const newProposalId  = (proposal as unknown as { id: string }).id
      const wsId = (source as unknown as { workspaceId: string }).workspaceId
      await (sdb as unknown as {
        proposalContractSection: { createMany: (a: object) => Promise<unknown> }
      }).proposalContractSection.createMany({
        data: sourceSections.map(s => ({
          workspaceId:      wsId,
          proposalId:       newProposalId,
          sourceBlockId:    s.sourceBlockId,
          title:            s.title,
          body:             s.body,
          orderIndex:       s.orderIndex,
          attachedBy:       s.attachedBy,
          editedFromSource: s.editedFromSource,
        })),
      })
    }

    revalidatePath(`/projects/${(source as unknown as { projectId: string }).projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: (proposal as unknown as { publicToken: string }).publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create revision' }
  }
}

// ─── Update proposal status (for Kanban stage changes) ───────────────────────

export async function updateProposalStatus(
  proposalId: string,
  status: string
): Promise<ActionResult> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const proposal = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: {
        projectId:   true,
        workspaceId: true,
        content:     true,
        project: { select: { status: true } },
      },
    })

    // When manually marking APPROVED, snapshot the gross total from content so
    // the project card shows the correct amount (same logic as the client
    // approval route). Prefer content.totalCents (set by buildContent), fall
    // back to content.budgetSnapshot.totalCents for older proposals.
    let approvedTotalCents: number | undefined
    if (status === 'APPROVED' && proposal) {
      const c = proposal.content as Record<string, unknown> | null
      const fromTop      = c && typeof c.totalCents === 'number' ? c.totalCents : null
      const fromSnapshot = c?.budgetSnapshot
        ? (c.budgetSnapshot as Record<string, unknown>).totalCents
        : null
      const resolved = fromTop ?? (typeof fromSnapshot === 'number' ? fromSnapshot : null)
      if (resolved !== null) approvedTotalCents = resolved
    }

    await sdb.proposal.update({
      where: { id: proposalId },
      data:  {
        status: status as Parameters<typeof sdb.proposal.update>[0]['data']['status'],
        ...(approvedTotalCents !== undefined ? { approvedTotalCents } : {}),
      } as Parameters<typeof sdb.proposal.update>[0]['data'],
    })

    // ── Auto-advance project status based on proposal outcome ─────────────────
    if (proposal) {
      const projectStatus = (proposal.project as unknown as { status: string }).status

      if (status === 'APPROVED') {
        await applyProposalWonEffects(sdb, proposalId, proposal.projectId)
      }

      if (['LOST', 'DECLINED', 'EXPIRED'].includes(status) && projectStatus === 'ACTIVE') {
        // Proposal lost/declined — drop back to Lead only if no other
        // approved proposals remain on this project
        const otherApproved = await sdb.proposal.count({
          where: {
            projectId: proposal.projectId,
            id:        { not: proposalId },
            status:    'APPROVED',
          },
        })
        if (otherApproved === 0) {
          await sdb.project.update({
            where: { id: proposal.projectId },
            data:  { status: 'LEAD' },
          })
        }
      }
    }

    revalidatePath('/proposals')
    revalidatePath('/projects')
    if (proposal) revalidatePath(`/projects/${proposal.projectId}`)

    // Audit notable status transitions
    if (proposal && (status === 'LOST' || status === 'APPROVED')) {
      await logAuditEvent({
        workspaceId: (proposal as unknown as { workspaceId: string }).workspaceId,
        actorId:     user.id,
        action:      status === 'LOST' ? 'proposal.lost' : 'proposal.approved',
        entityType:  'Proposal',
        entityId:    proposalId,
      })
    }

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update status' }
  }
}

// Convenience wrapper — marks a proposal as won (APPROVED)
export async function markProposalWon(proposalId: string): Promise<ActionResult> {
  return updateProposalStatus(proposalId, 'APPROVED')
}

// Convenience wrapper — marks a proposal as lost
export async function markProposalLost(proposalId: string): Promise<ActionResult> {
  return updateProposalStatus(proposalId, 'LOST')
}

// ─── Delete a proposal ───────────────────────────────────────────────────────

export async function deleteProposal(proposalId: string): Promise<ActionResult> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    const proposal = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { projectId: true },
    })
    if (!proposal) return { success: false, error: 'Proposal not found' }
    await sdb.proposal.delete({ where: { id: proposalId } })
    revalidatePath(`/projects/${(proposal as unknown as { projectId: string }).projectId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete proposal' }
  }
}

// ─── Update brand overrides ───────────────────────────────────────────────────

export async function updateProposalBranding(
  proposalId: string,
  brandOverrides: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const gate = await requireMoneyPermission({ proposalId }, 'proposals', 'EDIT')
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    await sdb.proposal.update({
      where: { id: proposalId },
      data: { brandOverrides: brandOverrides as object },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update branding' }
  }
}
