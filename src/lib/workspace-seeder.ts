/**
 * workspace-seeder.ts
 *
 * Seeds a freshly created workspace with the global library of rate cards and
 * budget templates. Called immediately after workspace creation in:
 *   - src/app/api/webhooks/clerk/route.ts  (user.created event)
 *   - src/server/actions/workspace.ts       (createWorkspace action)
 *
 * Uses raw `db` — NOT getScopedDb() — because workspace context may not be
 * available in the calling environment (e.g. webhook handler).
 *
 * Isolation guarantee: seeded rows are LOCAL copies. Editing them never touches
 * the GlobalRateCard / GlobalTemplate tables. Future global updates do NOT
 * propagate to existing workspaces. This is intentional.
 */

import { db } from '@/lib/db'
import type { RateCategory, RateUnit, ShootType, TemplateKind } from '@prisma/client'

export async function seedWorkspaceFromGlobals(workspaceId: string): Promise<void> {
  // Fetch all featured globals in parallel
  const [globalRates, globalTemplates] = await Promise.all([
    db.globalRateCard.findMany({
      where:   { isFeatured: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.globalTemplate.findMany({
      where:   { isFeatured: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  await db.$transaction(async (tx) => {
    // ── Rate cards ──────────────────────────────────────────────────────────
    for (const g of globalRates) {
      await tx.rateCard.create({
        data: {
          workspaceId,
          role:             g.role,
          category:         g.category as RateCategory,
          defaultUnit:      g.defaultUnit as RateUnit,
          defaultRateCents: g.defaultRateCents,
          notes:            g.notes,
          searchTokens:     g.searchTokens,
          isFavorite:       false,
        },
      })
    }

    // ── Budget templates ────────────────────────────────────────────────────
    for (const g of globalTemplates) {
      await tx.budgetTemplate.create({
        data: {
          workspaceId,
          name:        g.name,
          description: g.description,
          shootType:   g.shootType as ShootType,
          kind:        g.templateKind as TemplateKind,
          // Strip any globalRateCard IDs from the structure — the workspace
          // copy has its own rate card IDs (or none). Descriptions are kept so
          // line items still have meaningful labels.
          structure:   JSON.parse(JSON.stringify(stripRateCardIds(g.structure))),
        } as unknown as Parameters<typeof tx.budgetTemplate.create>[0]['data'],
      })
    }
  })

  console.log(
    `[workspace-seeder] Seeded workspace ${workspaceId} with ${globalRates.length} rate cards and ${globalTemplates.length} templates.`
  )
}

// ---------------------------------------------------------------------------
// Re-seed (additive) — skips items already present in the workspace.
// Used by the "Reset workspace library" settings button.
// ---------------------------------------------------------------------------

export async function reseedWorkspaceFromGlobals(workspaceId: string): Promise<{
  ratesAdded: number
  templatesAdded: number
}> {
  const [globalRates, globalTemplates, existingRates, existingTemplates] = await Promise.all([
    db.globalRateCard.findMany({ where: { isFeatured: true }, orderBy: { sortOrder: 'asc' } }),
    db.globalTemplate.findMany({ where: { isFeatured: true }, orderBy: { sortOrder: 'asc' } }),
    db.rateCard.findMany({ where: { workspaceId, archivedAt: null }, select: { role: true } }),
    db.budgetTemplate.findMany({ where: { workspaceId }, select: { name: true } }),
  ])

  const existingRoles = new Set(existingRates.map(r => r.role))
  const existingNames = new Set(existingTemplates.map(t => t.name))

  const ratesToAdd     = globalRates.filter(g => !existingRoles.has(g.role))
  const templatesToAdd = globalTemplates.filter(g => !existingNames.has(g.name))

  if (ratesToAdd.length === 0 && templatesToAdd.length === 0) {
    return { ratesAdded: 0, templatesAdded: 0 }
  }

  await db.$transaction(async (tx) => {
    for (const g of ratesToAdd) {
      await tx.rateCard.create({
        data: {
          workspaceId,
          role:             g.role,
          category:         g.category as RateCategory,
          defaultUnit:      g.defaultUnit as RateUnit,
          defaultRateCents: g.defaultRateCents,
          notes:            g.notes,
          searchTokens:     g.searchTokens,
          isFavorite:       false,
        },
      })
    }

    for (const g of templatesToAdd) {
      await tx.budgetTemplate.create({
        data: {
          workspaceId,
          name:        g.name,
          description: g.description,
          shootType:   g.shootType as ShootType,
          kind:        g.templateKind as TemplateKind,
          structure:   JSON.parse(JSON.stringify(stripRateCardIds(g.structure))),
        } as unknown as Parameters<typeof tx.budgetTemplate.create>[0]['data'],
      })
    }
  })

  return { ratesAdded: ratesToAdd.length, templatesAdded: templatesToAdd.length }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TemplateAccount = {
  name: string
  code?: string
  items?: Array<{ description: string; qty?: number; unit?: string; rateCents?: number; rateCardId?: string; [key: string]: unknown }>
  children?: TemplateAccount[]
  [key: string]: unknown
}

type TemplateStructure = {
  accounts?: TemplateAccount[]
  [key: string]: unknown
}

/** Remove rateCardId from every line item — workspace copies don't share global IDs. */
function stripRateCardIds(raw: unknown): TemplateStructure {
  const structure = raw as TemplateStructure
  if (!structure?.accounts) return structure
  return {
    ...structure,
    accounts: structure.accounts.map(account => stripAccountRateCardIds(account)),
  }
}

function stripAccountRateCardIds(account: TemplateAccount): TemplateAccount {
  return {
    ...account,
    items: account.items?.map(({ rateCardId: _removed, ...item }) => item),
    children: account.children?.map(child => stripAccountRateCardIds(child)),
  }
}
