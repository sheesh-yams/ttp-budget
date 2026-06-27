/**
 * scripts/backfill-deliverable-ids.ts
 *
 * Assigns a stable `id` to every entry in Phase.deliverables JSON that lacks
 * one, and converts bare-string entries into { id, title } objects.
 *
 * Usage:
 *   npx tsx scripts/backfill-deliverable-ids.ts          # dry-run (prints changes, no writes)
 *   npx tsx scripts/backfill-deliverable-ids.ts --apply  # apply changes
 *
 * Idempotent: entries that already have an `id` are left unchanged.
 *
 * The resulting shape is:
 *   { id: string; title: string; description?: string; sectionIds?: string[] }
 */

import { PrismaClient } from '@prisma/client'
import { toJsonSafe }   from '../src/lib/json-safe'
import { randomUUID }   from 'crypto'

const db     = new PrismaClient()
const DRY_RUN = !process.argv.includes('--apply')

// ─── Types ────────────────────────────────────────────────────────────────────

type RawDeliverable = string | { title?: string; id?: string; description?: string; number?: string; sectionIds?: string[] }

type Deliverable = {
  id:           string
  title:        string
  description?: string
  sectionIds?:  string[]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '[dry-run] No changes will be written.' : '[apply] Writing changes to DB.')
  console.log()

  const phases = await db.phase.findMany({
    where:  { deliverables: { not: null } },
    select: { id: true, budgetId: true, name: true, deliverables: true },
  })

  console.log(`Found ${phases.length} phase(s) with deliverables.`)
  console.log()

  let phasesUpdated  = 0
  let entriesUpdated = 0

  for (const phase of phases) {
    const raw = phase.deliverables
    if (!Array.isArray(raw) || raw.length === 0) continue

    const entries = raw as RawDeliverable[]
    let phaseChanged = false

    const updated: Deliverable[] = entries.map(entry => {
      // Already a well-formed deliverable with an id — leave it.
      if (typeof entry === 'object' && entry !== null && typeof entry.id === 'string' && entry.id.length > 0) {
        return {
          id:          entry.id,
          title:       entry.title ?? '',
          ...(entry.description ? { description: entry.description } : {}),
          ...(entry.sectionIds  ? { sectionIds: entry.sectionIds }   : {}),
        }
      }

      phaseChanged = true
      entriesUpdated++

      if (typeof entry === 'string') {
        // Bare string → convert to { id, title }
        return { id: randomUUID(), title: entry }
      }

      // Object missing id — preserve existing fields, add id
      return {
        id:          randomUUID(),
        title:       entry.title ?? '',
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.sectionIds  ? { sectionIds: entry.sectionIds }   : {}),
      }
    })

    if (!phaseChanged) continue

    phasesUpdated++

    console.log(`  Phase "${phase.name}" (${phase.id}) — ${entries.length} deliverable(s), ${entries.filter(e => !(typeof e === 'object' && e !== null && typeof (e as { id?: string }).id === 'string')).length} need id`)
    if (DRY_RUN) {
      console.log('    [dry-run] would write:', JSON.stringify(updated, null, 2).split('\n').map(l => '    ' + l).join('\n'))
    } else {
      await db.phase.update({
        where: { id: phase.id },
        data:  { deliverables: toJsonSafe(updated) },
      })
      console.log('    ✓ written')
    }
  }

  console.log()
  console.log('─────────────────────────────────────')
  console.log(`Phases examined : ${phases.length}`)
  console.log(`Phases updated  : ${phasesUpdated}`)
  console.log(`Entries updated : ${entriesUpdated}`)
  if (DRY_RUN && phasesUpdated > 0) {
    console.log()
    console.log('Re-run with --apply to write these changes.')
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
