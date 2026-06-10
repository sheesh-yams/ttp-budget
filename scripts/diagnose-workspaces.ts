/**
 * Diagnostic script — shows the full workspace/user state so we know exactly
 * which workspace is the live one and where everyone currently sits.
 *
 * Usage:
 *   npx ts-node scripts/diagnose-workspaces.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  WORKSPACE DIAGNOSTIC')
  console.log('══════════════════════════════════════════\n')

  // ── All workspaces ────────────────────────────────────────────────────────
  const workspaces = await db.workspace.findMany({
    select: { id: true, name: true, clerkOrgId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`WORKSPACES (${workspaces.length} total):`)
  workspaces.forEach(w => {
    const orgStatus = w.clerkOrgId ? `clerkOrgId=${w.clerkOrgId}` : '⚠️  clerkOrgId=null (not linked to any Clerk org)'
    console.log(`  [${w.createdAt.toISOString().slice(0, 10)}] ${w.id}  "${w.name}"`)
    console.log(`    ${orgStatus}`)
  })

  // ── All users ─────────────────────────────────────────────────────────────
  console.log('\nUSERS:')
  const users = await db.user.findMany({
    select: {
      id: true, clerkId: true, email: true, name: true,
      role: true, workspaceId: true, onboarded: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  users.forEach(u => {
    const ws = workspaces.find(w => w.id === u.workspaceId)
    const wsLabel = ws ? `"${ws.name}" (${ws.id})` : `UNKNOWN (${u.workspaceId})`
    console.log(`  ${u.email}  "${u.name ?? ''}"`)
    console.log(`    role=${u.role}  onboarded=${u.onboarded}`)
    console.log(`    workspaceId → ${wsLabel}`)
    console.log(`    clerkId=${u.clerkId}`)
    console.log()
  })

  // ── Summary / recommendations ─────────────────────────────────────────────
  const nullOrgWorkspaces = workspaces.filter(w => !w.clerkOrgId)
  const linkedWorkspaces  = workspaces.filter(w =>  w.clerkOrgId)

  console.log('══════════════════════════════════════════')
  console.log('SUMMARY:')
  console.log(`  ${linkedWorkspaces.length} workspace(s) linked to a Clerk org (these work with auth)`)
  console.log(`  ${nullOrgWorkspaces.length} workspace(s) with clerkOrgId=null (auth will fail for these)`)

  if (nullOrgWorkspaces.length > 0) {
    console.log('\n⚠️  PROBLEM: Workspaces with null clerkOrgId cannot be resolved by the')
    console.log('   webhook or auth middleware. Users in these workspaces may be in the')
    console.log('   wrong place.\n')
    nullOrgWorkspaces.forEach(w => {
      const members = users.filter(u => u.workspaceId === w.id)
      console.log(`   "${w.name}" (${w.id}): ${members.length} user(s) → ${members.map(u => u.email).join(', ')}`)
    })
  }

  console.log('\n══════════════════════════════════════════\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
