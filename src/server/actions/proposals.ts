'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser } from '@/lib/auth'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { ActionResult } from '@/types'

function uid() { return crypto.randomUUID().slice(0, 8) }

// ─── Capture a frozen snapshot of budget line items ───────────────────────────
// Stored in content.budgetSnapshot so the public page never reads live budget data.

async function captureBudgetSnapshot(budgetId: string) {
  // Fetch budget-level markup / tax rates alongside the primary phase
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    select: { markupPct: true, taxPct: true },
  })
  const budgetMarkupPct = budget?.markupPct != null ? Number(budget.markupPct) : 0
  const budgetTaxPct    = budget?.taxPct    != null ? Number(budget.taxPct)    : 0

  const phaseInclude = {
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

  const primaryPhase =
    await db.phase.findFirst({ where: { budgetId, isPrimary: true }, include: phaseInclude }) ??
    await db.phase.findFirst({ where: { budgetId }, orderBy: { order: 'asc' }, include: phaseInclude })

  const accounts = (primaryPhase?.accounts ?? []).map(acc => ({
    id:       acc.id,
    name:     acc.name,
    code:     acc.code,
    order:    acc.order,
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

  // Production subtotal (per-line base + per-line markups)
  const productionCents = accounts.reduce(
    (sum, acc) => sum + sumAccount(acc as unknown as AccountInput),
    0
  )

  // Apply budget-level agency fee and tax → gross total
  const agencyFeeCents = Math.round(productionCents * budgetMarkupPct)
  const preTax         = productionCents + agencyFeeCents
  const taxCents       = Math.round(preTax * budgetTaxPct)
  const totalCents     = preTax + taxCents

  return { accounts, productionCents, budgetMarkupPct, budgetTaxPct, totalCents }
}

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
            { id: uid(), name: 'Deposit — on signing', percentPct: 50, trigger: 'on_signing' },
            { id: uid(), name: 'Final — on delivery', percentPct: 50, trigger: 'on_delivery' },
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
    const existing = await db.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: { budgetId: true, content: true },
    })
    const snapshot = await captureBudgetSnapshot(existing.budgetId)
    const mergedContent = { ...(existing.content as object), budgetSnapshot: snapshot }

    const proposal = await db.proposal.update({
      where: { id: proposalId },
      data: { status: 'SENT', sentAt: new Date(), content: mergedContent as object },
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

// ─── Create + populate + send in one call (from NewProposalModal) ─────────────

export async function createSentProposal(input: {
  projectId: string
  budgetId: string
  title: string
  depositPct: number      // 0-100, remainder becomes final payment
  expiresAt: string       // ISO date string
  totalCents: number      // pre-computed from budget; stored for approval snapshot
}): Promise<ActionResult<{ id: string; publicToken: string; publicUrl: string }>> {
  try {
    const user = await getCurrentUser()

    // Read description + deliverables from the primary phase
    const primaryPhase = await db.phase.findFirst({
      where: { budgetId: input.budgetId, isPrimary: true },
      select: { description: true, deliverables: true },
    }) ?? await db.phase.findFirst({
      where: { budgetId: input.budgetId },
      orderBy: { order: 'asc' },
      select: { description: true, deliverables: true },
    })

    const phaseAbout = primaryPhase?.description ?? ''
    const phaseDeliverables = (primaryPhase?.deliverables as { title: string; description: string }[] | null) ?? []

    const content = buildContent({ ...input, about: phaseAbout, deliverables: phaseDeliverables })
    const snapshot = await captureBudgetSnapshot(input.budgetId)

    // Auto-increment version so each new send is v1, v2, v3 …
    const maxVersion = await db.proposal.aggregate({
      where: { projectId: input.projectId },
      _max: { version: true },
    })
    const nextVersion = (maxVersion._max.version ?? 0) + 1

    const proposal = await db.proposal.create({
      data: {
        workspaceId: user.workspaceId,
        projectId: input.projectId,
        budgetId: input.budgetId,
        title: input.title,
        content: { ...content, budgetSnapshot: snapshot } as object,
        status: 'SENT',
        sentAt: new Date(),
        expiresAt: new Date(input.expiresAt),
        version: nextVersion,
        createdById: user.id,
      },
    })

    revalidatePath(`/projects/${input.projectId}`)
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/p/${proposal.publicToken}`
    return { success: true, data: { id: proposal.id, publicToken: proposal.publicToken, publicUrl } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create proposal' }
  }
}

// ─── Create a DRAFT proposal (same as createSentProposal but stays DRAFT) ────

export async function createDraftProposal(input: {
  projectId: string
  budgetId: string
  title: string
  depositPct: number
  expiresAt: string
  totalCents: number
}): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const user = await getCurrentUser()

    const primaryPhase = await db.phase.findFirst({
      where: { budgetId: input.budgetId, isPrimary: true },
      select: { description: true, deliverables: true },
    }) ?? await db.phase.findFirst({
      where: { budgetId: input.budgetId },
      orderBy: { order: 'asc' },
      select: { description: true, deliverables: true },
    })

    const phaseAbout = primaryPhase?.description ?? ''
    const phaseDeliverables = (primaryPhase?.deliverables as { title: string; description: string }[] | null) ?? []

    const content = buildContent({ ...input, about: phaseAbout, deliverables: phaseDeliverables })

    // Auto-increment version so each new proposal is v1, v2, v3 …
    const maxVersion = await db.proposal.aggregate({
      where: { projectId: input.projectId },
      _max: { version: true },
    })
    const nextVersion = (maxVersion._max.version ?? 0) + 1

    const proposal = await db.proposal.create({
      data: {
        workspaceId: user.workspaceId,
        projectId: input.projectId,
        budgetId: input.budgetId,
        title: input.title,
        content: content as object,
        status: 'DRAFT',
        expiresAt: new Date(input.expiresAt),
        version: nextVersion,
        createdById: user.id,
      },
    })
    revalidatePath(`/projects/${input.projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: proposal.publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to save draft' }
  }
}

// ─── Update an existing DRAFT proposal in-place ───────────────────────────────

export async function updateDraftProposal(
  proposalId: string,
  input: {
    title: string
    depositPct: number
    expiresAt: string
    totalCents: number
  }
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    await getWorkspaceId()
    const existing = await db.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: { budgetId: true },
    })
    const primaryPhase = await db.phase.findFirst({
      where: { budgetId: existing.budgetId, isPrimary: true },
      select: { description: true, deliverables: true },
    }) ?? await db.phase.findFirst({
      where: { budgetId: existing.budgetId },
      orderBy: { order: 'asc' },
      select: { description: true, deliverables: true },
    })
    const phaseAbout = primaryPhase?.description ?? ''
    const phaseDeliverables = (primaryPhase?.deliverables as { title: string; description: string }[] | null) ?? []
    const content = buildContent({ ...input, about: phaseAbout, deliverables: phaseDeliverables })
    const proposal = await db.proposal.update({
      where: { id: proposalId },
      data: {
        title: input.title,
        content: content as object,
        expiresAt: new Date(input.expiresAt),
        updatedAt: new Date(),
      },
    })
    revalidatePath(`/projects/${proposal.projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: proposal.publicToken } }
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
    await getWorkspaceId()
    // Fetch current content so we can merge the snapshot in
    const existing = await db.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: { budgetId: true, projectId: true, content: true },
    })
    const snapshot = await captureBudgetSnapshot(existing.budgetId)
    const mergedContent = { ...(existing.content as object), budgetSnapshot: snapshot }

    const proposal = await db.proposal.update({
      where: { id: proposalId },
      data: { status: 'SENT', sentAt: new Date(), content: mergedContent as object },
    })
    revalidatePath(`/projects/${proposal.projectId}`)
    return { success: true, data: { publicToken: proposal.publicToken } }
  } catch {
    return { success: false, error: 'Failed to send proposal' }
  }
}

// ─── Create a new version (revision) from an existing proposal ────────────────

export async function createProposalRevision(
  proposalId: string
): Promise<ActionResult<{ id: string; publicToken: string }>> {
  try {
    const user = await getCurrentUser()
    const source = await db.proposal.findUniqueOrThrow({
      where: { id: proposalId },
    })
    // Find the highest version for this project
    const maxVersion = await db.proposal.aggregate({
      where: { projectId: source.projectId },
      _max: { version: true },
    })
    const nextVersion = (maxVersion._max.version ?? 1) + 1
    const proposal = await db.proposal.create({
      data: {
        workspaceId: source.workspaceId,
        projectId:   source.projectId,
        budgetId:    source.budgetId,
        title:       source.title,
        content:     source.content as object,
        status:      'DRAFT',
        version:     nextVersion,
        expiresAt:   source.expiresAt,
        createdById: user.id,
      },
    })
    revalidatePath(`/projects/${source.projectId}`)
    return { success: true, data: { id: proposal.id, publicToken: proposal.publicToken } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create revision' }
  }
}

// ─── Shared content builder ───────────────────────────────────────────────────

function buildContent(input: {
  about: string
  deliverables: { title: string; description: string }[]
  depositPct: number
  totalCents: number
}) {
  return {
    totalCents: input.totalCents,
    sections: [
      { type: 'about', title: 'The project', body: input.about },
      {
        type: 'scope',
        title: 'Deliverables',
        items: input.deliverables.map((d, i) => ({
          number: String(i + 1).padStart(2, '0'),
          title: d.title,
          description: d.description,
        })),
      },
      { type: 'budget', detailLevel: 'SUMMARY' },
      {
        type: 'terms',
        title: 'Payment terms',
        body: '',
        milestones: [
          { id: uid(), name: 'Deposit — on signing',  percentPct: input.depositPct,             trigger: 'on_signing' },
          { id: uid(), name: 'Final — on delivery',   percentPct: 100 - input.depositPct,       trigger: 'on_delivery' },
        ],
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
    await getWorkspaceId()
    await db.proposal.update({
      where: { id: proposalId },
      data:  { status: status as Parameters<typeof db.proposal.update>[0]['data']['status'] },
    })
    revalidatePath('/proposals')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update status' }
  }
}

// ─── Delete a proposal ───────────────────────────────────────────────────────

export async function deleteProposal(proposalId: string): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    const proposal = await db.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: { projectId: true },
    })
    await db.proposal.delete({ where: { id: proposalId } })
    revalidatePath(`/projects/${proposal.projectId}`)
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
