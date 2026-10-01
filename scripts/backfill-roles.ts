/**
 * backfill-roles.ts — roles Phase 1 backfill (migration 20261001000001).
 *
 * Seeds the system roles in every workspace and writes the rows the new
 * tables need to mirror today's state:
 *   1. 3 workspace roles + 4 project roles per workspace (src/lib/permissions.ts presets)
 *   2. WorkspaceMember per user per workspace they belong to:
 *        home workspace → User.role
 *        other Clerk orgs → Clerk admin = Owner, else their invitation's role.
 *        No invitation (would default to Producer) is AMBIGUOUS → skipped, listed.
 *        Clerk orgs with no linked workspace → skipped, listed.
 *   3. ProjectTeamMember.projectRoleId from the legacy slot enum
 *   4. a "Team member" row for every ProjectAssignment with no active team row
 *
 * Dry run by default (prints the plan, writes nothing):
 *   npx tsx scripts/backfill-roles.ts
 * Apply (one transaction per workspace; every write re-checks its condition;
 * one AuditEvent per changed row):
 *   npx tsx scripts/backfill-roles.ts --apply
 * Idempotent — a second run finds nothing to do.
 */

import { createClerkClient } from '@clerk/backend'
import type { UserRole } from '@prisma/client'
import { db } from '../src/lib/db'
import { ensureSystemRoles } from '../src/lib/roles'

const APPLY = process.argv.includes('--apply')
const ACTOR = null // system task

type MembershipPlan = { userId: string; email: string; workspaceId: string; workspaceName: string; role: UserRole; why: string }

async function plan() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
  const workspaces = await db.workspace.findMany({
    where:   { deletedAt: null } as never,
    select:  { id: true, name: true, clerkOrgId: true },
    orderBy: { createdAt: 'asc' },
  })
  const wsById  = new Map(workspaces.map(w => [w.id, w]))
  const orgToWs = new Map(workspaces.filter(w => w.clerkOrgId).map(w => [w.clerkOrgId!, w]))
  const existing = new Set((await db.workspaceMember.findMany({ select: { workspaceId: true, userId: true } })).map(m => `${m.workspaceId}:${m.userId}`))

  const memberships: MembershipPlan[] = []
  const skipped: string[] = []
  const users = await db.user.findMany({ select: { id: true, email: true, clerkId: true, role: true, workspaceId: true }, orderBy: { createdAt: 'asc' } })
  for (const u of users) {
    const add = (p: MembershipPlan) => {
      if (!existing.has(`${p.workspaceId}:${p.userId}`) && !memberships.some(m => m.workspaceId === p.workspaceId && m.userId === p.userId)) memberships.push(p)
    }
    const home = wsById.get(u.workspaceId)
    if (home) add({ userId: u.id, email: u.email, workspaceId: home.id, workspaceName: home.name, role: u.role, why: 'home workspace' })

    let orgs: { organization: { id: string; name: string }; role: string }[]
    try {
      orgs = (await clerk.users.getOrganizationMembershipList({ userId: u.clerkId, limit: 100 })).data as never
    } catch (e) {
      skipped.push(`${u.email}: Clerk lookup failed (${(e as Error).message?.slice(0, 80)})`)
      continue
    }
    for (const m of orgs) {
      const ws = orgToWs.get(m.organization.id)
      if (!ws) { skipped.push(`${u.email}: Clerk org "${m.organization.name}" has no linked workspace`); continue }
      if (ws.id === u.workspaceId) continue
      if (m.role === 'org:admin') {
        add({ userId: u.id, email: u.email, workspaceId: ws.id, workspaceName: ws.name, role: 'OWNER', why: 'Clerk admin' })
        continue
      }
      const invite = await db.workspaceInvitation.findFirst({
        where: { workspaceId: ws.id, email: u.email.toLowerCase() }, orderBy: { createdAt: 'desc' }, select: { role: true },
      })
      if (!invite) { skipped.push(`${u.email}: member of "${ws.name}" with no invitation — role ambiguous`); continue }
      add({ userId: u.id, email: u.email, workspaceId: ws.id, workspaceName: ws.name, role: invite.role, why: 'their invitation' })
    }
  }

  const slotRows = await db.projectTeamMember.findMany({
    where:  { projectRoleId: null, role: { not: null } },
    select: { id: true, workspaceId: true, role: true },
  })
  const assignments = await db.projectAssignment.findMany({ select: { projectId: true, userId: true, workspaceId: true, user: { select: { email: true } }, project: { select: { name: true } } } })
  const active = new Set((await db.projectTeamMember.findMany({ where: { unassignedAt: null }, select: { projectId: true, userId: true } })).map(a => `${a.projectId}:${a.userId}`))
  // Only people still in that workspace (a removed member's leftover
  // assignment must not become an active team row).
  const inWorkspace = (a: { workspaceId: string; userId: string }) =>
    existing.has(`${a.workspaceId}:${a.userId}`) ||
    memberships.some(m => m.workspaceId === a.workspaceId && m.userId === a.userId)
  const leftover = assignments.filter(a => !active.has(`${a.projectId}:${a.userId}`))
  const teamMemberRows = leftover.filter(inWorkspace)
  for (const a of leftover.filter(a => !inWorkspace(a))) {
    skipped.push(`${a.user.email}: assignment on "${a.project.name}" but not a member of that workspace — no team row`)
  }

  return { workspaces, memberships, skipped, slotRows, teamMemberRows }
}

async function main() {
  const p = await plan()
  console.log(`\nWorkspaces to seed roles in: ${p.workspaces.length}`)
  console.log(`\nMemberships to create (${p.memberships.length}):`)
  for (const m of p.memberships) console.log(`  ${m.email.padEnd(36)} ${m.workspaceName.padEnd(30)} ${m.role.padEnd(12)} (${m.why})`)
  console.log(`\nSkipped (${p.skipped.length}):`)
  for (const s of p.skipped) console.log(`  ${s}`)
  console.log(`\nTeam rows to map to project roles: ${p.slotRows.length}`)
  console.log(`Team member rows to create: ${p.teamMemberRows.length}`)
  for (const a of p.teamMemberRows) console.log(`  ${a.user.email.padEnd(36)} ${a.project.name}`)

  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); return }

  for (const ws of p.workspaces) {
    await db.$transaction(async (tx) => {
      const before = await tx.workspaceRole.count({ where: { workspaceId: ws.id } }) + await tx.projectRole.count({ where: { workspaceId: ws.id } })
      await ensureSystemRoles(ws.id, tx)
      const after = await tx.workspaceRole.count({ where: { workspaceId: ws.id } }) + await tx.projectRole.count({ where: { workspaceId: ws.id } })
      if (after > before) {
        await tx.auditEvent.create({ data: { workspaceId: ws.id, actorId: ACTOR, action: 'roles.seeded', entityType: 'Workspace', entityId: ws.id, metadata: { created: after - before, source: 'backfill-roles' } } })
      }
      const wsRoles = new Map((await tx.workspaceRole.findMany({ where: { workspaceId: ws.id, systemKey: { not: null } }, select: { id: true, systemKey: true } })).map(r => [r.systemKey!, r.id]))
      const prRoles = new Map((await tx.projectRole.findMany({ where: { workspaceId: ws.id, systemKey: { not: null } }, select: { id: true, systemKey: true } })).map(r => [r.systemKey!, r.id]))

      for (const m of p.memberships.filter(m => m.workspaceId === ws.id)) {
        // skipDuplicates re-checks "no membership yet" at write time.
        const { count } = await tx.workspaceMember.createMany({ data: [{ workspaceId: ws.id, userId: m.userId, roleId: wsRoles.get(m.role)! }], skipDuplicates: true })
        if (count) await tx.auditEvent.create({ data: { workspaceId: ws.id, actorId: ACTOR, action: 'member.role_backfilled', entityType: 'Member', entityId: m.userId, metadata: { role: m.role, why: m.why, source: 'backfill-roles' } } })
      }

      for (const r of p.slotRows.filter(r => r.workspaceId === ws.id)) {
        const { count } = await tx.projectTeamMember.updateMany({
          where: { id: r.id, projectRoleId: null, role: r.role },
          data:  { projectRoleId: prRoles.get(r.role!)! },
        })
        if (count) await tx.auditEvent.create({ data: { workspaceId: ws.id, actorId: ACTOR, action: 'project.team_role_backfilled', entityType: 'ProjectTeamMember', entityId: r.id, metadata: { slot: r.role, source: 'backfill-roles' } } })
      }

      for (const a of p.teamMemberRows.filter(a => a.workspaceId === ws.id)) {
        const onTeam = await tx.projectTeamMember.count({ where: { projectId: a.projectId, userId: a.userId, unassignedAt: null } })
        if (onTeam) continue
        const row = await tx.projectTeamMember.create({ data: { workspaceId: ws.id, projectId: a.projectId, userId: a.userId, role: null, projectRoleId: prRoles.get('TEAM_MEMBER')! } })
        await tx.auditEvent.create({ data: { workspaceId: ws.id, actorId: ACTOR, action: 'project.team_member_backfilled', entityType: 'Project', entityId: a.projectId, metadata: { userId: a.userId, teamRowId: row.id, source: 'backfill-roles' } } })
      }
    }, { timeout: 120_000 })
  }

  // Verified end state
  const after = await plan()
  const counts = await Promise.all(p.workspaces.map(async w => ({
    name: w.name,
    wsRoles: await db.workspaceRole.count({ where: { workspaceId: w.id } }),
    prRoles: await db.projectRole.count({ where: { workspaceId: w.id } }),
    members: await db.workspaceMember.count({ where: { workspaceId: w.id } }),
  })))
  console.log('\nEnd state:')
  for (const c of counts) console.log(`  ${c.name.padEnd(36)} workspace roles=${c.wsRoles} project roles=${c.prRoles} members=${c.members}`)
  console.log(`  remaining: memberships=${after.memberships.length} slot rows=${after.slotRows.length} team member rows=${after.teamMemberRows.length}`)
}

main().finally(() => db.$disconnect())
