/**
 * scripts/dedupe-workspaces.ts
 *
 * Finds workspaces with duplicate names that share an OWNER user,
 * keeps the one with the most projects (tie-break: oldest createdAt),
 * and deletes the empty shells from both Clerk and the database.
 *
 * Usage:
 *   npx tsx scripts/dedupe-workspaces.ts --dry   # preview only, no changes
 *   npx tsx scripts/dedupe-workspaces.ts          # execute deletions
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'

const db = new PrismaClient()
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

const DRY = process.argv.includes('--dry')

async function main() {
  console.log(DRY ? '🔍 DRY RUN — no changes will be made\n' : '🚨 LIVE RUN — changes will be executed\n')

  // Fetch all workspaces with their OWNER user and project count
  const workspaces = await db.workspace.findMany({
    include: {
      users: {
        where: { role: 'OWNER' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { id: true, clerkId: true, email: true },
      },
      _count: { select: { projects: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Group workspaces by (ownerEmail, workspaceName) — case-insensitive name
  type WS = typeof workspaces[number]
  const groups = new Map<string, WS[]>()

  for (const ws of workspaces) {
    const ownerEmail = ws.users[0]?.email ?? '__no-owner__'
    const key = `${ownerEmail}::${ws.name.trim().toLowerCase()}`
    const existing = groups.get(key) ?? []
    existing.push(ws)
    groups.set(key, existing)
  }

  // Only care about groups with more than one workspace
  const dupeGroups = [...groups.entries()].filter(([, ws]) => ws.length > 1)

  if (dupeGroups.length === 0) {
    console.log('✅ No duplicate workspaces found.')
    return
  }

  console.log(`Found ${dupeGroups.length} duplicate group(s):\n`)

  let totalDeleted = 0

  for (const [key, group] of dupeGroups) {
    const [ownerEmail, name] = key.split('::')
    console.log(`── Group: "${name}" (owner: ${ownerEmail})`)

    // Canonical = most projects; tie-break = oldest createdAt (already sorted)
    const sorted = [...group].sort((a, b) => {
      const diff = b._count.projects - a._count.projects
      return diff !== 0 ? diff : a.createdAt.getTime() - b.createdAt.getTime()
    })

    const canonical = sorted[0]
    const toDelete = sorted.slice(1)

    console.log(`   ✔  Keep:   id=${canonical.id}  projects=${canonical._count.projects}  clerkOrgId=${canonical.clerkOrgId ?? 'none'}`)
    for (const ws of toDelete) {
      console.log(`   ✗  Delete: id=${ws.id}  projects=${ws._count.projects}  clerkOrgId=${ws.clerkOrgId ?? 'none'}`)
    }

    if (!DRY) {
      for (const ws of toDelete) {
        // Delete Clerk org if one is linked
        if (ws.clerkOrgId) {
          try {
            await clerk.organizations.deleteOrganization(ws.clerkOrgId)
            console.log(`   🗑  Deleted Clerk org ${ws.clerkOrgId}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.warn(`   ⚠  Could not delete Clerk org ${ws.clerkOrgId}: ${msg}`)
          }
        }
        // Delete DB workspace (cascades to projects, clients, etc.)
        await db.workspace.delete({ where: { id: ws.id } })
        console.log(`   🗑  Deleted DB workspace ${ws.id}`)
        totalDeleted++
      }
    } else {
      totalDeleted += toDelete.length
    }

    console.log()
  }

  if (DRY) {
    console.log(`\nDry run complete. Would delete ${totalDeleted} workspace(s).`)
    console.log('Run without --dry to execute.\n')
  } else {
    console.log(`\n✅ Done. Deleted ${totalDeleted} workspace(s).\n`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
