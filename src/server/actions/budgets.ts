'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId, requireRole } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma, type RateUnit, type RateCategory, type ProposalStatus } from '@prisma/client'
import { calcBudgetTotals, type AccountInput, type BudgetDiscountConfig } from '@/lib/totals'
import { logAuditEvent } from '@/lib/audit'

// ─── Section helper ───────────────────────────────────────────────────────────

async function getOrCreateDefaultSection(phaseId: string, workspaceId: string): Promise<string> {
  const existing = await db.budgetSection.findFirst({
    where:   { phaseId },
    select:  { id: true },
    orderBy: { orderIndex: 'asc' },
  })
  if (existing) return existing.id
  const created = await db.budgetSection.create({
    data:   { phaseId, workspaceId, title: 'Main', orderIndex: 0 },
    select: { id: true },
  })
  return created.id
}

// ─── Category mapping ─────────────────────────────────────────────────────────

type LineItemCategory = 'CREW' | 'LOCATION' | 'EQUIPMENT' | 'SERVICE' | 'DELIVERABLE'

function mapRateCategory(rc: RateCategory): LineItemCategory {
  switch (rc) {
    case 'CREW':            return 'CREW'
    case 'TALENT':          return 'CREW'
    case 'EQUIPMENT':       return 'EQUIPMENT'
    case 'LOCATION':        return 'LOCATION'
    case 'POST':            return 'DELIVERABLE'
    case 'TRAVEL':          return 'SERVICE'
    case 'CATERING':        return 'SERVICE'
    case 'INSURANCE':       return 'SERVICE'
    case 'PRODUCTION_FEE':  return 'SERVICE'
    case 'MISC':            return 'SERVICE'
  }
}

// ─── Create budget ────────────────────────────────────────────────────────────

export async function createBudget(projectId: string, templateId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const [sdb, user, workspaceId] = await Promise.all([getScopedDb(), getCurrentUser(), getWorkspaceId()])

    // Ownership check: scoped client ensures this project belongs to the active workspace.
    const project = await sdb.project.findFirst({ where: { id: projectId } })
    if (!project) return { success: false, error: 'Project not found' }

    const budget = await sdb.budget.create({
      data: {
        projectId,
        name: 'Main Budget',
        createdById: user.id,
        phases: { create: { name: 'v1 Estimate', order: 0, isPrimary: true, workspaceId } },
      } as unknown as Parameters<typeof sdb.budget.create>[0]['data'],
    })

    // Every new phase needs a default "Main" section immediately.
    const newPhase = await db.phase.findFirst({ where: { budgetId: budget.id }, select: { id: true } })
    if (newPhase) {
      await db.budgetSection.create({
        data: { phaseId: newPhase.id, workspaceId, title: 'Main', orderIndex: 0 },
      })
    }

    if (templateId) {
      const template = await sdb.budgetTemplate.findFirst({ where: { id: templateId } })
      if (template) {
        await materialiseTemplate(budget.id, template.structure as TemplateStructure, workspaceId)
      }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: { id: budget.id } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create budget' }
  }
}

// =============================================================
// CLONE FROM EXISTING BUDGET
// =============================================================

// ─── Shared tree-reconstruction helper ─────────────────────────────────────
// Accounts are fetched flat (depth-agnostic — no fixed-depth `include`, which
// is what left duplicatePhase's fetch capped at 2 levels) and rebuilt into a
// nested tree here, keyed by parentId. Reused by listCloneableBudgets (for
// calcBudgetTotals), getBudgetClonePreview (for the section/depth summary),
// and cloneBudget (for the actual copy).

interface FlatCloneAccount {
  id:         string
  phaseId:    string
  sectionId:  string
  parentId:   string | null
  name:       string
  order:      number
  lineItems: {
    description: string
    rateCardId:  string | null
    quantity:    Prisma.Decimal
    rateCents:   number
    markupPct:   Prisma.Decimal | null
  }[]
}

type WithChildren<T> = T & { children: WithChildren<T>[] }
type AccountTreeNode = WithChildren<FlatCloneAccount>

/**
 * Roots (parentId null) first, each with `.children` nested — siblings
 * sorted by `order`. Generic so cloneBudget can reuse it with the richer
 * field set it needs (code, notes, full line item shape) rather than just
 * the totals-only FlatCloneAccount shape used by the list/preview actions.
 */
function buildAccountTree<T extends { id: string; parentId: string | null; order: number }>(
  flat: T[]
): WithChildren<T>[] {
  const byId = new Map<string, WithChildren<T>>(flat.map(a => [a.id, { ...a, children: [] }]))
  const roots: WithChildren<T>[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const byOrder = (a: WithChildren<T>, b: WithChildren<T>) => a.order - b.order
  for (const node of byId.values()) node.children.sort(byOrder)
  roots.sort(byOrder)
  return roots
}

function toAccountInput(nodes: AccountTreeNode[]): AccountInput[] {
  return nodes.map(n => ({
    lineItems: n.lineItems.map(li => ({
      quantity:  li.quantity,
      rateCents: li.rateCents,
      markupPct: li.markupPct,
    })),
    children: toAccountInput(n.children),
  }))
}

function budgetDiscountConfig(b: {
  discountType: string | null
  discountLabel: string | null
  discountValueCents: number | null
  discountValuePct: Prisma.Decimal | null
}): BudgetDiscountConfig | null {
  if (!b.discountType) return null
  return {
    type:       b.discountType as 'flat' | 'pct',
    label:      b.discountLabel,
    valueCents: b.discountValueCents,
    valuePct:   b.discountValuePct != null ? Number(b.discountValuePct) : null,
  }
}

/** Primary phase if set, else the most recently ordered one. */
function pickRepresentativePhase<T extends { id: string; isPrimary: boolean; order: number }>(
  phases: T[]
): T | undefined {
  return phases.find(p => p.isPrimary) ?? [...phases].sort((a, b) => b.order - a.order)[0]
}

// ─── List cloneable budgets (picker source list) ───────────────────────────

export type CloneableBudget = {
  budgetId:        string
  budgetName:      string
  projectId:       string
  projectName:     string
  projectType:     string | null
  clientName:      string
  createdAt:       Date
  proposalStatus:  ProposalStatus | null
  grandTotalCents: number
  lineItemCount:   number
  sectionCount:    number
  phaseCount:      number
}

export async function listCloneableBudgets(): Promise<ActionResult<CloneableBudget[]>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()

    const budgets = await sdb.budget.findMany({
      select: {
        id: true, name: true, createdAt: true,
        markupPct: true, taxPct: true,
        discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
        project: {
          select: {
            id: true, name: true, shootType: true,
            client: { select: { name: true } },
          },
        },
        proposals: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        phases: { select: { id: true, isPrimary: true, order: true } },
        _count: { select: { phases: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (budgets.length === 0) return { success: true, data: [] }

    // Representative phase per budget (primary, else most recent) — totals and
    // structure counts are computed from this one phase, not every version.
    const phaseIdByBudget = new Map<string, string>()
    for (const b of budgets) {
      const chosen = pickRepresentativePhase(b.phases)
      if (chosen) phaseIdByBudget.set(b.id, chosen.id)
    }
    const phaseIds = [...phaseIdByBudget.values()]

    // Two flat queries across every chosen phase at once — avoids N+1 and
    // avoids a fixed-depth `include` (accounts nest arbitrarily deep).
    const [sections, accounts] = await Promise.all([
      sdb.budgetSection.findMany({ where: { phaseId: { in: phaseIds } }, select: { phaseId: true } }),
      sdb.account.findMany({
        where: { phaseId: { in: phaseIds } },
        select: {
          id: true, phaseId: true, sectionId: true, parentId: true, name: true, order: true,
          lineItems: { select: { description: true, rateCardId: true, quantity: true, rateCents: true, markupPct: true } },
        },
      }),
    ])

    const sectionCountByPhase = new Map<string, number>()
    for (const s of sections) sectionCountByPhase.set(s.phaseId, (sectionCountByPhase.get(s.phaseId) ?? 0) + 1)

    const accountsByPhase = new Map<string, FlatCloneAccount[]>()
    for (const a of accounts) {
      const list = accountsByPhase.get(a.phaseId) ?? []
      list.push(a as FlatCloneAccount)
      accountsByPhase.set(a.phaseId, list)
    }

    return {
      success: true,
      data: budgets.map(b => {
        const phaseId = phaseIdByBudget.get(b.id)
        const flat = phaseId ? (accountsByPhase.get(phaseId) ?? []) : []
        const tree = toAccountInput(buildAccountTree(flat))
        const totals = calcBudgetTotals(
          tree,
          Number(b.markupPct ?? 0),
          Number(b.taxPct ?? 0),
          budgetDiscountConfig(b),
        )
        return {
          budgetId:        b.id,
          budgetName:      b.name,
          projectId:       b.project.id,
          projectName:     b.project.name,
          projectType:     b.project.shootType ?? null,
          clientName:      b.project.client.name,
          createdAt:       b.createdAt,
          proposalStatus:  b.proposals[0]?.status ?? null,
          grandTotalCents: totals.grandTotalCents,
          lineItemCount:   flat.reduce((sum, a) => sum + a.lineItems.length, 0),
          sectionCount:    phaseId ? (sectionCountByPhase.get(phaseId) ?? 0) : 0,
          phaseCount:      b._count.phases,
        }
      }),
    }
  } catch (err) {
    console.error('[listCloneableBudgets]', err)
    return { success: false, error: 'Failed to load budgets' }
  }
}

// ─── Clone preview (structure + rate diff) ─────────────────────────────────

export type ClonePreview = {
  phaseId:  string
  phaseName: string
  sections: { title: string; accounts: { name: string; depth: number; lineItemCount: number }[] }[]
  totals: { subtotalCents: number; grandTotalCents: number }
  rateChanges: {
    lineItemDescription: string
    rateCardName:        string
    oldRateCents:         number
    newRateCents:         number
  }[]
  /** Rate cards referenced by a line item but since archived — original rate kept, link dropped. */
  orphanedRateCards: string[]
}

export async function getBudgetClonePreview(
  sourceBudgetId: string,
  sourcePhaseId?: string,
): Promise<ActionResult<ClonePreview>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()

    const budget = await sdb.budget.findFirst({
      where: { id: sourceBudgetId },
      select: {
        markupPct: true, taxPct: true,
        discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
        phases: { select: { id: true, name: true, isPrimary: true, order: true } },
      },
    })
    if (!budget) return { success: false, error: 'SOURCE_NOT_FOUND' }

    const phase = sourcePhaseId
      ? budget.phases.find(p => p.id === sourcePhaseId)
      : pickRepresentativePhase(budget.phases)
    if (!phase) return { success: false, error: 'SOURCE_NOT_FOUND' }

    const [sections, accounts] = await Promise.all([
      sdb.budgetSection.findMany({ where: { phaseId: phase.id }, orderBy: { orderIndex: 'asc' }, select: { id: true, title: true } }),
      sdb.account.findMany({
        where: { phaseId: phase.id },
        select: {
          id: true, phaseId: true, sectionId: true, parentId: true, name: true, order: true,
          lineItems: { select: { description: true, rateCardId: true, quantity: true, rateCents: true, markupPct: true } },
        },
      }),
    ])
    const flat = accounts as FlatCloneAccount[]

    const totals = calcBudgetTotals(
      toAccountInput(buildAccountTree(flat)),
      Number(budget.markupPct ?? 0),
      Number(budget.taxPct ?? 0),
      budgetDiscountConfig(budget),
    )

    // Section → depth-annotated account list, in tree (document) order.
    const sectionSummaries = sections.map(section => {
      const sectionTree = buildAccountTree(flat.filter(a => a.sectionId === section.id))
      const rows: { name: string; depth: number; lineItemCount: number }[] = []
      function walk(nodes: AccountTreeNode[], depth: number) {
        for (const n of nodes) {
          rows.push({ name: n.name, depth, lineItemCount: n.lineItems.length })
          walk(n.children, depth + 1)
        }
      }
      walk(sectionTree, 0)
      return { title: section.title, accounts: rows }
    })

    // Rate diff: only for line items whose rate card is still active. An
    // archived rate card is reported as "orphaned" — original rate is kept,
    // never diffed, since there's no live rate to compare against.
    const rateCardIds = [...new Set(flat.flatMap(a => a.lineItems.map(li => li.rateCardId).filter((id): id is string => !!id)))]
    const rateCards = rateCardIds.length
      ? await sdb.rateCard.findMany({ where: { id: { in: rateCardIds } }, select: { id: true, role: true, defaultRateCents: true, archivedAt: true } })
      : []
    const rateCardById = new Map(rateCards.map(rc => [rc.id, rc]))

    const rateChanges: ClonePreview['rateChanges'] = []
    const orphanedRateCards = new Set<string>()
    for (const account of flat) {
      for (const li of account.lineItems) {
        if (!li.rateCardId) continue
        const rc = rateCardById.get(li.rateCardId)
        if (!rc || rc.archivedAt) {
          orphanedRateCards.add(rc?.role ?? 'Unknown rate card')
          continue
        }
        if (rc.defaultRateCents !== li.rateCents) {
          rateChanges.push({
            lineItemDescription: li.description,
            rateCardName:        rc.role,
            oldRateCents:         li.rateCents,
            newRateCents:         rc.defaultRateCents,
          })
        }
      }
    }

    return {
      success: true,
      data: {
        phaseId:   phase.id,
        phaseName: phase.name,
        sections:  sectionSummaries,
        totals:    { subtotalCents: totals.subtotalCents, grandTotalCents: totals.grandTotalCents },
        rateChanges,
        orphanedRateCards: [...orphanedRateCards],
      },
    }
  } catch (err) {
    console.error('[getBudgetClonePreview]', err)
    return { success: false, error: 'Failed to load clone preview' }
  }
}

// ─── Clone budget (the actual copy) ────────────────────────────────────────

export type CloneBudgetInput = {
  sourceBudgetId: string
  sourcePhaseId?: string
  target:
    | { mode: 'NEW_BUDGET'; projectId: string; budgetName: string }
    | { mode: 'NEW_PHASE'; budgetId: string; phaseName: string }
  rateMode: 'REFRESH' | 'PRESERVE'
}

export type CloneBudgetResult = {
  budgetId: string
  phaseId: string
  counts: { sections: number; accounts: number; lineItems: number }
  rateChangeCount: number
}

// Full field set needed to actually recreate a row — richer than
// FlatCloneAccount/its lineItems shape above, which only carries what
// calcBudgetTotals needs for the list/preview actions.
interface CloneSourceAccount {
  id:        string
  sectionId: string
  parentId:  string | null
  name:      string
  code:      string | null
  order:     number
  notes:     string | null
  lineItems: {
    id:               string
    description:      string
    rateCardId:       string | null
    quantity:         Prisma.Decimal
    unit:             RateUnit
    rateCents:        number
    markupPct:        Prisma.Decimal | null
    hasMarkup:         boolean
    taxRate:           Prisma.Decimal | null
    notes:             string | null
    quantityFormula:   string | null
    lineItemCategory:  string | null
    tags:              string[]
    order:              number
  }[]
}

export async function cloneBudget(input: CloneBudgetInput): Promise<ActionResult<CloneBudgetResult>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const [sdb, user, workspaceId] = await Promise.all([getScopedDb(), getCurrentUser(), getWorkspaceId()])

    // ── Step 1: fetch the source through the scoped client — this is what
    // enforces cross-workspace isolation. A sourceBudgetId from another
    // workspace simply doesn't come back here; there is nothing to bypass.
    const sourceBudget = await sdb.budget.findFirst({
      where: { id: input.sourceBudgetId },
      select: {
        markupPct: true, taxPct: true,
        discountType: true, discountLabel: true, discountValueCents: true, discountValuePct: true,
        phases: {
          select: {
            id: true, name: true, isPrimary: true, order: true,
            overview: true, description: true, deliverables: true, pageBreakBetweenAccounts: true,
          },
        },
      },
    })
    if (!sourceBudget) return { success: false, error: 'SOURCE_NOT_FOUND' }

    const sourcePhase = input.sourcePhaseId
      ? sourceBudget.phases.find(p => p.id === input.sourcePhaseId)
      : pickRepresentativePhase(sourceBudget.phases)
    if (!sourcePhase) return { success: false, error: 'SOURCE_NOT_FOUND' }

    const [sections, sourceAccounts] = await Promise.all([
      sdb.budgetSection.findMany({
        where: { phaseId: sourcePhase.id },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, title: true, description: true, orderIndex: true },
      }),
      sdb.account.findMany({
        where: { phaseId: sourcePhase.id },
        select: {
          id: true, sectionId: true, parentId: true, name: true, code: true, order: true, notes: true,
          lineItems: {
            select: {
              id: true, description: true, rateCardId: true,
              quantity: true, unit: true, rateCents: true, markupPct: true, hasMarkup: true, taxRate: true,
              notes: true, quantityFormula: true, lineItemCategory: true, tags: true, order: true,
            },
          },
        },
      }),
    ]) as [
      Array<{ id: string; title: string; description: string | null; orderIndex: number }>,
      CloneSourceAccount[],
    ]

    // ── Step 2: resolve rate-card state BEFORE the transaction (keep it short).
    // Fetched regardless of rateMode — PRESERVE still needs to know which
    // rateCardId refs are archived, so it can drop the (now-dead) link even
    // while keeping the original rate.
    const referencedRateCardIds = [...new Set(
      sourceAccounts.flatMap(a => a.lineItems.map(li => li.rateCardId).filter((id): id is string => !!id))
    )]
    const rateCards = referencedRateCardIds.length
      ? await sdb.rateCard.findMany({
          where: { id: { in: referencedRateCardIds } },
          select: { id: true, defaultRateCents: true, archivedAt: true },
        })
      : []
    const rateCardById = new Map(rateCards.map(rc => [rc.id, rc]))

    // ── Step 3: validate the target through the scoped client too.
    if (input.target.mode === 'NEW_PHASE') {
      const targetBudget = await sdb.budget.findFirst({ where: { id: input.target.budgetId }, select: { id: true } })
      if (!targetBudget) return { success: false, error: 'TARGET_NOT_FOUND' }
    } else {
      const targetProject = await sdb.project.findFirst({ where: { id: input.target.projectId }, select: { id: true } })
      if (!targetProject) return { success: false, error: 'TARGET_NOT_FOUND' }
    }

    const accountTree = buildAccountTree(sourceAccounts)

    // ── Step 4: the transaction. Nothing partial ever persists.
    let rateChangeCount = 0

    const cloneResult = await sdb.$transaction(async (tx) => {
      // 4a — target Budget
      let newBudgetId: string
      if (input.target.mode === 'NEW_BUDGET') {
        const newBudget = await tx.budget.create({
          data: {
            projectId:          input.target.projectId,
            name:               input.target.budgetName,
            createdById:        user.id,
            markupPct:          sourceBudget.markupPct,
            taxPct:             sourceBudget.taxPct,
            discountType:       sourceBudget.discountType,
            discountLabel:      sourceBudget.discountLabel,
            discountValueCents: sourceBudget.discountValueCents,
            discountValuePct:   sourceBudget.discountValuePct,
            clonedFromBudgetId: input.sourceBudgetId,
          } as unknown as Prisma.BudgetUncheckedCreateInput,
        })
        newBudgetId = newBudget.id
      } else {
        newBudgetId = input.target.budgetId
      }

      // 4b — new Phase. Budget-level settings (markup/tax/discount) are NOT
      // duplicated here in NEW_PHASE mode — they live on Budget, shared by
      // every phase in it, and silently overwriting them would change the
      // fee/tax for every other phase already in the target budget. Only
      // structural/content fields copy: pageBreakBetweenAccounts, overview,
      // description, deliverables.
      let phaseOrder = 0
      let isPrimary  = true
      if (input.target.mode === 'NEW_PHASE') {
        const maxOrder = await tx.phase.aggregate({ where: { budgetId: newBudgetId }, _max: { order: true } })
        phaseOrder = (maxOrder._max.order ?? 0) + 1
        isPrimary  = false // never steal primary from an existing budget's phases
      }

      const newPhase = await tx.phase.create({
        data: {
          budgetId:     newBudgetId,
          workspaceId,
          name:         input.target.mode === 'NEW_PHASE' ? input.target.phaseName : 'v1 Estimate',
          order:        phaseOrder,
          isPrimary,
          overview:                 sourcePhase.overview,
          description:              sourcePhase.description,
          deliverables:             sourcePhase.deliverables ?? undefined,
          pageBreakBetweenAccounts: sourcePhase.pageBreakBetweenAccounts,
        },
      })

      // 4c — sections, no nesting
      const sectionIdMap = new Map<string, string>()
      for (const section of sections) {
        const created = await tx.budgetSection.create({
          data: { workspaceId, phaseId: newPhase.id, title: section.title, description: section.description, orderIndex: section.orderIndex },
        })
        sectionIdMap.set(section.id, created.id)
      }

      // 4d — accounts. Must stay sequential: each parent's real new id has to
      // exist before its children are created. Pre-order walk of the tree
      // already fetched depth-agnostically in Step 1 guarantees this.
      const accountIdMap = new Map<string, string>()
      async function cloneAccountLevel(nodes: WithChildren<CloneSourceAccount>[], parentId: string | null) {
        for (const node of nodes) {
          const created = await tx.account.create({
            data: {
              workspaceId,
              phaseId:   newPhase.id,
              sectionId: sectionIdMap.get(node.sectionId)!,
              parentId,
              name:  node.name,
              code:  node.code,
              order: node.order,
              notes: node.notes,
            },
          })
          accountIdMap.set(node.id, created.id)
          if (node.children.length) await cloneAccountLevel(node.children, created.id)
        }
      }
      await cloneAccountLevel(accountTree, null)

      // 4e — line items. No children, no sequential requirement — one batched
      // createMany across every account at once. Rate mode applied per row:
      // REFRESH pulls the live rate card value (when it isn't archived);
      // PRESERVE always keeps the original snapshot. Either way, a reference
      // to an archived rate card is dropped (rateCardId → null) since it's
      // dead going forward — the rate itself is still kept as-is.
      const lineItemRows: Prisma.LineItemUncheckedCreateInput[] = []
      for (const account of sourceAccounts) {
        const newAccountId = accountIdMap.get(account.id)!
        for (const li of account.lineItems) {
          const rc = li.rateCardId ? rateCardById.get(li.rateCardId) : undefined
          const isOrphaned = !!li.rateCardId && (!rc || rc.archivedAt !== null)

          let newRateCents = li.rateCents
          if (input.rateMode === 'REFRESH' && !isOrphaned && rc) {
            newRateCents = rc.defaultRateCents
            if (newRateCents !== li.rateCents) rateChangeCount++
          }

          lineItemRows.push({
            workspaceId,
            accountId:        newAccountId,
            description:      li.description,
            rateCardId:       isOrphaned ? null : li.rateCardId,
            quantity:         li.quantity,
            unit:             li.unit,
            rateCents:        newRateCents,
            markupPct:        li.markupPct,
            hasMarkup:        li.hasMarkup,
            taxRate:          li.taxRate,
            notes:            li.notes,
            quantityFormula:  li.quantityFormula,
            lineItemCategory: li.lineItemCategory as never,
            tags:             li.tags,
            order:            li.order,
            // contactId intentionally NOT copied — crew/vendor assignment is
            // execution-stage state (drives auto-upsert of a ProjectMember on
            // the Teams page); a clone is a planning-stage starting point and
            // shouldn't auto-assign real people to a project they may have
            // nothing to do with yet.
          })
        }
      }
      if (lineItemRows.length) {
        await tx.lineItem.createMany({ data: lineItemRows })
      }

      await logAuditEvent({
        workspaceId,
        actorId:    user.id,
        action:     'budget.cloned',
        entityType: 'Budget',
        entityId:   newBudgetId,
        metadata: {
          sourceBudgetId: input.sourceBudgetId,
          sourcePhaseId:  sourcePhase.id,
          targetBudgetId: newBudgetId,
          targetPhaseId:  newPhase.id,
          mode:           input.target.mode,
          rateMode:       input.rateMode,
          counts: { sections: sections.length, accounts: accountIdMap.size, lineItems: lineItemRows.length },
          rateChangeCount,
        },
      })

      return {
        budgetId: newBudgetId,
        phaseId:  newPhase.id,
        counts:   { sections: sections.length, accounts: accountIdMap.size, lineItems: lineItemRows.length },
        rateChangeCount,
      }
    })

    if (input.target.mode === 'NEW_BUDGET') {
      revalidatePath(`/projects/${input.target.projectId}`)
    } else {
      revalidatePath('/')
    }

    return { success: true, data: cloneResult }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { success: false, error: 'A phase with that name already exists in the target budget — choose a different name.' }
    }
    console.error('[cloneBudget]', err)
    return { success: false, error: 'Failed to clone budget' }
  }
}

// ─── Add account ─────────────────────────────────────────────────────────────

const addAccountSchema = z.object({
  phaseId: z.string(),
  name: z.string().min(1).max(200),
  code: z.string().optional(),
  parentId: z.string().optional(),
  order: z.number().optional(),
})

export async function addAccount(input: z.infer<typeof addAccountSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    const data = addAccountSchema.parse(input)

    // Verify the phase belongs to this workspace before creating a child account.
    const phase = await sdb.phase.findFirst({ where: { id: data.phaseId }, select: { id: true, workspaceId: true } })
    if (!phase) return { success: false, error: 'Phase not found' }

    const sectionId = await getOrCreateDefaultSection(data.phaseId, phase.workspaceId ?? '')
    const account = await sdb.account.create({ data: { ...data, sectionId } as Prisma.AccountUncheckedCreateInput })
    return { success: true, data: { id: account.id } }
  } catch {
    return { success: false, error: 'Failed to add account' }
  }
}

// ─── Upsert line item ─────────────────────────────────────────────────────────

const lineItemSchema = z.object({
  accountId: z.string(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit: z.enum(['HOUR', 'HALF_DAY', 'DAY', 'WEEK', 'FLAT', 'EACH', 'MILE']),
  rateCents: z.number().int().nonnegative(),
  rateCardId: z.string().optional().nullable(),
  markupPct: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  quantityFormula: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  order: z.number().optional(),
  lineItemCategory: z.enum(['CREW', 'LOCATION', 'EQUIPMENT', 'SERVICE', 'DELIVERABLE']).optional().nullable(),
  // Magical Crew Workflow: Rolodex contact fulfilling this line item
  contactId: z.string().optional().nullable(),
})

export async function upsertLineItem(
  id: string | null,
  input: z.infer<typeof lineItemSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    const data = lineItemSchema.parse(input)

    let item
    if (id) {
      // Scoped update — WHERE id = ? AND workspaceId = ? blocks foreign ids.
      const { lineItemCategory: explicitCat, contactId: _cid, ...rest } = data
      item = await sdb.lineItem.update({
        where: { id },
        data: {
          ...rest,
          ...(explicitCat !== undefined ? { lineItemCategory: explicitCat } : {}),
          contactId: data.contactId ?? null,
        } as Parameters<typeof sdb.lineItem.update>[0]['data'],
      })

      // On edit: upsert ProjectMember when a CREW contact is linked (no kit insertion)
      if (data.contactId && (explicitCat === 'CREW' || data.lineItemCategory === 'CREW')) {
        await maybeUpsertCrewMember(sdb, data.accountId, data.contactId, data.description, data.rateCents, data.unit)
      }
    } else {
      // Verify the account belongs to this workspace before creating a child line item.
      const account = await sdb.account.findFirst({ where: { id: data.accountId }, select: { id: true } })
      if (!account) return { success: false, error: 'Account not found' }

      let lineItemCategory: LineItemCategory | undefined = data.lineItemCategory ?? undefined

      if (!lineItemCategory && data.rateCardId) {
        const rc = await sdb.rateCard.findFirst({
          where: { id: data.rateCardId },
          select: { category: true },
        })
        if (rc) lineItemCategory = mapRateCategory(rc.category)
      }

      const { lineItemCategory: _omit, contactId: _cid, ...createData } = data
      item = await sdb.lineItem.create({
        data: {
          ...(createData as Prisma.LineItemUncheckedCreateInput),
          ...(lineItemCategory ? { lineItemCategory } : {}),
          contactId: data.contactId ?? null,
        } as Parameters<typeof sdb.lineItem.create>[0]['data'],
      })

      if (data.rateCardId) {
        // Fire-and-forget usage count — raw db intentional (no user-facing data returned)
        void db.rateCard.update({
          where: { id: data.rateCardId },
          data: { usageCount: { increment: 1 } },
        })
      }

      // Magical Crew Workflow — only on CREATE with an assigned CREW contact.
      // Awaited so the kit line item is in the DB before the client refreshes.
      if (data.contactId && lineItemCategory === 'CREW') {
        await runCrewWorkflow(sdb, {
          accountId:   data.accountId,
          contactId:   data.contactId,
          description: data.description,
          rateCents:   data.rateCents,
          unit:        data.unit,
          quantity:    data.quantity,
          crewItemOrder: typeof item.order === 'number' ? item.order : 0,
        }).catch(err => console.error('[crew-workflow] failed — kit may not have been inserted:', err))
      }
    }
    return { success: true, data: { id: item.id } }
  } catch {
    return { success: false, error: 'Failed to save line item' }
  }
}

// ─── Crew workflow helpers ─────────────────────────────────────────────────────

/**
 * Traverse account → phase → budget → project to get the projectId.
 * Returns null if the account is not found (defensive; scoped check already ran above).
 */
async function getProjectIdFromAccount(
  sdb: Awaited<ReturnType<typeof getScopedDb>>,
  accountId: string
): Promise<string | null> {
  const account = await sdb.account.findFirst({
    where: { id: accountId },
    select: {
      phase: {
        select: {
          budget: {
            select: { projectId: true },
          },
        },
      },
    },
  })
  return account?.phase?.budget?.projectId ?? null
}

/**
 * If the contact isn't already on the project team, add them.
 * Used by both the CREATE and EDIT paths.
 */
async function maybeUpsertCrewMember(
  sdb: Awaited<ReturnType<typeof getScopedDb>>,
  accountId: string,
  contactId: string,
  description: string,
  rateCents: number,
  unit: string,
) {
  const [projectId, contact] = await Promise.all([
    getProjectIdFromAccount(sdb, accountId),
    sdb.contact.findFirst({
      where: { id: contactId },
      select: { id: true, name: true, email: true, phone: true },
    }),
  ])
  if (!projectId || !contact) return

  // Dedup: only add if this contact isn't already on the team
  const existing = await sdb.projectMember.findFirst({
    where: { projectId, contactId: contact.id },
    select: { id: true },
  })
  if (existing) return

  const memberCount = await sdb.projectMember.count({ where: { projectId } })
  await sdb.projectMember.create({
    data: {
      projectId,
      contactId:   contact.id,
      name:        contact.name,
      role:        description,
      email:       contact.email  ?? null,
      phone:       contact.phone  ?? null,
      rateCents:   rateCents,
      rateUnit:    unit as Parameters<typeof sdb.projectMember.create>[0]['data']['rateUnit'],
      mismatchFlag: false,
      order:       memberCount,
    } as Parameters<typeof sdb.projectMember.create>[0]['data'],
  })

  revalidatePath(`/projects/${projectId}/crew`)
}

/**
 * Full Magical Crew Workflow for new line items:
 * 1. Upsert ProjectMember
 * 2. If contact.hasKit → insert a companion EQUIPMENT line item directly below
 */
async function runCrewWorkflow(
  sdb: Awaited<ReturnType<typeof getScopedDb>>,
  opts: {
    accountId:     string
    contactId:     string
    description:   string
    rateCents:     number
    unit:          string
    quantity:      number
    crewItemOrder: number
  }
) {
  const [projectId, contact] = await Promise.all([
    getProjectIdFromAccount(sdb, opts.accountId),
    sdb.contact.findFirst({
      where: { id: opts.contactId },
      select: {
        id:           true,
        name:         true,
        email:        true,
        phone:        true,
        hasKit:       true,
        kitRateCents: true,
        kitName:      true,
      },
    }),
  ])
  if (!projectId || !contact) return

  // Step 1: Upsert ProjectMember
  const existing = await sdb.projectMember.findFirst({
    where: { projectId, contactId: contact.id },
    select: { id: true },
  })
  if (!existing) {
    const memberCount = await sdb.projectMember.count({ where: { projectId } })
    await sdb.projectMember.create({
      data: {
        projectId,
        contactId:   contact.id,
        name:        contact.name,
        role:        opts.description,
        email:       contact.email ?? null,
        phone:       contact.phone ?? null,
        rateCents:   opts.rateCents,
        rateUnit:    opts.unit as Parameters<typeof sdb.projectMember.create>[0]['data']['rateUnit'],
        mismatchFlag: false,
        order:       memberCount,
      } as Parameters<typeof sdb.projectMember.create>[0]['data'],
    })
    revalidatePath(`/projects/${projectId}/crew`)
  }

  // Step 2: Auto-insert kit line item if contact has kit and kitRateCents is set
  if (contact.hasKit && contact.kitRateCents) {
    await sdb.lineItem.create({
      data: {
        accountId:        opts.accountId,
        description:      contact.kitName ?? `${contact.name}'s Kit`,
        quantity:         opts.quantity,
        unit:             opts.unit as Parameters<typeof sdb.lineItem.create>[0]['data']['unit'],
        rateCents:        contact.kitRateCents,
        lineItemCategory: 'EQUIPMENT',
        contactId:        contact.id,
        order:            opts.crewItemOrder + 1,
        tags:             [],
      } as Parameters<typeof sdb.lineItem.create>[0]['data'],
    })
    // Invalidate the budget page so the kit appears without a hard refresh
    if (projectId) revalidatePath(`/projects/${projectId}`)
  }
}

// ─── Delete line item ─────────────────────────────────────────────────────────

export async function deleteLineItem(id: string): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    // Scoped delete — WHERE id = ? AND workspaceId = ?; no-ops silently on foreign ids.
    await sdb.lineItem.delete({ where: { id } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete line item' }
  }
}

// ─── Duplicate line item ──────────────────────────────────────────────────────

export async function duplicateLineItem(lineItemId: string): Promise<ActionResult<{ newLineItemId: string }>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()

    // Scoped read — null if lineItemId belongs to another workspace
    const source = await sdb.lineItem.findFirst({
      where: { id: lineItemId },
      select: {
        accountId: true, workspaceId: true, description: true,
        quantity: true, unit: true, rateCents: true, hasMarkup: true,
        markupPct: true, taxRate: true, notes: true, rateCardId: true,
        lineItemCategory: true, contactId: true, quantityFormula: true,
        order: true,
      },
    })
    if (!source) return { success: false, error: 'Line item not found' }

    const { order: sourceOrder } = source

    const newItem = await db.$transaction(async tx => {
      // Shift all items below the source down by 1
      await tx.lineItem.updateMany({
        where: { accountId: source.accountId, order: { gt: sourceOrder } },
        data: { order: { increment: 1 } },
      })
      // Insert duplicate immediately below the source
      return tx.lineItem.create({
        data: {
          accountId:        source.accountId,
          workspaceId:      source.workspaceId,
          description:      source.description,
          quantity:         source.quantity,
          unit:             source.unit,
          rateCents:        source.rateCents,
          hasMarkup:        source.hasMarkup,
          markupPct:        source.markupPct ?? undefined,
          taxRate:          source.taxRate ?? undefined,
          notes:            source.notes ?? undefined,
          rateCardId:       source.rateCardId ?? undefined,
          lineItemCategory: source.lineItemCategory ?? undefined,
          contactId:        source.contactId ?? undefined,
          quantityFormula:  source.quantityFormula ?? undefined,
          order:            sourceOrder + 1,
        } as Parameters<typeof tx.lineItem.create>[0]['data'],
        select: { id: true },
      })
    })

    return { success: true, data: { newLineItemId: newItem.id } }
  } catch {
    return { success: false, error: 'Failed to duplicate line item' }
  }
}

// ─── Update account ───────────────────────────────────────────────────────────

export async function updateAccount(id: string, input: { name: string; code?: string | null }): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    await sdb.account.update({ where: { id }, data: input })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update account' }
  }
}

// ─── Reorder accounts ─────────────────────────────────────────────────────────

export async function reorderAccounts(
  accounts: { id: string; order: number; code?: string | null }[]
): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    // Verify ALL account IDs belong to this workspace in one scoped count.
    const verified = await sdb.account.count({ where: { id: { in: accounts.map(a => a.id) } } })
    if (verified !== accounts.length) return { success: false, error: 'Account not found' }
    // IDs are now trusted — raw db is safe for the batch transaction.
    await db.$transaction(
      accounts.map(({ id, order }, i) =>
        db.account.update({
          where: { id },
          data: { order, code: String((i + 1) * 100) },
        })
      )
    )
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to reorder accounts' }
  }
}

// ─── Delete account ───────────────────────────────────────────────────────────

export async function deleteAccount(id: string): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    await sdb.account.delete({ where: { id } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete account' }
  }
}

// ─── Move line item to a different account ────────────────────────────────────

export async function moveLineItem(itemId: string, targetAccountId: string): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    // Verify both the line item and target account belong to this workspace.
    const [item, account] = await Promise.all([
      sdb.lineItem.findFirst({ where: { id: itemId }, select: { id: true } }),
      sdb.account.findFirst({ where: { id: targetAccountId }, select: { id: true } }),
    ])
    if (!item || !account) return { success: false, error: 'Not found' }
    const count = await db.lineItem.count({ where: { accountId: targetAccountId } })
    await db.lineItem.update({
      where: { id: itemId },
      data: { accountId: targetAccountId, order: count },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to move line item' }
  }
}

// ─── Move multiple line items to a target account at a given position ─────────

export async function moveLineItems(
  lineItemIds: string[],
  toAccountId: string,
  beforeItemId: string | null
): Promise<ActionResult> {
  if (!lineItemIds.length) return { success: true, data: undefined }
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()

    // Verify all items and the target account belong to this workspace.
    const [itemCount, account] = await Promise.all([
      sdb.lineItem.count({ where: { id: { in: lineItemIds } } }),
      sdb.account.findFirst({ where: { id: toAccountId }, select: { id: true } }),
    ])
    if (itemCount !== lineItemIds.length) return { success: false, error: 'One or more items not found' }
    if (!account) return { success: false, error: 'Target account not found' }

    await db.$transaction(async tx => {
      // Capture source account IDs before moving anything.
      const sourceItems = await tx.lineItem.findMany({
        where: { id: { in: lineItemIds } },
        select: { id: true, accountId: true },
      })
      const sourceAccountIds = [...new Set(
        sourceItems.filter(i => i.accountId !== toAccountId).map(i => i.accountId)
      )]

      // Current items in the target account (ordered).
      const targetItems = await tx.lineItem.findMany({
        where: { accountId: toAccountId },
        orderBy: { order: 'asc' },
        select: { id: true },
      })

      const movingSet = new Set(lineItemIds)

      // Remove moved items from the target list (they'll be reinserted at the drop position).
      const staying = targetItems.filter(i => !movingSet.has(i.id))
      const insertIdx = beforeItemId
        ? staying.findIndex(i => i.id === beforeItemId)
        : staying.length
      const safeIdx = insertIdx === -1 ? staying.length : insertIdx

      // New order: items before insertion, moved items (in caller-supplied order), items after.
      const newOrder = [
        ...staying.slice(0, safeIdx).map(i => i.id),
        ...lineItemIds,
        ...staying.slice(safeIdx).map(i => i.id),
      ]

      await Promise.all(
        newOrder.map((id, idx) =>
          tx.lineItem.update({ where: { id }, data: { accountId: toAccountId, order: idx } })
        )
      )

      // Re-index source accounts that lost items (fills order gaps left by removed items).
      for (const accId of sourceAccountIds) {
        const remaining = await tx.lineItem.findMany({
          where: { accountId: accId },
          orderBy: { order: 'asc' },
          select: { id: true },
        })
        await Promise.all(
          remaining.map(({ id }, idx) =>
            tx.lineItem.update({ where: { id }, data: { order: idx } })
          )
        )
      }
    })

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to move line items' }
  }
}

// ─── Reorder line items ───────────────────────────────────────────────────────

export async function reorderLineItems(items: { id: string; order: number }[]): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    // Verify all IDs belong to this workspace.
    const verified = await sdb.lineItem.count({ where: { id: { in: items.map(i => i.id) } } })
    if (verified !== items.length) return { success: false, error: 'Line item not found' }
    await db.$transaction(
      items.map(({ id, order }) => db.lineItem.update({ where: { id }, data: { order } }))
    )
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to reorder' }
  }
}

// ─── Duplicate phase ──────────────────────────────────────────────────────────

export async function duplicatePhase(phaseId: string, newName: string): Promise<ActionResult<{ id: string }>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const [sdb, workspaceId] = await Promise.all([getScopedDb(), getWorkspaceId()])

    // Scoped read — returns null if phaseId belongs to another workspace.
    const source = await sdb.phase.findFirst({
      where: { id: phaseId },
      include: {
        accounts: {
          include: {
            lineItems: true,
            children: { include: { lineItems: true } },
          },
        },
      },
    })
    if (!source) return { success: false, error: 'Phase not found' }

    const maxOrder = await db.phase.aggregate({
      where: { budgetId: source.budgetId },
      _max: { order: true },
    })

    const newPhase = await db.phase.create({
      data: {
        budgetId:     source.budgetId,
        workspaceId,
        name:         newName,
        order:        (maxOrder._max.order ?? 0) + 1,
        isPrimary:    false,
        description:  source.description ?? null,
        deliverables: source.deliverables ?? undefined,
      },
    })

    const newSection = await db.budgetSection.create({
      data:   { phaseId: newPhase.id, workspaceId, title: 'Main', orderIndex: 0 },
      select: { id: true },
    })
    await cloneAccounts(source.accounts as unknown as AccountNode[], newPhase.id, newSection.id, null, workspaceId)

    revalidatePath('/')
    return { success: true, data: { id: newPhase.id } }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { success: false, error: `A version named "${newName}" already exists — choose a different name.` }
    }
    console.error('[duplicatePhase]', err)
    return { success: false, error: 'Failed to duplicate phase' }
  }
}

// ─── Update phase overview (description + deliverables) ──────────────────────

interface DeliverableInput { id?: string; title: string; description: string; number?: string; sectionIds?: string[] }

export async function updatePhaseOverview(
  phaseId: string,
  data: { overview: string | null; description: string | null; deliverables: DeliverableInput[] }
): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    const updateFn = sdb.phase.update as unknown as (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
    await updateFn({
      where: { id: phaseId },
      data: {
        overview:     data.overview || null,
        description:  data.description || null,
        deliverables: data.deliverables.length > 0 ? (data.deliverables as unknown as Prisma.InputJsonValue) : undefined,
      },
    })
    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save overview' }
  }
}

// ─── Update budget globals ────────────────────────────────────────────────────

export async function updateBudgetGlobals(budgetId: string, globals: Record<string, number>): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    await sdb.budget.update({ where: { id: budgetId }, data: { globals } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update globals' }
  }
}

// ─── Rate card search ─────────────────────────────────────────────────────────

export async function searchRateCards(query: string): Promise<ActionResult<unknown[]>> {
  try {
    const sdb = await getScopedDb()
    const rates = await sdb.rateCard.findMany({
      where: {
        archivedAt: null,
        OR: [
          { role: { contains: query, mode: 'insensitive' } },
          { searchTokens: { contains: query.toLowerCase() } },
        ],
      },
      orderBy: [{ isFavorite: 'desc' }, { usageCount: 'desc' }, { role: 'asc' }],
      take: 8,
    })
    return { success: true, data: rates }
  } catch {
    return { success: false, error: 'Search failed' }
  }
}

// ─── Update budget markup / tax rates ────────────────────────────────────────

export async function updateBudgetRates(
  budgetId: string,
  { markupPct, taxPct }: { markupPct: number | null; taxPct: number | null }
): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    await sdb.budget.update({ where: { id: budgetId }, data: { markupPct, taxPct } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update budget rates' }
  }
}

// ─── Update budget discount ───────────────────────────────────────────────────
// Single source of truth for proposals + invoices generated from this budget
// (replaces the old per-proposal Proposal.content.discount).

const discountSchema = z.object({
  discountType:       z.enum(['flat', 'pct']).nullable(),
  discountLabel:      z.string().max(120).nullable(),
  discountValueCents: z.number().int().min(0).nullable(),
  discountValuePct:   z.number().min(0).max(1).nullable(), // 0–1 fraction
})

export async function updateBudgetDiscount(
  budgetId: string,
  input: z.infer<typeof discountSchema>
): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const data = discountSchema.parse(input)
    const sdb = await getScopedDb()
    await sdb.budget.update({ where: { id: budgetId }, data })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update budget discount' }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
// These use raw `db` for Phase/Account/LineItem creates.
// workspaceId is passed explicitly from the calling action (which has already
// verified workspace ownership via getScopedDb). New rows always carry workspaceId.

type TemplateStructure = {
  accounts: Array<{
    name: string
    code?: string
    items: Array<{
      description: string
      rateCardId?: string
      qty: number
      unit: RateUnit
      rateCents: number
      markupPct?: number
      notes?: string
      tags?: string[]
    }>
    children?: TemplateStructure['accounts']
  }>
}

async function materialiseTemplate(budgetId: string, structure: TemplateStructure, workspaceId: string) {
  const phase = await db.phase.findFirst({ where: { budgetId } })
  if (!phase) return

  const sectionId = await getOrCreateDefaultSection(phase.id, workspaceId)

  const rateCardIds = structure.accounts
    .flatMap(a => [...a.items, ...(a.children?.flatMap(c => c.items) ?? [])])
    .map(i => i.rateCardId)
    .filter((id): id is string => !!id)
  const rcMap = await buildRateCategoryMap(rateCardIds)

  for (let i = 0; i < structure.accounts.length; i++) {
    const acc = structure.accounts[i]
    const account = await db.account.create({
      data: { phaseId: phase.id, sectionId, workspaceId, name: acc.name, code: acc.code ?? String((i + 1) * 100), order: i },
    })
    for (let j = 0; j < acc.items.length; j++) {
      const item = acc.items[j]
      const lineItemCategory = item.rateCardId ? rcMap.get(item.rateCardId) : undefined
      await db.lineItem.create({
        data: {
          accountId:   account.id,
          workspaceId,
          description: item.description,
          rateCardId:  item.rateCardId ?? null,
          quantity:    item.qty,
          unit:        item.unit,
          rateCents:   item.rateCents,
          markupPct:   item.markupPct != null ? item.markupPct / 100 : null,
          notes:       item.notes ?? null,
          tags:        item.tags ?? [],
          order:       j,
          ...(lineItemCategory ? { lineItemCategory } : {}),
        },
      })
    }
  }
}

type AccountNode = {
  id: string
  name: string
  code: string | null
  order: number
  notes: string | null
  lineItems: Array<{
    description: string
    rateCardId: string | null
    quantity: unknown
    unit: RateUnit
    rateCents: number
    markupPct: unknown
    notes: string | null
    quantityFormula: string | null
    tags: string[]
    order: number
    lineItemCategory?: LineItemCategory | null
  }>
  children?: AccountNode[]
}

async function buildRateCategoryMap(ids: string[]): Promise<Map<string, LineItemCategory>> {
  if (!ids.length) return new Map()
  const cards = await db.rateCard.findMany({
    where: { id: { in: ids } },
    select: { id: true, category: true },
  })
  return new Map(cards.map(c => [c.id, mapRateCategory(c.category)]))
}

// ─── Insert package into phase ────────────────────────────────────────────────

export async function insertPackageIntoPhase(
  phaseId: string,
  structure: TemplateStructure
): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const [sdb, workspaceId] = await Promise.all([getScopedDb(), getWorkspaceId()])

    // Scoped read — returns null if phaseId belongs to another workspace.
    const phase = await sdb.phase.findFirst({ where: { id: phaseId }, select: { id: true } })
    if (!phase) return { success: false, error: 'Phase not found' }

    const sectionId = await getOrCreateDefaultSection(phaseId, workspaceId)

    const rateCardIds = structure.accounts
      .flatMap(a => a.items)
      .map(i => i.rateCardId)
      .filter((id): id is string => !!id)
    const rcMap = await buildRateCategoryMap(rateCardIds)

    const existingCount = await db.account.count({ where: { phaseId } })
    for (let i = 0; i < structure.accounts.length; i++) {
      const acc = structure.accounts[i]
      const account = await db.account.create({
        data: { phaseId, sectionId, workspaceId, name: acc.name, code: acc.code, order: existingCount + i },
      })
      for (let j = 0; j < acc.items.length; j++) {
        const item = acc.items[j]
        const lineItemCategory = item.rateCardId ? rcMap.get(item.rateCardId) : undefined
        await db.lineItem.create({
          data: {
            accountId:   account.id,
            workspaceId,
            description: item.description,
            rateCardId:  item.rateCardId ?? null,
            quantity:    item.qty,
            unit:        item.unit,
            rateCents:   item.rateCents,
            markupPct:   item.markupPct != null ? item.markupPct / 100 : null,
            notes:       item.notes ?? null,
            tags:        [],
            order:       j,
            ...(lineItemCategory ? { lineItemCategory } : {}),
          },
        })
      }
    }
    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to insert package' }
  }
}

async function cloneAccounts(accounts: AccountNode[], phaseId: string, sectionId: string, parentId: string | null, workspaceId: string) {
  for (const acc of accounts) {
    const newAcc = await db.account.create({
      data: { phaseId, sectionId, parentId, workspaceId, name: acc.name, code: acc.code, order: acc.order, notes: acc.notes },
    })
    for (const item of acc.lineItems) {
      await db.lineItem.create({
        data: {
          accountId:       newAcc.id,
          workspaceId,
          description:     item.description,
          rateCardId:      item.rateCardId,
          quantity:        Number(item.quantity),
          unit:            item.unit,
          rateCents:       item.rateCents,
          markupPct:       item.markupPct ? Number(item.markupPct) : null,
          notes:           item.notes,
          quantityFormula: item.quantityFormula,
          tags:            item.tags,
          order:           item.order,
          ...(item.lineItemCategory ? { lineItemCategory: item.lineItemCategory } : {}),
        },
      })
    }
    if (acc.children && acc.children.length) {
      await cloneAccounts(acc.children, phaseId, sectionId, newAcc.id, workspaceId)
    }
  }
}

// ─── Phase management ─────────────────────────────────────────────────────────

export async function renamePhase(phaseId: string, name: string): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    // Scoped update — WHERE id = ? AND workspaceId = ?
    await sdb.phase.update({ where: { id: phaseId }, data: { name: name.trim() } })
    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to rename phase' }
  }
}

export async function makePhasePrimary(phaseId: string): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    // Scoped read verifies ownership; budgetId is now trusted.
    const phase = await sdb.phase.findFirst({ where: { id: phaseId }, select: { budgetId: true } })
    if (!phase) return { success: false, error: 'Phase not found' }
    await db.$transaction([
      db.phase.updateMany({ where: { budgetId: phase.budgetId }, data: { isPrimary: false } }),
      db.phase.update({ where: { id: phaseId }, data: { isPrimary: true } }),
    ])
    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to set primary phase' }
  }
}

export async function deletePhase(phaseId: string): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    // Scoped read verifies ownership.
    const phase = await sdb.phase.findFirst({ where: { id: phaseId }, select: { budgetId: true, isPrimary: true } })
    if (!phase) return { success: false, error: 'Phase not found' }
    if (phase.isPrimary) return { success: false, error: 'Cannot delete the primary phase' }
    const count = await db.phase.count({ where: { budgetId: phase.budgetId } })
    if (count <= 1) return { success: false, error: 'Cannot delete the only phase' }
    await db.phase.delete({ where: { id: phaseId } })
    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete phase' }
  }
}

// ─── Bulk operations ──────────────────────────────────────────────────────────
// All three follow the same security pattern as reorderAccounts / moveLineItem:
//   1. Use sdb (scoped) to COUNT/FIND — guarantees IDs belong to this workspace.
//   2. Use raw db for the mutation — safe because ownership is already verified.

export async function bulkDeleteLineItems(ids: string[]): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    if (!ids.length) return { success: true, data: undefined }
    const sdb = await getScopedDb()
    const count = await sdb.lineItem.count({ where: { id: { in: ids } } })
    if (count !== ids.length) return { success: false, error: 'One or more items not found' }
    await db.lineItem.deleteMany({ where: { id: { in: ids } } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete line items' }
  }
}

export async function bulkMoveToNewAccount(
  ids:         string[],
  accountName: string,
  phaseId:     string,
): Promise<ActionResult<{ accountId: string }>> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    if (!ids.length) return { success: false, error: 'No items selected' }
    const sdb = await getScopedDb()

    // Verify items and phase belong to this workspace
    const [itemCount, phase] = await Promise.all([
      sdb.lineItem.count({ where: { id: { in: ids } } }),
      sdb.phase.findFirst({ where: { id: phaseId }, select: { id: true, workspaceId: true } }),
    ])
    if (itemCount !== ids.length) return { success: false, error: 'One or more items not found' }
    if (!phase) return { success: false, error: 'Phase not found' }

    const sectionId = await getOrCreateDefaultSection(phaseId, phase.workspaceId ?? '')

    // Determine code and insertion order from existing top-level account count
    const existingCount = await db.account.count({ where: { phaseId, parentId: null } })
    const newCode = String((existingCount + 1) * 100)

    const newAccount = await db.account.create({
      data: {
        phaseId,
        sectionId,
        name:  accountName,
        code:  newCode,
        order: existingCount,
        ...(phase.workspaceId ? { workspaceId: phase.workspaceId } : {}),
      },
    })

    // Move items preserving their relative order within the new account
    await db.$transaction(
      ids.map((id, i) =>
        db.lineItem.update({ where: { id }, data: { accountId: newAccount.id, order: i } })
      )
    )

    return { success: true, data: { accountId: newAccount.id } }
  } catch {
    return { success: false, error: 'Failed to group items' }
  }
}

export async function bulkUpdateLineItems(
  ids:     string[],
  updates: { quantity?: number; unit?: RateUnit; rateCents?: number },
): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    if (!ids.length) return { success: true, data: undefined }
    const sdb = await getScopedDb()
    const count = await sdb.lineItem.count({ where: { id: { in: ids } } })
    if (count !== ids.length) return { success: false, error: 'One or more items not found' }

    // Only update the fields the caller explicitly provided
    const data: Record<string, unknown> = {}
    if (updates.quantity  !== undefined) data.quantity  = updates.quantity
    if (updates.unit      !== undefined) data.unit      = updates.unit
    if (updates.rateCents !== undefined) data.rateCents = updates.rateCents
    if (!Object.keys(data).length) return { success: true, data: undefined }

    await db.lineItem.updateMany({ where: { id: { in: ids } }, data })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update line items' }
  }
}

// ─── Bulk duplicate line items ────────────────────────────────────────────────

export async function bulkDuplicateLineItems(ids: string[]): Promise<ActionResult<{ newLineItemIds: string[] }>> {
  if (!ids.length) return { success: true, data: { newLineItemIds: [] } }
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()

    // Scoped read — cross-workspace IDs return nothing (silently skipped)
    const sources = await sdb.lineItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, accountId: true, workspaceId: true, description: true,
        quantity: true, unit: true, rateCents: true, hasMarkup: true,
        markupPct: true, taxRate: true, notes: true, rateCardId: true,
        lineItemCategory: true, contactId: true, quantityFormula: true,
        order: true,
      },
    })
    if (!sources.length) return { success: true, data: { newLineItemIds: [] } }

    // Group by account, sort each group descending by order (process bottom-to-top
    // so earlier shifts don't invalidate the order values of later items in the same account)
    const byAccount: Record<string, typeof sources> = {}
    for (const s of sources) {
      if (!byAccount[s.accountId]) byAccount[s.accountId] = []
      byAccount[s.accountId].push(s)
    }
    for (const arr of Object.values(byAccount)) {
      arr.sort((a, b) => b.order - a.order)
    }

    const newIds: string[] = []

    await db.$transaction(async tx => {
      for (const items of Object.values(byAccount)) {
        for (const item of items) {
          // Shift everything below this item (including any duplicates already inserted)
          await tx.lineItem.updateMany({
            where: { accountId: item.accountId, order: { gt: item.order } },
            data: { order: { increment: 1 } },
          })
          const newItem = await tx.lineItem.create({
            data: {
              accountId:        item.accountId,
              workspaceId:      item.workspaceId,
              description:      item.description,
              quantity:         item.quantity,
              unit:             item.unit,
              rateCents:        item.rateCents,
              hasMarkup:        item.hasMarkup,
              markupPct:        item.markupPct ?? undefined,
              taxRate:          item.taxRate ?? undefined,
              notes:            item.notes ?? undefined,
              rateCardId:       item.rateCardId ?? undefined,
              lineItemCategory: item.lineItemCategory ?? undefined,
              contactId:        item.contactId ?? undefined,
              quantityFormula:  item.quantityFormula ?? undefined,
              order:            item.order + 1,
            } as Parameters<typeof tx.lineItem.create>[0]['data'],
            select: { id: true },
          })
          newIds.push(newItem.id)
        }
      }
    })

    return { success: true, data: { newLineItemIds: newIds } }
  } catch {
    return { success: false, error: 'Failed to duplicate line items' }
  }
}
