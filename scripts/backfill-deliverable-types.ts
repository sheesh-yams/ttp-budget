/**
 * scripts/backfill-deliverable-types.ts
 *
 * Adds `type: 'DELIVERABLE'` and `quantity: 1` to every scope item in
 * Proposal.content that is missing those fields.
 *
 * Usage:
 *   npx tsx scripts/backfill-deliverable-types.ts          # dry-run
 *   npx tsx scripts/backfill-deliverable-types.ts --apply  # apply changes
 *
 * Idempotent: items that already have a `type` are left unchanged.
 */

import { PrismaClient } from '@prisma/client'
import { toJsonSafe }   from '../src/lib/json-safe'

const prisma = new PrismaClient()
const apply  = process.argv.includes('--apply')

interface ScopeItem {
  number:      string
  title:       string
  description: string
  sectionIds?: string[]
  type?:       string
  quantity?:   number
  [key: string]: unknown
}

interface ProposalSection {
  type:   string
  items?: ScopeItem[]
  [key: string]: unknown
}

interface ProposalContent {
  sections?: ProposalSection[]
  [key: string]: unknown
}

async function main() {
  const proposals = await prisma.proposal.findMany({
    select: { id: true, title: true, content: true },
  })

  let updatedCount = 0

  for (const proposal of proposals) {
    const content = proposal.content as ProposalContent | null
    if (!content?.sections) continue

    let dirty = false
    const nextSections = content.sections.map(section => {
      if (section.type !== 'scope' || !Array.isArray(section.items)) return section
      const nextItems = section.items.map((item: ScopeItem) => {
        if (item.type !== undefined && item.quantity !== undefined) return item
        dirty = true
        return {
          ...item,
          type:     item.type     ?? 'DELIVERABLE',
          quantity: item.quantity ?? 1,
        }
      })
      return { ...section, items: nextItems }
    })

    if (!dirty) continue

    updatedCount++
    if (apply) {
      await prisma.proposal.update({
        where: { id: proposal.id },
        data:  { content: toJsonSafe({ ...content, sections: nextSections }) },
      })
      console.log(`  ✓ updated "${proposal.title}" (${proposal.id})`)
    } else {
      console.log(`  ~ would update "${proposal.title}" (${proposal.id})`)
    }
  }

  if (updatedCount === 0) {
    console.log('Nothing to update — all scope items already have type + quantity.')
  } else if (apply) {
    console.log(`\nUpdated ${updatedCount} proposal(s).`)
  } else {
    console.log(`\nDry-run: ${updatedCount} proposal(s) would be updated. Pass --apply to write.`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
