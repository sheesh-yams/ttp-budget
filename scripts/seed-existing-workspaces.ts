/**
 * scripts/seed-existing-workspaces.ts
 *
 * Finds workspaces with NO rate cards and seeds them from the global library.
 * Safe to run on production — workspaces that already have rate cards (e.g.
 * The Third Place) are skipped automatically.
 *
 * Usage:
 *   npx tsx scripts/seed-existing-workspaces.ts          # dry run (preview only)
 *   npx tsx scripts/seed-existing-workspaces.ts --seed   # actually seed
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import type { RateCategory, RateUnit, ShootType, TemplateKind } from '@prisma/client'

const db = new PrismaClient()
const DRY = !process.argv.includes('--seed')

async function main() {
  console.log(DRY
    ? '🔍  DRY RUN — run with --seed to actually seed\n'
    : '🌱  SEED MODE\n'
  )

  // Load featured globals
  const [globalRates, globalTemplates] = await Promise.all([
    db.globalRateCard.findMany({ where: { isFeatured: true }, orderBy: { sortOrder: 'asc' } }),
    db.globalTemplate.findMany({ where: { isFeatured: true }, orderBy: { sortOrder: 'asc' } }),
  ])
  console.log(`Global library: ${globalRates.length} rate cards, ${globalTemplates.length} templates\n`)

  // Find all workspaces and their rate card counts
  const workspaces = await db.workspace.findMany({
    include: {
      _count: {
        select: { rateCards: true, templates: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${workspaces.length} workspace(s):`)
  for (const ws of workspaces) {
    const rateCount = ws._count.rateCards
    const tplCount  = ws._count.templates
    const needsSeed = rateCount === 0

    const status = needsSeed
      ? '⚠  EMPTY — will seed'
      : `✓  ${rateCount} rate cards, ${tplCount} templates — skip`
    console.log(`  ${ws.id}  "${ws.name}"  ${status}`)
  }

  const toSeed = workspaces.filter(ws => ws._count.rateCards === 0)
  console.log(`\nWorkspaces to seed: ${toSeed.length}`)

  if (toSeed.length === 0) {
    console.log('\n✅  Nothing to do — all workspaces already have rate cards.')
    return
  }

  if (DRY) {
    console.log('\nRun with --seed to apply.')
    return
  }

  // Seed each empty workspace
  for (const ws of toSeed) {
    console.log(`\n🌱  Seeding "${ws.name}" (${ws.id})...`)

    await db.$transaction(async (tx) => {
      // Rate cards
      for (const g of globalRates) {
        await tx.rateCard.create({
          data: {
            workspaceId:      ws.id,
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

      // Templates
      for (const g of globalTemplates) {
        await tx.budgetTemplate.create({
          data: {
            workspaceId: ws.id,
            name:        g.name,
            description: g.description,
            shootType:   g.shootType as ShootType,
            kind:        g.templateKind as TemplateKind,
            structure:   JSON.parse(JSON.stringify(stripRateCardIds(g.structure))),
          } as never,
        })
      }
    })

    console.log(`  ✓ Seeded ${globalRates.length} rate cards + ${globalTemplates.length} templates`)
  }

  console.log('\n✅  Done. Reload the app to see the seeded data.\n')
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

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
