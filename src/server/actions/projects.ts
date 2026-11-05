'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser } from '@/lib/auth'
import { getAccess, getProjectAccess, requirePermission, requireProjectPermission } from '@/lib/access'
import { archiveChangeAllowed } from '@/lib/project-access'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma } from '@prisma/client'
import { createBudget } from './budgets'
import { applyStage, effectivePhase, isPhase, restoredStatus, statusForPhase, type StageKey } from '@/lib/project-phase'
import { logAuditEvent } from '@/lib/audit'

// ─── Create project + budget from template ────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1).max(300),
  clientId: z.string().optional(),
  clientName: z.string().optional(), // if creating a new client inline
  shootType: z.enum([
    'MUSIC_VIDEO','BRAND_CAMPAIGN','PRODUCT_SHOOT','EVENT_RECAP',
    'SOCIAL_CONTENT','INFLUENCER','DOCUMENTARY','OTHER',
  ]),
  templateId: z.string().optional().nullable(),
})

/**
 * Archiving / restoring: the workspace Projects permission, on a project the
 * caller can open (roles 2b). Not exported — 'use server' exports are RPCs.
 */
async function requireProjectsAreaOn(projectId: string) {
  const gate = await requirePermission('projects', 'EDIT')
  if (!gate.ok) return gate
  if (typeof projectId !== 'string' || !(await getProjectAccess(projectId))) {
    return { ...gate, ok: false, error: { success: false as const, error: 'Project not found' } }
  }
  return gate
}

export async function createProjectWithBudget(
  input: z.infer<typeof createProjectSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requirePermission('projects', 'EDIT')
    if (!gate.ok) return gate.error

    const [db, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const data = createProjectSchema.parse(input)

    // Resolve or create client
    let clientId = data.clientId
    if (!clientId && data.clientName?.trim()) {
      const newClient = await db.client.create({
        data: { name: data.clientName.trim() } as unknown as Prisma.ClientUncheckedCreateInput,
      })
      clientId = newClient.id
    }
    if (!clientId) {
      return { success: false, error: 'Client is required' }
    }

    // Create project
    const project = await db.project.create({
      data: {
        clientId,
        name: data.name,
        shootType: data.shootType,
        status: 'LEAD',
        createdById: user.id,
      } as unknown as Prisma.ProjectUncheckedCreateInput,
    })

    // A creator whose role only opens assigned projects is put on this one —
    // otherwise they'd create a project they can't open.
    const access = await getAccess()
    if (!access.isOwner && access.projectScope === 'ASSIGNED') {
      await db.projectAssignment.create({ data: { projectId: project.id, userId: user.id } } as unknown as Parameters<typeof db.projectAssignment.create>[0])
    }

    // Create budget (materialises template if provided). Needs budget edit
    // rights; without them the project is created with no budget.
    const budget = await createBudget(project.id, data.templateId ?? undefined)
    if (!budget.success) console.warn('[createProjectWithBudget] budget skipped:', (budget as { success: false; error: string }).error)

    revalidatePath('/projects')
    revalidatePath('/dashboard')
    return { success: true, data: { id: project.id } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to create project' }
  }
}

// ─── Update project info ──────────────────────────────────────────────────────

const SHOOT_TYPES = [
  'MUSIC_VIDEO','BRAND_CAMPAIGN','PRODUCT_SHOOT','EVENT_RECAP',
  'SOCIAL_CONTENT','INFLUENCER','DOCUMENTARY','OTHER',
] as const

const STAGES = ['LEAD','PRE_PROD','PRODUCTION','POST','INVOICING','OFFBOARDING','WRAPPED','ARCHIVED'] as const

export async function updateProject(
  projectId: string,
  input: {
    name: string
    /** A phase, or WRAPPED / ARCHIVED (the Edit modal's Stage select). */
    stage: StageKey
    shootType: typeof SHOOT_TYPES[number]
    /** Individual shoot dates, "YYYY-MM-DD". Need not be contiguous. */
    shootDates: string[]
  }
): Promise<ActionResult> {
  try {
    const gate = await requireProjectPermission(projectId, 'overview', 'EDIT')
    if (!gate.ok) return gate.error
    if (!(STAGES as readonly string[]).includes(input.stage)) return { success: false, error: 'Invalid stage' }

    const db = await getScopedDb()
    const current = await db.project.findFirst({ where: { id: projectId }, select: { status: true, phase: true, archivedAt: true } })
    if (!current) return { success: false, error: 'Project not found' }
    const next = applyStage(input.stage, { status: current.status, phase: effectivePhase(current.status, current.phase) })
    if (!(await archiveChangeAllowed(projectId, next.status))) {
      return { success: false, error: 'Archiving or restoring a project needs the Projects permission.' }
    }
    const wantedKeys = [...new Set(input.shootDates)].sort()

    await db.project.update({
      where: { id: projectId },
      data: {
        name:           input.name.trim(),
        status:         next.status,
        phase:          next.phase,
        ...(next.phase !== current.phase ? { phaseChangedAt: new Date() } : {}),
        // Keep archivedAt in step when the status path archives / restores
        // (an already-archived project keeps its original date).
        archivedAt: next.status === 'ARCHIVED' ? (current.archivedAt ?? new Date()) : null,
        shootType:      input.shootType,
        shootStartDate: wantedKeys[0] ? new Date(wantedKeys[0]) : null,
        shootEndDate:   wantedKeys.length ? new Date(wantedKeys[wantedKeys.length - 1]) : null,
      },
    })

    const existing = await db.shootDay.findMany({
      where: { projectId },
      select: { id: true, date: true, orderIndex: true },
    })
    const existingByKey = new Map(existing.map(d => [d.date.toISOString().slice(0, 10), d]))
    const wantedSet = new Set(wantedKeys)

    // Create days that were added
    let nextOrder = existing.reduce((max, d) => Math.max(max, d.orderIndex), -1) + 1
    const toCreate = wantedKeys
      .filter(key => !existingByKey.has(key))
      .map(key => ({ projectId, date: new Date(key), orderIndex: nextOrder++ }))
    if (toCreate.length > 0) {
      await db.shootDay.createMany({
        data: toCreate as unknown as Parameters<typeof db.shootDay.createMany>[0]['data'],
      })
    }

    // Remove days that were deselected — move their entries to the boneyard first
    // rather than deleting scheduled scenes outright.
    const toRemove = existing.filter(d => !wantedSet.has(d.date.toISOString().slice(0, 10)))
    if (toRemove.length > 0) {
      const removeIds = toRemove.map(d => d.id)
      await db.scheduleEntry.updateMany({
        where: { shootDayId: { in: removeIds } },
        data: { shootDayId: null, computedStartTime: null, computedEndTime: null, concurrentWithPrevious: false },
      })
      await db.shootDay.deleteMany({ where: { id: { in: removeIds } } })
    }

    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/schedule`)
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to update project' }
  }
}

export async function listShootDays(projectId: string): Promise<ActionResult<{ id: string; date: string }[]>> {
  const db = await getScopedDb()
  const days = await db.shootDay.findMany({
    where: { projectId },
    orderBy: { date: 'asc' },
    select: { id: true, date: true },
  })
  return { success: true, data: days.map(d => ({ id: d.id, date: d.date.toISOString().slice(0, 10) })) }
}

// ─── Archive project ──────────────────────────────────────────────────────────

export async function archiveProject(projectId: string): Promise<ActionResult> {
  try {
    const gate = await requireProjectsAreaOn(projectId)
    if (!gate.ok) return gate.error

    const db = await getScopedDb()
    await db.project.update({
      where: { id: projectId },
      data: {
        status:     'ARCHIVED',
        archivedAt: new Date(),
      },
    })
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to archive project' }
  }
}

// ─── Unarchive project ────────────────────────────────────────────────────────

export async function unarchiveProject(projectId: string): Promise<ActionResult> {
  try {
    const gate = await requireProjectsAreaOn(projectId)
    if (!gate.ok) return gate.error

    const db = await getScopedDb()
    const current = await db.project.findFirst({ where: { id: projectId }, select: { phase: true } })
    if (!current) return { success: false, error: 'Project not found' }
    await db.project.updateMany({
      where: { id: projectId, status: 'ARCHIVED' },
      data: {
        status:     restoredStatus(current.phase),
        archivedAt: null,
      },
    })
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to unarchive project' }
  }
}

// ─── Set phase (the /projects table's in-place change) ────────────────────────

export async function setProjectPhase(projectId: string, phase: string): Promise<ActionResult<{ status: string }>> {
  try {
    if (typeof projectId !== 'string' || !isPhase(phase)) return { success: false, error: 'Invalid phase' }
    const gate = await requireProjectPermission(projectId, 'overview', 'EDIT')
    if (!gate.ok) return gate.error

    const [db, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const current = await db.project.findFirst({ where: { id: projectId }, select: { status: true, phase: true, workspaceId: true } })
    if (!current) return { success: false, error: 'Project not found' }
    if (current.status === 'ARCHIVED') return { success: false, error: 'Restore the project before changing its phase.' }
    if (effectivePhase(current.status, current.phase) === phase && current.phase === phase && current.status !== 'WRAPPED') return { success: true, data: { status: current.status } }

    const status = statusForPhase(phase, current.status)
    // Guarded on the values just read, so a concurrent archive isn't undone.
    const res = await db.project.updateMany({
      where: { id: projectId, status: current.status, phase: current.phase },
      data:  { phase, status, phaseChangedAt: new Date() },
    })
    if (res.count !== 1) return { success: false, error: 'The project changed meanwhile — refresh and try again.' }

    await logAuditEvent({
      workspaceId: current.workspaceId, actorId: user.id, action: 'project.phaseChanged',
      entityType: 'Project', entityId: projectId,
      metadata: { from: current.phase, to: phase, statusFrom: current.status, statusTo: status },
    })
    revalidatePath('/projects')
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/dashboard')
    return { success: true, data: { status } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to change phase' }
  }
}

/** Wrap from the table: status WRAPPED, phase kept. */
export async function wrapProject(projectId: string): Promise<ActionResult> {
  try {
    if (typeof projectId !== 'string') return { success: false, error: 'Invalid project' }
    const gate = await requireProjectPermission(projectId, 'overview', 'EDIT')
    if (!gate.ok) return gate.error
    const [db, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const current = await db.project.findFirst({ where: { id: projectId }, select: { status: true, workspaceId: true } })
    if (!current) return { success: false, error: 'Project not found' }
    if (current.status === 'ARCHIVED') return { success: false, error: 'Restore the project first.' }
    const res = await db.project.updateMany({ where: { id: projectId, status: { in: ['LEAD', 'ACTIVE'] } }, data: { status: 'WRAPPED' } })
    if (res.count !== 1) return { success: false, error: 'The project is already wrapped or changed meanwhile — refresh.' }
    await logAuditEvent({ workspaceId: current.workspaceId, actorId: user.id, action: 'project.wrapped', entityType: 'Project', entityId: projectId })
    revalidatePath('/projects')
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/dashboard')
    return { success: true, data: undefined }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to wrap project' }
  }
}
