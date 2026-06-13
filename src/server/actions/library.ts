'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import type { ActionResult } from '@/types'
import type { RateCategory, RateUnit, ShootType, TemplateKind } from '@prisma/client'
import { toJsonSafe } from '@/lib/json-safe'

// ---------------------------------------------------------------------------
// Copy a GlobalRateCard into the active workspace
// ---------------------------------------------------------------------------

export async function copyGlobalRateCardToWorkspace(
  globalId: string
): Promise<ActionResult<{ id: string; alreadyExists: boolean }>> {
  try {
    const workspaceId = await getWorkspaceId()

    const global = await db.globalRateCard.findUniqueOrThrow({ where: { id: globalId } })

    // Check if a non-archived rate card with the same role already exists
    const existing = await db.rateCard.findFirst({
      where: { workspaceId, role: global.role, archivedAt: null },
      select: { id: true },
    })

    if (existing) {
      return { success: true, data: { id: existing.id, alreadyExists: true } }
    }

    const created = await db.rateCard.create({
      data: {
        workspaceId,
        role:             global.role,
        category:         global.category as RateCategory,
        defaultUnit:      global.defaultUnit as RateUnit,
        defaultRateCents: global.defaultRateCents,
        notes:            global.notes,
        searchTokens:     global.searchTokens,
        isFavorite:       false,
      },
      select: { id: true },
    })

    revalidatePath('/rates')
    revalidatePath('/library')
    return { success: true, data: { id: created.id, alreadyExists: false } }
  } catch {
    return { success: false, error: 'Failed to add rate card to workspace' }
  }
}

// ---------------------------------------------------------------------------
// Copy a GlobalTemplate into the active workspace
// ---------------------------------------------------------------------------

export async function copyGlobalTemplateToWorkspace(
  globalId: string
): Promise<ActionResult<{ id: string; alreadyExists: boolean }>> {
  try {
    const workspaceId = await getWorkspaceId()

    const global = await db.globalTemplate.findUniqueOrThrow({ where: { id: globalId } })

    // Check if a template with the same name already exists
    const existing = await db.budgetTemplate.findFirst({
      where: { workspaceId, name: global.name },
      select: { id: true },
    })

    if (existing) {
      return { success: true, data: { id: existing.id, alreadyExists: true } }
    }

    // Strip any rateCardId references — workspace copies have their own IDs
    const structure = stripRateCardIds(global.structure)

    const created = await db.budgetTemplate.create({
      data: {
        workspaceId,
        name:        global.name,
        description: global.description,
        shootType:   global.shootType as ShootType,
        kind:        global.templateKind as TemplateKind,
        structure:   toJsonSafe(structure),
      } as unknown as Parameters<typeof db.budgetTemplate.create>[0]['data'],
      select: { id: true },
    })

    revalidatePath('/templates')
    revalidatePath('/library')
    return { success: true, data: { id: created.id, alreadyExists: false } }
  } catch {
    return { success: false, error: 'Failed to add template to workspace' }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TemplateAccount = {
  items?: Array<{ rateCardId?: string; [key: string]: unknown }>
  children?: TemplateAccount[]
  [key: string]: unknown
}

type TemplateStructure = { accounts?: TemplateAccount[]; [key: string]: unknown }

function stripRateCardIds(raw: unknown): TemplateStructure {
  const structure = raw as TemplateStructure
  if (!structure?.accounts) return structure
  return {
    ...structure,
    accounts: structure.accounts.map(account => ({
      ...account,
      items: account.items?.map(({ rateCardId: _removed, ...item }) => item),
      children: account.children?.map(child => ({
        ...child,
        items: child.items?.map(({ rateCardId: _removed, ...item }) => item),
      })),
    })),
  }
}
