'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { getScopedDb } from '@/lib/db-scoped'
import { sumAccount, calcBudgetTotals, type AccountInput } from '@/lib/totals'
import { lineTotal } from '@/lib/money'
import type { ActionResult } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ActualSheetDb   = {
  id: string
  workspaceId: string
  projectId: string
  budgetId: string
  phaseId: string
  name: string
  revenueOverrideCents: number | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

type ActualEntryDb   = {
  id: string
  actualSheetId: string
  lineItemId: string | null
  accountId: string | null
  description: string
  actualCents: number
  notes: string | null
  isAdHoc: boolean
  order: number
  date: Date | null
  vendorContactId: string | null
  status: 'PENDING' | 'APPROVED'
  createdAt: Date
  updatedAt: Date
}

type ActualSheetFull = ActualSheetDb & { entries: ActualEntryDb[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/actuals`)
}

// Recursive helper: walk account tree and collect all line items with their accountId
export type AccountNode = {
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

    // Get the full phase tree — sdb auto-scopes, blocks foreign phaseId reads.
    const phase = await sdb.phase.findFirst({
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

    // raw db: create with explicit workspaceId (sdb.create has Prisma type-inference issues
    // with nested relation inputs; the IDOR risk on creates is controlled workspaceId, not reads)
    const sheet = await db.actualSheet.create({
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
 * Update an ActualEntry's amount, notes, date, and/or status.
 * Called on blur of each actual input in the editor.
 */
export async function updateActualEntry(
  entryId: string,
  actualCents: number,
  opts?: {
    notes?: string
    date?: Date | null
    status?: 'PENDING' | 'APPROVED'
  },
): Promise<ActionResult<void>> {
  try {
    await db.actualEntry.update({
      where: { id: entryId },
      data: {
        actualCents,
        ...(opts?.notes !== undefined ? { notes: opts.notes } : {}),
        ...(opts?.date !== undefined  ? { date: opts.date }   : {}),
        ...(opts?.status !== undefined ? { status: opts.status } : {}),
      },
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
    date?: Date | null
    vendorContactId?: string | null
    status?: 'PENDING' | 'APPROVED'
  },
): Promise<ActionResult<ActualEntryDb>> {
  try {
    // Verify the sheet belongs to this workspace via sdb
    const sdb = await getScopedDb()
    const sheet = await sdb.actualSheet.findFirst({
      where: { id: sheetId },
      select: { id: true },
    })
    if (!sheet) return { success: false, error: 'Sheet not found' }

    // Count existing entries to set order
    const count = await db.actualEntry.count({ where: { actualSheetId: sheetId } })

    const createFn = db.actualEntry.create as unknown as (args: { data: Record<string, unknown> }) => Promise<ActualEntryDb>
    const entry = await createFn({
      // Cast needed until `prisma generate` runs with the F1 schema additions
      // (date, vendorContactId, status). Remove cast after regeneration.
      data: {
        actualSheetId:   sheetId,
        accountId:       data.accountId,
        description:     data.description,
        actualCents:     data.actualCents,
        notes:           data.notes ?? null,
        isAdHoc:         true,
        order:           count,
        date:            data.date ?? null,
        vendorContactId: data.vendorContactId ?? null,
        status:          data.status ?? 'PENDING',
      },
    })

    revalidate(projectId)
    return { success: true, data: entry as unknown as ActualEntryDb }
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
    await db.actualEntry.delete({
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
    await sdb.actualSheet.update({
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
    const sheet = await sdb.actualSheet.findFirst({
      where:   { budgetId },
      include: { entries: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })

    return sheet as unknown as ActualSheetFull | null
  } catch (err) {
    console.error('[getActualSheet]', err)
    return null
  }
}

// ─── syncActualSheetEntries ────────────────────────────────────────────────────

/**
 * Idempotent backfill: after a budget changes (new line items added, items in
 * new sections, etc.) the existing ActualSheet won't have entries for those
 * items — they appear as un-editable "—" on the actuals page. This runs on
 * every page load when a sheet already exists and adds missing entries
 * (actualCents = 0) for any line items not yet covered.
 *
 * Returns the refreshed sheet so the page doesn't need a separate fetch.
 */
export async function syncActualSheetEntries(
  sheetId: string,
  phaseAccounts: AccountNode[],
): Promise<ActualSheetFull | null> {
  try {
    const sdb = await getScopedDb()
    const sheet = await sdb.actualSheet.findFirst({
      where:   { id: sheetId },
      include: { entries: { orderBy: { order: 'asc' } } },
    })
    if (!sheet) return null

    // Build the full flat set of line-item ids + their account info from the
    // current phase (using the same collector that createActualSheet uses, but
    // with the parentId:null-filtered list from the page so no double-counting).
    const allLineItems = collectLineItems(phaseAccounts)

    const existingLineItemIds = new Set(
      sheet.entries
        .filter(e => !e.isAdHoc && e.lineItemId)
        .map(e => e.lineItemId as string),
    )

    // Deduplicate by lineItemId (collectLineItems can double-count child accounts
    // when the full flat account list is also walked via .children).
    const seen = new Set<string>()
    const missing = allLineItems.filter(li => {
      if (existingLineItemIds.has(li.lineItemId) || seen.has(li.lineItemId)) return false
      seen.add(li.lineItemId)
      return true
    })
    if (missing.length === 0) return sheet as unknown as ActualSheetFull

    const maxOrder = sheet.entries.reduce((m, e) => Math.max(m, e.order), -1)
    await db.actualEntry.createMany({
      data: missing.map((li, i) => ({
        actualSheetId: sheetId,
        lineItemId:    li.lineItemId,
        accountId:     li.accountId,
        description:   li.description,
        actualCents:   0,
        isAdHoc:       false,
        order:         maxOrder + 1 + i,
      })),
    })

    const refreshed = await sdb.actualSheet.findFirst({
      where:   { id: sheetId },
      include: { entries: { orderBy: { order: 'asc' } } },
    })
    return refreshed as unknown as ActualSheetFull | null
  } catch (err) {
    console.error('[syncActualSheetEntries]', err)
    return null
  }
}

// ─── getWrapReportData ────────────────────────────────────────────────────────

export interface WrapAccountRow {
  accountId:     string
  accountName:   string
  accountCode:   string | null
  budgetedCents: number
  actualCents:   number
  varianceCents: number  // positive = under budget (saved), negative = over
  isAdHocOnly:   boolean // true if this account only has ad-hoc entries (not in original budget)
}

export interface WrapReportData {
  projectId:     string
  projectName:   string
  clientName:    string
  phaseName:     string
  budgetName:    string
  sheetName:     string
  // Revenue / margin
  billedCents:       number  // revenueOverrideCents ?? grandTotalCents
  totalBudgetCents:  number  // grand total from budget (including markup + tax)
  totalActualCents:  number  // sum of all actual entries
  profitCents:       number  // billedCents - totalActualCents
  marginPct:         number  // profitCents / billedCents * 100
  // Per-account breakdown
  accounts:          WrapAccountRow[]
  // Top overages (accounts most over budget, descending by overage)
  topOverages:       WrapAccountRow[]
  // Date range of entries (min/max date on entries that have a date set)
  firstEntryDate:    Date | null
  lastEntryDate:     Date | null
  generatedAt:       Date
}

/**
 * Compute wrap report data for a project.
 * Reads the primary (most recently created) ActualSheet for the project's
 * primary budget phase, then compares actuals vs. budget at the account level.
 */
export async function getWrapReportData(
  projectId: string,
): Promise<WrapReportData | null> {
  try {
    const sdb = await getScopedDb()

    // Load project + client
    const project = await sdb.project.findFirst({
      where: { id: projectId },
      select: {
        id:   true,
        name: true,
        client: { select: { name: true } },
      },
    })
    if (!project) return null

    // Load the most recent ActualSheet for this project
    const sheet = await sdb.actualSheet.findFirst({
      where:   { projectId },
      orderBy: { createdAt: 'desc' },
      include: { entries: { orderBy: { order: 'asc' } } },
    })
    if (!sheet) return null

    // Load the budget + phase tree
    const budget = await sdb.budget.findFirst({
      where: { id: sheet.budgetId },
      select: {
        id: true,
        name: true,
        markupPct: true,
        taxPct: true,
        phases: {
          where: { id: sheet.phaseId },
          select: {
            id: true,
            name: true,
            accounts: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                name: true,
                code: true,
                order: true,
                lineItems: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    description: true,
                    quantity: true,
                    rateCents: true,
                    markupPct: true,
                    order: true,
                  },
                },
                children: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    order: true,
                    lineItems: {
                      orderBy: { order: 'asc' },
                      select: {
                        id: true,
                        description: true,
                        quantity: true,
                        rateCents: true,
                        markupPct: true,
                        order: true,
                      },
                    },
                    children: {
                      orderBy: { order: 'asc' },
                      select: {
                        id: true,
                        name: true,
                        code: true,
                        order: true,
                        lineItems: {
                          orderBy: { order: 'asc' },
                          select: {
                            id: true,
                            description: true,
                            quantity: true,
                            rateCents: true,
                            markupPct: true,
                            order: true,
                          },
                        },
                        children: { select: { id: true, name: true, code: true, lineItems: { select: { id: true, quantity: true, rateCents: true, markupPct: true } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    const phase = budget?.phases?.[0]
    if (!budget || !phase) return null

    // ── Compute budgeted cents per account ────────────────────────────────────

    type AccountFlat = {
      id: string
      name: string
      code: string | null
      budgetedCents: number
    }

    function flattenAccounts(
      accs: typeof phase.accounts,
      result: AccountFlat[] = [],
    ): AccountFlat[] {
      for (const acc of accs) {
        result.push({
          id:            acc.id,
          name:          acc.name,
          code:          acc.code,
          budgetedCents: sumAccount(acc as unknown as AccountInput),
        })
        if (acc.children?.length) {
          flattenAccounts(acc.children as typeof phase.accounts, result)
        }
      }
      return result
    }

    const flatAccounts = flattenAccounts(phase.accounts)
    const accountMap   = new Map(flatAccounts.map(a => [a.id, a]))

    // ── Budget grand total ────────────────────────────────────────────────────

    const totals = calcBudgetTotals(
      phase.accounts as unknown as AccountInput[],
      Number(budget.markupPct ?? 0),
      Number(budget.taxPct ?? 0),
    )

    const billedCents      = (sheet as unknown as { revenueOverrideCents: number | null }).revenueOverrideCents
                              ?? totals.grandTotalCents
    const totalBudgetCents = totals.grandTotalCents

    // ── Aggregate actuals by accountId ────────────────────────────────────────

    const actualByAccount = new Map<string, number>()
    let totalActualCents = 0
    let firstEntryDate: Date | null = null
    let lastEntryDate:  Date | null = null

    for (const entry of (sheet as unknown as ActualSheetFull).entries) {
      const cents = entry.actualCents
      totalActualCents += cents
      if (entry.accountId) {
        actualByAccount.set(
          entry.accountId,
          (actualByAccount.get(entry.accountId) ?? 0) + cents,
        )
      }
      if (entry.date) {
        if (!firstEntryDate || entry.date < firstEntryDate) firstEntryDate = entry.date
        if (!lastEntryDate  || entry.date > lastEntryDate)  lastEntryDate  = entry.date
      }
    }

    // Collect ad-hoc account IDs that don't exist in the budget tree
    const adHocAccountIds = new Set<string>()
    for (const entry of (sheet as unknown as ActualSheetFull).entries) {
      if (entry.isAdHoc && entry.accountId && !accountMap.has(entry.accountId)) {
        adHocAccountIds.add(entry.accountId)
      }
    }

    // ── Build account rows ────────────────────────────────────────────────────

    const accounts: WrapAccountRow[] = flatAccounts.map(acc => {
      const actual   = actualByAccount.get(acc.id) ?? 0
      const variance = acc.budgetedCents - actual
      return {
        accountId:     acc.id,
        accountName:   acc.name,
        accountCode:   acc.code,
        budgetedCents: acc.budgetedCents,
        actualCents:   actual,
        varianceCents: variance,
        isAdHocOnly:   false,
      }
    })

    // Ad-hoc-only accounts (entries that reference an accountId not in the budget tree)
    // We skip these for now — they're already counted in totalActualCents
    // but we don't have account names for them (would need a separate DB lookup).

    const topOverages = accounts
      .filter(a => a.varianceCents < 0)
      .sort((a, b) => a.varianceCents - b.varianceCents)
      .slice(0, 5)

    const profitCents = billedCents - totalActualCents
    const marginPct   = billedCents > 0 ? (profitCents / billedCents) * 100 : 0

    return {
      projectId:         project.id,
      projectName:       project.name,
      clientName:        project.client.name,
      phaseName:         phase.name,
      budgetName:        budget.name,
      sheetName:         (sheet as unknown as ActualSheetFull).name,
      billedCents,
      totalBudgetCents,
      totalActualCents,
      profitCents,
      marginPct,
      accounts,
      topOverages,
      firstEntryDate,
      lastEntryDate,
      generatedAt: new Date(),
    }
  } catch (err) {
    console.error('[getWrapReportData]', err)
    return null
  }
}

// Re-export the types so the page + component can use them without re-deriving
export type { ActualSheetFull, ActualEntryDb }
