'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser } from '@/lib/auth'
import { sumAccount, type AccountInput } from '@/lib/totals'
import type { ActionResult, ProposalDiscount } from '@/types'

function uid() { return crypto.randomUUID().slice(0, 8) }

// ─── Capture a frozen snapshot of budget line items ───────────────────────────
// Internal helper — always called from exported functions that have already
// validated workspace ownership via getScopedDb(). Uses raw db intentionally.

async function captureBudgetSnapshot(budgetId: string, discount?: ProposalDiscount) {
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

  return { accounts, productionCents, budgetMarkupPct, budgetTaxPct, discountCents, discountLabel, totalCents }
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
            { id: uid(), name: 'Deposit — on signing', percentPct: 50, trigger: 'on_signing' },
            { id: uid(), name: 'Final — on delivery', percentPct: 50, trigger: 'on_delivery' },
          ],
        },
      ],
    }

    const proposal = await sdb.proposal.create({
      data: {
        projectId,
        budgetId,
        title,
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
    const sdb = await getScopedDb()
    const existing = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { budgetId: true, content: true },
    })
    if (!existing) return { success: false, error: 'Proposal not found' }
    const discount = (existing.content as { discount?: ProposalDiscount }).discount
    const snapshot = await captureBudgetSnapshot(existing.budgetId as string, discount)
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
    const snapshot = await captureBudgetSnapshot(input.budgetId, input.discount)

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
    const primaryPhase = await db.phase.findFirst({
      where: { budgetId: existing.budgetId as string, isPrimary: true },
      select: { description: true, deliverables: true },
    }) ?? await db.phase.findFirst({
      where: { budgetId: existing.budgetId as string },
      orderBy: { order: 'asc' },
      select: { description: true, deliverables: true },
    })
    const phaseAbout = primaryPhase?.description ?? ''
    const phaseDeliverables = (primaryPhase?.deliverables as { title: string; description: string }[] | null) ?? []
    const content = buildContent({ ...input, about: phaseAbout, deliverables: phaseDeliverables })
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
    const snapshot = await captureBudgetSnapshot(existing.budgetId as string, discount2)
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
  about: string
  deliverables: { title: string; description: string }[]
  milestones: { id: string; name: string; percentPct: number; trigger: string; customDate?: string }[]
  totalCents: number
  discount?: ProposalDiscount
}) {
  return {
    totalCents: input.totalCents,
    ...(input.discount ? { discount: input.discount } : {}),
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
    const sdb = await getScopedDb()
    const proposal = await sdb.proposal.findFirst({
      where: { id: proposalId },
      select: { projectId: true },
    })
    await sdb.proposal.update({
      where: { id: proposalId },
      data:  { status: status as Parameters<typeof sdb.proposal.update>[0]['data']['status'] },
    })
    revalidatePath('/proposals')
    if (proposal) revalidatePath(`/projects/${proposal.projectId}`)
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
