'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, getWorkspaceId, requireRole } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma, type RateUnit, type RateCategory } from '@prisma/client'

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

  revalidatePath(`/projects/${projectId}/team`)
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
    revalidatePath(`/projects/${projectId}/team`)
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
  } catch {
    return { success: false, error: 'Failed to duplicate phase' }
  }
}

// ─── Update phase overview (description + deliverables) ──────────────────────

interface DeliverableInput { id?: string; title: string; description: string; number?: string; sectionIds?: string[] }

export async function updatePhaseOverview(
  phaseId: string,
  data: { description: string | null; deliverables: DeliverableInput[] }
): Promise<ActionResult> {
  try {
    const roleGate = await requireRole(['OWNER', 'PRODUCER'])
    if (!roleGate.ok) return roleGate.error
    const sdb = await getScopedDb()
    await sdb.phase.update({
      where: { id: phaseId },
      data: {
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
