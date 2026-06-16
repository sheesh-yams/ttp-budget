'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser } from '@/lib/auth'
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
    shootStartDate: string | null
    shootEndDate: string | null
  }
): Promise<ActionResult> {
  try {
    const db = await getScopedDb()
    await db.project.update({
      where: { id: projectId },
      data: {
        name:           input.name.trim(),
        status:         input.status,
        shootType:      input.shootType,
        shootStartDate: input.shootStartDate ? new Date(input.shootStartDate) : null,
        shootEndDate:   input.shootEndDate   ? new Date(input.shootEndDate)   : null,
      },
    })
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    return { success: true, data: undefined }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to update project' }
  }
}

// ─── Archive project ──────────────────────────────────────────────────────────

export async function archiveProject(projectId: string): Promise<ActionResult> {
  try {
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
