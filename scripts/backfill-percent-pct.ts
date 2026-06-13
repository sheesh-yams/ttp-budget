/**
 * scripts/backfill-percent-pct.ts
 *
 * One-time migration: convert PaymentMilestone.percentPct from display-percent
 * format (50 = 50%) to decimal format (0.5 = 50%) in all stored Proposal.content
 * JSON blobs.
 *
 * Run AFTER deploying the code changes that expect decimal format, before any
 * new proposals are created with the old format.
 *
 * Usage:
 *   npx tsx scripts/backfill-percent-pct.ts
 *   # or, for a dry run:
 *   DRY_RUN=1 npx tsx scripts/backfill-percent-pct.ts
 *
 * Idempotency: skips milestones where percentPct <= 1 (already decimal).
 * Edge case note: a legacy 1% milestone (percentPct === 1) would be skipped.
 * In practice all real proposals use round splits (50/50, 33/33/33, etc.),
 * so this is safe.
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const DRY_RUN = process.env.DRY_RUN === '1'

interface Milestone {
  id: string
  name: string
  percentPct: number
  trigger: string
  customDate?: string
}

interface Section {
  type: string
  milestones?: Milestone[]
  [key: string]: unknown
}

interface ProposalContent {
  sections?: Section[]
  [key: string]: unknown
}

async function main() {
  console.log(`[backfill-percent-pct] Starting${DRY_RUN ? ' (DRY RUN — no writes)' : ''}…`)

  const proposals = await db.proposal.findMany({
    select: { id: true, content: true },
  })

  console.log(`[backfill-percent-pct] Found ${proposals.length} proposals to inspect.`)

  let updated = 0
  let skipped = 0

  for (const proposal of proposals) {
    const content = proposal.content as ProposalContent
    if (!content?.sections) { skipped++; continue }

    let dirty = false

    for (const section of content.sections) {
      if (section.type !== 'terms' || !Array.isArray(section.milestones)) continue
      for (const m of section.milestones) {
        if (typeof m.percentPct !== 'number') continue
        if (m.percentPct > 1) {
          console.log(
            `  [${proposal.id}] ${m.name}: ${m.percentPct} → ${m.percentPct / 100}`
          )
          m.percentPct = m.percentPct / 100
          dirty = true
        }
      }
    }

    if (!dirty) { skipped++; continue }

    if (!DRY_RUN) {
      await db.proposal.update({
        where: { id: proposal.id },
        data: { content: content as object },
      })
    }
    updated++
  }

  console.log(
    `[backfill-percent-pct] Done. Updated: ${updated}, Skipped (already decimal or no terms): ${skipped}.`
  )
  if (DRY_RUN) {
    console.log('[backfill-percent-pct] DRY RUN — no changes written.')
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
