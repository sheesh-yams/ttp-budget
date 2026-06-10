/**
 * One-time script: move an invited user into the correct workspace.
 *
 * Run after adding the user to the Clerk org manually via the Clerk Dashboard.
 *
 * Usage:
 *   npx ts-node scripts/fix-invited-user.ts
 */

// Load .env.local so DATABASE_URL is available without any CLI wrapper
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ── Config — edit before running ──────────────────────────────────────────────
const INVITED_USER_EMAIL  = 'sara.reza@gmail.com'   // update to Sara's actual email if different
const INVITED_USER_NAME   = 'Sara Reza'              // used as fallback search if email doesn't match
const TARGET_WORKSPACE_ID = 'cmq89lp7f0000gfgg6mevwd5u' // hardcode the correct workspace ID
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find the target workspace by ID
  const workspace = await db.workspace.findUnique({
    where: { id: TARGET_WORKSPACE_ID },
    select: { id: true, name: true, clerkOrgId: true },
  })

  if (!workspace) {
    console.error(`❌ No workspace found with id "${TARGET_WORKSPACE_ID}"`)
    process.exit(1)
  }
  console.log(`✓ Target workspace: "${workspace.name}" (${workspace.id})`)
  console.log(`  Clerk org ID: ${workspace.clerkOrgId ?? '⚠️  null — onboarding incomplete'}`)

  // 2. Find Sara's user record (by email first, then name)
  let user = await db.user.findFirst({
    where: { email: { contains: INVITED_USER_EMAIL, mode: 'insensitive' } },
    select: { id: true, clerkId: true, email: true, name: true, workspaceId: true, role: true },
  })

  if (!user) {
    console.log(`  No user found with email "${INVITED_USER_EMAIL}", trying name search…`)
    user = await db.user.findFirst({
      where: { name: { contains: INVITED_USER_NAME, mode: 'insensitive' } },
      select: { id: true, clerkId: true, email: true, name: true, workspaceId: true, role: true },
    })
  }

  if (!user) {
    console.error(`❌ No user found matching email "${INVITED_USER_EMAIL}" or name "${INVITED_USER_NAME}"`)
    console.log('\nAll users in DB:')
    const allUsers = await db.user.findMany({
      select: { id: true, email: true, name: true, workspaceId: true },
    })
    allUsers.forEach(u => console.log(`  ${u.email}  "${u.name ?? ''}"  workspace=${u.workspaceId}`))
    process.exit(1)
  }

  console.log(`\n✓ Found user: "${user.name ?? '(no name)'}" <${user.email}>`)
  console.log(`  DB id:       ${user.id}`)
  console.log(`  Clerk id:    ${user.clerkId}`)
  console.log(`  Current workspace: ${user.workspaceId}`)

  // 3. Move the user (or just fix their role if already in the right workspace)
  const alreadyThere = user.workspaceId === workspace.id
  if (alreadyThere) {
    console.log('\n⚠️  User is already in the correct workspace — but will fix role to PRODUCER.')
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      workspaceId: workspace.id,
      role: 'PRODUCER',
      onboarded: true,
    },
    select: { id: true, email: true, workspaceId: true, role: true },
  })

  console.log(alreadyThere
    ? `\n✅ Role fixed for user in workspace "${workspace.name}"`
    : `\n✅ User moved to workspace "${workspace.name}"`)
  console.log(`   workspaceId: ${updated.workspaceId}`)
  console.log(`   role:        ${updated.role}`)
  console.log(`\nNEXT STEP: Make sure Sara is also a member of the Clerk org "${workspace.clerkOrgId}".`)
  console.log('Go to: Clerk Dashboard → Organizations → The Third Place → Members → Add member')
  console.log('Search for Sara by email and add her as "Member". That fires the webhook, but')
  console.log('the DB is already fixed so she\'ll have access immediately on next sign-in.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
