'use server'

import { revalidatePath }  from 'next/cache'
import { db }              from '@/lib/db'
import { getScopedDb }     from '@/lib/db-scoped'
import { requireRole }     from '@/lib/auth'
import { toJsonSafe }      from '@/lib/json-safe'
import type { ActionResult } from '@/types'

// ─── Local types ──────────────────────────────────────────────────────────────

type Deliverable = {
  id:           string
  title:        string
  description?: string
  sectionIds?:  string[]
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createBudgetSection(
  phaseId:     string,
  title:       string,
  orderIndex?: number,
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const phase = await sdb.phase.findFirst({
      where:  { id: phaseId },
      select: { id: true, workspaceId: true },
    })
    if (!phase) return { success: false, error: 'Phase not found' }

    const idx = orderIndex ?? await sdb.budgetSection.count({ where: { phaseId } })
    const section = await sdb.budgetSection.create({
      data:   { phaseId, workspaceId: phase.workspaceId ?? gate.workspaceId, title, orderIndex: idx },
      select: { id: true },
    })

    revalidatePath('/')
    return { success: true, data: { id: section.id } }
  } catch {
    return { success: false, error: 'Failed to create section' }
  }
}

// ─── Rename ───────────────────────────────────────────────────────────────────

export async function renameBudgetSection(
  sectionId:    string,
  title:        string,
  description?: string | null,
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const section = await sdb.budgetSection.findFirst({
      where:  { id: sectionId },
      select: { id: true },
    })
    if (!section) return { success: false, error: 'Section not found' }

    await sdb.budgetSection.update({
      where: { id: sectionId },
      data:  { title, description: description ?? null },
    })

    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to rename section' }
  }
}

// ─── Reorder ──────────────────────────────────────────────────────────────────

export async function reorderBudgetSections(
  phaseId:          string,
  orderedSectionIds: string[],
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const phase = await sdb.phase.findFirst({ where: { id: phaseId }, select: { id: true } })
    if (!phase) return { success: false, error: 'Phase not found' }

    // Verify all IDs belong to this phase in this workspace
    const found = await sdb.budgetSection.count({
      where: { phaseId, id: { in: orderedSectionIds } },
    })
    if (found !== orderedSectionIds.length) {
      return { success: false, error: 'One or more sections not found' }
    }

    // IDs verified — safe to batch-update with raw db
    await db.$transaction(
      orderedSectionIds.map((id, i) =>
        db.budgetSection.update({ where: { id }, data: { orderIndex: i } })
      )
    )

    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to reorder sections' }
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteBudgetSection(
  sectionId:             string,
  moveAccountsToSectionId?: string,
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const section = await sdb.budgetSection.findFirst({
      where:  { id: sectionId },
      select: { id: true, phaseId: true },
    })
    if (!section) return { success: false, error: 'Section not found' }

    // Never allow deleting the only section in a phase
    const siblingCount = await sdb.budgetSection.count({ where: { phaseId: section.phaseId } })
    if (siblingCount <= 1) return { success: false, error: 'CANNOT_DELETE_ONLY_SECTION' }

    const accountCount = await sdb.account.count({ where: { sectionId } })
    if (accountCount > 0 && !moveAccountsToSectionId) {
      return { success: false, error: 'SECTION_HAS_ACCOUNTS' }
    }

    if (moveAccountsToSectionId) {
      // Target must belong to the same phase (workspace isolation already enforced by sdb)
      const target = await sdb.budgetSection.findFirst({
        where:  { id: moveAccountsToSectionId, phaseId: section.phaseId },
        select: { id: true },
      })
      if (!target) return { success: false, error: 'Target section not found or in a different phase' }

      // Append moved accounts after whatever already exists in the target section
      const { _max } = await sdb.account.aggregate({
        where: { sectionId: moveAccountsToSectionId },
        _max:  { order: true },
      })
      let nextOrder = (_max.order ?? -1) + 1

      const toMove = await sdb.account.findMany({
        where:   { sectionId },
        select:  { id: true },
        orderBy: { order: 'asc' },
      })

      await db.$transaction(
        toMove.map(acc =>
          db.account.update({
            where: { id: acc.id },
            data:  { sectionId: moveAccountsToSectionId, order: nextOrder++ },
          })
        )
      )
    }

    await sdb.budgetSection.delete({ where: { id: sectionId } })

    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to delete section' }
  }
}

// ─── Move account to section ──────────────────────────────────────────────────

export async function moveAccountToSection(
  accountId:  string,
  toSectionId: string,
  orderIndex:  number,
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const [account, toSection] = await Promise.all([
      sdb.account.findFirst({
        where:  { id: accountId },
        select: { id: true, phaseId: true },
      }),
      sdb.budgetSection.findFirst({
        where:  { id: toSectionId },
        select: { id: true, phaseId: true },
      }),
    ])

    if (!account)   return { success: false, error: 'Account not found' }
    if (!toSection) return { success: false, error: 'Target section not found' }

    if (account.phaseId !== toSection.phaseId) {
      return { success: false, error: 'CROSS_PHASE_MOVE_REJECTED' }
    }

    await sdb.account.update({
      where: { id: accountId },
      data:  { sectionId: toSectionId, order: orderIndex },
    })

    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to move account' }
  }
}

// ─── Deliverable → section links ──────────────────────────────────────────────

export async function setDeliverableSectionLinks(
  phaseId:       string,
  deliverableId: string,
  sectionIds:    string[],
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const phase = await sdb.phase.findFirst({
      where:  { id: phaseId },
      select: { id: true, deliverables: true },
    })
    if (!phase) return { success: false, error: 'Phase not found' }

    if (sectionIds.length > 0) {
      const valid = await sdb.budgetSection.count({
        where: { phaseId, id: { in: sectionIds } },
      })
      if (valid !== sectionIds.length) {
        return { success: false, error: 'One or more section IDs are invalid for this phase' }
      }
    }

    const deliverables = (Array.isArray(phase.deliverables) ? phase.deliverables : []) as Deliverable[]
    const updated = deliverables.map(d =>
      d.id === deliverableId
        ? { ...d, sectionIds: sectionIds.length > 0 ? sectionIds : undefined }
        : d
    )

    await sdb.phase.update({
      where: { id: phaseId },
      data:  { deliverables: toJsonSafe(updated) },
    })

    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update deliverable section links' }
  }
}

// ─── Page-break toggle ────────────────────────────────────────────────────────

export async function togglePageBreakBetweenAccounts(
  phaseId: string,
  value:   boolean,
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const phase = await sdb.phase.findFirst({ where: { id: phaseId }, select: { id: true } })
    if (!phase) return { success: false, error: 'Phase not found' }

    await sdb.phase.update({ where: { id: phaseId }, data: { pageBreakBetweenAccounts: value } })

    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update page break setting' }
  }
}

// ─── Dismiss nudge ────────────────────────────────────────────────────────────

export async function dismissSectionsNudge(phaseId: string): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error!
    const sdb = await getScopedDb()

    const phase = await sdb.phase.findFirst({ where: { id: phaseId }, select: { id: true } })
    if (!phase) return { success: false, error: 'Phase not found' }

    await sdb.phase.update({
      where: { id: phaseId },
      data:  { sectionsNudgeDismissedAt: new Date() },
    })

    revalidatePath('/')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to dismiss nudge' }
  }
}
