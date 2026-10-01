// Role rows + memberships (roles Phase 1). Server-only; plain module, not
// 'use server'. Every place that puts a user into a workspace or changes their
// role calls setWorkspaceMembership, so WorkspaceMember stays in step with the
// legacy User.role until enforcement reads from it (Phase 2).
//
// Uses the raw client: callers have already established the workspace (a
// gate, a token-verified invitation, or a verified Clerk webhook).

import type { Prisma, ProjectTeamRole, UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { WORKSPACE_ROLE_PRESETS, PROJECT_ROLE_PRESETS, legacyRoleFor } from '@/lib/permissions'

type Client = typeof db | Prisma.TransactionClient

export type ProjectRoleKey = ProjectTeamRole | 'TEAM_MEMBER'

/**
 * Seed the system workspace roles and project roles for a workspace if they
 * aren't there yet. Idempotent (unique on workspaceId + systemKey / name).
 */
export async function ensureSystemRoles(workspaceId: string, client: Client = db) {
  await client.workspaceRole.createMany({
    data: WORKSPACE_ROLE_PRESETS.map(p => ({
      workspaceId,
      systemKey:            p.systemKey,
      name:                 p.name,
      order:                p.order,
      projectScope:         p.projectScope,
      workspacePermissions: p.workspacePermissions,
      projectBaseline:      p.projectBaseline,
    })),
    skipDuplicates: true,
  })
  await client.projectRole.createMany({
    data: PROJECT_ROLE_PRESETS.map(p => ({
      workspaceId,
      systemKey:   p.systemKey,
      name:        p.name,
      order:       p.order,
      permissions: p.permissions,
    })),
    skipDuplicates: true,
  })
}

/** The seeded workspace role matching a legacy UserRole. */
export async function systemWorkspaceRoleId(workspaceId: string, key: UserRole, client: Client = db) {
  const find = () => client.workspaceRole.findFirst({ where: { workspaceId, systemKey: key }, select: { id: true } })
  let role = await find()
  if (!role) {
    await ensureSystemRoles(workspaceId, client)
    role = await find()
  }
  if (!role) throw new Error(`System workspace role ${key} missing for ${workspaceId}`)
  return role.id
}

/** The project role id that replaces a legacy team slot (or Team member). */
export async function systemProjectRoleId(workspaceId: string, key: ProjectRoleKey, client: Client = db) {
  const find = () => client.projectRole.findFirst({ where: { workspaceId, systemKey: key }, select: { id: true } })
  let role = await find()
  if (!role) {
    await ensureSystemRoles(workspaceId, client)
    role = await find()
  }
  if (!role) throw new Error(`System project role ${key} missing for ${workspaceId}`)
  return role.id
}

/**
 * The legacy User.role an invitation grants when it's ACCEPTED: from its
 * workspace role as that role is now (it may have been edited since the
 * invite was sent), else the role stored on the invitation.
 */
export async function legacyRoleForInvite(
  invite: { role: UserRole; roleId: string | null }, workspaceId: string, client: Client = db,
): Promise<UserRole> {
  if (!invite.roleId) return invite.role
  const role = await client.workspaceRole.findFirst({ where: { id: invite.roleId, workspaceId } })
  return role ? legacyRoleFor(role) : invite.role
}

/**
 * Record that `userId` is a member of `workspaceId` with the system role
 * matching the legacy `role`. Creates or updates the membership.
 */
export async function setWorkspaceMembership(
  args: { userId: string; workspaceId: string; role: UserRole; roleId?: string | null },
  client: Client = db,
) {
  // A specific (possibly custom) role wins when it's still in this workspace.
  const chosen = args.roleId
    ? await client.workspaceRole.findFirst({ where: { id: args.roleId, workspaceId: args.workspaceId }, select: { id: true } })
    : null
  const roleId = chosen?.id ?? await systemWorkspaceRoleId(args.workspaceId, args.role, client)
  await client.workspaceMember.upsert({
    where:  { workspaceId_userId: { workspaceId: args.workspaceId, userId: args.userId } },
    create: { workspaceId: args.workspaceId, userId: args.userId, roleId },
    update: { roleId },
  })
}

export async function removeWorkspaceMembership(
  args: { userId: string; workspaceId: string },
  client: Client = db,
) {
  await client.workspaceMember.deleteMany({ where: { workspaceId: args.workspaceId, userId: args.userId } })
}

/**
 * Create a membership only if there isn't one — for event paths (webhooks)
 * that may land after a richer write (e.g. an accepted invite's custom role)
 * and must not overwrite it.
 */
export async function ensureWorkspaceMembership(args: { userId: string; workspaceId: string; role: UserRole }) {
  try {
    const existing = await db.workspaceMember.findFirst({ where: { workspaceId: args.workspaceId, userId: args.userId }, select: { id: true } })
    if (!existing) await setWorkspaceMembership(args)
  } catch (err) {
    console.error('[roles] ensure membership failed (non-fatal):', err)
  }
}

/**
 * Best-effort wrapper for paths where the membership mirror must never block
 * the main operation (sign-up, webhooks). Logs and continues on failure.
 */
export async function syncWorkspaceMembership(args: { userId: string; workspaceId: string; role: UserRole; roleId?: string | null }) {
  try {
    await setWorkspaceMembership(args)
  } catch (err) {
    console.error('[roles] membership sync failed (non-fatal):', err)
  }
}
