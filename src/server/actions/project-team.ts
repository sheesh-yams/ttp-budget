'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
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
// Returns the 3 active role slots. No mutation gate — COLLABORATORs can read.

export async function getProjectTeam(
  projectId: string,
): Promise<ActionResult<ProjectTeamMap>> {
  try {
    const sdb = await getScopedDb()
    const rows = await sdb.projectTeamMember.findMany({
      where:   { projectId, unassignedAt: null },
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
    const sdb = await getScopedDb()
    const rows = await sdb.projectTeamMember.findMany({
      where:   { projectId },
      include: { user: { select: { name: true, email: true, avatarUrl: true, role: true } } },
      orderBy: { assignedAt: 'desc' },
    })

    return {
      success: true,
      data: rows.map(row => ({
        id:                 row.id,
        userId:             row.userId,
        role:               row.role,
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
      }

      // 2. Create the new active row.
      const newRow = await tx.projectTeamMember.create({
        data: {
          workspaceId:      gate.workspaceId,
          projectId,
          userId,
          role,
          assignedByUserId: gate.userId,
        },
      })
      newMemberId = newRow.id

      // 3. Auto-create ProjectAssignment for visibility (idempotent).
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

      // 2. Optionally remove visibility grant if user has no other active roles.
      if (removeVisibility) {
        const otherActiveRoles = await tx.projectTeamMember.count({
          where: { projectId, userId, unassignedAt: null },
        })
        if (otherActiveRoles === 0) {
          await tx.projectAssignment.deleteMany({ where: { projectId, userId } })
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
      where:   { userId, workspaceId: gate.workspaceId, unassignedAt: null },
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
