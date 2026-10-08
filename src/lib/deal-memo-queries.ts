// Read-side loaders for the deal memo pages. Take a scoped client so every
// query stays in-tenant; plain module, not 'use server'.

import type { Prisma } from '@prisma/client'
import type { ScopedDb } from '@/lib/db-scoped'
import { CREW_LINE_WHERE, lineHeadcountAndDays, memoExpectedCents } from '@/lib/deal-memo-core'

/**
 * The budget + phase deal memos are written against. Must match the Actuals
 * page exactly (first budget by createdAt, its primary phase else first
 * phase), so memo → actuals mapping always targets lines the actuals sheet has.
 */
export async function resolveTrackedPhase(sdb: ScopedDb, projectId: string) {
  const budget = await sdb.budget.findFirst({
    where:   { projectId },
    orderBy: { createdAt: 'asc' },
    select:  { id: true, phases: { orderBy: { order: 'asc' }, select: { id: true, name: true, isPrimary: true } } },
  })
  const phase = budget ? (budget.phases.find(p => p.isPrimary) ?? budget.phases[0] ?? null) : null
  return { budgetId: budget?.id ?? null, phaseId: phase?.id ?? null, phaseName: phase?.name ?? null }
}

/** Every line in the tracked phase, with its account name — for the actuals-mapping picker. */
export async function loadPhaseLines(sdb: ScopedDb, phaseId: string) {
  const lines = await sdb.lineItem.findMany({
    where:   { account: { phaseId } },
    orderBy: [{ account: { order: 'asc' } }, { order: 'asc' }],
    select:  {
      id: true, description: true, rateCents: true, unit: true, quantity: true, quantityFormula: true,
      contactId: true, lineItemCategory: true,
      account: { select: { name: true } },
    },
  })
  return lines.map(l => ({
    id:          l.id,
    description: l.description,
    accountName: l.account.name,
    rateCents:   l.rateCents,
    unit:        l.unit,
    quantity:    Number(l.quantity),
    quantityFormula: l.quantityFormula,
    contactId:   l.contactId,
    category:    l.lineItemCategory,
  }))
}

export type PhaseLine = Awaited<ReturnType<typeof loadPhaseLines>>[number]

const MEMO_LIST_SELECT = {
  id: true, lineItemId: true, roleLabel: true, position: true, status: true, awardedAt: true,
  days: true, contactId: true, projectMemberId: true, updatedAt: true,
  sentAt: true, firstViewedAt: true, signedAt: true, sentSnapshot: true,
  contact: { select: { id: true, name: true, primaryRole: true } },
  fees:    { orderBy: { order: 'asc' as const }, select: { kind: true, rateCents: true, unit: true, quantity: true } },
}

export async function loadDealMemoBoard(sdb: ScopedDb, projectId: string) {
  const tracked = await resolveTrackedPhase(sdb, projectId)

  const [crewLines, memos] = await Promise.all([
    tracked.phaseId
      ? sdb.lineItem.findMany({
          where:   { account: { phaseId: tracked.phaseId }, ...CREW_LINE_WHERE },
          orderBy: [{ account: { order: 'asc' } }, { order: 'asc' }],
          select:  {
            id: true, description: true, rateCents: true, unit: true, quantity: true, quantityFormula: true,
            account: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    sdb.dealMemo.findMany({
      where:   { projectId },
      orderBy: { createdAt: 'asc' },
      select:  MEMO_LIST_SELECT,
    }),
  ])

  // A signed memo costs what the vendor signed (the frozen snapshot), not the working rows.
  const signedExpectedCents = (m: { signedAt: Date | null; sentSnapshot: Prisma.JsonValue | null }): number | null => {
    if (!m.signedAt || !m.sentSnapshot || typeof m.sentSnapshot !== 'object') return null
    const v = (m.sentSnapshot as { expectedTotalCents?: unknown }).expectedTotalCents
    return typeof v === 'number' ? v : null
  }

  const serialiseMemo = (m: (typeof memos)[number]) => {
    const dayRate = m.fees.find(f => f.kind === 'DAY_RATE')
    return {
      id:            m.id,
      lineItemId:    m.lineItemId,
      roleLabel:     m.roleLabel,
      position:      m.position,
      status:        m.status,
      contactName:   m.contact?.name ?? 'No contact',
      contactId:     m.contactId,
      dayRateCents:  dayRate?.rateCents ?? 0,
      dayRateUnit:   dayRate?.unit ?? 'DAY',
      expectedCents: signedExpectedCents(m) ?? memoExpectedCents(m.fees),
      sentAt:        m.sentAt?.toISOString() ?? null,
      firstViewedAt: m.firstViewedAt?.toISOString() ?? null,
      signedAt:      m.signedAt?.toISOString() ?? null,
    }
  }

  const lineIds = new Set(crewLines.map(l => l.id))
  const roles = crewLines.map(l => {
    const { headcount, days } = lineHeadcountAndDays(l)
    return {
      lineItemId:   l.id,
      description:  l.description,
      accountName:  l.account.name,
      rateCents:    l.rateCents,
      unit:         l.unit,
      headcount,
      days,
      budgetCents:  Math.round(Number(l.quantity) * l.rateCents),
      memos:        memos.filter(m => m.lineItemId === l.id).map(serialiseMemo),
    }
  })

  // Memos whose line is gone, isn't crew, or never had one.
  const unbudgeted = memos.filter(m => !m.lineItemId || !lineIds.has(m.lineItemId)).map(serialiseMemo)

  return { ...tracked, roles, unbudgeted }
}

export type DealMemoBoard = Awaited<ReturnType<typeof loadDealMemoBoard>>

export async function loadDealMemoEditor(sdb: ScopedDb, projectId: string, memoId: string) {
  const memo = await sdb.dealMemo.findFirst({
    where:   { id: memoId, projectId },
    include: {
      contact:  { select: { id: true, name: true, primaryRole: true, email: true } },
      fees:     { orderBy: { order: 'asc' } },
      sections: { orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] },
    },
  })
  if (!memo) return null

  const tracked = await resolveTrackedPhase(sdb, projectId)
  const [lines, library] = await Promise.all([
    tracked.phaseId ? loadPhaseLines(sdb, tracked.phaseId) : Promise.resolve([] as PhaseLine[]),
    sdb.contractBlock.findMany({
      where:   { audience: 'VENDOR', isActive: true },
      orderBy: [{ orderIndex: 'asc' }, { title: 'asc' }],
      select:  { id: true, title: true, internalName: true, isDefault: true, category: true },
    }),
  ])

  // Category + library name of each section's source block (inactive blocks
  // included) — review colours and the "from SOW – Talent" label.
  const sourceIds = [...new Set(memo.sections.map(s => s.sourceBlockId).filter((id): id is string => !!id))]
  const sourceBlocks = sourceIds.length
    ? await sdb.contractBlock.findMany({ where: { id: { in: sourceIds } }, select: { id: true, category: true, internalName: true } })
    : []
  const sectionCategories = new Map(sourceBlocks.map(b => [b.id, b.category]))
  const sectionSourceNames = new Map(sourceBlocks.map(b => [b.id, b.internalName?.trim() || null]))

  return { memo, lines, library, tracked, sectionCategories, sectionSourceNames }
}
