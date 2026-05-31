/**
 * scripts/fix-workspace-links.ts
 *
 * Audits and repairs the Clerk org ↔ DB workspace mapping for your account.
 *
 * What it does:
 *   1. Lists all Clerk orgs you belong to
 *   2. Lists all DB workspaces
 *   3. Shows which orgs have no matching DB workspace (broken link)
 *   4. Shows which DB workspaces have no clerkOrgId (unlinked)
 *   5. With --fix: deletes orphan Clerk orgs (no DB workspace) and removes
 *      stale clerkOrgId values pointing to the wrong workspace
 *
 * Usage:
 *   npx tsx scripts/fix-workspace-links.ts            # audit only
 *   npx tsx scripts/fix-workspace-links.ts --fix      # repair
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'

const db = new PrismaClient()
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

const FIX = process.argv.includes('--fix')

async function main() {
  console.log(FIX ? '🔧 FIX MODE\n' : '🔍 AUDIT MODE (run with --fix to repair)\n')

  // ── 1. Load Clerk orgs for your account ──────────────────────────────────────
  const myClerkId = process.env.MY_CLERK_USER_ID
  if (!myClerkId) {
    // Fall back to finding OWNER users in DB
    console.log('Tip: set MY_CLERK_USER_ID in .env.local to scope to your account only.\n')
  }

  // List ALL Clerk orgs (up to 100)
  const clerkOrgs = await clerk.organizations.getOrganizationList({ limit: 100 })
  console.log(`Clerk orgs found: ${clerkOrgs.data.length}`)
  clerkOrgs.data.forEach(o => console.log(`  ${o.id}  "${o.name}"`))
  console.log()

  // ── 2. Load all DB workspaces ─────────────────────────────────────────────────
  const dbWorkspaces = await db.workspace.findMany({
    include: {
      users: { where: { role: 'OWNER' }, take: 1, select: { email: true } },
      _count: { select: { projects: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`DB workspaces found: ${dbWorkspaces.length}`)
  dbWorkspaces.forEach(w =>
    console.log(`  ${w.id}  "${w.name}"  clerkOrgId=${w.clerkOrgId ?? 'NULL'}  projects=${w._count.projects}`)
  )
  console.log()

  // ── 3. Find orphan Clerk orgs (no matching DB workspace) ──────────────────────
  const clerkOrgIds = new Set(clerkOrgs.data.map(o => o.id))
  const dbOrgIds    = new Set(dbWorkspaces.map(w => w.clerkOrgId).filter(Boolean) as string[])

  const orphanClerkOrgs = clerkOrgs.data.filter(o => !dbOrgIds.has(o.id))
  console.log(`Orphan Clerk orgs (no matching DB workspace): ${orphanClerkOrgs.length}`)
  orphanClerkOrgs.forEach(o => console.log(`  ✗ ${o.id}  "${o.name}"`))
  console.log()

  // ── 4. Find DB workspaces with wrong/missing clerkOrgId ───────────────────────
  const unlinkedWorkspaces = dbWorkspaces.filter(w => !w.clerkOrgId)
  const wrongLinkWorkspaces = dbWorkspaces.filter(
    w => w.clerkOrgId && !clerkOrgIds.has(w.clerkOrgId)
  )

  console.log(`DB workspaces with no clerkOrgId: ${unlinkedWorkspaces.length}`)
  unlinkedWorkspaces.forEach(w => console.log(`  ⚠  ${w.id}  "${w.name}"`))
  console.log()

  console.log(`DB workspaces with stale clerkOrgId (Clerk org not found): ${wrongLinkWorkspaces.length}`)
  wrongLinkWorkspaces.forEach(w =>
    console.log(`  ⚠  ${w.id}  "${w.name}"  clerkOrgId=${w.clerkOrgId}`)
  )
  console.log()

  // ── 5. Duplicates by name ─────────────────────────────────────────────────────
  const nameGroups = new Map<string, typeof dbWorkspaces>()
  for (const w of dbWorkspaces) {
    const key = w.name.trim().toLowerCase()
    nameGroups.set(key, [...(nameGroups.get(key) ?? []), w])
  }
  const dupes = [...nameGroups.values()].filter(g => g.length > 1)
  console.log(`Duplicate workspace names: ${dupes.length} group(s)`)
  dupes.forEach(group => {
    console.log(`  "${group[0].name}":`)
    group.forEach(w =>
      console.log(`    ${w.id}  clerkOrgId=${w.clerkOrgId ?? 'NULL'}  projects=${w._count.projects}`)
    )
  })
  console.log()

  if (!FIX) {
    console.log('Run with --fix to repair orphan Clerk orgs and stale clerkOrgId values.')
    return
  }

  // ── Fix: delete orphan Clerk orgs ─────────────────────────────────────────────
  for (const org of orphanClerkOrgs) {
    try {
      await clerk.organizations.deleteOrganization(org.id)
      console.log(`🗑  Deleted orphan Clerk org ${org.id} "${org.name}"`)
    } catch (err) {
      console.warn(`⚠  Could not delete Clerk org ${org.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Fix: clear stale clerkOrgId on DB workspaces ─────────────────────────────
  for (const w of wrongLinkWorkspaces) {
    await db.$executeRawUnsafe(
      `UPDATE "Workspace" SET "clerkOrgId" = NULL WHERE id = $1`,
      w.id
    )
    console.log(`🔧 Cleared stale clerkOrgId from workspace "${w.name}" (${w.id})`)
  }

  // ── Fix: dedupe — keep workspace with most projects per name group ────────────
  for (const group of dupes) {
    const sorted = [...group].sort((a, b) =>
      b._count.projects - a._count.projects || a.createdAt.getTime() - b.createdAt.getTime()
    )
    const keep    = sorted[0]
    const remove  = sorted.slice(1)

    console.log(`\nDeduping "${keep.name}": keeping ${keep.id} (${keep._count.projects} projects)`)
    for (const w of remove) {
      if (w.clerkOrgId) {
        try {
          await clerk.organizations.deleteOrganization(w.clerkOrgId)
          console.log(`  🗑  Deleted Clerk org ${w.clerkOrgId}`)
        } catch (err) {
          console.warn(`  ⚠  Could not delete Clerk org ${w.clerkOrgId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      await db.workspace.delete({ where: { id: w.id } })
      console.log(`  🗑  Deleted DB workspace ${w.id} (${w._count.projects} projects)`)
    }
  }

  console.log('\n✅ Done. Reload the app and run the audit again to verify.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
