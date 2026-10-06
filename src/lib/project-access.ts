// Page- and route-level access guards. Server-only (uses auth); plain module,
// not 'use server', so nothing here is a callable endpoint.
//
// Every page under /projects/[id] must call requireProjectAccess — a jest test
// (src/lib/__tests__/project-access-coverage.test.ts) fails the build if a
// project page forgets. Layout checks alone aren't enough: App Router layouts
// don't re-run when navigating between sibling pages.

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { getAccess, getProjectAccess } from '@/lib/access'
import type { ProjectArea, WorkspaceArea } from '@/lib/permissions'

/**
 * Whether the signed-in user may open this project. Non-throwing — for API
 * routes, which answer 404 themselves.
 */
export const checkProjectAccess = cache(async (projectId: string) => {
  // Whether the project opens follows the workspace role's project scope
  // (ALL / ASSIGNED) — getProjectAccess.
  const [workspaceId, user, access] = await Promise.all([getWorkspaceId(), getCurrentUser(), getProjectAccess(projectId)])
  if (!access) return null
  const project = await db.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true, name: true } })
  if (!project) return null
  return { project, user, workspaceId }
})

/** Same check for pages: 404s instead of returning null. */
export async function requireProjectAccess(projectId: string) {
  const access = await checkProjectAccess(projectId)
  if (!access) notFound()
  return access
}

/**
 * Roles Phase 2: a project tab that's on the new permissions — 404 unless the
 * viewer has at least VIEW on its area here (baseline + project roles).
 */
export async function requireProjectArea(projectId: string, area: ProjectArea) {
  const access = await getProjectAccess(projectId)
  if (!access || !access.can(area)) notFound()
  return access
}


/**
 * Roles Phase 2: a workspace page on the new permissions — 404 unless the
 * viewer has at least VIEW on its workspace area.
 */
export async function requireWorkspaceArea(area: WorkspaceArea) {
  const access = await getAccess()
  if (!access.can(area)) notFound()
  return access
}

/**
 * Moving a project into or out of ARCHIVED — by any path, including a status
 * field — needs the workspace Projects permission (roles 2b). Other status
 * changes are Overview edits.
 */
export async function archiveChangeAllowed(projectId: string, nextStatus: string | undefined): Promise<boolean> {
  if (nextStatus === undefined) return true
  const workspaceId = await getWorkspaceId()
  const p = await db.project.findFirst({ where: { id: projectId, workspaceId }, select: { status: true } })
  if (!p) return true   // the caller's gate already answers not-found
  const touchesArchive = (nextStatus === 'ARCHIVED') !== (p.status === 'ARCHIVED')
  return !touchesArchive || (await getAccess()).can('projects', 'EDIT')
}
