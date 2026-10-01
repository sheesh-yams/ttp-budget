'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import { checkProjectAccess } from '@/lib/project-access'
import { systemProjectRoleId } from '@/lib/roles'
import type { ActionResult } from '@/types'
import type { ProjectTeamRole, UserRole } from '@prisma/client'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TeamMember {
  id:             string
  userId:         string
  role:           ProjectTeamRole
  assignedAt:     string
  assignedByUserId: string | null
  user: {
    name:      string | null
    email:     string
    avatarUrl: string | null
    role:      UserRole
  }
}

export interface TeamMemberHistory extends TeamMember {
  /** Display name of the project role (covers rows with no legacy slot). */
  roleName:           string | null
  unassignedAt:       string | null
  unassignedByUserId: string | null
  unassignReason:     string | null
}

export interface ProjectTeamMap {
  PROJECT_LEAD:      TeamMember | null
  ACCOUNT_MANAGER:   TeamMember | null
  PROJECT_MANAGER:   TeamMember | null
}

// ─── getProjectTeam ───────────────────────────────────────────────────────────
// Returns the 3 active role slots. Anyone who can open the project can read.

export async function getProjectTeam(
  projectId: string,
): Promise<ActionResult<ProjectTeamMap>> {
  try {
    if (!(await checkProjectAccess(projectId))) return { success: false, error: 'Project not found' }
    const sdb = await getScopedDb()
    const rows = await sdb.projectTeamMember.findMany({
      // The 3 named slots only — Team member rows have no legacy slot.
      where:   { projectId, unassignedAt: null, role: { not: null } },
      include: { user: { select: { name: true, email: true, avatarUrl: true, role: true } } },
      orderBy: { assignedAt: 'asc' },
    })

    const map: ProjectTeamMap = {
      PROJECT_LEAD:    null,
      ACCOUNT_MANAGER: null,
      PROJECT_MANAGER: null,
    }
    for (const row of rows) {
      const serialised: TeamMember = {
        id:               row.id,
        userId:           row.userId,
        role:             row.role,
        assignedAt:       row.assignedAt.toISOString(),
        assignedByUserId: row.assignedByUserId,
        user:             row.user,
      }
      map[row.role] = serialised
    }
    return { success: true, data: map }
  } catch {
    return { success: false, error: 'Failed to load project team' }
  }
}

// ─── getProjectTeamHistory ────────────────────────────────────────────────────

export async function getProjectTeamHistory(
  projectId: string,
): Promise<ActionResult<TeamMemberHistory[]>> {
  try {
    if (!(await checkProjectAccess(projectId))) return { success: false, error: 'Project not found' }
    const sdb = await getScopedDb()
    const rows = await sdb.projectTeamMember.findMany({
      // A Team member row ended by a promotion to a named role isn't history
      // anyone needs (the new role's own row records it).
      // (Spelled out: SQL NULLs make a NOT { role: null, reason } drop rows.)
      where:   {
        projectId,
        OR: [{ role: { not: null } }, { unassignReason: null }, { unassignReason: { not: 'REPLACED' } }],
      },
      include: {
        user:        { select: { name: true, email: true, avatarUrl: true, role: true } },
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

// ─── listEligibleUsersForProjectTeam ─────────────────────────────────────────
// All workspace users (any role) are eligible for project team roles.

export interface EligibleUser {
  id:        string
  name:      string | null
  email:     string
  avatarUrl: string | null
  role:      UserRole
}

export async function listEligibleUsersForProjectTeam(): Promise<ActionResult<EligibleUser[]>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
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

// ─── assignProjectTeamRole ────────────────────────────────────────────────────
// Atomically replaces the active role holder (if any) and creates the new row.
// Auto-creates a ProjectAssignment for visibility grant in the same transaction.

export async function assignProjectTeamRole(input: {
  projectId: string
  role:      ProjectTeamRole
  userId:    string
}): Promise<ActionResult<TeamMember>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const { projectId, role, userId } = input

    // Verify project and target user both belong to this workspace.
    const [project, targetUser] = await Promise.all([
      db.project.findFirst({ where: { id: projectId, workspaceId: gate.workspaceId }, select: { id: true } }),
      db.user.findFirst({ where: { id: userId, workspaceId: gate.workspaceId }, select: { id: true, name: true, email: true, avatarUrl: true, role: true } }),
    ])
    if (!project)    return { success: false, error: 'Project not found' }
    if (!targetUser) return { success: false, error: 'User not found in this workspace' }

    let replacedUserId: string | undefined
    let newMemberId: string | undefined

    const [projectRoleId, teamMemberRoleId] = await Promise.all([
      systemProjectRoleId(gate.workspaceId, role),
      systemProjectRoleId(gate.workspaceId, 'TEAM_MEMBER'),
    ])

    await db.$transaction(async (tx) => {
      // 1. Mark any existing active holder as replaced.
      const existing = await tx.projectTeamMember.findFirst({
        where:  { projectId, role, unassignedAt: null },
        select: { id: true, userId: true },
      })
      if (existing) {
        replacedUserId = existing.userId
        await tx.projectTeamMember.update({
          where: { id: existing.id },
          data:  {
            unassignedAt:       new Date(),
            unassignedByUserId: gate.userId,
            unassignReason:     'REPLACED',
          },
        })
        // They keep access to the project, so they stay on its team as a
        // Team member unless they still hold another role here.
        if (existing.userId !== userId) {
          const stillOnTeam = await tx.projectTeamMember.count({
            where: { projectId, userId: existing.userId, unassignedAt: null },
          })
          if (stillOnTeam === 0) {
            await tx.projectTeamMember.create({
              data: {
                workspaceId: gate.workspaceId, projectId, userId: existing.userId,
                role: null, projectRoleId: teamMemberRoleId, assignedByUserId: gate.userId,
              },
            })
          }
        }
      }

      // 2. A named role supersedes being a plain Team member here.
      await tx.projectTeamMember.updateMany({
        where: { projectId, userId, workspaceId: gate.workspaceId, unassignedAt: null, role: null },
        data:  { unassignedAt: new Date(), unassignedByUserId: gate.userId, unassignReason: 'REPLACED' },
      })

      // 3. Create the new active row.
      const newRow = await tx.projectTeamMember.create({
        data: {
          workspaceId:      gate.workspaceId,
          projectId,
          userId,
          role,
          projectRoleId,
          assignedByUserId: gate.userId,
        },
      })
      newMemberId = newRow.id

      // 4. Auto-create ProjectAssignment for visibility (idempotent).
      const existingAssignment = await tx.projectAssignment.findFirst({
        where:  { projectId, userId },
        select: { id: true },
      })
      if (!existingAssignment) {
        await tx.projectAssignment.create({
          data: { projectId, userId, workspaceId: gate.workspaceId },
        })
      }
    })

    void logAuditEvent({
      workspaceId: gate.workspaceId,
      actorId:     gate.userId,
      action:      'project.team_role_assigned',
      entityType:  'Project',
      entityId:    projectId,
      metadata:    { role, userId, replacedUserId },
    })

    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    revalidatePath('/proposals')
    revalidatePath('/clients')

    return {
      success: true,
      data: {
        id:               newMemberId!,
        userId,
        role,
        assignedAt:       new Date().toISOString(),
        assignedByUserId: gate.userId,
        user:             { name: targetUser.name, email: targetUser.email, avatarUrl: targetUser.avatarUrl, role: targetUser.role },
      },
    }
  } catch (err) {
    console.error('[assignProjectTeamRole]', err)
    return { success: false, error: 'Failed to assign team role' }
  }
}

// ─── unassignProjectTeamRole ──────────────────────────────────────────────────
// Marks the active role holder as removed. Optionally removes visibility grant
// when the user holds no other active roles on this project.

export async function unassignProjectTeamRole(input: {
  projectId:        string
  role:             ProjectTeamRole
  removeVisibility: boolean
}): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const { projectId, role, removeVisibility } = input

    const active = await db.projectTeamMember.findFirst({
      where:  { projectId, role, unassignedAt: null, workspaceId: gate.workspaceId },
      select: { id: true, userId: true },
    })
    if (!active) return { success: false, error: 'No active holder for this role' }

    const { userId } = active
    const teamMemberRoleId = await systemProjectRoleId(gate.workspaceId, 'TEAM_MEMBER')

    await db.$transaction(async (tx) => {
      // 1. Mark role as removed.
      await tx.projectTeamMember.update({
        where: { id: active.id },
        data:  {
          unassignedAt:       new Date(),
          unassignedByUserId: gate.userId,
          unassignReason:     'REMOVED',
        },
      })

      // 2. With no other active role here: either drop their access, or keep
      //    them on the team as a plain Team member (everyone with access to a
      //    project holds a project role).
      const otherActiveRoles = await tx.projectTeamMember.count({
        where: { projectId, userId, unassignedAt: null },
      })
      if (otherActiveRoles === 0) {
        if (removeVisibility) {
          await tx.projectAssignment.deleteMany({ where: { projectId, userId } })
        } else {
          await tx.projectTeamMember.create({
            data: {
              workspaceId: gate.workspaceId, projectId, userId,
              role: null, projectRoleId: teamMemberRoleId, assignedByUserId: gate.userId,
            },
          })
        }
      }
    })

    void logAuditEvent({
      workspaceId: gate.workspaceId,
      actorId:     gate.userId,
      action:      'project.team_role_unassigned',
      entityType:  'Project',
      entityId:    projectId,
      metadata:    { role, userId, removeVisibility },
    })

    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    revalidatePath('/proposals')
    revalidatePath('/clients')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[unassignProjectTeamRole]', err)
    return { success: false, error: 'Failed to unassign team role' }
  }
}

// ─── Others on the project ────────────────────────────────────────────────────
// People with access to the project (a ProjectAssignment) beyond the 3 named
// roles. For a Collaborator the assignment *is* their access to the project.

export interface ProjectOtherMember {
  userId:    string
  name:      string | null
  email:     string
  avatarUrl: string | null
  role:      UserRole
}

export async function getProjectOthers(
  projectId: string,
): Promise<ActionResult<ProjectOtherMember[]>> {
  try {
    const access = await checkProjectAccess(projectId)
    if (!access) return { success: false, error: 'Project not found' }

    const [assignments, active] = await Promise.all([
      db.projectAssignment.findMany({
        where:   { projectId, workspaceId: access.workspaceId },
        include: { user: { select: { name: true, email: true, avatarUrl: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.projectTeamMember.findMany({
        where:  { projectId, workspaceId: access.workspaceId, unassignedAt: null, role: { not: null } },
        select: { userId: true },
      }),
    ])
    const inNamedRole = new Set(active.map(a => a.userId))
    return {
      success: true,
      data: assignments
        .filter(a => !inNamedRole.has(a.userId))
        .map(a => ({ userId: a.userId, ...a.user })),
    }
  } catch {
    return { success: false, error: 'Failed to load project members' }
  }
}

export async function addProjectMember(input: {
  projectId: string
  userId:    string
}): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const { projectId, userId } = input
    const [project, targetUser] = await Promise.all([
      db.project.findFirst({ where: { id: projectId, workspaceId: gate.workspaceId }, select: { id: true } }),
      db.user.findFirst({ where: { id: userId, workspaceId: gate.workspaceId }, select: { id: true } }),
    ])
    if (!project)    return { success: false, error: 'Project not found' }
    if (!targetUser) return { success: false, error: 'User not found in this workspace' }

    const teamMemberRoleId = await systemProjectRoleId(gate.workspaceId, 'TEAM_MEMBER')

    // Access (ProjectAssignment) + a Team member row. Unique (projectId,
    // userId) on the assignment — adding someone already on it is a no-op.
    const count = await db.$transaction(async (tx) => {
      const { count } = await tx.projectAssignment.createMany({
        data:           [{ projectId, userId, workspaceId: gate.workspaceId }],
        skipDuplicates: true,
      })
      const onTeam = await tx.projectTeamMember.count({
        where: { projectId, userId, workspaceId: gate.workspaceId, unassignedAt: null },
      })
      if (onTeam === 0) {
        await tx.projectTeamMember.create({
          data: {
            workspaceId: gate.workspaceId, projectId, userId,
            role: null, projectRoleId: teamMemberRoleId, assignedByUserId: gate.userId,
          },
        })
      }
      return count
    })

    if (count > 0) {
      void logAuditEvent({
        workspaceId: gate.workspaceId,
        actorId:     gate.userId,
        action:      'project.member_added',
        entityType:  'Project',
        entityId:    projectId,
        metadata:    { userId },
      })
    }

    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[addProjectMember]', err)
    return { success: false, error: 'Failed to add to project' }
  }
}

export async function removeProjectMember(input: {
  projectId: string
  userId:    string
}): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const { projectId, userId } = input
    const heldRole = await db.projectTeamMember.findFirst({
      where:  { projectId, userId, workspaceId: gate.workspaceId, unassignedAt: null, role: { not: null } },
      select: { id: true },
    })
    if (heldRole) return { success: false, error: 'They hold a named role on this project — remove them from it first.' }

    const { count } = await db.$transaction(async (tx) => {
      await tx.projectTeamMember.updateMany({
        where: { projectId, userId, workspaceId: gate.workspaceId, unassignedAt: null },
        data:  { unassignedAt: new Date(), unassignedByUserId: gate.userId, unassignReason: 'REMOVED' },
      })
      return tx.projectAssignment.deleteMany({
        where: { projectId, userId, workspaceId: gate.workspaceId },
      })
    })

    if (count > 0) {
      void logAuditEvent({
        workspaceId: gate.workspaceId,
        actorId:     gate.userId,
        action:      'project.member_removed',
        entityType:  'Project',
        entityId:    projectId,
        metadata:    { userId },
      })
    }

    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[removeProjectMember]', err)
    return { success: false, error: 'Failed to remove from project' }
  }
}

// ─── getActiveProjectRolesForUser ─────────────────────────────────────────────
// Used by the workspace-member-removal confirmation dialog to list the roles
// a user currently holds before the owner removes them from the workspace.

export interface ActiveProjectRole {
  projectId:   string
  projectName: string
  role:        ProjectTeamRole
}

export async function getActiveProjectRolesForUser(
  userId: string,
): Promise<ActionResult<ActiveProjectRole[]>> {
  try {
    const gate = await requireRole(['OWNER'])
    if (!gate.ok) return gate.error

    const rows = await db.projectTeamMember.findMany({
      where:   { userId, workspaceId: gate.workspaceId, unassignedAt: null, role: { not: null } },
      include: { project: { select: { name: true } } },
      orderBy: { assignedAt: 'asc' },
    })

    return {
      success: true,
      data: rows.map(r => ({
        projectId:   r.projectId,
        projectName: r.project.name,
        role:        r.role,
      })),
    }
  } catch {
    return { success: false, error: 'Failed to load active roles' }
  }
}
