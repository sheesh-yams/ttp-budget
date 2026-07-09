'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma } from '@prisma/client'
import { createBudget } from './budgets'

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

export async function createProjectWithBudget(
  input: z.infer<typeof createProjectSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
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

    // Create budget (materialises template if provided)
    await createBudget(project.id, data.templateId ?? undefined)

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

const PROJECT_STATUSES = ['LEAD','ACTIVE','WRAPPED','ARCHIVED'] as const

export async function updateProject(
  projectId: string,
  input: {
    name: string
    status: typeof PROJECT_STATUSES[number]
    shootType: typeof SHOOT_TYPES[number]
    /** Individual shoot dates, "YYYY-MM-DD". Need not be contiguous. */
    shootDates: string[]
  }
): Promise<ActionResult> {
  try {
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const db = await getScopedDb()
    const wantedKeys = [...new Set(input.shootDates)].sort()

    await db.project.update({
      where: { id: projectId },
      data: {
        name:           input.name.trim(),
        status:         input.status,
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
        data: { shootDayId: null, computedStartTime: null, computedEndTime: null },
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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
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
    const gate = await requireRole(['OWNER', 'PRODUCER'])
    if (!gate.ok) return gate.error

    const db = await getScopedDb()
    await db.project.update({
      where: { id: projectId },
      data: {
        status:     'ACTIVE',
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
