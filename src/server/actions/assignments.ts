'use server'

/**
 * Project ↔ Collaborator assignment actions (Feature F9).
 *
 * Only Owners and Producers may view or change assignments. Collaborators see a
 * project solely because a row exists here (enforced in the projects list +
 * detail page). Tenant isolation via getScopedDb() on ProjectAssignment; the
 * non-scoped User table is filtered by workspaceId explicitly.
 */

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getScopedDb } from '@/lib/db-scoped'
import { requireRole } from '@/lib/auth'
import type { ActionResult } from '@/types'

export interface AssignableCollaborator {
  id:        string
  name:      string | null
  email:     string
  avatarUrl: string | null
  assigned:  boolean
}

// ─── getProjectAssignees ──────────────────────────────────────────────────────

export async function getProjectAssignees(
  projectId: string,
): Promise<ActionResult<AssignableCollaborator[]>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()
    const project = await sdb.project.findFirst({ where: { id: projectId }, select: { id: true } })
    if (!project) return { success: false, error: 'Project not found' }

    const [collaborators, assignments] = await Promise.all([
      // User is not auto-scoped — filter by the active workspace explicitly.
      db.user.findMany({
        where:   { workspaceId: gate.workspaceId, role: 'COLLABORATOR' },
        select:  { id: true, name: true, email: true, avatarUrl: true },
        orderBy: { name: 'asc' },
      }),
      sdb.projectAssignment.findMany({ where: { projectId }, select: { userId: true } }),
    ])

    const assignedIds = new Set(assignments.map(a => a.userId))
    return {
      success: true,
      data: collaborators.map(c => ({ ...c, assigned: assignedIds.has(c.id) })),
    }
  } catch {
    return { success: false, error: 'Failed to load collaborators' }
  }
}

// ─── setProjectAssignment ─────────────────────────────────────────────────────

export async function setProjectAssignment(
  projectId: string,
  userId:    string,
  assigned:  boolean,
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const sdb = await getScopedDb()

    // Both the project and the target user must belong to the active workspace.
    const [project, target] = await Promise.all([
      sdb.project.findFirst({ where: { id: projectId }, select: { id: true } }),
      db.user.findFirst({
        where:  { id: userId, workspaceId: gate.workspaceId, role: 'COLLABORATOR' },
        select: { id: true },
      }),
    ])
    if (!project) return { success: false, error: 'Project not found' }
    if (!target)  return { success: false, error: 'Collaborator not found' }

    const existing = await sdb.projectAssignment.findFirst({
      where:  { projectId, userId },
      select: { id: true },
    })

    if (assigned && !existing) {
      // workspaceId auto-injected by the scoped create.
      await sdb.projectAssignment.create({ data: { projectId, userId } as never })
    } else if (!assigned && existing) {
      await sdb.projectAssignment.deleteMany({ where: { projectId, userId } })
    }

    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update assignment' }
  }
}
