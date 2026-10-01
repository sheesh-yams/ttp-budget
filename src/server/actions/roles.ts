'use server'

/**
 * Settings → Roles server actions — thin wrappers. Each gates with
 * requireTeamAdmin (Team & roles EDIT, and Owner while the workspace pages
 * are on the legacy role), runs the logic in src/lib/role-admin.ts, and
 * refreshes the Roles and Team pages on success.
 */

import { revalidatePath } from 'next/cache'
import { requireTeamAdmin } from '@/lib/access'
import * as admin from '@/lib/role-admin'
import type { ProjectScopeValue } from '@/lib/permissions'
import type { ActionResult } from '@/types'

export type { WorkspaceRoleRow, ProjectRoleRow } from '@/lib/role-admin'

async function run<T>(fn: (g: admin.Caller) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const g = await requireTeamAdmin()
  if (!g.ok) return g.error
  const res = await fn({ userId: g.userId, workspaceId: g.workspaceId })
  if (res.success) { revalidatePath('/settings/roles'); revalidatePath('/team') }
  return res
}

export async function listRoles() {
  // A read — called during render, where revalidatePath isn't allowed.
  const g = await requireTeamAdmin()
  if (!g.ok) return g.error
  return admin.listRoles({ userId: g.userId, workspaceId: g.workspaceId })
}

export async function createWorkspaceRole(input: { name: string; copyFromId: string }) {
  return run(g => admin.createWorkspaceRole(g, input))
}

export async function updateWorkspaceRole(
  id: string,
  input: { name?: string; projectScope?: ProjectScopeValue; workspacePermissions?: unknown; projectBaseline?: unknown },
) {
  return run(g => admin.updateWorkspaceRole(g, id, input))
}

export async function deleteWorkspaceRole(id: string) {
  return run(g => admin.deleteWorkspaceRole(g, id))
}

export async function createProjectRole(input: { name: string; copyFromId?: string }) {
  return run(g => admin.createProjectRole(g, input))
}

export async function updateProjectRole(id: string, input: { name?: string; permissions?: unknown }) {
  return run(g => admin.updateProjectRole(g, id, input))
}

export async function deleteProjectRole(id: string) {
  return run(g => admin.deleteProjectRole(g, id))
}

export async function assignWorkspaceRole(userId: string, roleId: string) {
  return run(g => admin.assignWorkspaceRole(g, userId, roleId))
}
