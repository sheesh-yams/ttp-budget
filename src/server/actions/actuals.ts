'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getWorkspaceId } from '@/lib/auth'
import type { ActionResult } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape of ActualSheet + entries as returned from DB (after prisma generate)
type ActualSheetDb   = { id: string; workspaceId: string; projectId: string; budgetId: string; phaseId: string; name: string; revenueOverrideCents: number | null; notes: string | null; createdAt: Date; updatedAt: Date }
type ActualEntryDb   = { id: string; actualSheetId: string; lineItemId: string | null; accountId: string | null; description: string; actualCents: number; notes: string | null; isAdHoc: boolean; order: number; createdAt: Date; updatedAt: Date }
type ActualSheetFull = ActualSheetDb & { entries: ActualEntryDb[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/actuals`)
}

// Recursive helper: walk account tree and collect all line items with their accountId
type AccountNode = {
  id: string
  lineItems: { id: string; description: string; order: number }[]
  children: AccountNode[]
}

function collectLineItems(
  accounts: AccountNode[],
): { lineItemId: string; accountId: string; description: string; order: number }[] {
  const out: { lineItemId: string; accountId: string; description: string; order: number }[] = []
  let seq = 0
  function walk(accs: AccountNode[]) {
    for (const acc of accs) {
      for (const item of acc.lineItems) {
        out.push({ lineItemId: item.id, accountId: acc.id, description: item.description, order: seq++ })
      }
      walk(acc.children)
    }
  }
  walk(accounts)
  return out
}

// ─── createActualSheet ────────────────────────────────────────────────────────

/**
 * Create a new ActualSheet for a budget phase, pre-populating an ActualEntry
 * for every line item in that phase (actualCents = 0 initially).
 */
export async function createActualSheet(
  projectId: string,
  budgetId: string,
  phaseId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const sdb = await getScopedDb()

    // Verify the budget belongs to the active workspace
    const budget = await sdb.budget.findFirst({
      where: { id: budgetId, projectId },
      select: { id: true },
    })
    if (!budget) return { success: false, error: 'Budget not found' }

    // Get the full phase tree so we can pre-populate entries
    const phase = await db.phase.findFirst({
      where: { id: phaseId, budgetId },
      include: {
        accounts: {
          orderBy: { order: 'asc' },
          include: {
            lineItems: { orderBy: { order: 'asc' } },
            children: {
              orderBy: { order: 'asc' },
              include: {
                lineItems: { orderBy: { order: 'asc' } },
                children: {
                  orderBy: { order: 'asc' },
                  include: { lineItems: { orderBy: { order: 'asc' } } },
                },
              },
            },
          },
        },
      },
    })
    if (!phase) return { success: false, error: 'Phase not found' }

    const workspaceId = await getWorkspaceId()
    const lineItems = collectLineItems(phase.accounts as unknown as AccountNode[])

    const sheet = await (db as unknown as {
      actualSheet: {
        create: (args: {
          data: Record<string, unknown>
          select: Record<string, unknown>
        }) => Promise<{ id: string }>
      }
    }).actualSheet.create({
      data: {
        workspaceId,
        projectId,
        budgetId,
        phaseId,
        entries: {
          create: lineItems.map(li => ({
            lineItemId:  li.lineItemId,
            accountId:   li.accountId,
            description: li.description,
            actualCents: 0,
            isAdHoc:     false,
            order:       li.order,
          })),
        },
      },
      select: { id: true },
    })

    revalidate(projectId)
    return { success: true, data: { id: sheet.id } }
  } catch (err) {
    console.error('[createActualSheet]', err)
    return { success: false, error: 'Failed to create actuals sheet' }
  }
}

// ─── updateActualEntry ────────────────────────────────────────────────────────

/**
 * Update the actualCents (and optional notes) on a single ActualEntry.
 * Called on blur of each actual input in the editor.
 */
export async function updateActualEntry(
  entryId: string,
  actualCents: number,
  notes?: string,
): Promise<ActionResult<void>> {
  try {
    await (db as unknown as {
      actualEntry: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
      }
    }).actualEntry.update({
      where: { id: entryId },
      data: { actualCents, ...(notes !== undefined ? { notes } : {}) },
    })

    return { success: true, data: undefined }
  } catch (err) {
    console.error('[updateActualEntry]', err)
    return { success: false, error: 'Failed to save' }
  }
}

// ─── addAdHocEntry ────────────────────────────────────────────────────────────

/**
 * Add a new unplanned / ad-hoc entry to an ActualSheet.
 * These represent costs that weren't in the original budget.
 */
export async function addAdHocEntry(
  sheetId: string,
  projectId: string,
  data: {
    accountId: string
    description: string
    actualCents: number
    notes?: string
  },
): Promise<ActionResult<ActualEntryDb>> {
  try {
    // Verify the sheet belongs to this workspace via sdb
    const sdb = await getScopedDb()
    const sheet = await (sdb as unknown as {
      actualSheet: {
        findFirst: (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => Promise<{ id: string } | null>
      }
    }).actualSheet.findFirst({
      where: { id: sheetId },
      select: { id: true },
    })
    if (!sheet) return { success: false, error: 'Sheet not found' }

    // Count existing entries to set order
    const count = await (db as unknown as {
      actualEntry: { count: (args: { where: { actualSheetId: string } }) => Promise<number> }
    }).actualEntry.count({ where: { actualSheetId: sheetId } })

    const entry = await (db as unknown as {
      actualEntry: {
        create: (args: { data: Record<string, unknown> }) => Promise<ActualEntryDb>
      }
    }).actualEntry.create({
      data: {
        actualSheetId: sheetId,
        accountId:     data.accountId,
        description:   data.description,
        actualCents:   data.actualCents,
        notes:         data.notes ?? null,
        isAdHoc:       true,
        order:         count,
      },
    })

    revalidate(projectId)
    return { success: true, data: entry }
  } catch (err) {
    console.error('[addAdHocEntry]', err)
    return { success: false, error: 'Failed to add row' }
  }
}

// ─── deleteAdHocEntry ─────────────────────────────────────────────────────────

/**
 * Delete an ad-hoc ActualEntry. (Non-ad-hoc entries are never deleted —
 * they stay with actualCents = 0 if the item wasn't spent.)
 */
export async function deleteAdHocEntry(
  entryId: string,
  projectId: string,
): Promise<ActionResult<void>> {
  try {
    await (db as unknown as {
      actualEntry: {
        delete: (args: { where: { id: string; isAdHoc: boolean } }) => Promise<unknown>
      }
    }).actualEntry.delete({
      where: { id: entryId, isAdHoc: true },
    })

    revalidate(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[deleteAdHocEntry]', err)
    return { success: false, error: 'Failed to delete row' }
  }
}

// ─── updateActualSheet ────────────────────────────────────────────────────────

/**
 * Update sheet-level settings: revenue override and/or name.
 */
export async function updateActualSheet(
  sheetId: string,
  projectId: string,
  data: { revenueOverrideCents?: number | null; name?: string },
): Promise<ActionResult<void>> {
  try {
    const sdb = await getScopedDb()
    await (sdb as unknown as {
      actualSheet: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
      }
    }).actualSheet.update({
      where: { id: sheetId },
      data,
    })

    revalidate(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[updateActualSheet]', err)
    return { success: false, error: 'Failed to update sheet' }
  }
}

// ─── getActualSheet ───────────────────────────────────────────────────────────

/**
 * Fetch the ActualSheet for a given budget, with all entries.
 * Returns null if none exists yet.
 * Used by the page server component.
 */
export async function getActualSheet(budgetId: string): Promise<ActualSheetFull | null> {
  try {
    const sdb = await getScopedDb()
    const sheet = await (sdb as unknown as {
      actualSheet: {
        findFirst: (args: {
          where: Record<string, unknown>
          include: Record<string, unknown>
          orderBy: Record<string, unknown>
        }) => Promise<ActualSheetFull | null>
      }
    }).actualSheet.findFirst({
      where:   { budgetId },
      include: { entries: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })

    return sheet
  } catch (err) {
    console.error('[getActualSheet]', err)
    return null
  }
}

// Re-export the types so the page + component can use them without re-deriving
export type { ActualSheetFull, ActualEntryDb }
