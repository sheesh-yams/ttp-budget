// Role rows + memberships. Server-only; plain module, not 'use server'. Every
// place that puts a user into a workspace or changes their role goes through
// setWorkspaceMembership — WorkspaceMember is the single source of a person's
// role in a workspace (the legacy User.role is gone).
//
// Uses the raw client: callers have already established the workspace (a
// gate, a token-verified invitation, or a verified Clerk webhook).

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { WORKSPACE_ROLE_PRESETS, PROJECT_ROLE_PRESETS, type SystemRoleKey } from '@/lib/permissions'

type Client = typeof db | Prisma.TransactionClient

export type ProjectRoleKey = 'PROJECT_LEAD' | 'ACCOUNT_MANAGER' | 'PROJECT_MANAGER' | 'TEAM_MEMBER'

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

/** The seeded built-in workspace role with this key. */
export async function systemWorkspaceRoleId(workspaceId: string, key: SystemRoleKey, client: Client = db) {
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
 * Record that `userId` is a member of `workspaceId` with `roleId` (a specific,
 * possibly custom role) — or, if that's missing / no longer in this workspace,
 * the built-in role `fallback`. Creates or updates the membership.
 */
export async function setWorkspaceMembership(
  args: { userId: string; workspaceId: string; fallback: SystemRoleKey; roleId?: string | null },
  client: Client = db,
) {
  // A specific (possibly custom) role wins when it's still in this workspace.
  const chosen = args.roleId
    ? await client.workspaceRole.findFirst({ where: { id: args.roleId, workspaceId: args.workspaceId }, select: { id: true } })
    : null
  const roleId = chosen?.id ?? await systemWorkspaceRoleId(args.workspaceId, args.fallback, client)
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
export async function ensureWorkspaceMembership(args: { userId: string; workspaceId: string; fallback: SystemRoleKey; roleId?: string | null }) {
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
export async function syncWorkspaceMembership(args: { userId: string; workspaceId: string; fallback: SystemRoleKey; roleId?: string | null }) {
  try {
    await setWorkspaceMembership(args)
  } catch (err) {
    console.error('[roles] membership sync failed (non-fatal):', err)
  }
}
