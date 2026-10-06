// Access resolver (roles Phase 1). Server-only; plain module, not 'use server'.
//
// Answers "what may the signed-in person do?" from WorkspaceMember →
// WorkspaceRole and, on a project, their ProjectRoles (see permissions.ts for
// the rules). Falls back to the legacy User.role preset when a membership
// hasn't been written yet, so it is safe to call before the backfill.
//
// Phase 1: nothing enforces through this yet — requireRole / project-access.ts
// still do. Phase 2 moves every gate here.

import { cache } from 'react'
import type { ProjectTeamRole } from '@prisma/client'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import {
  atLeast, readProjectPermissions, readWorkspacePermissions, resolveProjectPermissions,
  workspacePresetFor, PROJECT_ROLE_PRESETS, PROJECT_AREA_KEYS, WORKSPACE_AREA_KEYS,
  type Level, type ProjectArea, type ProjectPermissions, type ProjectScopeValue,
  type WorkspaceArea, type WorkspacePermissions,
} from '@/lib/permissions'

export interface Access {
  userId:       string
  workspaceId:  string
  isOwner:      boolean
  /** WorkspaceRole id; null while running on the legacy fallback. */
  roleId:       string | null
  roleName:     string
  projectScope: ProjectScopeValue
  workspace:    WorkspacePermissions
  baseline:     ProjectPermissions
  can:          (area: WorkspaceArea, level?: Level) => boolean
}

export interface ProjectAccess {
  projectId:   string
  permissions: ProjectPermissions
  can:         (area: ProjectArea, level?: Level) => boolean
}

const ALL_EDIT_WORKSPACE = Object.fromEntries(WORKSPACE_AREA_KEYS.map(k => [k, 'EDIT'])) as WorkspacePermissions
const ALL_EDIT_PROJECT   = Object.fromEntries(PROJECT_AREA_KEYS.map(k => [k, 'EDIT'])) as ProjectPermissions

function withCan(workspace: WorkspacePermissions) {
  return (area: WorkspaceArea, level: Level = 'VIEW') => atLeast(workspace[area], level)
}

export const getAccess = cache(async (): Promise<Access> => {
  const [user, workspaceId] = await Promise.all([getCurrentUser(), getWorkspaceId()])

  const member = await db.workspaceMember.findFirst({
    where:  { workspaceId, userId: user.id },
    select: { role: { select: { id: true, name: true, systemKey: true, projectScope: true, workspacePermissions: true, projectBaseline: true } } },
  })

  if (member) {
    const r = member.role
    const isOwner = r.systemKey === 'OWNER'
    const workspace = isOwner ? ALL_EDIT_WORKSPACE : readWorkspacePermissions(r.workspacePermissions)
    return {
      userId: user.id, workspaceId, isOwner,
      roleId: r.id, roleName: r.name,
      projectScope: isOwner ? 'ALL' : r.projectScope,
      workspace,
      baseline: isOwner ? ALL_EDIT_PROJECT : readProjectPermissions(r.projectBaseline),
      can: withCan(workspace),
    }
  }

  // Legacy fallback: no membership row yet → today's role, as its preset.
  const preset  = workspacePresetFor(user.role)
  const isOwner = user.role === 'OWNER'
  return {
    userId: user.id, workspaceId, isOwner,
    roleId: null, roleName: preset.name,
    projectScope: preset.projectScope,
    workspace: preset.workspacePermissions,
    baseline:  preset.projectBaseline,
    can: withCan(preset.workspacePermissions),
  }
})

/** Permissions of a legacy team row that has no projectRoleId yet. */
function legacySlotGrant(slot: ProjectTeamRole | null): ProjectPermissions | null {
  if (!slot) return null
  return PROJECT_ROLE_PRESETS.find(p => p.systemKey === slot)?.permissions ?? null
}

/**
 * The signed-in person's access to one project, or null when they can't open
 * it (not in this workspace, or ASSIGNED scope and not on its team).
 */
export const getProjectAccess = cache(async (projectId: string): Promise<ProjectAccess | null> => {
  const access = await getAccess()

  const [project, teamRows, assignment] = await Promise.all([
    db.project.findFirst({ where: { id: projectId, workspaceId: access.workspaceId }, select: { id: true } }),
    db.projectTeamMember.findMany({
      where:  { projectId, userId: access.userId, workspaceId: access.workspaceId, unassignedAt: null },
      select: { role: true, projectRole: { select: { permissions: true } } },
    }),
    // Until every assignment has a team row (backfill), an assignment alone
    // still puts someone on the team.
    db.projectAssignment.findFirst({ where: { projectId, userId: access.userId }, select: { id: true } }),
  ])
  if (!project) return null

  const onTeam = teamRows.length > 0 || !!assignment
  if (!access.isOwner && access.projectScope === 'ASSIGNED' && !onTeam) return null

  const grants = teamRows
    .map(r => (r.projectRole ? readProjectPermissions(r.projectRole.permissions) : legacySlotGrant(r.role)))
    .filter((g): g is ProjectPermissions => g !== null)

  const permissions = access.isOwner ? ALL_EDIT_PROJECT : resolveProjectPermissions(access.baseline, grants)
  return {
    projectId,
    permissions,
    can: (area: ProjectArea, level: Level = 'VIEW') => atLeast(permissions[area], level),
  }
})

// ─── Gates (same shape as requireRole's RoleGate) ────────────────────────────

export type PermissionGate = {
  ok:          boolean
  error:       { success: false; error: string } | null
  userId:      string
  workspaceId: string
}

export async function requirePermission(area: WorkspaceArea, level: Level): Promise<PermissionGate> {
  const access = await getAccess()
  const ok = access.can(area, level)
  return {
    ok,
    error: ok ? null : { success: false, error: 'UNAUTHORIZED_ROLE' },
    userId:      access.userId,
    workspaceId: access.workspaceId,
  }
}

/**
 * Managing people and roles (Team page, Settings → Roles, invites): Team &
 * roles EDIT on the ACTIVE workspace (roles 2c). `isOwner` lets callers apply
 * "only Owners touch Owners" (src/lib/owner-rules.ts).
 */
export async function requireTeamAdmin(): Promise<PermissionGate & { isOwner: boolean }> {
  const access = await getAccess()
  const ok = access.can('team', 'EDIT')
  return {
    ok,
    error: ok ? null : { success: false, error: 'UNAUTHORIZED_ROLE' },
    userId:      access.userId,
    workspaceId: access.workspaceId,
    isOwner:     access.isOwner,
  }
}

/** Seeing the team and roles read-only: Team & roles VIEW (roles 2c). */
export async function requireTeamViewer(): Promise<PermissionGate & { isOwner: boolean; canEdit: boolean }> {
  const access = await getAccess()
  const ok = access.can('team')
  return {
    ok,
    error: ok ? null : { success: false, error: 'UNAUTHORIZED_ROLE' },
    userId:      access.userId,
    workspaceId: access.workspaceId,
    isOwner:     access.isOwner,
    canEdit:     access.can('team', 'EDIT'),
  }
}

export async function requireProjectPermission(
  projectId: string, area: ProjectArea, level: Level,
): Promise<PermissionGate> {
  const [access, project] = await Promise.all([getAccess(), getProjectAccess(projectId)])
  const ok = !!project && project.can(area, level)
  return {
    ok,
    // Can't open the project at all → don't confirm it exists.
    error: ok ? null : { success: false, error: project ? 'UNAUTHORIZED_ROLE' : 'Project not found' },
    userId:      access.userId,
    workspaceId: access.workspaceId,
  }
}

/**
 * Account-level danger zone (delete workspace, reset demo data, Stripe payouts):
 * the Owner of the ACTIVE workspace only, whatever a role is configured to do
 * (user decision 2026-10-05).
 */
export async function requireOwner(): Promise<PermissionGate> {
  const access = await getAccess()
  return {
    ok:          access.isOwner,
    error:       access.isOwner ? null : { success: false, error: 'UNAUTHORIZED_ROLE' },
    userId:      access.userId,
    workspaceId: access.workspaceId,
  }
}
