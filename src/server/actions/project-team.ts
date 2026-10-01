'use server'

/**
 * Project team (roles Phase 3b): everyone on a project holds a project role
 * (Settings → Roles → Project roles), any role can have several people, and a
 * person may hold more than one. A ProjectAssignment exists exactly while the
 * person has at least one active team row — it's what opens the project for
 * an ASSIGNED-scope workspace role.
 *
 * Reads need access to the project; changes need `projectTeam` EDIT there.
 * The legacy `role` column (PL/AM/PM) is no longer written — readers use the
 * project role's systemKey (and its old one-per-slot unique index only covers
 * legacy rows, so a built-in role can now have several people).
 */

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { requireRole } from '@/lib/auth'
import { getProjectAccess, requireProjectPermission } from '@/lib/access'
import { logAuditEvent } from '@/lib/audit'
import { checkProjectAccess } from '@/lib/project-access'
import type { ActionResult } from '@/types'
import type { Prisma, ProjectTeamRole, UserRole } from '@prisma/client'
import { PROJECT_AREA_KEYS, atLeast, readProjectPermissions } from '@/lib/permissions'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TeamUser {
  name:      string | null
  email:     string
  avatarUrl: string | null
  role:      UserRole
}

export interface TeamRow {
  /** The ProjectTeamMember row id. */
  id:            string
  userId:        string
  projectRoleId: string | null
  roleName:      string
  assignedAt:    string
  user:          TeamUser
}

export interface ProjectRoleOption {
  id:        string
  name:      string
  systemKey: string | null
}

export interface TeamMemberHistory {
  id:                 string
  userId:             string
  role:               ProjectTeamRole | null
  /** Display name of the project role. */
  roleName:           string | null
  assignedAt:         string
  assignedByUserId:   string | null
  unassignedAt:       string | null
  unassignedByUserId: string | null
  unassignReason:     string | null
  user:               TeamUser
}

const USER_SELECT = { name: true, email: true, avatarUrl: true, role: true } as const

/**
 * You can only hand out what you hold: a project role can be given (or taken
 * away) only if it grants nothing beyond the caller's own access on that
 * project. Owners and Producers hold everything, so this only limits project
 * roles like Project Manager from promoting people (or themselves) past them.
 */
async function canGrant(projectId: string, roleId: string | null, workspaceId: string) {
  if (!roleId) return true
  const [mine, role] = await Promise.all([
    getProjectAccess(projectId),
    db.projectRole.findFirst({ where: { id: roleId, workspaceId }, select: { permissions: true } }),
  ])
  if (!mine || !role) return false
  const grants = readProjectPermissions(role.permissions)
  return PROJECT_AREA_KEYS.every(k => atLeast(mine.permissions[k], grants[k]))
}
const CANT_GRANT = { success: false as const, error: 'That role grants more than you have on this project.' }

/**
 * Serialise every team change for one person on one project (add / change /
 * remove), so the "assignment iff an active row" invariant can't be broken by
 * two requests interleaving. Transaction-scoped advisory lock.
 */
async function lockPersonOnProject(tx: Prisma.TransactionClient, projectId: string, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'team:' + projectId + ':' + userId}))`
}

function revalidateTeam(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/proposals')
  revalidatePath('/clients')
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getProjectTeamList(
  projectId: string,
): Promise<ActionResult<{ rows: TeamRow[]; roles: ProjectRoleOption[]; canEdit: boolean }>> {
  try {
    const [access, opened] = await Promise.all([getProjectAccess(projectId), checkProjectAccess(projectId)])
    if (!access || !opened) return { success: false, error: 'Project not found' }
    const workspaceId = opened.workspaceId

    const [rows, roles] = await Promise.all([
      db.projectTeamMember.findMany({
        where:   { projectId, workspaceId, unassignedAt: null },
        include: { user: { select: USER_SELECT }, projectRole: { select: { name: true, order: true } } },
        orderBy: { assignedAt: 'asc' },
      }),
      db.projectRole.findMany({
        where:   { workspaceId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select:  { id: true, name: true, systemKey: true },
      }),
    ])

    const sorted = [...rows].sort((a, b) => (a.projectRole?.order ?? 99) - (b.projectRole?.order ?? 99))
    return {
      success: true,
      data: {
        rows: sorted.map(r => ({
          id:            r.id,
          userId:        r.userId,
          projectRoleId: r.projectRoleId,
          roleName:      r.projectRole?.name ?? 'Team member',
          assignedAt:    r.assignedAt.toISOString(),
          user:          r.user,
        })),
        roles,
        canEdit: access.can('projectTeam', 'EDIT'),
      },
    }
  } catch {
    return { success: false, error: 'Failed to load project team' }
  }
}

export async function getProjectTeamHistory(
  projectId: string,
): Promise<ActionResult<TeamMemberHistory[]>> {
  try {
    if (!(await checkProjectAccess(projectId))) return { success: false, error: 'Project not found' }
    const sdb = await getScopedDb()
    const rows = await sdb.projectTeamMember.findMany({
      // A Team member row ended by a promotion isn't history anyone needs.
      where:   {
        projectId,
        OR: [
          { unassignReason: null },
          { unassignReason: { not: 'REPLACED' } },
          { projectRole: { systemKey: { not: 'TEAM_MEMBER' } } },
          // `not` excludes NULL — custom roles have no systemKey.
          { projectRole: { systemKey: null } },
        ],
      },
      include: {
        user:        { select: USER_SELECT },
        projectRole: { select: { name: true } },
      },
      orderBy: { assignedAt: 'desc' },
    })

    return {
      success: true,
      data: rows.map(row => ({
        id:                 row.id,
        userId:             row.userId,
        role:               row.role,
        roleName:           row.projectRole?.name ?? null,
        assignedAt:         row.assignedAt.toISOString(),
        assignedByUserId:   row.assignedByUserId,
        unassignedAt:       row.unassignedAt?.toISOString() ?? null,
        unassignedByUserId: row.unassignedByUserId,
        unassignReason:     row.unassignReason,
        user:               row.user,
      })),
    }
  } catch {
    return { success: false, error: 'Failed to load team history' }
  }
}

// ─── People who can be added ──────────────────────────────────────────────────

export interface EligibleUser {
  id:        string
  name:      string | null
  email:     string
  avatarUrl: string | null
  role:      UserRole
}

export async function listEligibleUsersForProjectTeam(projectId: string): Promise<ActionResult<EligibleUser[]>> {
  try {
    const gate = await requireProjectPermission(projectId, 'projectTeam', 'EDIT')
    if (!gate.ok) return gate.error

    const users = await db.user.findMany({
      where:   { workspaceId: gate.workspaceId },
      select:  { id: true, name: true, email: true, avatarUrl: true, role: true },
      orderBy: { name: 'asc' },
    })
    return { success: true, data: users }
  } catch {
    return { success: false, error: 'Failed to load eligible users' }
  }
}

// ─── Add / change / remove ────────────────────────────────────────────────────

export async function addToProjectTeam(input: {
  projectId:     string
  userId:        string
  projectRoleId: string
}): Promise<ActionResult> {
  try {
    const { projectId, userId, projectRoleId } = input
    const gate = await requireProjectPermission(projectId, 'projectTeam', 'EDIT')
    if (!gate.ok) return gate.error

    const [targetUser, role] = await Promise.all([
      db.user.findFirst({ where: { id: userId, workspaceId: gate.workspaceId }, select: { id: true } }),
      db.projectRole.findFirst({ where: { id: projectRoleId, workspaceId: gate.workspaceId }, select: { id: true, name: true, systemKey: true } }),
    ])
    if (!targetUser) return { success: false, error: 'User not found in this workspace' }
    if (!role)       return { success: false, error: 'Project role not found' }
    if (!(await canGrant(projectId, role.id, gate.workspaceId))) return CANT_GRANT

    const added = await db.$transaction(async tx => {
      await lockPersonOnProject(tx, projectId, userId)
      const already = await tx.projectTeamMember.findFirst({
        where:  { projectId, userId, projectRoleId, unassignedAt: null },
        select: { id: true },
      })
      if (already) return false
      // Team member adds nothing to a role they already hold here.
      if (role.systemKey === 'TEAM_MEMBER') {
        const onTeam = await tx.projectTeamMember.count({ where: { projectId, userId, unassignedAt: null } })
        if (onTeam > 0) return false
      }
      // A plain Team member row is superseded by any other role they get here.
      if (role.systemKey !== 'TEAM_MEMBER') {
        await tx.projectTeamMember.updateMany({
          where: { projectId, userId, unassignedAt: null, projectRole: { systemKey: 'TEAM_MEMBER' } },
          data:  { unassignedAt: new Date(), unassignedByUserId: gate.userId, unassignReason: 'REPLACED' },
        })
      }
      await tx.projectTeamMember.create({
        data: {
          workspaceId: gate.workspaceId, projectId, userId,
          role: null, projectRoleId, assignedByUserId: gate.userId,
        },
      })
      await tx.projectAssignment.createMany({
        data: [{ projectId, userId, workspaceId: gate.workspaceId }], skipDuplicates: true,
      })
      return true
    })

    if (added) {
      void logAuditEvent({
        workspaceId: gate.workspaceId, actorId: gate.userId,
        action: 'project.team_role_assigned', entityType: 'Project', entityId: projectId,
        metadata: { userId, projectRoleId, roleName: role.name },
      })
    }
    revalidateTeam(projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[addToProjectTeam]', err)
    return { success: false, error: 'Failed to add to the project' }
  }
}

/** Load an active team row on its project, gated by projectTeam EDIT. */
async function editableRow(teamRowId: string) {
  const row = typeof teamRowId === 'string' && teamRowId
    ? await db.projectTeamMember.findFirst({
        where:  { id: teamRowId, unassignedAt: null },
        select: { id: true, projectId: true, userId: true, workspaceId: true, projectRoleId: true },
      })
    : null
  if (!row) return { row: null, gate: null }
  const gate = await requireProjectPermission(row.projectId, 'projectTeam', 'EDIT')
  // The row must be in the caller's active workspace (the gate resolves the
  // project there; a foreign row's project wouldn't open).
  if (!gate.ok || row.workspaceId !== gate.workspaceId) return { row: null, gate }
  return { row, gate }
}

export async function setProjectTeamRole(input: { teamRowId: string; projectRoleId: string }): Promise<ActionResult> {
  try {
    const { row, gate } = await editableRow(input.teamRowId)
    if (!row) return gate && !gate.ok ? gate.error : { success: false, error: 'Team member not found' }
    if (row.projectRoleId === input.projectRoleId) return { success: true, data: undefined }

    const role = await db.projectRole.findFirst({
      where:  { id: input.projectRoleId, workspaceId: gate!.workspaceId },
      select: { id: true, name: true, systemKey: true },
    })
    if (!role) return { success: false, error: 'Project role not found' }
    if (!(await canGrant(row.projectId, role.id, gate!.workspaceId)) || !(await canGrant(row.projectId, row.projectRoleId, gate!.workspaceId))) {
      return CANT_GRANT
    }

    await db.$transaction(async tx => {
      await lockPersonOnProject(tx, row.projectId, row.userId)
      // History: the old row ends, a new one starts. Guarded on still-active
      // so a concurrent remove can't be undone.
      const ended = await tx.projectTeamMember.updateMany({
        where: { id: row.id, unassignedAt: null },
        data:  { unassignedAt: new Date(), unassignedByUserId: gate!.userId, unassignReason: 'REPLACED' },
      })
      if (ended.count === 0) throw new Error('ROW_GONE')
      const others = await tx.projectTeamMember.findMany({
        where:  { projectId: row.projectId, userId: row.userId, unassignedAt: null },
        select: { projectRoleId: true },
      })
      // Already holds it — or it's Team member while they hold another role.
      const redundant = others.some(o => o.projectRoleId === role.id) || (role.systemKey === 'TEAM_MEMBER' && others.length > 0)
      if (!redundant) {
        await tx.projectTeamMember.create({
          data: {
            workspaceId: gate!.workspaceId, projectId: row.projectId, userId: row.userId,
            role: null, projectRoleId: role.id, assignedByUserId: gate!.userId,
          },
        })
      }
    })

    void logAuditEvent({
      workspaceId: gate!.workspaceId, actorId: gate!.userId,
      action: 'project.team_role_changed', entityType: 'Project', entityId: row.projectId,
      metadata: { userId: row.userId, from: row.projectRoleId, to: role.id, roleName: role.name },
    })
    revalidateTeam(row.projectId)
    return { success: true, data: undefined }
  } catch (err) {
    if (err instanceof Error && err.message === 'ROW_GONE') return { success: false, error: 'That person was just removed — refresh.' }
    console.error('[setProjectTeamRole]', err)
    return { success: false, error: 'Failed to change project role' }
  }
}

export async function removeFromProjectTeam(input: { teamRowId: string }): Promise<ActionResult> {
  try {
    const { row, gate } = await editableRow(input.teamRowId)
    if (!row) return gate && !gate.ok ? gate.error : { success: false, error: 'Team member not found' }
    if (!(await canGrant(row.projectId, row.projectRoleId, gate!.workspaceId))) return CANT_GRANT

    await db.$transaction(async tx => {
      await lockPersonOnProject(tx, row.projectId, row.userId)
      await tx.projectTeamMember.updateMany({
        where: { id: row.id, unassignedAt: null },
        data:  { unassignedAt: new Date(), unassignedByUserId: gate!.userId, unassignReason: 'REMOVED' },
      })
      // No role left here → no access to the project either.
      const stillOnTeam = await tx.projectTeamMember.count({
        where: { projectId: row.projectId, userId: row.userId, unassignedAt: null },
      })
      if (stillOnTeam === 0) {
        await tx.projectAssignment.deleteMany({ where: { projectId: row.projectId, userId: row.userId } })
      }
    })

    void logAuditEvent({
      workspaceId: gate!.workspaceId, actorId: gate!.userId,
      action: 'project.team_role_unassigned', entityType: 'Project', entityId: row.projectId,
      metadata: { userId: row.userId, projectRoleId: row.projectRoleId },
    })
    revalidateTeam(row.projectId)
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[removeFromProjectTeam]', err)
    return { success: false, error: 'Failed to remove from the project' }
  }
}

// ─── getActiveProjectRolesForUser ─────────────────────────────────────────────
// Used by the workspace-member-removal confirmation dialog to list the roles
// a user currently holds before the owner removes them from the workspace.

export interface ActiveProjectRole {
  projectId:   string
  projectName: string
  /** The project role's display name. */
  role:        string
}

export async function getActiveProjectRolesForUser(
  userId: string,
): Promise<ActionResult<ActiveProjectRole[]>> {
  try {
    const gate = await requireRole(['OWNER'])
    if (!gate.ok) return gate.error

    const rows = await db.projectTeamMember.findMany({
      where:   { userId, workspaceId: gate.workspaceId, unassignedAt: null },
      include: { project: { select: { name: true } }, projectRole: { select: { name: true } } },
      orderBy: { assignedAt: 'asc' },
    })

    return {
      success: true,
      data: rows.map(r => ({
        projectId:   r.projectId,
        projectName: r.project.name,
        role:        r.projectRole?.name ?? r.role ?? 'Team member',
      })),
    }
  } catch {
    return { success: false, error: 'Failed to load active roles' }
  }
}
