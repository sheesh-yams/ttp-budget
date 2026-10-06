/**
 * Settings → Roles logic (roles Phase 3): workspace roles, project roles, and
 * assigning people to workspace roles. Plain module — the 'use server'
 * wrappers in src/server/actions/roles.ts gate (requireTeamAdmin) and pass the
 * caller in as `g`; this file never checks the session itself.
 *
 * Rules:
 *  - Up to MAX_ROLES of each kind. Names unique per workspace.
 *  - The Owner role is locked (full access, can't be edited or deleted).
 *  - System roles can be renamed/edited (except Owner) but not deleted.
 *  - A role in use can't be deleted (members, or project team rows incl. history).
 *  - Always at least one Owner; you can't change your own role.
 *  - Only Owners touch Owners, and a non-Owner can only grant what they have
 *    (src/lib/owner-rules.ts).
 */

import { clerkClient } from '@clerk/nextjs/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { logAuditEvent } from '@/lib/audit'
import { ensureSystemRoles } from '@/lib/roles'
import {
  MAX_ROLES, ROLE_NAME_MAX,
  normaliseProjectPermissions, normaliseWorkspacePermissions,
  type ProjectPermissions, type ProjectScopeValue, type WorkspacePermissions,
} from '@/lib/permissions'
import type { ActionResult } from '@/types'
import { BEYOND_OWN_ERROR, HELD_ROLE_ERROR, OWNER_ONLY_ERROR, mayChangeOwnership, mayEditRole, projectPermsWithin, roleWithin } from '@/lib/owner-rules'

export interface WorkspaceRoleRow {
  id:                   string
  name:                 string
  systemKey:            string | null
  order:                number
  projectScope:         ProjectScopeValue
  workspacePermissions: WorkspacePermissions
  projectBaseline:      ProjectPermissions
  memberCount:          number
}

export interface ProjectRoleRow {
  id:          string
  name:        string
  systemKey:   string | null
  order:       number
  permissions: ProjectPermissions
  /** Active team rows using it. */
  activeCount: number
  /** Any team row ever (history keeps a reference — blocks deletion). */
  everUsed:    boolean
}

export type Caller = { userId: string; workspaceId: string; isOwner: boolean }

/** The caller's own workspace role — what a non-Owner may grant up to (roles 2c). */
export async function callerRole(g: { userId: string; workspaceId: string }) {
  const m = await db.workspaceMember.findFirst({
    where:  { workspaceId: g.workspaceId, userId: g.userId },
    select: { role: { select: { systemKey: true, projectScope: true, workspacePermissions: true, projectBaseline: true } } },
  })
  return m?.role ?? null
}

/** Whether the caller holds this workspace role, or this project role on any project. */
async function callerHoldsWorkspaceRole(g: Caller, roleId: string): Promise<boolean> {
  return !!(await db.workspaceMember.findFirst({ where: { workspaceId: g.workspaceId, userId: g.userId, roleId }, select: { id: true } }))
}
async function callerHoldsProjectRole(g: Caller, projectRoleId: string): Promise<boolean> {
  return !!(await db.projectTeamMember.findFirst({ where: { workspaceId: g.workspaceId, userId: g.userId, projectRoleId, unassignedAt: null }, select: { id: true } }))
}

function cleanName(name: unknown): string | null {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
  return n && n.length <= ROLE_NAME_MAX ? n : null
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listRoles(g: Caller): Promise<ActionResult<{ workspaceRoles: WorkspaceRoleRow[]; projectRoles: ProjectRoleRow[] }>> {
  try {
    await ensureSystemRoles(g.workspaceId)

    const [wr, pr] = await Promise.all([
      db.workspaceRole.findMany({
        where:   { workspaceId: g.workspaceId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { members: true } } },
      }),
      db.projectRole.findMany({
        where:   { workspaceId: g.workspaceId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { teamMembers: true } } },
      }),
    ])
    const active = await db.projectTeamMember.groupBy({
      by:    ['projectRoleId'],
      where: { workspaceId: g.workspaceId, unassignedAt: null, projectRoleId: { not: null } },
      _count: true,
    })
    const activeBy = new Map(active.map(a => [a.projectRoleId!, a._count]))

    return {
      success: true,
      data: {
        workspaceRoles: wr.map(r => ({
          id: r.id, name: r.name, systemKey: r.systemKey, order: r.order,
          projectScope:         r.projectScope,
          workspacePermissions: normaliseWorkspacePermissions(r.workspacePermissions),
          projectBaseline:      normaliseProjectPermissions(r.projectBaseline),
          memberCount:          r._count.members,
        })),
        projectRoles: pr.map(r => ({
          id: r.id, name: r.name, systemKey: r.systemKey, order: r.order,
          permissions: normaliseProjectPermissions(r.permissions),
          activeCount: activeBy.get(r.id) ?? 0,
          everUsed:    r._count.teamMembers > 0,
        })),
      },
    }
  } catch (err) {
    console.error('[listRoles]', err)
    return { success: false, error: 'Failed to load roles' }
  }
}

// ─── Workspace roles ──────────────────────────────────────────────────────────

export async function createWorkspaceRole(g: Caller, input: { name: string; copyFromId: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const name = cleanName(input.name)
    if (!name) return { success: false, error: `Give the role a name (up to ${ROLE_NAME_MAX} characters).` }

    const [count, source] = await Promise.all([
      db.workspaceRole.count({ where: { workspaceId: g.workspaceId } }),
      db.workspaceRole.findFirst({ where: { id: input.copyFromId, workspaceId: g.workspaceId } }),
    ])
    if (count >= MAX_ROLES) return { success: false, error: `A workspace can have up to ${MAX_ROLES} roles.` }
    if (!source) return { success: false, error: 'Role to copy from not found.' }
    // A full-access copy of Owner is the Owner's call (roles 2c).
    if (source.systemKey === 'OWNER' && !g.isOwner) return { success: false, error: 'Only an Owner can copy the Owner role.' }
    if (!g.isOwner) {
      const mine = await callerRole(g)
      if (!mine || !roleWithin(mine, { ...source, systemKey: null })) return { success: false, error: BEYOND_OWN_ERROR }
    }

    // A copy of Owner is a full-access custom role — it isn't Owner (that's locked).
    const created = await db.workspaceRole.create({
      data: {
        workspaceId:          g.workspaceId,
        name,
        systemKey:            null,
        order:                count,
        projectScope:         source.projectScope,
        workspacePermissions: normaliseWorkspacePermissions(source.workspacePermissions),
        projectBaseline:      normaliseProjectPermissions(source.projectBaseline),
      },
      select: { id: true },
    })
    void logAuditEvent({ workspaceId: g.workspaceId, actorId: g.userId, action: 'role.created', entityType: 'WorkspaceRole', entityId: created.id, metadata: { name, copiedFrom: source.name } })
    return { success: true, data: created }
  } catch (err) {
    if (isUniqueViolation(err)) return { success: false, error: 'A role with that name already exists.' }
    console.error('[createWorkspaceRole]', err)
    return { success: false, error: 'Failed to create role' }
  }
}

export async function updateWorkspaceRole(
  g: Caller,
  id: string,
  input: { name?: string; projectScope?: ProjectScopeValue; workspacePermissions?: unknown; projectBaseline?: unknown },
): Promise<ActionResult> {
  try {
    const role = await db.workspaceRole.findFirst({ where: { id, workspaceId: g.workspaceId } })
    if (!role) return { success: false, error: 'Role not found.' }
    if (role.systemKey === 'OWNER') return { success: false, error: 'The Owner role always has full access and can’t be changed.' }
    if (!mayEditRole(g.isOwner, await callerHoldsWorkspaceRole(g, id))) return { success: false, error: HELD_ROLE_ERROR }

    const data: Prisma.WorkspaceRoleUpdateInput = {}
    if (input.name !== undefined) {
      const name = cleanName(input.name)
      if (!name) return { success: false, error: `Give the role a name (up to ${ROLE_NAME_MAX} characters).` }
      data.name = name
    }
    if (input.projectScope !== undefined) {
      if (input.projectScope !== 'ALL' && input.projectScope !== 'ASSIGNED') return { success: false, error: 'Invalid project scope.' }
      data.projectScope = input.projectScope
    }
    if (input.workspacePermissions !== undefined) data.workspacePermissions = normaliseWorkspacePermissions(input.workspacePermissions)
    if (input.projectBaseline !== undefined)      data.projectBaseline      = normaliseProjectPermissions(input.projectBaseline)
    if (!g.isOwner) {
      const mine = await callerRole(g)
      const next = {
        systemKey:            role.systemKey,
        projectScope:         (data.projectScope as ProjectScopeValue | undefined) ?? role.projectScope,
        workspacePermissions: data.workspacePermissions ?? role.workspacePermissions,
        projectBaseline:      data.projectBaseline ?? role.projectBaseline,
      }
      if (!mine || !roleWithin(mine, { ...next, systemKey: null })) return { success: false, error: BEYOND_OWN_ERROR }
    }

    const updated = await db.workspaceRole.update({ where: { id }, data })

    void logAuditEvent({
      workspaceId: g.workspaceId, actorId: g.userId, action: 'role.updated', entityType: 'WorkspaceRole', entityId: id,
      metadata: {
        name: updated.name,
        changed: Object.keys(data),
        before: { projectScope: role.projectScope, workspacePermissions: role.workspacePermissions, projectBaseline: role.projectBaseline },
      },
    })
    return { success: true, data: undefined }
  } catch (err) {
    if (isUniqueViolation(err)) return { success: false, error: 'A role with that name already exists.' }
    console.error('[updateWorkspaceRole]', err)
    return { success: false, error: 'Failed to save role' }
  }
}

export async function deleteWorkspaceRole(g: Caller, id: string): Promise<ActionResult> {
  try {
    const role = await db.workspaceRole.findFirst({
      where: { id, workspaceId: g.workspaceId },
      include: { _count: { select: { members: true } } },
    })
    if (!role) return { success: false, error: 'Role not found.' }
    if (role.systemKey) return { success: false, error: 'Built-in roles can’t be deleted.' }
    if (!mayEditRole(g.isOwner, await callerHoldsWorkspaceRole(g, id))) return { success: false, error: HELD_ROLE_ERROR }
    if (role._count.members > 0) return { success: false, error: `Move the ${role._count.members} member${role._count.members === 1 ? '' : 's'} with this role to another role first.` }

    // Pending invitations with this role then join as Collaborator (FK SET NULL).
    await db.workspaceRole.delete({ where: { id } })
    void logAuditEvent({ workspaceId: g.workspaceId, actorId: g.userId, action: 'role.deleted', entityType: 'WorkspaceRole', entityId: id, metadata: { name: role.name } })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[deleteWorkspaceRole]', err)
    return { success: false, error: 'Failed to delete role' }
  }
}

// ─── Project roles ────────────────────────────────────────────────────────────

export async function createProjectRole(g: Caller, input: { name: string; copyFromId?: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const name = cleanName(input.name)
    if (!name) return { success: false, error: `Give the role a name (up to ${ROLE_NAME_MAX} characters).` }

    const [count, source] = await Promise.all([
      db.projectRole.count({ where: { workspaceId: g.workspaceId } }),
      input.copyFromId ? db.projectRole.findFirst({ where: { id: input.copyFromId, workspaceId: g.workspaceId } }) : Promise.resolve(null),
    ])
    if (count >= MAX_ROLES) return { success: false, error: `A workspace can have up to ${MAX_ROLES} project roles.` }
    if (input.copyFromId && !source) return { success: false, error: 'Role to copy from not found.' }
    if (!g.isOwner && source) {
      const mine = await callerRole(g)
      if (!mine || !projectPermsWithin(mine, source.permissions)) return { success: false, error: BEYOND_OWN_ERROR }
    }

    const created = await db.projectRole.create({
      data: {
        workspaceId: g.workspaceId,
        name,
        systemKey:   null,
        order:       count,
        permissions: normaliseProjectPermissions(source?.permissions ?? {}),
        // (cap checked above for non-Owners)
      },
      select: { id: true },
    })
    void logAuditEvent({ workspaceId: g.workspaceId, actorId: g.userId, action: 'project_role.created', entityType: 'ProjectRole', entityId: created.id, metadata: { name, copiedFrom: source?.name ?? null } })
    return { success: true, data: created }
  } catch (err) {
    if (isUniqueViolation(err)) return { success: false, error: 'A project role with that name already exists.' }
    console.error('[createProjectRole]', err)
    return { success: false, error: 'Failed to create project role' }
  }
}

export async function updateProjectRole(g: Caller, id: string, input: { name?: string; permissions?: unknown }): Promise<ActionResult> {
  try {
    const role = await db.projectRole.findFirst({ where: { id, workspaceId: g.workspaceId } })
    if (!role) return { success: false, error: 'Project role not found.' }
    if (!mayEditRole(g.isOwner, await callerHoldsProjectRole(g, id))) return { success: false, error: HELD_ROLE_ERROR }

    const data: Prisma.ProjectRoleUpdateInput = {}
    if (input.name !== undefined) {
      const name = cleanName(input.name)
      if (!name) return { success: false, error: `Give the role a name (up to ${ROLE_NAME_MAX} characters).` }
      data.name = name
    }
    if (input.permissions !== undefined) data.permissions = normaliseProjectPermissions(input.permissions)
    if (!g.isOwner && input.permissions !== undefined) {
      const mine = await callerRole(g)
      if (!mine || !projectPermsWithin(mine, data.permissions)) return { success: false, error: BEYOND_OWN_ERROR }
    }

    await db.projectRole.update({ where: { id }, data })
    void logAuditEvent({
      workspaceId: g.workspaceId, actorId: g.userId, action: 'project_role.updated', entityType: 'ProjectRole', entityId: id,
      metadata: { changed: Object.keys(data), before: { name: role.name, permissions: role.permissions } },
    })
    return { success: true, data: undefined }
  } catch (err) {
    if (isUniqueViolation(err)) return { success: false, error: 'A project role with that name already exists.' }
    console.error('[updateProjectRole]', err)
    return { success: false, error: 'Failed to save project role' }
  }
}

export async function deleteProjectRole(g: Caller, id: string): Promise<ActionResult> {
  try {
    const role = await db.projectRole.findFirst({
      where: { id, workspaceId: g.workspaceId },
      include: { _count: { select: { teamMembers: true } } },
    })
    if (!role) return { success: false, error: 'Project role not found.' }
    if (role.systemKey) return { success: false, error: 'Built-in project roles can’t be deleted — rename or change them instead.' }
    if (!mayEditRole(g.isOwner, await callerHoldsProjectRole(g, id))) return { success: false, error: HELD_ROLE_ERROR }
    if (role._count.teamMembers > 0) return { success: false, error: 'This role has been used on a project (team history keeps it), so it can’t be deleted. Rename it or change its permissions instead.' }

    await db.projectRole.delete({ where: { id } })
    void logAuditEvent({ workspaceId: g.workspaceId, actorId: g.userId, action: 'project_role.deleted', entityType: 'ProjectRole', entityId: id, metadata: { name: role.name } })
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[deleteProjectRole]', err)
    return { success: false, error: 'Failed to delete project role' }
  }
}

// ─── Assign a member's workspace role ─────────────────────────────────────────

export async function assignWorkspaceRole(g: Caller, userId: string, roleId: string): Promise<ActionResult> {
  try {
    if (userId === g.userId) return { success: false, error: 'You can’t change your own role.' }

    const [target, role, workspace] = await Promise.all([
      db.user.findFirst({ where: { id: userId, workspaceMemberships: { some: { workspaceId: g.workspaceId } } }, select: { id: true, clerkId: true } }),
      db.workspaceRole.findFirst({ where: { id: roleId, workspaceId: g.workspaceId } }),
      db.workspace.findUnique({ where: { id: g.workspaceId }, select: { clerkOrgId: true } }),
    ])
    if (!target) return { success: false, error: 'Member not found.' }
    if (!role)   return { success: false, error: 'Role not found.' }
    if (!g.isOwner && role.systemKey !== 'OWNER') {
      const mine = await callerRole(g)
      if (!mine || !roleWithin(mine, { ...role, systemKey: null })) return { success: false, error: BEYOND_OWN_ERROR }
    }

    await db.$transaction(async tx => {
      const current = await tx.workspaceMember.findFirst({
        where: { workspaceId: g.workspaceId, userId }, include: { role: { select: { systemKey: true } } },
      })
      // Only Owners make someone Owner or change an existing Owner (roles 2c).
      if (!mayChangeOwnership(g.isOwner, current?.role.systemKey, role.systemKey)) throw new Error('OWNER_ONLY')
      // Never leave the workspace without an Owner. FOR UPDATE locks the Owner
      // memberships, so two Owners demoting each other at once serialise and
      // the second sees the first's change.
      if (current?.role.systemKey === 'OWNER' && role.systemKey !== 'OWNER') {
        const owners = await tx.$queryRaw<{ id: string }[]>`
          SELECT m."id" FROM "WorkspaceMember" m
          JOIN "WorkspaceRole" r ON r."id" = m."roleId"
          WHERE m."workspaceId" = ${g.workspaceId} AND r."systemKey" = 'OWNER'
          FOR UPDATE OF m`
        if (owners.length <= 1) throw new Error('LAST_OWNER')
      }
      await tx.workspaceMember.upsert({
        where:  { workspaceId_userId: { workspaceId: g.workspaceId, userId } },
        create: { workspaceId: g.workspaceId, userId, roleId },
        update: { roleId },
      })
    })

    // Best-effort Clerk sync (admin = Owner), as changeMemberRole did.
    if (workspace?.clerkOrgId) {
      try {
        const clerk = await clerkClient()
        await clerk.organizations.updateOrganizationMembership({
          organizationId: workspace.clerkOrgId, userId: target.clerkId,
          role: role.systemKey === 'OWNER' ? 'org:admin' : 'org:member',
        })
      } catch (e) {
        console.error('[assignWorkspaceRole] Clerk role sync failed (DB updated):', e)
      }
    }

    void logAuditEvent({ workspaceId: g.workspaceId, actorId: g.userId, action: 'member.role_changed', entityType: 'Member', metadata: { userId, roleId, roleName: role.name, systemKey: role.systemKey } })
    return { success: true, data: undefined }
  } catch (err) {
    if (err instanceof Error && err.message === 'LAST_OWNER') return { success: false, error: 'The workspace needs at least one Owner.' }
    if (err instanceof Error && err.message === 'OWNER_ONLY') return { success: false, error: OWNER_ONLY_ERROR }
    console.error('[assignWorkspaceRole]', err)
    return { success: false, error: 'Failed to change role' }
  }
}
