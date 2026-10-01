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
import type { UserRole } from '@prisma/client'
import { getProjectAccess } from '@/lib/access'
import type { ProjectArea } from '@/lib/permissions'

/**
 * The access decision itself, for a known user: the project must be in the
 * workspace, and a Collaborator must be assigned to it. Pure DB — testable
 * without a session.
 */
export async function findOpenableProject(args: {
  projectId: string; workspaceId: string; userId: string; role: UserRole
}) {
  const project = await db.project.findFirst({
    where:  { id: args.projectId, workspaceId: args.workspaceId },
    select: { id: true, name: true },
  })
  if (!project) return null
  if (args.role === 'COLLABORATOR') {
    const assignment = await db.projectAssignment.findFirst({
      where:  { projectId: args.projectId, userId: args.userId },
      select: { id: true },
    })
    if (!assignment) return null
  }
  return project
}

/**
 * Whether the signed-in user may open this project. Non-throwing — for API
 * routes, which answer 404 themselves.
 */
export const checkProjectAccess = cache(async (projectId: string) => {
  const [workspaceId, user] = await Promise.all([getWorkspaceId(), getCurrentUser()])
  const project = await findOpenableProject({ projectId, workspaceId, userId: user.id, role: user.role })
  if (!project) return null
  return { project, user, workspaceId, role: user.role }
})

/** Same check for pages: 404s instead of returning null. */
export async function requireProjectAccess(projectId: string) {
  const access = await checkProjectAccess(projectId)
  if (!access) notFound()
  return access
}

/**
 * Owner/Producer-only pages: workspace money (invoices, proposals, clients,
 * actuals, rate library…) and the rolodex. 404 rather than redirect so their
 * existence isn't confirmed to a Collaborator.
 */
export async function requireProducerPageAccess() {
  const user = await getCurrentUser()
  if (user.role === 'COLLABORATOR') notFound()
  return user
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

