/**
 * scripts/backfill-clerk-orgs.ts
 *
 * One-time migration: for every Workspace that has clerkOrgId === null,
 * create a corresponding Clerk organization, add the OWNER as admin, and
 * store the org ID on the Workspace row.
 *
 * Safe to run multiple times — it skips Workspaces that already have a clerkOrgId.
 *
 * Usage:
 *   npx tsx scripts/backfill-clerk-orgs.ts
 *
 * Requires CLERK_SECRET_KEY and DATABASE_URL to be set in .env.local or env.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'

const db = new PrismaClient()
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

async function main() {
  const workspaces = await db.workspace.findMany({
    where: { clerkOrgId: null },
    include: {
      users: {
        where: { role: 'OWNER' },
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  console.log(`Found ${workspaces.length} workspace(s) without a Clerk org.`)

  for (const workspace of workspaces) {
    const owner = workspace.users[0]
    if (!owner) {
      console.warn(`  ⚠ Workspace "${workspace.name}" (${workspace.id}) has no OWNER — skipping.`)
      continue
    }

    try {
      // Create Clerk org
      const org = await clerk.organizations.createOrganization({
        name: workspace.name,
        createdBy: owner.clerkId,
      })

      // Store clerkOrgId on the workspace
      await db.workspace.update({
        where: { id: workspace.id },
        data: { clerkOrgId: org.id },
      })

      console.log(`  ✓ "${workspace.name}" → Clerk org ${org.id}`)
    } catch (err) {
      console.error(`  ✗ Failed for "${workspace.name}" (${workspace.id}):`, err)
    }
  }

  console.log('Done.')
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
