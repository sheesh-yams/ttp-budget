'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getWorkspaceId, getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma, type RateUnit } from '@prisma/client'

// ─── Create budget ────────────────────────────────────────────────────────────

export async function createBudget(projectId: string, templateId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser()
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId: user.workspaceId },
    })
    if (!project) return { success: false, error: 'Project not found' }

    const budget = await db.budget.create({
      data: {
        workspaceId: user.workspaceId,
        projectId,
        name: 'Main Budget',
        createdById: user.id,
        phases: { create: { name: 'v1 Estimate', order: 0, isPrimary: true } },
      },
    })

    if (templateId) {
      const template = await db.budgetTemplate.findFirst({
        where: { id: templateId, workspaceId: user.workspaceId },
      })
      if (template) {
        await materialiseTemplate(budget.id, template.structure as TemplateStructure)
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
    await getWorkspaceId()
    const data = addAccountSchema.parse(input)
    const account = await db.account.create({ data: data as Prisma.AccountUncheckedCreateInput })
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
})

export async function upsertLineItem(
  id: string | null,
  input: z.infer<typeof lineItemSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await getWorkspaceId()
    const data = lineItemSchema.parse(input)
    const item = id
      ? await db.lineItem.update({ where: { id }, data })
      : await db.lineItem.create({ data: data as Prisma.LineItemUncheckedCreateInput })

    if (!id && data.rateCardId) {
      void db.rateCard.update({
        where: { id: data.rateCardId },
        data: { usageCount: { increment: 1 } },
      })
    }
    return { success: true, data: { id: item.id } }
  } catch {
    return { success: false, error: 'Failed to save line item' }
  }
}

// ─── Delete line item ─────────────────────────────────────────────────────────

export async function deleteLineItem(id: string): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    await db.lineItem.delete({ where: { id } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete line item' }
  }
}

// ─── Update account ───────────────────────────────────────────────────────────

export async function updateAccount(id: string, input: { name: string; code?: string | null }): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    await db.account.update({ where: { id }, data: input })
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
    await getWorkspaceId()
    // Always assign sequential 100/200/300 codes when reordering so the
    // display order stays in sync — even if accounts had no codes before.
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
    await getWorkspaceId()
    await db.account.delete({ where: { id } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete account' }
  }
}

// ─── Move line item to a different account ────────────────────────────────────

export async function moveLineItem(itemId: string, targetAccountId: string): Promise<ActionResult> {
  try {
    await getWorkspaceId()
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
    await getWorkspaceId()
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
    await getWorkspaceId()

    const source = await db.phase.findUnique({
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
        name:         newName,
        order:        (maxOrder._max.order ?? 0) + 1,
        isPrimary:    false,
        description:  source.description ?? null,
        deliverables: source.deliverables ?? undefined,
      },
    })

    await cloneAccounts(source.accounts as AccountNode[], newPhase.id, null)

    revalidatePath('/')
    return { success: true, data: { id: newPhase.id } }
  } catch {
    return { success: false, error: 'Failed to duplicate phase' }
  }
}

// ─── Update phase overview (description + deliverables) ──────────────────────

interface DeliverableInput { title: string; description: string; number?: string }

export async function updatePhaseOverview(
  phaseId: string,
  data: { description: string | null; deliverables: DeliverableInput[] }
): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    await db.phase.update({
      where: { id: phaseId },
      data: {
        description:  data.description || null,
        deliverables: data.deliverables.length > 0 ? data.deliverables : undefined,
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
    await getWorkspaceId()
    await db.budget.update({ where: { id: budgetId }, data: { globals } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update globals' }
  }
}

// ─── Rate card search ─────────────────────────────────────────────────────────

export async function searchRateCards(query: string): Promise<ActionResult<unknown[]>> {
  try {
    const workspaceId = await getWorkspaceId()
    const rates = await db.rateCard.findMany({
      where: {
        workspaceId,
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
    await getWorkspaceId()
    await db.budget.update({ where: { id: budgetId }, data: { markupPct, taxPct } })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update budget rates' }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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

async function materialiseTemplate(budgetId: string, structure: TemplateStructure) {
  const phase = await db.phase.findFirst({ where: { budgetId } })
  if (!phase) return
  for (let i = 0; i < structure.accounts.length; i++) {
    const acc = structure.accounts[i]
    const account = await db.account.create({
      data: { phaseId: phase.id, name: acc.name, code: acc.code ?? String((i + 1) * 100), order: i },
    })
    for (let j = 0; j < acc.items.length; j++) {
      const item = acc.items[j]
      await db.lineItem.create({
        data: {
          accountId: account.id,
          description: item.description,
          rateCardId: item.rateCardId ?? null,
          quantity: item.qty,
          unit: item.unit,
          rateCents: item.rateCents,
          // Template stores markupPct as a percentage (e.g. 20 for 20%).
          // The DB and lineTotal() expect a decimal (0.20). Divide by 100.
          markupPct: item.markupPct != null ? item.markupPct / 100 : null,
          notes: item.notes ?? null,
          tags: item.tags ?? [],
          order: j,
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
  }>
  children?: AccountNode[]
}

// ─── Insert package into phase ────────────────────────────────────────────────

export async function insertPackageIntoPhase(
  phaseId: string,
  structure: TemplateStructure
): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    const phase = await db.phase.findUnique({ where: { id: phaseId } })
    if (!phase) return { success: false, error: 'Phase not found' }

    const existingCount = await db.account.count({ where: { phaseId } })
    for (let i = 0; i < structure.accounts.length; i++) {
      const acc = structure.accounts[i]
      const account = await db.account.create({
        data: { phaseId, name: acc.name, code: acc.code, order: existingCount + i },
      })
      for (let j = 0; j < acc.items.length; j++) {
        const item = acc.items[j]
        await db.lineItem.create({
          data: {
            accountId:   account.id,
            description: item.description,
            rateCardId:  item.rateCardId ?? null,
            quantity:    item.qty,
            unit:        item.unit,
            rateCents:   item.rateCents,
            // Template stores markupPct as a percentage (e.g. 20 for 20%).
            // The DB and lineTotal() expect a decimal (0.20). Divide by 100.
            markupPct:   item.markupPct != null ? item.markupPct / 100 : null,
            notes:       item.notes ?? null,
            tags:        [],
            order:       j,
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

async function cloneAccounts(accounts: AccountNode[], phaseId: string, parentId: string | null) {
  for (const acc of accounts) {
    const newAcc = await db.account.create({
      data: { phaseId, parentId, name: acc.name, code: acc.code, order: acc.order, notes: acc.notes },
    })
    for (const item of acc.lineItems) {
      await db.lineItem.create({
        data: {
          accountId: newAcc.id,
          description: item.description,
          rateCardId: item.rateCardId,
          quantity: Number(item.quantity),
          unit: item.unit,
          rateCents: item.rateCents,
          markupPct: item.markupPct ? Number(item.markupPct) : null,
          notes: item.notes,
          quantityFormula: item.quantityFormula,
          tags: item.tags,
          order: item.order,
        },
      })
    }
    if (acc.children && acc.children.length) {
      await cloneAccounts(acc.children, phaseId, newAcc.id)
    }
  }
}

// ─── Phase management ─────────────────────────────────────────────────────────

export async function renamePhase(phaseId: string, name: string): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    await db.phase.update({ where: { id: phaseId }, data: { name: name.trim() } })
    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to rename phase' }
  }
}

export async function makePhasePrimary(phaseId: string): Promise<ActionResult> {
  try {
    await getWorkspaceId()
    const phase = await db.phase.findUniqueOrThrow({ where: { id: phaseId }, select: { budgetId: true } })
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
    await getWorkspaceId()
    const phase = await db.phase.findUniqueOrThrow({ where: { id: phaseId }, select: { budgetId: true, isPrimary: true } })
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
