/**
 * scripts/backfill-workspace-ids.ts
 *
 * Fills in the denormalized `workspaceId` column on Phase, Account, LineItem,
 * and ProjectMember rows that were created before the A1 migration.
 *
 * Usage:
 *   npx tsx scripts/backfill-workspace-ids.ts          # dry-run (no writes)
 *   npx tsx scripts/backfill-workspace-ids.ts --apply  # apply changes
 *
 * Idempotent: every query is WHERE workspaceId IS NULL, so re-running after
 * a partial failure is safe. Rows already filled are skipped.
 *
 * Walk order:
 *   Budget → Phase            (Budget.workspaceId → Phase.workspaceId)
 *   Phase  → Account          (Phase.workspaceId  → Account.workspaceId)
 *   Account → LineItem        (Account.workspaceId → LineItem.workspaceId)
 *   Project → ProjectMember   (Project.workspaceId → ProjectMember.workspaceId)
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const DRY_RUN = !process.argv.includes('--apply')

// ── helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(msg + '\n')
}

function banner(title: string) {
  log(`\n─── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`)
}

async function updateMany(
  model: string,
  count: number,
  fn: () => Promise<{ count: number }>
): Promise<number> {
  if (count === 0) {
    log(`  ${model}: 0 rows need filling — skipping`)
    return 0
  }
  log(`  ${model}: ${count} rows need filling${DRY_RUN ? ' (dry-run)' : ''}`)
  if (DRY_RUN) return count
  const result = await fn()
  log(`  ${model}: ✓ ${result.count} rows updated`)
  return result.count
}

// ── Phase ─────────────────────────────────────────────────────────────────────

async function backfillPhases() {
  banner('Phase ← Budget.workspaceId')

  // Count first so we can report accurately in dry-run
  const unfilled = await db.phase.count({ where: { workspaceId: null } })

  await updateMany('Phase', unfilled, async () => {
    // Prisma doesn't support cross-table UPDATE ... FROM in updateMany,
    // so we pull the mapping and batch-update in chunks.
    const phases = await db.phase.findMany({
      where: { workspaceId: null },
      select: { id: true, budgetId: true },
    })

    const budgetIds = [...new Set(phases.map(p => p.budgetId))]
    const budgets = await db.budget.findMany({
      where: { id: { in: budgetIds } },
      select: { id: true, workspaceId: true },
    })
    const budgetMap = new Map(budgets.map(b => [b.id, b.workspaceId]))

    let updated = 0
    const CHUNK = 500
    for (let i = 0; i < phases.length; i += CHUNK) {
      const chunk = phases.slice(i, i + CHUNK)
      await Promise.all(
        chunk.map(p => {
          const wid = budgetMap.get(p.budgetId)
          if (!wid) return Promise.resolve()
          return db.phase.update({ where: { id: p.id }, data: { workspaceId: wid } })
        })
      )
      updated += chunk.length
    }
    return { count: updated }
  })
}

// ── Account ───────────────────────────────────────────────────────────────────

async function backfillAccounts() {
  banner('Account ← Phase.workspaceId')

  const unfilled = await db.account.count({ where: { workspaceId: null } })

  await updateMany('Account', unfilled, async () => {
    const accounts = await db.account.findMany({
      where: { workspaceId: null },
      select: { id: true, phaseId: true },
    })

    const phaseIds = [...new Set(accounts.map(a => a.phaseId))]
    const phases = await db.phase.findMany({
      where: { id: { in: phaseIds } },
      select: { id: true, workspaceId: true },
    })
    const phaseMap = new Map(phases.map(p => [p.id, p.workspaceId]))

    let updated = 0
    const CHUNK = 500
    for (let i = 0; i < accounts.length; i += CHUNK) {
      const chunk = accounts.slice(i, i + CHUNK)
      await Promise.all(
        chunk.map(a => {
          const wid = phaseMap.get(a.phaseId)
          if (!wid) return Promise.resolve()
          return db.account.update({ where: { id: a.id }, data: { workspaceId: wid } })
        })
      )
      updated += chunk.length
    }
    return { count: updated }
  })
}

// ── LineItem ──────────────────────────────────────────────────────────────────

async function backfillLineItems() {
  banner('LineItem ← Account.workspaceId')

  const unfilled = await db.lineItem.count({ where: { workspaceId: null } })

  await updateMany('LineItem', unfilled, async () => {
    const items = await db.lineItem.findMany({
      where: { workspaceId: null },
      select: { id: true, accountId: true },
    })

    const accountIds = [...new Set(items.map(i => i.accountId))]
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, workspaceId: true },
    })
    const accountMap = new Map(accounts.map(a => [a.id, a.workspaceId]))

    let updated = 0
    const CHUNK = 500
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK)
      await Promise.all(
        chunk.map(item => {
          const wid = accountMap.get(item.accountId)
          if (!wid) return Promise.resolve()
          return db.lineItem.update({ where: { id: item.id }, data: { workspaceId: wid } })
        })
      )
      updated += chunk.length
    }
    return { count: updated }
  })
}

// ── ProjectMember ─────────────────────────────────────────────────────────────

async function backfillProjectMembers() {
  banner('ProjectMember ← Project.workspaceId')

  const unfilled = await db.projectMember.count({ where: { workspaceId: null } })

  await updateMany('ProjectMember', unfilled, async () => {
    const members = await db.projectMember.findMany({
      where: { workspaceId: null },
      select: { id: true, projectId: true },
    })

    const projectIds = [...new Set(members.map(m => m.projectId))]
    const projects = await db.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, workspaceId: true },
    })
    const projectMap = new Map(projects.map(p => [p.id, p.workspaceId]))

    let updated = 0
    const CHUNK = 500
    for (let i = 0; i < members.length; i += CHUNK) {
      const chunk = members.slice(i, i + CHUNK)
      await Promise.all(
        chunk.map(m => {
          const wid = projectMap.get(m.projectId)
          if (!wid) return Promise.resolve()
          return db.projectMember.update({ where: { id: m.id }, data: { workspaceId: wid } })
        })
      )
      updated += chunk.length
    }
    return { count: updated }
  })
}

// ── Summary ───────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${'='.repeat(60)}`)
  log(`  Backfill workspaceId — ${DRY_RUN ? 'DRY RUN (pass --apply to write)' : 'APPLYING CHANGES'}`)
  log(`${'='.repeat(60)}`)

  await backfillPhases()
  await backfillAccounts()
  await backfillLineItems()
  await backfillProjectMembers()

  // Final counts
  banner('Summary')
  const [phases, accounts, lineItems, members] = await Promise.all([
    db.phase.count({ where: { workspaceId: null } }),
    db.account.count({ where: { workspaceId: null } }),
    db.lineItem.count({ where: { workspaceId: null } }),
    db.projectMember.count({ where: { workspaceId: null } }),
  ])
  log(`  Remaining unfilled rows after run:`)
  log(`    Phase:         ${phases}`)
  log(`    Account:       ${accounts}`)
  log(`    LineItem:      ${lineItems}`)
  log(`    ProjectMember: ${members}`)

  if (!DRY_RUN && phases + accounts + lineItems + members === 0) {
    log(`\n  ✓ All rows backfilled. IDOR surface closed.\n`)
  } else if (DRY_RUN) {
    log(`\n  (dry-run — no writes made)\n`)
  } else {
    log(`\n  ⚠ Some rows still unfilled — check for orphaned records.\n`)
  }
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
