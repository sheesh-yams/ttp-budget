/**
 * Move Sara to the correct workspace (ttp-workspace — the real one with a Clerk org).
 *
 * Usage:
 *   npx ts-node scripts/fix-sara-workspace.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const SARA_CLERK_ID     = 'user_3Ex6IQaJwzu2jRQoptv0CRBpwHM'
const TARGET_WORKSPACE  = 'ttp-workspace'  // Ashish + Roshni's real workspace

async function main() {
  const workspace = await db.workspace.findUnique({
    where: { id: TARGET_WORKSPACE },
    select: { id: true, name: true, clerkOrgId: true },
  })

  if (!workspace) {
    console.error('❌ Target workspace not found')
    process.exit(1)
  }

  console.log(`✓ Target: "${workspace.name}" (${workspace.id})`)
  console.log(`  clerkOrgId: ${workspace.clerkOrgId}`)

  const sara = await db.user.findUnique({
    where: { clerkId: SARA_CLERK_ID },
    select: { id: true, email: true, name: true, workspaceId: true, role: true },
  })

  if (!sara) {
    console.error('❌ Sara not found')
    process.exit(1)
  }

  console.log(`\n✓ Found: "${sara.name}" <${sara.email}>`)
  console.log(`  Current workspace: ${sara.workspaceId}`)
  console.log(`  Current role:      ${sara.role}`)

  if (sara.workspaceId === TARGET_WORKSPACE) {
    console.log('\n✅ Sara is already in the correct workspace.')
    process.exit(0)
  }

  await db.user.update({
    where: { clerkId: SARA_CLERK_ID },
    data: { workspaceId: TARGET_WORKSPACE, role: 'PRODUCER', onboarded: true },
  })

  console.log('\n✅ Sara moved to the correct workspace!')
  console.log(`   workspaceId: ${TARGET_WORKSPACE}`)
  console.log(`   role:        PRODUCER`)
  console.log('\nSara needs to sign out and sign back in to see the workspace.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
