'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import type { ScopedDb } from '@/lib/db-scoped'
import { getCurrentUser } from '@/lib/auth'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { ActionResult, ProposalDiscount } from '@/types'
import { logAuditEvent } from '@/lib/audit'
import { generatePublicToken } from '@/lib/secure-token'

function uid() { return crypto.randomUUID().slice(0, 8) }

// ─── Capture a frozen snapshot of budget line items ───────────────────────────
// Internal helper — always called from exported functions that have already
// validated workspace ownership via getScopedDb(). Accepts sdb so all reads
// remain scoped to the active workspace.

async function captureBudgetSnapshot(sdb: ScopedDb, budgetId: string, discount?: ProposalDiscount) {
  // sdb.budget.findFirst auto-scopes — safe even if budgetId comes from user input.
  const budget = await sdb.budget.findFirst({
    where: { id: budgetId },
    select: { markupPct: true, taxPct: true },
  })
  const budgetMarkupPct = budget?.markupPct != null ? Number(budget.markupPct) : 0
  const budgetTaxPct    = budget?.taxPct    != null ? Number(budget.taxPct)    : 0

  const phaseInclude = {
    sections: {
      orderBy: { orderIndex: 'asc' as const },
      select:  { id: true, title: true, orderIndex: true },
    },
    accounts: {
      where: { parentId: null },
      orderBy: { order: 'asc' as const },
      include: {
        lineItems: { orderBy: { order: 'asc' as const } },
        children: {
          orderBy: { order: 'asc' as const },
          include: { lineItems: { orderBy: { order: 'asc' as const } } },
        },
      },
    },
  }

  // sdb.phase.findFirst auto-scopes — blocks foreign budgetId cross-workspace reads.
  const primaryPhase =
    await sdb.phase.findFirst({ where: { budgetId, isPrimary: true }, include: phaseInclude }) ??
    await sdb.phase.findFirst({ where: { budgetId }, orderBy: { order: 'asc' }, include: phaseInclude })

  const sections = (primaryPhase?.sections ?? []).map(s => ({ id: s.id, title: s.title }))

  const accounts = (primaryPhase?.accounts ?? []).map(acc => ({
    id:        acc.id,
    name:      acc.name,
    code:      acc.code,
    order:     acc.order,
    sectionId: (acc as unknown as { sectionId?: string }).sectionId ?? null,
    lineItems: acc.lineItems.map(i => ({
      id:              i.id,
      description:     i.description,
      quantity:        Number(i.quantity),
      quantityFormula: i.quantityFormula ?? null,
      unit:            i.unit,
      rateCents:       i.rateCents,
      markupPct:       i.markupPct != null ? Number(i.markupPct) : null,
      notes:           i.notes,
      order:           i.order,
    })),
    children: acc.children.map(child => ({
      id:       child.id,
      name:     child.name,
      order:    child.order,
      lineItems: child.lineItems.map(i => ({
        id:              i.id,
        description:     i.description,
        quantity:        Number(i.quantity),
        quantityFormula: i.quantityFormula ?? null,
        unit:            i.unit,
        rateCents:       i.rateCents,
        markupPct:       i.markupPct != null ? Number(i.markupPct) : null,
        notes:           i.notes,
        order:           i.order,
      })),
    })),
  }))

  const productionCents = accounts.reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
    0
  )

  const agencyFeeCents = Math.round(productionCents * budgetMarkupPct)
  const preTax         = productionCents + agencyFeeCents

  let discountCents = 0
  let discountLabel = ''
  if (discount) {
    discountLabel = discount.label || 'Discount'
    if (discount.type === 'flat' && discount.valueCents) {
      discountCents = discount.valueCents
    } else if (discount.type === 'pct' && discount.valuePct) {
      discountCents = Math.round(preTax * (discount.valuePct / 100))
    }
    discountCents = Math.max(0, Math.min(discountCents, preTax))
  }

  const afterDiscount = preTax - discountCents
  const taxCents      = Math.round(afterDiscount * budgetTaxPct)
  const totalCents    = afterDiscount + taxCents

  const pageBreakBetweenAccounts = (primaryPhase as unknown as { pageBreakBetweenAccounts?: boolean })?.pageBreakBetweenAccounts ?? false

  return { accounts, sections, pageBreakBetweenAccounts, productionCents, budgetMarkupPct, budgetTaxPct, discountCents, discountLabel, totalCents }
}

// ─── Create proposal from a budget ───────────────────────────────────────────

export async function createProposal(
  projectId: string,
  budgetId: string,
  title: string
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
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

export async function sendProposal(proposalId: string): Promise<ActionResult<{ publicUrl: string }>> {
  try {
    const [sdb, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const existing = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { budgetId: true, content: true, workspaceId: true },
    })
    if (!existing) return { success: false, error: 'Proposal not found' }
    const discount = (existing.content as { discount?: ProposalDiscount }).discount
    const snapshot = await captureBudgetSnapshot(sdb, existing.budgetId as string, discount)
    const mergedContent = { ...(existing.content as object), budgetSnapshot: snapshot }

    const now = new Date()
    const proposal = await sdb.proposal.update({
      where: { id: proposalId },
      data: {
        status:  'SENT',
        sentAt:  now,
        content: mergedContent as object,
        publicTokenExpiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      } as unknown as Parameters<typeof sdb.proposal.update>[0]['data'],
    })
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/p/${(proposal as unknown as { publicToken: string }).publicToken}`
    revalidatePath(`/proposals/${proposalId}/edit`)

    await logAuditEvent({
      workspaceId: (existing as unknown as { workspaceId: string }).workspaceId,
      actorId:     user.id,
      action:      'proposal.sent',
      entityType:  'Proposal',
      entityId:    proposalId,
    })

    return { success: true, data: { publicUrl } }
  } catch {
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

// ─── Create + populate + send in one call (from NewProposalModal) ─────────────

export async function createSentProposal(input: {
  projectId: string
  budgetId: string
  title: string
  milestones: { id: string; name: string; percentPct: number; trigger: string; customDate?: string }[]
  expiresAt: string
  totalCents: number
  discount?: ProposalDiscount
}): Promise<ActionResult<{ id: string; publicToken: string; publicUrl: string }>> {
  try {
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

    const content = buildContent({ ...input, overview: phaseOverview, about: phaseAbout, deliverables: phaseDeliverables })
    const snapshot = await captureBudgetSnapshot(sdb, input.budgetId, input.discount)

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
        content: { ...content, budgetSnapshot: snapshot } as object,
        status: 'SENT',
        sentAt: new Date(),
        expiresAt: new Date(input.expiresAt),
        publicTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) as unknown as undefined,
        version: nextVersion,
        createdById: user.id,
      } as unknown as Parameters<typeof sdb.proposal.create>[0]['data'],
    })

    revalidatePath(`/projects/${input.projectId}`)
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/p/${(proposal as unknown as { publicToken: string }).publicToken}`
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
  discount?: ProposalDiscount
}): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
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

    const content = buildContent({ ...input, overview: phaseOverview, about: phaseAbout, deliverables: phaseDeliverables })

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
    discount?: ProposalDiscount
  }
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
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
    const content = buildContent({ ...input, overview: phaseOverview, about: phaseAbout, deliverables: phaseDeliverables })
    const proposal = await sdb.proposal.update({
      where: { id: proposalId },
      data: {
        title: input.title,
        content: content as object,
        expiresAt: new Date(input.expiresAt),
        updatedAt: new Date(),
      },
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
  proposalId: string
): Promise<ActionResult<{ publicToken: string }>> {
  try {
    const sdb = await getScopedDb()
    const existing = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { budgetId: true, projectId: true, content: true },
    })
    if (!existing) return { success: false, error: 'Proposal not found' }
    const discount2 = (existing.content as { discount?: ProposalDiscount }).discount
    const snapshot = await captureBudgetSnapshot(sdb, existing.budgetId as string, discount2)
    const mergedContent = { ...(existing.content as object), budgetSnapshot: snapshot }

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
    return { success: true, data: { publicToken: (proposal as unknown as { publicToken: string }).publicToken } }
  } catch {
    return { success: false, error: 'Failed to send proposal' }
  }
}

// ─── Create a new version (revision) from an existing proposal ────────────────

export async function createProposalRevision(
  proposalId: string
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
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
    revalidatePath(`/projects/${(source as unknown as { projectId: string }).projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: (proposal as unknown as { publicToken: string }).publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create revision' }
  }
}

// ─── Shared content builder ───────────────────────────────────────────────────

function buildContent(input: {
  overview: string
  about: string
  deliverables: { title: string; description: string; sectionIds?: string[] }[]
  milestones: { id: string; name: string; percentPct: number; trigger: string; customDate?: string }[]
  totalCents: number
  discount?: ProposalDiscount
}) {
  return {
    totalCents: input.totalCents,
    ...(input.discount ? { discount: input.discount } : {}),
    sections: [
      { type: 'about', title: 'The project', overview: input.overview, body: input.about },
      {
        type: 'scope',
        title: 'Deliverables',
        items: input.deliverables.map((d, i) => ({
          number:     String(i + 1).padStart(2, '0'),
          title:      d.title,
          description: d.description,
          ...(d.sectionIds?.length ? { sectionIds: d.sectionIds } : {}),
        })),
      },
      { type: 'budget', detailLevel: 'SUMMARY' },
      {
        type: 'terms',
        title: 'Payment terms',
        body: '',
        milestones: input.milestones,
      },
    ],
  }
}

// ─── Update proposal status (for Kanban stage changes) ───────────────────────

export async function updateProposalStatus(
  proposalId: string,
  status: string
): Promise<ActionResult> {
  try {
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

      if (status === 'APPROVED' && projectStatus === 'LEAD') {
        // Won proposal → promote project Lead → Active
        await sdb.project.update({
          where: { id: proposal.projectId },
          data:  { status: 'ACTIVE' },
        })
      }

      // ── Won proposal → reconcile Teams page ───────────────────────────────
      // Fire-and-forget: delete unassigned placeholders not in the new proposal,
      // flag assigned members whose role disappeared, add missing placeholders.
      if (status === 'APPROVED') {
        reconcileTeamFromWonProposal(proposal.projectId, proposalId, sdb).catch(() => {})
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

// ─── Won proposal → Teams page reconciliation ────────────────────────────────
// Called fire-and-forget from updateProposalStatus when status → APPROVED.
//
// Rules:
//  • Unassigned placeholder whose role is NOT in the new proposal  → delete
//  • Assigned member whose role IS in the new proposal             → clear mismatchFlag
//  • Assigned member whose role is NOT in the new proposal         → set mismatchFlag (red card)
//  • Role in new proposal with fewer slots than needed             → add unassigned placeholders

async function reconcileTeamFromWonProposal(
  projectId: string,
  proposalId: string,
  sdb: Awaited<ReturnType<typeof getScopedDb>>,
) {
  // Fetch the proposal's budgetId
  const proposal = await sdb.proposal.findFirst({
    where: { id: proposalId },
    select: { budgetId: true },
  })
  if (!proposal?.budgetId) return

  // Get primary phase
  const phase =
    (await sdb.phase.findFirst({ where: { budgetId: proposal.budgetId as string, isPrimary: true }, select: { id: true } })) ??
    (await sdb.phase.findFirst({ where: { budgetId: proposal.budgetId as string }, orderBy: { order: 'asc' }, select: { id: true } }))
  if (!phase) return

  // Get CREW line items — same filter as importCrewFromBudget
  const crewWhere = {
    OR: [
      { lineItemCategory: 'CREW' },
      { lineItemCategory: null, rateCard: { category: { in: ['CREW', 'TALENT'] } } },
    ],
  } as import('@prisma/client').Prisma.LineItemWhereInput

  const accounts = await sdb.account.findMany({
    where:   { phaseId: phase.id, parentId: null },
    orderBy: { order: 'asc' },
    select:  {
      name:      true,
      lineItems: {
        where:   crewWhere,
        orderBy: { order: 'asc' },
        select:  { description: true, quantity: true, quantityFormula: true, rateCents: true, unit: true },
      },
      children: {
        orderBy: { order: 'asc' },
        select:  {
          name:      true,
          lineItems: {
            where:   crewWhere,
            orderBy: { order: 'asc' },
            select:  { description: true, quantity: true, quantityFormula: true, rateCents: true, unit: true },
          },
        },
      },
    },
  })

  function headcountOf(qty: unknown, formula: string | null): number {
    const match = formula?.match(/^(\d+(?:\.\d+)?)[x×]/)
    if (match) return Math.max(1, Math.round(Number(match[1])))
    return Math.max(1, Math.round(Number(qty)))
  }

  // Build: role → { dept, count, rateCents, unit }
  const proposalRoles = new Map<string, { dept: string; count: number; rateCents: number | null; unit: string }>()
  for (const acc of accounts) {
    const allItems = [
      ...acc.lineItems.map(i => ({ dept: acc.name, item: i })),
      ...acc.children.flatMap(c => c.lineItems.map(i => ({ dept: c.name, item: i }))),
    ]
    for (const { dept, item } of allItems) {
      const hc  = headcountOf(item.quantity, item.quantityFormula)
      const key = item.description
      const cur = proposalRoles.get(key)
      if (cur) cur.count += hc
      else proposalRoles.set(key, { dept, count: hc, rateCents: item.rateCents, unit: item.unit })
    }
  }

  const proposalRoleNames = new Set(proposalRoles.keys())

  // Load current team
  const currentMembers = await sdb.projectMember.findMany({
    where:  { projectId },
    select: { id: true, name: true, role: true, department: true, order: true },
  })

  const isAssigned = (m: { name: string }) => m.name !== 'Unassigned'

  const toDelete:       string[] = []
  const toMismatch:     string[] = []
  const toClearMismatch: string[] = []

  for (const m of currentMembers) {
    if (proposalRoleNames.has(m.role)) {
      toClearMismatch.push(m.id)
    } else if (isAssigned(m)) {
      toMismatch.push(m.id)
    } else {
      toDelete.push(m.id)
    }
  }

  // Execute changes
  if (toDelete.length > 0)       await sdb.projectMember.deleteMany({ where: { id: { in: toDelete } } })
  if (toMismatch.length > 0)     await sdb.projectMember.updateMany({ where: { id: { in: toMismatch } }, data: { mismatchFlag: true } })
  if (toClearMismatch.length > 0) await sdb.projectMember.updateMany({ where: { id: { in: toClearMismatch } }, data: { mismatchFlag: false } })

  // Add placeholders for roles that need more slots than currently exist
  const remaining = currentMembers.filter(m => !toDelete.includes(m.id))
  const currentRoleCount = new Map<string, number>()
  for (const m of remaining) currentRoleCount.set(m.role, (currentRoleCount.get(m.role) ?? 0) + 1)

  let maxOrder = Math.max(-1, ...currentMembers.map(m => m.order))
  const toCreate: Parameters<typeof sdb.projectMember.createMany>[0]['data'] = []

  for (const [role, { dept, count, rateCents, unit }] of proposalRoles.entries()) {
    const existing  = currentRoleCount.get(role) ?? 0
    const needed    = Math.max(0, count - existing)
    for (let i = 0; i < needed; i++) {
      toCreate.push({
        projectId,
        contactId:    null,
        name:         'Unassigned',
        role,
        department:   dept,
        email:        null,
        phone:        null,
        rateCents:    rateCents,
        rateUnit:     unit as import('@prisma/client').RateUnit,
        callTime:     null,
        mismatchFlag: false,
        order:        ++maxOrder,
      })
    }
  }

  if (toCreate.length > 0) await sdb.projectMember.createMany({ data: toCreate })

  revalidatePath(`/projects/${projectId}/team`)
}

// ─── Update brand overrides ───────────────────────────────────────────────────

export async function updateProposalBranding(
  proposalId: string,
  brandOverrides: Record<string, unknown>
): Promise<ActionResult> {
  try {
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
