'use server'

import { revalidatePath } from 'next/cache'
import { getScopedDb } from '@/lib/db-scoped'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { Prisma } from '@prisma/client'

const clientSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  billingAddress: z.string().optional(),
  notes: z.string().optional(),
})

export async function upsertClient(
  id: string | null,
  input: z.infer<typeof clientSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const [db, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const data = clientSchema.parse(input)
    const client = id
      ? await db.client.update({ where: { id }, data })
      : await db.client.create({ data } as unknown as { data: Prisma.ClientUncheckedCreateInput })
    revalidatePath('/clients')
    return { success: true, data: { id: client.id } }
  } catch {
    return { success: false, error: 'Failed to save client' }
  }
}

export async function archiveClient(id: string): Promise<ActionResult> {
  try {
    const db = await getScopedDb()
    await db.client.update({ where: { id }, data: { archivedAt: new Date() } })
    revalidatePath('/clients')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to archive client' }
  }
}

const projectSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1).max(300),
  code: z.string().optional(),
  shootType: z.enum(['MUSIC_VIDEO','BRAND_CAMPAIGN','PRODUCT_SHOOT','EVENT_RECAP','SOCIAL_CONTENT','INFLUENCER','DOCUMENTARY','OTHER']),
  shootStartDate: z.string().optional().nullable(),
  shootEndDate: z.string().optional().nullable(),
  description: z.string().optional(),
  notes: z.string().optional(),
})

export async function upsertProject(
  id: string | null,
  input: z.infer<typeof projectSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const [db, user] = await Promise.all([getScopedDb(), getCurrentUser()])
    const data = projectSchema.parse(input)
    const payload = {
      ...data,
      shootStartDate: data.shootStartDate ? new Date(data.shootStartDate) : null,
      shootEndDate: data.shootEndDate ? new Date(data.shootEndDate) : null,
    }
    const project = id
      ? await db.project.update({ where: { id }, data: payload })
      : await db.project.create({ data: { ...payload, createdById: user.id } } as unknown as { data: Prisma.ProjectUncheckedCreateInput })
    revalidatePath('/projects')
    revalidatePath('/dashboard')
    return { success: true, data: { id: project.id } }
  } catch (err) {
    console.error(err)
    return { success: false, error: 'Failed to save project' }
  }
}

export async function updateProjectStatus(
  id: string,
  status: 'LEAD' | 'ACTIVE' | 'WRAPPED' | 'ARCHIVED'
): Promise<ActionResult> {
  try {
    const db = await getScopedDb()
    await db.project.update({ where: { id }, data: { status } })
    revalidatePath('/dashboard')
    revalidatePath(`/projects/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to update status' }
  }
}
