'use server'

import { revalidatePath } from 'next/cache'
import { z }              from 'zod'
import { db }             from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  importPayloadSchema,
  formatZodError,
  type ImportRow,
} from '@/lib/importSchema'
import type { ActionResult }   from '@/types'
import type { TemplateStructure } from '@/types'
import type { Prisma }         from '@prisma/client'

// ─── Result type ──────────────────────────────────────────────────────────────

export type ImportResult = {
  accountsCreated: number
  accountsReused:  number
  itemsCreated:    number
}

// ─── Group rows by accountName (preserving first-appearance order) ────────────

function groupByAccount(rows: ImportRow[]): Map<string, ImportRow[]> {
  const map = new Map<string, ImportRow[]>()
  for (const row of rows) {
    const existing = map.get(row.accountName)
    if (existing) existing.push(row)
    else map.set(row.accountName, [row])
  }
  return map
}

// ─── importToBudget ───────────────────────────────────────────────────────────
//
// Groups imported rows by accountName, then for each group:
//   1. Finds the existing account in the phase by name (case-sensitive), or creates it.
//   2. Appends LineItem rows inside that account.
//
// Target: the PRIMARY phase of the budget. Falls back to the lowest-order phase.

export async function importToBudget(
  budgetId: string,
  rawData:  unknown
): Promise<ActionResult<ImportResult>> {
  try {
    const user = await getCurrentUser()

    // ── Auth: verify budget belongs to this workspace ────────────────────────
    const budget = await db.budget.findFirst({
      where: { id: budgetId, workspaceId: user.workspaceId },
      select: { id: true, projectId: true },
    })
    if (!budget) return { success: false, error: 'Budget not found' }

    // ── Validate payload ─────────────────────────────────────────────────────
    let rows: ImportRow[]
    try {
      rows = importPayloadSchema.parse(rawData)
    } catch (err) {
      if (err instanceof z.ZodError) return { success: false, error: formatZodError(err) }
      throw err
    }

    // ── Resolve target phase ─────────────────────────────────────────────────
    const phase =
      (await db.phase.findFirst({
        where: { budgetId, isPrimary: true },
        select: { id: true },
      })) ??
      (await db.phase.findFirst({
        where:   { budgetId },
        orderBy: { order: 'asc' },
        select:  { id: true },
      }))
    if (!phase) return { success: false, error: 'No phases found in this budget' }

    const groups = groupByAccount(rows)

    let accountsCreated = 0
    let accountsReused  = 0
    let itemsCreated    = 0

    // Current max account order (so appended accounts don't collide)
    const { _max } = await db.account.aggregate({
      where: { phaseId: phase.id, parentId: null },
      _max:  { order: true },
    })
    let nextAccountOrder = (_max.order ?? -1) + 1

    for (const [accountName, items] of groups) {
      // Find-or-create the account
      let account = await db.account.findFirst({
        where:  { phaseId: phase.id, name: accountName, parentId: null },
        select: { id: true },
      })

      if (account) {
        accountsReused++
      } else {
        account = await db.account.create({
          data:   { phaseId: phase.id, name: accountName, order: nextAccountOrder++ },
          select: { id: true },
        })
        accountsCreated++
      }

      // Current max item order in this account
      const { _max: itemMax } = await db.lineItem.aggregate({
        where: { accountId: account.id },
        _max:  { order: true },
      })
      let nextItemOrder = (itemMax.order ?? -1) + 1

      // Bulk-create line items
      const lineItemData: Prisma.LineItemCreateManyInput[] = items.map((item, i) => ({
        accountId:   account!.id,
        description: item.description,
        quantity:    item.qty,
        unit:        item.unit as Prisma.LineItemCreateManyInput['unit'],
        rateCents:   item.rateCents,
        markupPct:   item.markupPct ?? null,
        // hasMarkup and taxRate are new schema fields (added in the last migration).
        // They are valid once `prisma db push && prisma generate` has been run.
        ...(item.hasMarkup     !== undefined && { hasMarkup: item.hasMarkup }),
        ...(item.taxRate  != null             && { taxRate:   item.taxRate  }),
        notes:       item.notes ?? null,
        tags:        [],
        order:       nextItemOrder + i,
      }))

      await db.lineItem.createMany({ data: lineItemData })
      itemsCreated += items.length
      nextItemOrder += items.length
    }

    revalidatePath(`/projects/${budget.projectId}`)
    return { success: true, data: { accountsCreated, accountsReused, itemsCreated } }
  } catch (err) {
    console.error('[importToBudget]', err)
    return { success: false, error: 'Import failed — check the server logs for details' }
  }
}

// ─── importToTemplate ─────────────────────────────────────────────────────────
//
// Merges imported rows into the template's JSON structure field.
// Finds existing accounts by name; appends new accounts when not found.
// Does NOT duplicate accounts that already exist.

export async function importToTemplate(
  templateId: string,
  rawData:    unknown
): Promise<ActionResult<ImportResult>> {
  try {
    const user = await getCurrentUser()

    // ── Auth ─────────────────────────────────────────────────────────────────
    const template = await db.budgetTemplate.findFirst({
      where:  { id: templateId, workspaceId: user.workspaceId },
      select: { id: true, structure: true },
    })
    if (!template) return { success: false, error: 'Template not found' }

    // ── Validate payload ─────────────────────────────────────────────────────
    let rows: ImportRow[]
    try {
      rows = importPayloadSchema.parse(rawData)
    } catch (err) {
      if (err instanceof z.ZodError) return { success: false, error: formatZodError(err) }
      throw err
    }

    // ── Merge into structure JSON ─────────────────────────────────────────────
    const structure = template.structure as unknown as TemplateStructure
    const accounts  = structure.accounts ?? []

    const groups = groupByAccount(rows)

    let accountsCreated = 0
    let accountsReused  = 0
    let itemsCreated    = 0

    for (const [accountName, items] of groups) {
      let account = accounts.find(a => a.name === accountName)

      if (account) {
        accountsReused++
      } else {
        account = {
          id:       crypto.randomUUID().slice(0, 8),
          name:     accountName,
          items:    [],
          children: [],
        }
        accounts.push(account)
        accountsCreated++
      }

      for (const item of items) {
        account.items.push({
          id:          crypto.randomUUID().slice(0, 8),
          description: item.description,
          qty:         item.qty,
          unit:        item.unit as TemplateStructure['accounts'][number]['items'][number]['unit'],
          rateCents:   item.rateCents,
          markupPct:   item.markupPct ?? 0,
          notes:       item.notes ?? '',
        })
        itemsCreated++
      }
    }

    await db.budgetTemplate.update({
      where: { id: templateId },
      data:  { structure: { accounts } as object },
    })

    revalidatePath(`/templates/${templateId}`)
    return { success: true, data: { accountsCreated, accountsReused, itemsCreated } }
  } catch (err) {
    console.error('[importToTemplate]', err)
    return { success: false, error: 'Import failed — check the server logs for details' }
  }
}
